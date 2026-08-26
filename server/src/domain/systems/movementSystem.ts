/**
 * Movement system — turns a player's steering/jump intent into authoritative
 * position changes. This is deliberately tiny and side-effect free beyond the
 * player it is given, which makes lane logic trivial to change later.
 */
import type { RaceConfig } from '../../config/raceConfig.js';
import type { MoveInput, JumpInput, PlayerState, WorldState } from '../types.js';
import { hasBarriersForcedOpen } from './abilitySystem.js';
import { boundaryCrossed } from './dividerSystem.js';

/** Horizontal center (world X, px) of a given sub-lane. */
export function laneCenterX(lane: number, config: RaceConfig): number {
  return config.world.subLaneWidth + lane * config.world.subLaneWidth;
}

/**
 * Applies a lane-change intent authoritatively, matching the single-player rules:
 *
 *   - Stepping off the outer edge (left of lane 0 / right of the last lane) is
 *     fatal — the runner leaves the track and dies.
 *   - Crossing a main-lane boundary (Bugs|Humans, Humans|Klaus) is only allowed
 *     while that divider is OPEN. A move into a closed divider is rejected
 *     (the runner stays put), never fatal.
 *   - Any other in-lane step succeeds.
 *
 * `world.dividersOpen` must be up to date for the current tick before this runs.
 */
export function applyMove(
  player: PlayerState,
  input: MoveInput,
  world: WorldState,
  config: RaceConfig,
  raceMs = 0,
): void {
  const delta = input.direction === 'left' ? -1 : 1;
  const target = player.lane + delta;

  // Off the track edge → death (mirrors solo's off-road death step).
  // Under immortality (dev), the step is simply rejected instead of fatal.
  if (target < 0 || target > config.world.laneCount - 1) {
    if (!config.immortal) {
      player.died = true;
    }
    return;
  }

  // Blocked by a closed main-lane divider → no movement (unless OPENED BORDERS).
  const boundary = boundaryCrossed(player.lane, delta);
  if (
    boundary !== null &&
    !world.dividersOpen[boundary] &&
    !hasBarriersForcedOpen(player, raceMs)
  ) {
    return;
  }

  player.lane = target;
  player.x = laneCenterX(player.lane, config);
  // Changing lane goes AROUND a trash bin — clears the stuck state.
  player.stuck = false;
}

/** Applies a jump intent by marking the player airborne for the configured window. */
export function applyJump(player: PlayerState, _input: JumpInput, raceMs: number, config: RaceConfig): void {
  player.jumpUntilMs = raceMs + config.world.jumpDurationMs;
  // TODO(game-rules): add jump cooldown / double-jump rules here if needed.
}

/** True while the player is in the air at the given race time. */
export function isAirborne(player: PlayerState, raceMs: number): boolean {
  return raceMs < player.jumpUntilMs;
}
