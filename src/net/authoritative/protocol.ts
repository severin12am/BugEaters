/**
 * =============================================================================
 * Client wire protocol — mirror of the server's `server/src/net/protocol.ts`.
 * =============================================================================
 *
 * The client and server are built separately, so they cannot import each other.
 * Instead they keep two copies of the SAME message shapes. If you change a
 * message on the server, change it here too (they are deliberately identical).
 *
 * The client only ever SENDS inputs and only ever RENDERS snapshots — it never
 * decides an outcome. That is what makes the system authoritative and fair.
 */

/** Colyseus message channel names — must match the server. */
export const CHANNEL = {
  Input: 'input',
  Snapshot: 'snapshot',
  Ability: 'ability',
  Elimination: 'elimination',
  Final: 'final',
} as const;

// ---- Inputs (client -> server) --------------------------------------------

export interface InputBase {
  seq: number;
  clientTimeMs?: number;
}
export interface MoveInput extends InputBase {
  type: 'move';
  direction: 'left' | 'right';
}
export interface JumpInput extends InputBase {
  type: 'jump';
}
export interface ActivateAbilityInput extends InputBase {
  type: 'activate';
  abilityId: string;
  aimX?: number;
  aimY?: number;
}
export interface EatInput extends InputBase {
  type: 'eat';
  targetId: string;
}
export type PlayerInput = MoveInput | JumpInput | ActivateAbilityInput | EatInput;

// ---- Snapshots + events (server -> client) --------------------------------

export interface PlayerSnapshotDto {
  userId: string;
  role: string;
  lane: number;
  x: number;
  distance: number;
  jumpUntilMs: number;
  died: boolean;
  finished: boolean;
  finishTimeMs: number | null;
  lastInputSeq: number;
  abilities: string[];
  /** True while a puddle slide boost is active. */
  sliding?: boolean;
  /** True while stalled by a trash bin. */
  stalled?: boolean;
  /** True while a `speed-up` ability boost is active. */
  boosted?: boolean;
}

export interface HazardSnapshotDto {
  id: number;
  kind: string;
  lane: number;
  worldY: number;
  open?: boolean;
  angle?: number;
  abilityId?: string;
}

export type RacePhaseWire = 'waiting' | 'countdown' | 'racing' | 'finished';

export interface SnapshotMessage {
  serverTimeMs: number;
  startsAtMs: number;
  phase: RacePhaseWire;
  elapsedMs: number;
  players: PlayerSnapshotDto[];
  hazards: HazardSnapshotDto[];
  /** Open/closed state per main-lane divider (0 = Bugs|Humans, 1 = Humans|Klaus). */
  dividersOpen: boolean[];
}

export interface AbilityMessage {
  actorId: string;
  abilityId: string;
  raceMs: number;
  eliminatedIds?: string[];
}

export interface EliminationMessage {
  targetId: string;
  actorId: string | null;
  raceMs: number;
  cause: 'eat' | 'ability';
}

export interface FinalMessage {
  roomId: string;
  results: Array<{
    userId: string;
    finished: boolean;
    died: boolean;
    finishTimeMs: number | null;
    placement: number;
  }>;
}
