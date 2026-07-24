/**
 * =============================================================================
 * Race lifecycle — the phase state machine.
 * =============================================================================
 *
 * A race moves through a strict sequence of phases:
 *
 *     Waiting  ->  Countdown  ->  Racing  ->  Finished
 *
 * This module is the ONLY place that decides which phase a race is in at a given
 * time. Keeping the transition logic here (instead of scattered `if` checks)
 * makes the flow easy to read, test, and change later (e.g. adding a warm-up or
 * a photo-finish phase).
 *
 * The phase is derived purely from the clock relative to `startsAtMs`, which is
 * itself set by the lobby/matchmaking layer and carried in the signed ticket.
 */

import type { RaceConfig } from '../config/raceConfig.js';
import { RacePhase } from './types.js';

/**
 * Computes the phase a race should be in at wall-clock time `nowMs`.
 *
 * @param nowMs       Current server wall-clock time (ms).
 * @param startsAtMs  When racing begins (ms).
 * @param config      Race timing configuration.
 */
export function derivePhase(nowMs: number, startsAtMs: number, config: RaceConfig): RacePhase {
  const countdownStartsAtMs = startsAtMs - config.countdownMs;
  const endsAtMs = startsAtMs + config.raceDurationMs;

  if (nowMs >= endsAtMs) {
    return RacePhase.Finished;
  }
  if (nowMs >= startsAtMs) {
    return RacePhase.Racing;
  }
  if (nowMs >= countdownStartsAtMs) {
    return RacePhase.Countdown;
  }
  return RacePhase.Waiting;
}

/** Milliseconds of racing that have elapsed (0 before the green light). */
export function elapsedRaceMs(nowMs: number, startsAtMs: number): number {
  return Math.max(0, nowMs - startsAtMs);
}

/** True once the full race duration has passed. */
export function isRaceOver(nowMs: number, startsAtMs: number, config: RaceConfig): boolean {
  return nowMs >= startsAtMs + config.raceDurationMs;
}
