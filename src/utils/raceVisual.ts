import { TUNING } from '../config/tuning';
import { RACE_DISTANCE, ux } from './constants';

/**
 * Solo / lab: maps signed progress gap to on-screen Y offset.
 * Positive gap (world ahead of you) = debuff = render higher.
 * Negative gap (you ahead of world, e.g. speed boost) = render lower on screen.
 */
export function raceProgressGapToVisualOffset(progressGapPx: number): number {
  if (progressGapPx === 0) {
    return 0;
  }

  const scale = TUNING.physics.npcAheadVisualScale;
  const maxLag = ux(TUNING.physics.maxRaceVisualLagPx);
  const maxLead = ux(TUNING.physics.maxRaceVisualLeadPx ?? TUNING.physics.maxRaceVisualLagPx);

  if (progressGapPx > 0) {
    return Math.min(progressGapPx * scale, maxLag);
  }

  return Math.max(progressGapPx * scale, -maxLead);
}

/** @deprecated Use {@link raceProgressGapToVisualOffset}. */
export function raceLagToVisualOffset(aheadGapPx: number): number {
  return raceProgressGapToVisualOffset(aheadGapPx);
}

/**
 * Multiplayer: maps a signed progress gap (their `distanceTraveled` − yours) to
 * an on-screen Y offset across the visible runner band.
 *
 * Design goals:
 * - Local player stays anchored at `groundY`; slowdowns/trash read as rivals
 *   climbing ahead, not a fake fixed offset.
 * - Linear mapping: double the gap → double the separation (until band limit).
 * - Ahead rivals move up; behind rivals move down but stay on screen.
 *
 * @param progressGapPx positive when the other runner is ahead in the race
 * @param groundY anchor line where the local player stands when tied
 * @returns offset to subtract from `groundY` (positive = render higher on screen)
 */
export function rivalProgressGapToScreenOffset(
  progressGapPx: number,
  groundY: number,
): number {
  if (progressGapPx === 0) {
    return 0;
  }

  const cfg = TUNING.multiplayer.rivalVisual;
  const referenceGap = RACE_DISTANCE * cfg.referenceGapFraction;
  if (referenceGap <= 0) {
    return 0;
  }

  const maxAhead = Math.max(ux(40), groundY - ux(cfg.minRunnerYFromTop));
  const maxBehind = ux(cfg.maxBehindPx);

  if (progressGapPx > 0) {
    const t = Math.min(1, progressGapPx / referenceGap);
    return t * maxAhead;
  }

  const t = Math.min(1, -progressGapPx / referenceGap);
  return -t * maxBehind;
}

/**
 * Authoritative multiplayer: a FAITHFUL 1:1 mapping of the signed progress gap
 * to a screen offset. The rival is drawn at its true race distance relative to
 * you — exactly like the world's obstacles — so:
 *
 *   - the on-screen distance between two runners is identical on both screens
 *     (it's the same real gap, just mirrored: A sees B ahead, B sees A behind),
 *   - a runner who pulls ahead genuinely runs UP and off the top of the screen
 *     (and a runner who falls behind drops off the bottom), like a real race,
 *   - a rival lines up perfectly with an obstacle at the same distance.
 *
 * We clamp only to a large off-screen bound so extreme values never produce
 * absurd coordinates; within a few screens of you it is pure 1:1.
 *
 * @param progressGapPx positive when the other runner is ahead in the race
 */
export function authRivalGapToScreenOffset(progressGapPx: number): number {
  const bound = ux(2000); // a few screens; beyond this the rival is long gone
  return Math.max(-bound, Math.min(bound, progressGapPx));
}
