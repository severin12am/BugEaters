/**
 * Eating system — resolves food-chain eliminations between real players.
 *
 * The food chain (same as the client's `eatingRules`): Bug → Klaus → Human → Bug.
 * A client sends an `eat` intent when it believes it caught a rival; the SERVER
 * is the authority and only applies the kill when proximity + food-chain match.
 *
 * IMPORTANT: do NOT require the same sub-lane. Species start on different main
 * lanes (Bug left / Human middle / Klaus right). Solo eating uses screen
 * proximity; the server mirrors that with logical X + distance reach so a Human
 * can eat a Bug after crossing into contact range.
 */
import type { EatInput, PlayerRole, PlayerState, WorldState } from '../types.js';
import type { SimulationContext } from './context.js';

/** Rock-paper-scissors food chain. Mirrors `src/utils/eatingRules.ts`. */
const EATS: Record<PlayerRole, PlayerRole> = {
  bug: 'klaus',
  klaus: 'human',
  human: 'bug',
};

/** Logical px — mirrors solo `TUNING.eating` (before client DPR scale). */
const EAT_REACH_X_PX = 26;
const EAT_REACH_DISTANCE_PX = 32;

export function canEat(eater: PlayerRole, prey: PlayerRole): boolean {
  return EATS[eater] === prey;
}

/**
 * Applies an eat claim. Returns the eaten player's id when a kill happened, else
 * null (invalid claim — ignored).
 */
export function resolveEat(
  actor: PlayerState,
  input: EatInput,
  world: WorldState,
  ctx?: SimulationContext,
): string | null {
  if (actor.died || actor.finished) {
    return null;
  }
  const target = world.players.get(input.targetId);
  if (!target || target.died || target.finished) {
    return null;
  }
  if (!canEat(actor.role, target.role)) {
    return null;
  }
  const raceMs = ctx?.raceMs ?? world.elapsedMs;
  if (raceMs < target.eatProtectedUntilMs) {
    return null;
  }
  // Proximity in world space (logical px) — same idea as solo horizontal/vertical reach.
  if (Math.abs(target.x - actor.x) > EAT_REACH_X_PX) {
    return null;
  }
  if (Math.abs(target.distance - actor.distance) > EAT_REACH_DISTANCE_PX) {
    return null;
  }
  target.died = true;
  return target.id;
}
