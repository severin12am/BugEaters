/**
 * =============================================================================
 * RaceRoom — the Colyseus transport adapter.
 * =============================================================================
 *
 * This is intentionally THIN. All gameplay truth lives in the pure
 * {@link RaceSimulation}; this class only:
 *   - verifies admission tickets (trust boundary),
 *   - feeds client inputs into the simulation,
 *   - runs the fixed-tick loop,
 *   - broadcasts authoritative snapshots + events,
 *   - seals results and fires post-race hooks when the race ends.
 *
 * If you swap Colyseus for another transport later, this is the only file that
 * has to change. The simulation, results, and hooks stay untouched.
 */
import { Room, type Client } from 'colyseus';
import { RaceSimulation } from '../domain/RaceSimulation.js';
import { RacePhase, type PlayerInput } from '../domain/types.js';
import { verifyRaceTicket, type RaceTicketClaims } from '../admission/auth.js';
import {
  assertConsistentParams,
  raceParamsFromTicket,
  spawnFromTicket,
  type RaceParams,
} from '../admission/roster.js';
import { getServerContext, type ServerContext } from '../runtime/serverContext.js';
import { buildSnapshot } from './snapshot.js';
import { CHANNEL, type JoinOptions } from './protocol.js';

export class RaceRoom extends Room {
  /** Set from the ticket's capacity on first join (clamped to 3..12). */
  maxClients = 12;
  /** Colyseus routes joins to the room whose roomKey matches (see index.ts). */
  roomKey = '';

  private ctx!: ServerContext;
  private simulation: RaceSimulation | null = null;
  private params: RaceParams | null = null;
  private finalised = false;
  private lastSnapshotAtMs = 0;

  // ---- Lifecycle -----------------------------------------------------------

  onCreate(options: Pick<JoinOptions, 'roomKey'>): void {
    this.ctx = getServerContext();
    this.roomKey = options.roomKey;
    // Colyseus 0.17 matchmaking filters via listing metadata — set explicitly
    // so joinOrCreate({ roomKey }) finds the SAME room for every tab.
    this.setMetadata({ roomKey: options.roomKey });
    this.setPrivate(false);
    // Cap capacity to the configured maximum until a ticket narrows it.
    this.maxClients = this.ctx.config.maxPlayers;

    // Fixed-rate authoritative loop. The simulation decides everything; we just
    // pump it and broadcast the results.
    this.clock.setInterval(() => this.tick(), this.ctx.config.tickMs);

    this.onMessage(CHANNEL.Input, (client, message: PlayerInput) =>
      this.handleInput(client, message),
    );
  }

  /**
   * The trust boundary. Verifies the signed ticket and confirms it targets THIS
   * room. The returned claims become `client.auth`.
   */
  onAuth(_client: Client, options: JoinOptions): RaceTicketClaims {
    const claims = verifyRaceTicket(options.token, this.ctx.ticketSecret);
    if (claims.roomId !== this.roomKey || options.roomKey !== this.roomKey) {
      throw new Error('race ticket does not match this room');
    }
    return claims;
  }

  onJoin(client: Client, _options: JoinOptions, auth: RaceTicketClaims): void {
    const incoming = raceParamsFromTicket(auth, this.ctx.config);

    if (!this.simulation) {
      // First valid ticket defines the immutable race parameters.
      this.params = incoming;
      this.maxClients = incoming.capacity;
      this.simulation = new RaceSimulation(this.ctx.config, {
        seed: incoming.seed,
        startsAtMs: incoming.startsAtMs,
        capacity: incoming.capacity,
      });
    } else {
      // Everyone else must agree on seed + start time or they'd desync.
      assertConsistentParams(this.params!, incoming);
    }

    // Reconnect: keep server-owned progress; just re-send the current snapshot.
    if (!this.simulation.hasPlayer(auth.userId)) {
      this.simulation.addPlayer(spawnFromTicket(auth, this.ctx.config));
    }
    this.sendSnapshot(client);
  }

  onLeave(_client: Client, _code?: number): void {
    // Deliberately keep the player's authoritative state through Colyseus's
    // reconnect window. A transient mobile disconnect must not be treated as
    // death — the race continues fairly and the player can rejoin.
  }

  // ---- Input ---------------------------------------------------------------

  private handleInput(client: Client, message: PlayerInput): void {
    const claims = client.auth as RaceTicketClaims | undefined;
    if (!claims || !this.simulation) {
      return;
    }
    // The simulation validates ownership, sequence numbers, and liveness.
    this.simulation.enqueueInput(claims.userId, message);
  }

  // ---- Fixed-tick loop -----------------------------------------------------

  private tick(): void {
    if (!this.simulation || this.finalised) {
      return;
    }
    const now = Date.now();
    const result = this.simulation.step(now);

    // Surface ability activations for client VFX/SFX.
    for (const event of result.abilityEvents) {
      this.broadcast(CHANNEL.Ability, event);
    }
    // Surface eliminations (eats + targeted abilities) for death VFX/feedback.
    for (const elimination of result.eliminations) {
      this.broadcast(CHANNEL.Elimination, elimination);
    }
    for (const dilemma of result.dilemmaEvents) {
      this.broadcast(CHANNEL.Dilemma, dilemma);
    }

    // Throttle snapshots to the configured broadcast rate.
    if (now - this.lastSnapshotAtMs >= this.ctx.config.snapshotIntervalMs) {
      this.lastSnapshotAtMs = now;
      this.broadcastSnapshot(now);
    }

    if (result.justFinished) {
      // Send one final snapshot so clients see the finished state, then seal.
      this.broadcastSnapshot(now);
      void this.finalise();
    }
  }

  // ---- Snapshots -----------------------------------------------------------

  private sendSnapshot(client: Client): void {
    if (!this.simulation) {
      return;
    }
    client.send(CHANNEL.Snapshot, buildSnapshot(this.simulation.getWorld(), Date.now()));
  }

  private broadcastSnapshot(now: number): void {
    if (!this.simulation) {
      return;
    }
    this.broadcast(CHANNEL.Snapshot, buildSnapshot(this.simulation.getWorld(), now));
  }

  // ---- Finalization + extension hooks --------------------------------------

  private async finalise(): Promise<void> {
    if (this.finalised || !this.simulation || !this.params) {
      return;
    }
    this.finalised = true;

    const standings = this.simulation.sealResults();
    const sealed = {
      roomId: this.params.roomId,
      seed: this.params.seed,
      startsAtMs: this.params.startsAtMs,
      sealedAtMs: Date.now(),
      results: standings,
    };

    // 1. Tell clients the authoritative outcome.
    this.broadcast(CHANNEL.Final, { roomId: sealed.roomId, results: standings });

    // 2. Persist the sealed result (Supabase / console). Retryable failure.
    try {
      await this.ctx.resultsSink.submit(sealed);
    } catch (error) {
      console.error('[race-room] results submission failed', error);
    }

    // 3. Run post-race extension hooks (NFT minting, prizes, ...). Isolated so
    //    a failing hook never affects the core result flow.
    await this.ctx.postRaceHooks.runAll(sealed);

    // Give clients a moment to read the final message, then close the room.
    this.clock.setTimeout(() => this.disconnect(), 5_000);
  }

  onDispose(): void {
    // No-op: the simulation is plain memory and is GC'd with the room. Kept as a
    // clear hook for future cleanup (metrics flush, etc.).
    if (this.simulation && this.simulation.getPhase() !== RacePhase.Finished && !this.finalised) {
      console.warn(`[race-room] room ${this.roomKey} disposed before finishing`);
    }
  }
}
