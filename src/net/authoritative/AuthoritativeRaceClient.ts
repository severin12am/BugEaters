/**
 * =============================================================================
 * AuthoritativeRaceClient — the facade the Phaser game talks to.
 * =============================================================================
 *
 * This is the client-side counterpart to the authoritative server. It turns the
 * game into a RENDERER + INPUT SENDER:
 *
 *   - Call `join()` once to connect.
 *   - Call `move()` / `jump()` / `activate()` when the player acts. These predict
 *     locally (instant feedback) AND send the intent to the server.
 *   - Call `getRenderState()` every frame to get the authoritative-but-smoothed
 *     world to draw. The scene should render THIS and nothing it invents itself.
 *   - Subscribe to `onAbility` / `onFinal` for one-off events.
 *
 * Internally it combines three concerns, each in its own file:
 *   - RaceConnection       (transport: ticket + Colyseus)
 *   - InputPredictor       (local prediction + reconciliation for self)
 *   - SnapshotInterpolator (smooth interpolation for remote players)
 *
 * See docs/multiplayer/CLIENT_PREDICTION.md for the full explanation.
 */
import { ensureSession } from '../auth';
import { RaceConnection, type DevTicketOptions, type JoinedRaceInfo } from './RaceConnection';
import { InputPredictor } from './InputPredictor';
import { SnapshotInterpolator, type InterpolatedPlayer } from './SnapshotInterpolator';
import {
  extrapolateDistance,
  snapshotAgeSec,
  smoothClockOffset,
  speedMultiplierFromSnapshot,
} from './distanceExtrapolator';
import type {
  AbilityMessage,
  DilemmaMessage,
  EliminationMessage,
  FinalMessage,
  HazardSnapshotDto,
  RacePhaseWire,
  SnapshotMessage,
} from './protocol';
import { isRaceDevMode } from './env';

/** The full, render-ready state for one frame. Draw exactly this. */
export interface RaceRenderState {
  phase: RacePhaseWire;
  /** When racing begins, in the client's clock (server offset applied). */
  startsAtMs: number;
  /** Milliseconds of racing elapsed (0 before the green light). */
  raceMs: number;
  /** The local player's runner (predicted position, authoritative status). */
  self: SelfRenderState | null;
  /** Every other runner, interpolated for smoothness. */
  remotePlayers: InterpolatedPlayer[];
  /** World hazards from the latest snapshot. */
  hazards: HazardSnapshotDto[];
  /** Open/closed state per main-lane divider (0 = Bugs|Humans, 1 = Humans|Klaus). */
  dividersOpen: boolean[];
}

export interface SelfRenderState {
  userId: string;
  role: string;
  /** Predicted lane (instant), corrected by reconciliation. */
  lane: number;
  /** Predicted world X (instant), corrected by reconciliation. */
  x: number;
  /**
   * Forward progress: last snapshot plus the same elapsed time applied to every
   * runner, so the road is 60fps-smooth and the gap matches on both screens.
   */
  distance: number;
  /** Predicted airborne-until race time (ms). */
  jumpUntilMs: number;
  /** Authoritative status. */
  died: boolean;
  finished: boolean;
  abilities: string[];
  /** Active effect flags for VFX/feel. */
  sliding: boolean;
  stalled: boolean;
  boosted: boolean;
  eatProtected: boolean;
  blackrock: boolean;
  barriersOpen: boolean;
  flight: boolean;
  hellMode: boolean;
  slowed: boolean;
  flashlight: boolean;
}

export interface AuthoritativeRaceCallbacks {
  onAbility?: (event: AbilityMessage) => void;
  onElimination?: (event: EliminationMessage) => void;
  onDilemma?: (event: DilemmaMessage) => void;
  onFinal?: (event: FinalMessage) => void;
  onError?: (error: unknown) => void;
  onLeave?: (code: number) => void;
}

export class AuthoritativeRaceClient {
  private readonly connection: RaceConnection;
  private readonly predictor = new InputPredictor();
  private readonly interpolator = new SnapshotInterpolator();

