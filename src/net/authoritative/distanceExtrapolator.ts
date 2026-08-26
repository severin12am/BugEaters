/**
 * Smooths authoritative forward motion between 20Hz snapshots.
 *
 * Snapshots freeze `distance` until the next packet. Drawing that raw value
 * stair-steps the road for every player, anywhere in the world. We keep the
 * last confirmed snapshot and advance it locally with the same speed rules as
 * the server, so the road moves every frame. A late packet is a small
 * correction, not a hitch.
 *
 * Every runner uses the same snapshot + the same elapsed time, so the gap
 * between two players stays consistent on both screens.
 */
import { CLIENT_RACE_CONFIG } from './clientRaceConfig.js';

/** Matches server `progressSystem` / `abilitySystem` multipliers. */
export const SLIDE_MULTIPLIER = 1.5;
export const BOOST_MULTIPLIER = 1.5;
export const SLOW_MULTIPLIER = 0.34;

/**
 * How far we will invent motion after the last packet. Covers a normal
 * mobile/Wi-Fi hitch. After this we hold, so a dropped player does not keep
 * sliding across the track.
 */
export const MAX_EXTRAPOLATE_SEC = 0.35;

/** Ignore one-off clock spikes; snap if the jump is clearly a tab freeze. */
export const CLOCK_RESET_MS = 1_000;
export const CLOCK_SMOOTH_ALPHA = 0.15;

export interface SnapshotSpeedFlags {
  died?: boolean;
  finished?: boolean;
  stalled?: boolean;
  sliding?: boolean;
  boosted?: boolean;
  slowed?: boolean;
}

/** Forward-speed multiplier from the last snapshot's effect flags. */
export function speedMultiplierFromSnapshot(flags: SnapshotSpeedFlags): number {
  if (flags.died || flags.finished || flags.stalled) {
    return 0;
  }
  let multiplier = 1;
  if (flags.sliding) {
    multiplier *= SLIDE_MULTIPLIER;
  }
  if (flags.boosted) {
    multiplier *= BOOST_MULTIPLIER;
  }
  if (flags.slowed) {
    multiplier *= SLOW_MULTIPLIER;
  }
  return multiplier;
}

/** Seconds since the snapshot was stamped, clamped to the extrapolation budget. */
export function snapshotAgeSec(serverNowMs: number, snapshotServerTimeMs: number): number {
  return Math.max(0, Math.min(MAX_EXTRAPOLATE_SEC, (serverNowMs - snapshotServerTimeMs) / 1000));
}

/** Confirmed distance plus predicted travel since that snapshot. */
export function extrapolateDistance(
  distance: number,
  multiplier: number,
  dtSec: number,
  speedPxPerSec: number = CLIENT_RACE_CONFIG.speedPxPerSec,
): number {
  const dt = Math.max(0, Math.min(MAX_EXTRAPOLATE_SEC, dtSec));
  return distance + speedPxPerSec * multiplier * dt;
}

/**
 * Exponential moving average of (local now − server stamp). Stops one late
 * packet from yanking the whole render clock.
 */
export function smoothClockOffset(previous: number | null, measured: number): number {
  if (previous === null || !Number.isFinite(previous)) {
    return measured;
  }
  if (Math.abs(measured - previous) > CLOCK_RESET_MS) {
    return measured;
  }
  return previous * (1 - CLOCK_SMOOTH_ALPHA) + measured * CLOCK_SMOOTH_ALPHA;
}
