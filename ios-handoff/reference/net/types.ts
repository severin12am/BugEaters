import type { RaceRoomPhase } from '../config/multiplayer';
import type { CharacterType } from '../utils/constants';

/** Roster slot assigned to a player in a room. */
export interface RosterSlot {
  characterType: CharacterType;
  /** Global sub-lane index 0-8. */
  globalSubLane: number;
}

/** Result of joining/creating a room. */
export interface RoomInfo {
  roomId: string;
  seed: number;
  /** Synchronized race start, in the client's clock (server offset applied). */
  startsAtMs: number | null;
  phase: RaceRoomPhase;
  /** This client's assigned slot. */
  self: RosterSlot;
  userId: string;
}

/** A member visible in the lobby/race (from Presence + profiles). */
export interface RoomMember {
  userId: string;
  username: string | null;
  characterType: CharacterType;
  globalSubLane: number;
}

/**
 * Per-frame-ish player state broadcast at ~10-12Hz. Kept tiny: lane + vertical
 * offset + race distance + flags. Receivers interpolate between snapshots.
 */
export interface PlayerSnapshot {
  userId: string;
  globalSubLane: number;
  /** World X (px) for smooth horizontal interpolation between lanes. */
  x: number;
  /** Height above ground (px); >0 while jumping. */
  height: number;
  /** Player race progress (px) — used to place rivals ahead/behind. */
  distance: number;
  alive: boolean;
  /** Sender wall-clock timestamp (ms) for interpolation ordering. */
  t: number;
}

/** Final standing for one room member (end screen). */
export interface Standing {
  userId: string;
  characterType: CharacterType;
  globalSubLane: number;
  finished: boolean;
  died: boolean;
  finishTimeMs: number | null;
}

/** Authoritative elimination written by the referee and streamed to clients. */
export interface EliminationEvent {
  actorId: string | null;
  targetId: string | null;
  raceTimeMs: number | null;
}

/** A claim sent to the referee when a local player believes an eat happened. */
export interface EatClaim {
  roomId: string;
  /** The player attempting to eat (usually self). */
  actorId: string;
  /** The intended victim. */
  targetId: string;
  raceTimeMs: number;
  /** Cross-species food chain (default) or same-species Prisoner's Dilemma betrayal. */
  kind?: 'food-chain' | 'dilemma';
}

/** Broadcast when a Prisoner's Dilemma encounter begins between two real players. */
export interface DilemmaStartEvent {
  encounterId: string;
  initiatorId: string;
  targetId: string;
}

/** Broadcast when a player picks cooperate / eat during a dilemma. */
export interface DilemmaChoiceEvent {
  encounterId: string;
  userId: string;
  choice: 'cooperate' | 'eat';
}
