/**
 * =============================================================================
 * Wire protocol — the contract between client and server.
 * =============================================================================
 *
 * These are the ONLY message shapes that cross the network. Clients send
 * `ClientMessage`s (intents); the server sends `ServerMessage`s (authoritative
 * state + events). The client keeps a mirrored copy of these types (see
 * `src/net/authoritative/protocol.ts`) so both sides stay in lockstep.
 *
 * Keeping messages small matters on mobile / Telegram WebView: snapshots are
 * flat and numeric so they serialize cheaply.
 */
import type { PlayerInput } from '../domain/types.js';

// ---------------------------------------------------------------------------
// Channel names (Colyseus message "type"). One constant per channel so a typo
// can't silently drop messages.
// ---------------------------------------------------------------------------
export const CHANNEL = {
  /** Client -> server: a single player input/intent. */
  Input: 'input',
  /** Server -> client: authoritative world snapshot. */
  Snapshot: 'snapshot',
  /** Server -> client: an ability activation happened (for VFX/SFX). */
  Ability: 'ability',
  /** Server -> client: a runner was eliminated (eat or targeted ability). */
  Elimination: 'elimination',
  /** Server -> client: the race is over, with sealed standings. */
  Final: 'final',
} as const;

// ---------------------------------------------------------------------------
// Client -> server
// ---------------------------------------------------------------------------

/** Options a client passes when joining a race room. */
export interface JoinOptions {
  /** The signed race ticket from Supabase (see admission/auth.ts). */
  readonly token: string;
  /** The room id; Colyseus routes joins to the matching room via filterBy. */
  readonly roomKey: string;
}

/** The single client->server message: a player input. */
export type InputMessage = PlayerInput;

// ---------------------------------------------------------------------------
// Server -> client
// ---------------------------------------------------------------------------

/** A single player's public state within a snapshot. */
export interface PlayerSnapshotDto {
  readonly userId: string;
  readonly role: string;
  readonly lane: number;
  readonly x: number;
  readonly distance: number;
  readonly jumpUntilMs: number;
  readonly died: boolean;
  readonly finished: boolean;
  readonly finishTimeMs: number | null;
  /**
   * The last input sequence the server applied for THIS player. The owning
   * client uses it to reconcile its prediction (drop already-acked inputs).
   */
  readonly lastInputSeq: number;
  readonly abilities: string[];
  /** True while a puddle slide boost is active (for VFX + boosted feel). */
  readonly sliding?: boolean;
  /** True while stalled by a trash bin the runner failed to jump. */
  readonly stalled?: boolean;
  /** True while a `speed-up` ability boost is active. */
  readonly boosted?: boolean;
}

/** A single hazard within a snapshot. */
export interface HazardSnapshotDto {
  readonly id: number;
  readonly kind: string;
  readonly lane: number;
  readonly worldY: number;
  readonly open?: boolean;
  readonly angle?: number;
  readonly abilityId?: string;
}

/**
 * The authoritative world snapshot broadcast every `snapshotIntervalMs`. The
 * client renders from this and never invents outcomes.
 */
export interface SnapshotMessage {
  /** Server wall-clock time (ms) this snapshot represents. */
  readonly serverTimeMs: number;
  /** When racing begins (ms) — clients derive the countdown from this. */
  readonly startsAtMs: number;
  /** Race phase: 'waiting' | 'countdown' | 'racing' | 'finished'. */
  readonly phase: string;
  /** Milliseconds of racing elapsed. */
  readonly elapsedMs: number;
  readonly players: PlayerSnapshotDto[];
  readonly hazards: HazardSnapshotDto[];
  /**
   * Open/closed state of each main-lane divider (index 0 = Bugs|Humans,
   * 1 = Humans|Klaus). Clients render the lines + gate crossings from this.
   */
  readonly dividersOpen: boolean[];
}

/** Broadcast when an ability resolves. */
export interface AbilityMessage {
  readonly actorId: string;
  readonly abilityId: string;
  readonly raceMs: number;
  /** Ids eliminated by this activation, if any. */
  readonly eliminatedIds?: string[];
}

/** Broadcast when a runner is eliminated (eat or targeted ability). */
export interface EliminationMessage {
  readonly targetId: string;
  readonly actorId: string | null;
  readonly raceMs: number;
  readonly cause: 'eat' | 'ability';
}

/** Broadcast once when the race ends. */
export interface FinalMessage {
  readonly roomId: string;
  readonly results: Array<{
    readonly userId: string;
    readonly finished: boolean;
    readonly died: boolean;
    readonly finishTimeMs: number | null;
    readonly placement: number;
  }>;
}
