/**
 * Divider system — decides when the two main-lane boundaries (Bugs|Humans and
 * Humans|Klaus) are crossable.
 *
 * Dividers are SOLID by default and periodically open a passable gap. The whole
 * schedule is a pure function of (seed, boundary index, raceMs) so:
 *   - the server never stores mutable divider state to get out of sync,
 *   - every tick recomputes the same truth,
 *   - the state is broadcast so clients render identical lines.
 *
 * Timings mirror the client's original single-player feel
 * (`TUNING.laneDividers`): closed 8..15s, open 3..8s.
 */
import { seededInt } from '../rng.js';

/** Number of crossable boundaries between the three main lanes. */
export const DIVIDER_COUNT = 2;

const CLOSED_MIN_MS = 8_000;
const CLOSED_MAX_MS = 15_000;
const OPEN_MIN_MS = 3_000;
const OPEN_MAX_MS = 8_000;

/** Deterministic ms in [min, max] for a given boundary + cycle. */
function durationFor(seed: number, boundary: number, cycle: number, min: number, max: number): number {
  // Distinct salt per (boundary, cycle, phase) so closed/open pull different values.
  const salt = (boundary * 7919 + cycle * 104729) >>> 0;
  const span = max - min;
  return min + seededInt(seed ^ salt, cycle + 1, span + 1);
}

/**
 * True when the boundary is OPEN (crossable) at `raceMs`. Walks the deterministic
 * closed→open cycle from t=0. Bounded: cycles are ≥11s so a 60s race is ≤6 cycles.
 */
export function isDividerOpenAt(seed: number, boundary: number, raceMs: number): boolean {
  let t = 0;
  for (let cycle = 0; cycle < 64; cycle++) {
    const closed = durationFor(seed, boundary, cycle, CLOSED_MIN_MS, CLOSED_MAX_MS);
    if (raceMs < t + closed) {
      return false; // Inside the closed window.
    }
    t += closed;
    const open = durationFor(seed, boundary, cycle, OPEN_MIN_MS, OPEN_MAX_MS) + 1;
    if (raceMs < t + open) {
      return true; // Inside the open window.
    }
    t += open;
  }
  return false;
}

/** Computes the open/closed state of every divider at `raceMs`. */
export function computeDividers(seed: number, raceMs: number): boolean[] {
  const out: boolean[] = [];
  for (let boundary = 0; boundary < DIVIDER_COUNT; boundary++) {
    out.push(isDividerOpenAt(seed, boundary, raceMs));
  }
  return out;
}

/**
 * If a move from `fromLane` by `delta` (±1) crosses a main-lane boundary,
 * returns that boundary index; otherwise null.
 *
 * Main lanes: Bugs 0..2, Humans 3..5, Klaus 6..8.
 * Boundary 0 sits between lane 2 and 3; boundary 1 between lane 5 and 6.
 */
export function boundaryCrossed(fromLane: number, delta: number): number | null {
  const toLane = fromLane + delta;
  if ((fromLane === 2 && toLane === 3) || (fromLane === 3 && toLane === 2)) {
    return 0;
  }
  if ((fromLane === 5 && toLane === 6) || (fromLane === 6 && toLane === 5)) {
    return 1;
  }
  return null;
}
