/**
 * =============================================================================
 * Admission: roster mapping.
 * =============================================================================
 *
 * Translates verified ticket claims into the neutral {@link PlayerSpawn} shape
 * the simulation understands. This keeps the simulation completely unaware of
 * how players were matched, authenticated, or paid — it just receives spawns.
 *
 * It also derives the immutable race parameters (seed, start time, capacity)
 * that every ticket for a given room must agree on.
 */
import { clampRoomCapacity, type RaceConfig } from '../config/raceConfig.js';
import type { PlayerRole, PlayerSpawn } from '../domain/types.js';
import type { RaceTicketClaims } from './auth.js';

/** Immutable parameters that define a race, taken from the first valid ticket. */
export interface RaceParams {
  readonly roomId: string;
  readonly seed: number;
  readonly startsAtMs: number;
  readonly capacity: number;
}

/** Builds the immutable race parameters for a room from a ticket. */
export function raceParamsFromTicket(claims: RaceTicketClaims, config: RaceConfig): RaceParams {
  return {
    roomId: claims.roomId,
    seed: claims.seed >>> 0,
    startsAtMs: claims.startsAtMs,
    // Enforce the "3 to 12 players" rule in exactly one place.
    capacity: clampRoomCapacity(claims.maxPlayers, config),
  };
}

/**
 * Center sub-lane for a role's main lane:
 * Bug 0–2 (left), Human 3–5 (middle), Klaus 6–8 (right).
 */
export function laneForRole(role: PlayerRole, requestedLane: number, laneCount: number): number {
  const base = role === 'bug' ? 0 : role === 'human' ? 3 : 6;
  const max = Math.min(base + 2, laneCount - 1);
  if (requestedLane >= base && requestedLane <= max) {
    return requestedLane;
  }
  return base + 1; // center of that main lane
}

/** Builds a spawn descriptor for the simulation from a ticket. */
export function spawnFromTicket(claims: RaceTicketClaims, config: RaceConfig): PlayerSpawn {
  return {
    id: claims.userId,
    role: claims.role,
    lane: laneForRole(claims.role, claims.globalSubLane, config.world.laneCount),
  };
}

/**
 * Guards that a joining ticket is consistent with the room it targets. Two
 * tickets for the same room must share seed + start time, or someone is trying
 * to desync the simulation.
 */
export function assertConsistentParams(existing: RaceParams, incoming: RaceParams): void {
  if (existing.roomId !== incoming.roomId) {
    throw new Error('ticket room mismatch');
  }
  if (existing.seed !== incoming.seed || existing.startsAtMs !== incoming.startsAtMs) {
    throw new Error('ticket parameters do not match the active race');
  }
}
