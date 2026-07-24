/**
 * =============================================================================
 * Domain types — the vocabulary of the authoritative race simulation.
 * =============================================================================
 *
 * This file has NO dependencies on networking, Colyseus, Supabase, or Node APIs.
 * It only describes *what a race is made of*. Keeping the domain pure means the
 * simulation can be unit-tested, replayed deterministically, and reasoned about
 * without spinning up a server.
 *
 * Everything the server treats as "truth" is expressed here.
 */

/** Stable identifier for a player (the Supabase user id). */
export type PlayerId = string;

/**
 * Character role. This is GAME-SPECIFIC and expected to evolve.
 * TODO(game-rules): Replace/extend these roles as the design changes. The
 * simulation itself does not branch on role today; systems that eventually need
 * role-specific behavior should read it from {@link PlayerState.role}.
 */
export type PlayerRole = 'bug' | 'human' | 'klaus';

/**
 * The lifecycle phase of a single race. Drives what the simulation does each
 * tick and what the client is allowed to render. See `domain/lifecycle.ts`.
 */
export enum RacePhase {
  /** Room exists, waiting for the scheduled start time. No world movement. */
  Waiting = 'waiting',
  /** Countdown before the green light. World is frozen; clients show 3..2..1. */
  Countdown = 'countdown',
  /** The race is live. The world scrolls and inputs affect outcomes. */
  Racing = 'racing',
  /** The race is over. Standings are frozen and results are being sealed. */
  Finished = 'finished',
}

/**
 * ---- Player intents (inputs) --------------------------------------------
 * Clients send ONLY these. They never send positions or outcomes. Every input
 * carries a monotonically increasing `seq` so the server can ignore duplicates
 * / out-of-order packets, and a `clientTimeMs` used purely for diagnostics.
 *
 * TODO(game-rules): Add new intent variants here as gameplay grows (e.g. a
 * "taunt" or a new ability activation shape). The transport protocol and the
 * client mirror these shapes.
 */
export type PlayerInput =
  | MoveInput
  | JumpInput
  | ActivateAbilityInput
  | EatInput;

export interface InputBase {
  /** Monotonic per-player sequence number. Server keeps only the newest. */
  readonly seq: number;
  /** Client wall-clock time when the input was produced (diagnostics only). */
  readonly clientTimeMs?: number;
}

export interface MoveInput extends InputBase {
  readonly type: 'move';
  readonly direction: 'left' | 'right';
}

export interface JumpInput extends InputBase {
  readonly type: 'jump';
}

export interface ActivateAbilityInput extends InputBase {
  readonly type: 'activate';
  readonly abilityId: string;
  /** Optional aim point for targeted abilities, in world coordinates. */
  readonly aimX?: number;
  readonly aimY?: number;
}

/**
 * A claim that the actor ate a rival. The server is the authority: it validates
 * proximity + the food-chain rule before applying any elimination, so a client
 * cannot eat someone it is nowhere near or someone its species cannot eat.
 */
export interface EatInput extends InputBase {
  readonly type: 'eat';
  /** The rival the actor believes it ate. */
  readonly targetId: PlayerId;
}

/**
 * ---- Authoritative world state ------------------------------------------
 * The server owns exactly one of these per room. It is the ONLY truth. Clients
 * receive read-only snapshots derived from it (see `net/snapshot.ts`).
 */

/** Per-player authoritative state. Everything here is decided by the server. */
export interface PlayerState {
  readonly id: PlayerId;
  readonly role: PlayerRole;
  /** Current sub-lane index (0 .. laneCount-1). */
  lane: number;
  /** World X position in px (derived from lane; kept for smooth interpolation). */
  x: number;
  /** Server time (ms since race start) until which the player is airborne. */
  jumpUntilMs: number;
  /** Forward race progress in px. Higher = further along the track. */
  distance: number;
  died: boolean;
  finished: boolean;
  /** Race time (ms) at which the player finished; null while still running. */
  finishTimeMs: number | null;
  /** Highest input `seq` the server has applied. Sent back for reconciliation. */
  lastInputSeq: number;
  /** Ability ids the player is currently holding. GAME-SPECIFIC. */
  abilities: string[];

