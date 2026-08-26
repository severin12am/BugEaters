/**
 * =============================================================================
 * RaceSimulation — the authoritative heart of a single race.
 * =============================================================================
 *
 * This class owns the one-and-only WorldState for a room and advances it one
 * fixed tick at a time. It is transport-agnostic: it knows nothing about
 * Colyseus, WebSockets, or Supabase. You feed it player spawns and inputs; it
 * gives you back authoritative world state and, at the end, sealed results.
 *
 * WHY A PURE CLASS?
 *   - It can be unit-tested by feeding scripted inputs and asserting outcomes.
 *   - It can be replayed deterministically from (seed + inputs) to audit a race.
 *   - The networking layer becomes a thin adapter (see net/RaceRoom.ts).
 *
 * THE TICK PIPELINE (see `step`)
 *   1. Advance the clock + phase.
 *   2. Drain queued inputs -> movement / jump / ability systems.
 *   3. Spawn + resolve hazards.
 *   4. Advance forward progress.
 *   5. Detect race end -> mark finishers.
 *
 * Each numbered step is a small, replaceable system in `domain/systems`.
 */
import type { RaceConfig } from '../config/raceConfig.js';
import { DeterministicRng } from './rng.js';
import { derivePhase, elapsedRaceMs } from './lifecycle.js';
import {
  RacePhase,
  type PlayerId,
  type PlayerInput,
  type PlayerResult,
  type PlayerSpawn,
  type PlayerState,
  type WorldState,
} from './types.js';
import {
  advanceProgress,
  applyAbility,
  applyDilemmaChoice,
  applyJump,
  applyMove,
  computeDividers,
  computeStandings,
  laneCenterX,
  markFinishers,
  pruneHazards,
  resolveEat,
  resolveHazards,
  spawnHazards,
  tickDilemmas,
  type AbilityEvent,
  type DilemmaEvent,
  type SimulationContext,
} from './systems/index.js';

export interface RaceSimulationParams {
  readonly seed: number;
  readonly startsAtMs: number;
  readonly capacity: number;
}

/** An elimination resolved this tick (eat or targeted ability), for broadcast. */
export interface EliminationEvent {
  readonly targetId: string;
  readonly actorId: string | null;
  readonly raceMs: number;
  readonly cause: 'eat' | 'ability' | 'dilemma';
}

/** What changed during a single {@link RaceSimulation.step}. */
export interface StepResult {
  /** The phase became different from the previous tick. */
  readonly phaseChanged: boolean;
  /** This tick is the one where the race transitioned into Finished. */
  readonly justFinished: boolean;
  /** Ability activations resolved this tick, for the transport to broadcast. */
  readonly abilityEvents: AbilityEvent[];
  /** Eliminations resolved this tick (eats + targeted abilities). */
  readonly eliminations: EliminationEvent[];
  /** Prisoner's Dilemma start/resolve events this tick. */
  readonly dilemmaEvents: DilemmaEvent[];
}

export class RaceSimulation {
  private readonly config: RaceConfig;
  private readonly rng: DeterministicRng;
  private readonly world: WorldState;
  /** Race time (ms) at the previous simulated tick, for dt integration. */
  private lastRaceMs = 0;

  /**
   * Inputs received since the last tick, per player. Applied in `seq` order and
   * then cleared. Only inputs newer than the player's `lastInputSeq` are kept.
   */
  private readonly pendingInputs = new Map<PlayerId, PlayerInput[]>();

  constructor(config: RaceConfig, params: RaceSimulationParams) {
    this.config = config;
    this.rng = new DeterministicRng(params.seed);
    this.world = {
      seed: params.seed,
      startsAtMs: params.startsAtMs,
      capacity: params.capacity,
      phase: RacePhase.Waiting,
      tick: 0,
      elapsedMs: 0,
      players: new Map(),
      hazards: [],
      dividersOpen: computeDividers(params.seed, 0),
      laneSpawnCursor: [0, 0, 0],
      laneAbilityCursor: [0, 0, 0],
      nextHazardId: 0,
    };
  }

  // ---- Roster management ---------------------------------------------------

  /** Adds a player from a verified spawn descriptor. Idempotent per id. */
  addPlayer(spawn: PlayerSpawn): PlayerState {
    const existing = this.world.players.get(spawn.id);
    if (existing) {
      return existing;
    }
    const player: PlayerState = {
      id: spawn.id,
      role: spawn.role,
      lane: spawn.lane,
      x: laneCenterX(spawn.lane, this.config),
      jumpUntilMs: 0,
      distance: 0,
      prevDistance: 0,
      died: false,
      finished: false,
      finishTimeMs: null,
      lastInputSeq: -1,
      abilities: [],
      slideUntilMs: 0,
      stallUntilMs: 0,
      stuck: false,
      boostUntilMs: 0,
      eatProtectedUntilMs: 0,
      blackrockUntilMs: 0,
      barriersOpenUntilMs: 0,
      flightUntilMs: 0,
      hellModeUntilMs: 0,
      slowOthersUntilMs: 0,
      flashlightUntilMs: 0,
      armedAbilityId: null,
      armedUntilMs: 0,
    };
    this.world.players.set(spawn.id, player);
    return player;
  }

  hasPlayer(id: PlayerId): boolean {
    return this.world.players.has(id);
  }

  getPlayer(id: PlayerId): PlayerState | undefined {
    return this.world.players.get(id);
  }

  playerCount(): number {
    return this.world.players.size;
  }

  // ---- Input intake --------------------------------------------------------