  private selfUserId: string | null = null;
  private latest: SnapshotMessage | null = null;
  /** Local clock minus server clock (smoothed). Null before the first snapshot. */
  private clockOffsetMs: number | null = null;

  constructor(serverUrl?: string) {
    this.connection = new RaceConnection(serverUrl);
  }

  /** True only when a race-server URL is configured (else use the legacy path). */
  isConfigured(): boolean {
    return this.connection.isConfigured();
  }

  /** Connects to the authoritative room for `roomId`. */
  async join(
    roomId: string,
    callbacks: AuthoritativeRaceCallbacks = {},
    devOptions: DevTicketOptions = {},
  ): Promise<void> {
    // Prefer an explicit user id (dev mode / local practice). Otherwise use Supabase auth.
    if (!devOptions.userId && !isRaceDevMode) {
      const auth = await ensureSession();
      this.selfUserId = auth.userId;
    } else {
      this.selfUserId = devOptions.userId ?? null;
    }

    await this.connection.join(
      roomId,
      {
        onSnapshot: (snapshot) => this.ingestSnapshot(snapshot),
        onAbility: callbacks.onAbility,
        onElimination: callbacks.onElimination,
        onDilemma: callbacks.onDilemma,
        onFinal: callbacks.onFinal,
        onError: callbacks.onError,
        onLeave: callbacks.onLeave,
      },
      devOptions,
    );

    // Dev tickets may assign the userId — prefer the connection's confirmed id.
    this.selfUserId = this.connection.getJoinedUserId() ?? this.selfUserId;
  }

  getSelfUserId(): string | null {
    return this.selfUserId;
  }

  /** Shared race params from the ticket (seed / start / seat), when available. */
  getJoinedInfo(): JoinedRaceInfo | null {
    return this.connection.getJoinedInfo();
  }

  // ---- Inputs (predict locally + send) -------------------------------------

  move(direction: 'left' | 'right'): void {
    const seq = this.predictor.allocateSeq();
    const input = { type: 'move' as const, direction, seq, clientTimeMs: Date.now() };
    this.predictor.predict(input, this.raceMs());
    this.connection.sendInput(input);
  }

  jump(): void {
    const seq = this.predictor.allocateSeq();
    const input = { type: 'jump' as const, seq, clientTimeMs: Date.now() };
    this.predictor.predict(input, this.raceMs());
    this.connection.sendInput(input);
  }

  activate(abilityId: string, aimX?: number, aimY?: number): void {
    const seq = this.predictor.allocateSeq();
    const input = { type: 'activate' as const, abilityId, aimX, aimY, seq, clientTimeMs: Date.now() };
    // Ability effects are server-authoritative; predict() only bookkeeps the seq.
    this.predictor.predict(input, this.raceMs());
    this.connection.sendInput(input);
  }

  /** Claims an eat on a rival. The SERVER validates proximity + food chain. */
  eat(targetId: string): void {
    const seq = this.predictor.allocateSeq();
    const input = { type: 'eat' as const, targetId, seq, clientTimeMs: Date.now() };
    this.connection.sendInput(input);
  }

  /** Sends a Prisoner's Dilemma choice for an active encounter. */
  dilemmaChoice(encounterId: string, choice: 'cooperate' | 'eat'): void {
    const seq = this.predictor.allocateSeq();
    const input = {
      type: 'dilemma' as const,
      encounterId,
      choice,
      seq,
      clientTimeMs: Date.now(),
    };
    this.connection.sendInput(input);
  }

  // ---- Rendering -----------------------------------------------------------

  /** Builds the render-ready state for the current frame. Call every frame. */
  getRenderState(): RaceRenderState {
    const latest = this.latest;
    const phase: RacePhaseWire = latest?.phase ?? 'waiting';
    const offset = this.clockOffsetMs ?? 0;
    const startsAtMs = latest ? latest.startsAtMs + offset : 0;

    return {
      phase,
      startsAtMs,
      raceMs: this.raceMs(),
      self: this.buildSelf(),
      remotePlayers: this.buildRemotes(),
      hazards: latest?.hazards ?? [],
      dividersOpen: latest?.dividersOpen ?? [true, true],
    };
  }

