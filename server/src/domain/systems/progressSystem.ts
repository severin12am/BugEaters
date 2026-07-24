/**
 * Progress + finish system — advances each runner's forward progress and marks
 * finishers.
 *
 * Unlike a naive "everyone moves with the world" model, each runner integrates
 * its OWN distance every tick using a per-player speed multiplier derived from
 * active effects:
 *
 *   - stalled by trash  → 0×   (no forward progress)
 *   - puddle slide       → 1.5× (solo `puddleSlideBoostMultiplier`)
 *   - speed-up ability   → 1.4×
 *   - otherwise          → 1×   (tracks the world scroll)
 *
 * This is what makes rivals spread out on screen and gives standings a real,
 * skill-based tiebreak instead of collapsing to player id.
 */
import type { PlayerState, WorldState } from '../types.js';
import type { SimulationContext } from './context.js';

const PUDDLE_SLIDE_MULTIPLIER = 1.5;
const SPEED_UP_MULTIPLIER = 1.4;

/** The current forward-speed multiplier for a runner from its active effects. */
export function speedMultiplier(player: PlayerState, raceMs: number): number {
  // Stuck behind a trash bin — no forward progress until a lane change clears it.
  if (player.stuck) {
    return 0;
  }
  if (raceMs < player.stallUntilMs) {
    return 0;
  }
  let multiplier = 1;
  if (raceMs < player.slideUntilMs) {
    multiplier *= PUDDLE_SLIDE_MULTIPLIER;
  }
  if (raceMs < player.boostUntilMs) {
    multiplier *= SPEED_UP_MULTIPLIER;
  }
  return multiplier;
}

/** Integrates each living runner's own distance for this tick. */
export function advanceProgress(world: WorldState, ctx: SimulationContext): void {
  const perMs = ctx.config.world.speedPxPerSec / 1000;
  for (const player of world.players.values()) {
    if (player.died || player.finished) {
      continue;
    }
    player.distance += perMs * ctx.dtMs * speedMultiplier(player, ctx.raceMs);
  }
}

/**
 * Called once when the race clock reaches its end. Every runner still alive is
 * marked finished; their finish time reflects the full race duration (the clock
 * is the gate), while `distance` remains the tiebreak for standings.
 */
export function markFinishers(world: WorldState, ctx: SimulationContext): void {
  for (const player of world.players.values()) {
    if (!player.died && !player.finished) {
      player.finished = true;
      player.finishTimeMs = ctx.config.raceDurationMs;
    }
  }
}