  // ---- Transient movement effects (server-authoritative) ------------------
  /**
   * Race time (ms) until which a puddle slide boost is active. While active the
   * runner advances faster than the world (see progressSystem).
   */
  slideUntilMs: number;
  /**
   * Race time (ms) until which the runner is stalled by a trash bin it failed to
   * jump. While active it makes no forward progress. (Legacy timed stall; kept
   * for compatibility — trash now uses {@link stuck} instead.)
   */
  stallUntilMs: number;
  /**
   * True while the runner is physically stuck behind a trash bin. Unlike a timed
   * stall, this persists (zero forward progress) UNTIL the runner changes lane to
   * go around the bin. Because progress is per-player, one stuck runner never
   * pauses the race for anyone else.
   */
  stuck: boolean;
  /**
   * Race time (ms) until which a `speed-up` ability boost is active.
   */
  boostUntilMs: number;
}

/**
 * A world hazard / pickup. GAME-SPECIFIC — the concrete kinds and their effects
 * are expected to change. The simulation treats these generically where it can.
 * TODO(game-rules): Expand `HazardKind` and the resolution rules in
 * `domain/systems/hazardSystem.ts` as the level design evolves.
 */
export interface Hazard {
  readonly id: number;
  readonly kind: 'trash' | 'puddle' | 'manhole' | 'pickup';
  readonly lane: number;
  /** Forward world position (px) where the hazard sits. */
  worldY: number;
  /** Manhole-only: whether it is open (deadly) or closed. */
  open?: boolean;
  /** Cosmetic rotation, forwarded to the renderer. */
  angle?: number;
  /** Pickup-only: which ability the pickup grants. */
  abilityId?: string;
  /** Players who have already resolved this hazard (so effects fire once each). */
  resolvedBy?: Set<PlayerId>;
}

/**
 * The complete authoritative state of one race at one instant. This is the
 * shared world state the requirements refer to: the server simulates the entire
 * race from exactly this object.
 */
export interface WorldState {
  /** Deterministic seed shared by server + clients for reproducible hazards. */
  readonly seed: number;
  /** Absolute wall-clock time (ms) at which racing begins. */
  readonly startsAtMs: number;
  /** Room capacity (already clamped into the configured 3..12 band). */
  readonly capacity: number;

  phase: RacePhase;
  /** Number of fixed simulation ticks executed so far. */
  tick: number;
  /** Milliseconds elapsed since racing started (0 during waiting/countdown). */
  elapsedMs: number;

  /** All players in the room, keyed by player id. */
  readonly players: Map<PlayerId, PlayerState>;
  /** Active hazards in world order. */
  readonly hazards: Hazard[];
  /**
   * Open/closed state of each main-lane divider this tick (index 0 = Bugs|Humans
   * boundary, 1 = Humans|Klaus). Recomputed every tick from the shared seed +
   * race time so it is deterministic and broadcast to clients for rendering.
   */
  dividersOpen: boolean[];

  // ---- Internal bookkeeping (not gameplay truth, but part of the state) ----
  /**
   * Per main lane (0=Bugs,1=Humans,2=Klaus): forward position (px) up to which
   * hazard slots have been spawned. Each lane spawns on its own cadence.
   */
  laneSpawnCursor: number[];
  /** Per main lane: forward position up to which ability pickups were spawned. */
  laneAbilityCursor: number[];
  /** Monotonic id assigned to the next spawned hazard. */
  nextHazardId: number;
}

/**
 * A spawn descriptor produced by the admission layer from a verified ticket.
 * It is the ONLY way a player enters the world, keeping the simulation ignorant
 * of how admission/matchmaking works.
 */
export interface PlayerSpawn {
  readonly id: PlayerId;
  readonly role: PlayerRole;
  readonly lane: number;
}

/**
 * One player's authoritative outcome. Produced by the standings system when the
 * race ends and consumed by the results layer.
 */
export interface PlayerResult {
  readonly userId: PlayerId;
  readonly finished: boolean;
  readonly died: boolean;
  readonly finishTimeMs: number | null;
  /** 1-based finishing position. */
  readonly placement: number;
}