  /**
   * Queues a player input for the next tick. Rejects stale / duplicate packets
   * by sequence number so re-sends and out-of-order UDP-like delivery are safe.
   */
  enqueueInput(id: PlayerId, input: PlayerInput): void {
    const player = this.world.players.get(id);
    if (!player || player.died || player.finished) {
      return;
    }
    if (input.seq <= player.lastInputSeq) {
      return; // Already applied or superseded.
    }
    const queue = this.pendingInputs.get(id);
    if (queue) {
      queue.push(input);
    } else {
      this.pendingInputs.set(id, [input]);
    }
  }

  // ---- Simulation ----------------------------------------------------------

  /**
   * Advances the simulation to reflect wall-clock time `nowMs`. Called at a
   * fixed cadence by the transport layer. Returns what changed so the caller
   * can broadcast events + snapshots.
   */
  step(nowMs: number): StepResult {
    const previousPhase = this.world.phase;
    const phase = derivePhase(nowMs, this.world.startsAtMs, this.config);
    this.world.phase = phase;
    this.world.tick += 1;
    this.world.elapsedMs = elapsedRaceMs(nowMs, this.world.startsAtMs);
    // Refresh the deterministic divider state so movement gating + snapshots agree.
    this.world.dividersOpen = computeDividers(this.world.seed, this.world.elapsedMs);

    const abilityEvents: AbilityEvent[] = [];
    const eliminations: EliminationEvent[] = [];
    const dilemmaEvents: DilemmaEvent[] = [];

    // The world only simulates while racing. Waiting/countdown just tick the
    // clock so clients can show a synchronized countdown.
    if (phase === RacePhase.Racing || (phase === RacePhase.Finished && previousPhase === RacePhase.Racing)) {
      const ctx = this.buildContext();
      this.applyInputs(ctx, abilityEvents, eliminations, dilemmaEvents);
      advanceProgress(this.world, ctx);
      spawnHazards(this.world, ctx);
      for (const player of this.world.players.values()) {
        resolveHazards(player, this.world, ctx);
      }
      pruneHazards(this.world, ctx);
      for (const event of tickDilemmas(this.world, ctx)) {
        dilemmaEvents.push(event);
        if (event.type === 'resolve') {
          for (const targetId of event.diedIds ?? []) {
            eliminations.push({
              targetId,
              actorId: targetId === event.aId ? event.bId : event.aId,
              raceMs: ctx.raceMs,
              cause: 'dilemma',
            });
          }
        }
      }
    }

    this.lastRaceMs = this.world.elapsedMs;

    const justFinished = phase === RacePhase.Finished && previousPhase !== RacePhase.Finished;
    if (justFinished) {
      markFinishers(this.world, this.buildContext());
    }

    return {
      phaseChanged: phase !== previousPhase,
      justFinished,
      abilityEvents,
      eliminations,
      dilemmaEvents,
    };
  }

  /** Drains queued inputs into the movement / jump / ability / eat systems. */
  private applyInputs(
    ctx: SimulationContext,
    outAbilities: AbilityEvent[],
    outEliminations: EliminationEvent[],
    outDilemmas: DilemmaEvent[],
  ): void {
    for (const [id, queue] of this.pendingInputs) {
      const player = this.world.players.get(id);
      if (!player) {
        continue;
      }
      // Apply in sequence order for determinism.
      queue.sort((a, b) => a.seq - b.seq);
      for (const input of queue) {
        if (input.seq <= player.lastInputSeq || player.died || player.finished) {
          continue;
        }
        player.lastInputSeq = input.seq;
        switch (input.type) {
          case 'move':
            applyMove(player, input, this.world, this.config, ctx.raceMs);
            break;
          case 'jump':
            applyJump(player, input, ctx.raceMs, this.config);
            break;
          case 'activate': {
            const event = applyAbility(player, input, this.world, ctx);
            if (event) {
              outAbilities.push(event);
              for (const targetId of event.eliminatedIds ?? []) {
                outEliminations.push({ targetId, actorId: player.id, raceMs: ctx.raceMs, cause: 'ability' });
              }
            }
            break;
          }
          case 'eat': {
            const eatenId = this.config.immortal ? null : resolveEat(player, input, this.world, ctx);
            if (eatenId) {
              outEliminations.push({ targetId: eatenId, actorId: player.id, raceMs: ctx.raceMs, cause: 'eat' });
            }
            break;
          }
          case 'dilemma': {
            for (const event of applyDilemmaChoice(player, input, this.world, ctx)) {
              outDilemmas.push(event);
              if (event.type === 'resolve') {
                for (const targetId of event.diedIds ?? []) {
                  outEliminations.push({
                    targetId,
                    actorId: targetId === event.aId ? event.bId : event.aId,
                    raceMs: ctx.raceMs,
                    cause: 'dilemma',
                  });
                }
              }
            }
            break;
          }
        }
      }
    }
    this.pendingInputs.clear();
  }

  private buildContext(): SimulationContext {
    const raceMs = this.world.elapsedMs;
    const dtMs = Math.max(0, raceMs - this.lastRaceMs);
    return {
      config: this.config,
      rng: this.rng,
      raceMs,
      dtMs,
      worldY: (raceMs / 1000) * this.config.world.speedPxPerSec,
    };
  }

  // ---- Read-only accessors -------------------------------------------------

  /** The live world state. Treat as read-only outside the simulation. */
  getWorld(): Readonly<WorldState> {
    return this.world;
  }

  getPhase(): RacePhase {
    return this.world.phase;
  }

  isFinished(): boolean {
    return this.world.phase === RacePhase.Finished;
  }

  /** Computes the ordered, authoritative standings for the current world. */
  sealResults(): PlayerResult[] {
    return computeStandings(this.world);
  }
}
