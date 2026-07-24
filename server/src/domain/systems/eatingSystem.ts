/**
 * Eating system — resolves food-chain eliminations between real players.
 *
 * The food chain (same as the client's `eatingRules`): Bug → Klaus → Human → Bug.
 * A client sends an `eat` intent when it believes it caught a rival; the SERVER
 * is the authority and only applies the kill when:
 *   - both runners are alive and racing,
 *   - the actor's species may eat the target's species,
 *   - they are close enough (same sub-lane, distances within reach).
 *
 * This prevents a client from eating someone it is nowhere near or a species it
 * cannot eat.
 */
import type { EatInput, PlayerRole, PlayerState, WorldState } from '../types.js';

/** Rock-paper-scissors food chain. Mirrors `src/utils/eatingRules.ts`. */
const EATS: Record<PlayerRole, PlayerRole> = {
  bug: 'klaus',
  klaus: 'human',
  human: 'bug',
};

/** Forward-distance reach for an eat (px). Mirrors solo `TUNING.eating`. */
const EAT_REACH_PX = 34;

export function canEat(eater: PlayerRole, prey: PlayerRole): boolean {
  return EATS[eater] === prey;
}

/**
 * Applies an eat claim. Returns the eaten player's id when a kill happened, else
 * null (invalid claim — ignored).
 */
export function resolveEat(actor: PlayerState, input: EatInput, world: WorldState): string | null {
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
  // Must actually be next to each other on the track.
  if (target.lane !== actor.lane) {
    return null;
  }
  if (Math.abs(target.distance - actor.distance) > EAT_REACH_PX) {
    return null;
  }
  target.died = true;
  return target.id;
}
