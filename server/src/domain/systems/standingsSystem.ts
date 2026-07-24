/**
 * Standings system — turns the final world state into an ordered list of
 * authoritative results. This is the bridge between "the simulation" and "the
 * outcome" that downstream systems (Supabase, NFT minting, prizes) consume.
 *
 * Ordering rules (reference; change here if scoring changes):
 *   1. Survivors rank above those who died.
 *   2. Among survivors, earlier finish time ranks higher.
 *   3. Ties break by greater forward distance, then by player id (stable).
 */
import type { PlayerResult, WorldState } from '../types.js';

export function computeStandings(world: WorldState): PlayerResult[] {
  const players = [...world.players.values()];

  players.sort((a, b) => {
    // 1. Alive before dead.
    if (a.died !== b.died) {
      return a.died ? 1 : -1;
    }
    // 2. Earlier finish time first (nulls treated as "did not finish").
    const at = a.finishTimeMs ?? Number.POSITIVE_INFINITY;
    const bt = b.finishTimeMs ?? Number.POSITIVE_INFINITY;
    if (at !== bt) {
      return at - bt;
    }
    // 3. Further distance first.
    if (a.distance !== b.distance) {
      return b.distance - a.distance;
    }
    // 4. Stable, deterministic fallback.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return players.map((player, index) => ({
    userId: player.id,
    finished: player.finished,
    died: player.died,
    finishTimeMs: player.finishTimeMs,
    placement: index + 1,
  }));
}