  /** The current race time in ms (server clock), 0 before start. */
  raceMs(): number {
    if (!this.latest || this.clockOffsetMs === null) {
      return 0;
    }
    const serverNow = Date.now() - this.clockOffsetMs;
    return Math.max(0, serverNow - this.latest.startsAtMs);
  }

  leave(): void {
    this.connection.leave();
    this.predictor.reset();
    this.interpolator.reset();
    this.latest = null;
    this.clockOffsetMs = null;
  }

  // ---- Internals -----------------------------------------------------------

  private ingestSnapshot(snapshot: SnapshotMessage): void {
    this.latest = snapshot;
    this.clockOffsetMs = smoothClockOffset(
      this.clockOffsetMs,
      Date.now() - snapshot.serverTimeMs,
    );
    this.interpolator.setClockOffset(this.clockOffsetMs);
    this.interpolator.push(snapshot);

    // Reconcile the local player against the authoritative self state.
    if (this.selfUserId) {
      const self = snapshot.players.find((p) => p.userId === this.selfUserId);
      if (self) {
        this.predictor.reconcile(self, this.raceMs());
      }
    }
  }

  /** Seconds since the latest snapshot, shared by self and every rival. */
  private snapshotDtSec(): number {
    if (!this.latest || this.clockOffsetMs === null) {
      return 0;
    }
    return snapshotAgeSec(Date.now() - this.clockOffsetMs, this.latest.serverTimeMs);
  }

  private renderDistance(player: {
    distance: number;
    died?: boolean;
    finished?: boolean;
    stalled?: boolean;
    sliding?: boolean;
    boosted?: boolean;
    slowed?: boolean;
  }): number {
    return extrapolateDistance(
      player.distance,
      speedMultiplierFromSnapshot(player),
      this.snapshotDtSec(),
    );
  }

  private buildRemotes(): InterpolatedPlayer[] {
    if (!this.selfUserId) {
      return [];
    }
    return this.interpolator.interpolateRemotePlayers(this.selfUserId).map((remote) => {
      const raw = this.latest?.players.find((player) => player.userId === remote.userId);
      if (!raw) {
        return remote;
      }
      return { ...remote, distance: this.renderDistance(raw) };
    });
  }

  /** Merges predicted position with authoritative status for the local runner. */
  private buildSelf(): SelfRenderState | null {
    if (!this.latest || !this.selfUserId) {
      return null;
    }
    const authoritative = this.latest.players.find((p) => p.userId === this.selfUserId);
    if (!authoritative) {
      return null;
    }
    const predicted = this.predictor.getPredicted();
    return {
      userId: authoritative.userId,
      role: authoritative.role,
      // Prefer predicted position for responsiveness; fall back to authoritative.
      lane: predicted?.lane ?? authoritative.lane,
      x: predicted?.x ?? authoritative.x,
      jumpUntilMs: predicted?.jumpUntilMs ?? authoritative.jumpUntilMs,
      distance: this.renderDistance(authoritative),
      died: authoritative.died,
      finished: authoritative.finished,
      abilities: authoritative.abilities,
      sliding: authoritative.sliding ?? false,
      stalled: authoritative.stalled ?? false,
      boosted: authoritative.boosted ?? false,
      eatProtected: authoritative.eatProtected ?? false,
      blackrock: authoritative.blackrock ?? false,
      barriersOpen: authoritative.barriersOpen ?? false,
      flight: authoritative.flight ?? false,
      hellMode: authoritative.hellMode ?? false,
      slowed: authoritative.slowed ?? false,
      flashlight: authoritative.flashlight ?? false,
    };
  }
}

// Re-export protocol + helper types so scenes can import from one place.
export type { InterpolatedPlayer } from './SnapshotInterpolator';
export type {
  SnapshotMessage,
  PlayerSnapshotDto,
  HazardSnapshotDto,
  AbilityMessage,
  DilemmaMessage,
  EliminationMessage,
  FinalMessage,
} from './protocol';
