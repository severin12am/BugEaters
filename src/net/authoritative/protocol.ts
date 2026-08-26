/**
 * =============================================================================
 * Client wire protocol — mirror of the server's `server/src/net/protocol.ts`.
 * =============================================================================
 */

/** Colyseus message channel names — must match the server. */
export const CHANNEL = {
  Input: 'input',
  Snapshot: 'snapshot',
  Ability: 'ability',
  Elimination: 'elimination',
  Dilemma: 'dilemma',
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
export interface DilemmaChoiceInput extends InputBase {
  type: 'dilemma';
  encounterId: string;
  choice: 'cooperate' | 'eat';
}
export type PlayerInput =
  | MoveInput
  | JumpInput
  | ActivateAbilityInput
  | EatInput
  | DilemmaChoiceInput;

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
  sliding?: boolean;
  stalled?: boolean;
  boosted?: boolean;
  eatProtected?: boolean;
  blackrock?: boolean;
  barriersOpen?: boolean;
  flight?: boolean;
  hellMode?: boolean;
  slowed?: boolean;
  flashlight?: boolean;
}

export interface HazardSnapshotDto {
  id: number;
  kind: string;
  lane: number;
  worldY: number;
  open?: boolean;
  angle?: number;
  abilityId?: string;
  resolvedBy?: string[];
}

export type RacePhaseWire = 'waiting' | 'countdown' | 'racing' | 'finished';

export interface SnapshotMessage {
  serverTimeMs: number;
  startsAtMs: number;
  phase: RacePhaseWire;
  elapsedMs: number;
  players: PlayerSnapshotDto[];
  hazards: HazardSnapshotDto[];
  dividersOpen: boolean[];
}

export interface AbilityMessage {
  actorId: string;
  abilityId: string;
  raceMs: number;
  eliminatedIds?: string[];
  placedHazardId?: number;
}

export interface EliminationMessage {
  targetId: string;
  actorId: string | null;
  raceMs: number;
  cause: 'eat' | 'ability' | 'dilemma';
}

export interface DilemmaMessage {
  type: 'start' | 'resolve';
  encounterId: string;
  raceMs: number;
  aId: string;
  bId: string;
  deadlineRaceMs?: number;
  outcome?: string;
  diedIds?: string[];
  boostedIds?: string[];
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
