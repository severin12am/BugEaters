/**
 * =============================================================================
 * Deterministic RNG — reproducible randomness for a fair, authoritative race.
 * =============================================================================
 *
 * Fairness and "trustworthy outcomes" (the whole point of this backend) require
 * that randomness is reproducible: given the same seed and the same inputs, the
 * simulation must produce the same result every time. That lets us:
 *   - replay a race to audit a disputed result,
 *   - share the seed with clients so cosmetic prediction matches the server,
 *   - avoid `Math.random()`, which is non-deterministic and unauditable.
 *
 * This module intentionally has zero dependencies.
 */

/**
 * A small, fast, deterministic pseudo-random generator (mulberry32). Not
 * cryptographically secure — that is fine, we only need reproducibility.
 */
export class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    // Force to an unsigned 32-bit integer so behavior is identical everywhere.
    this.state = seed >>> 0;
  }

  /** Returns the next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  /** Returns an integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}

/**
 * A pure, stateless hash used when we want randomness keyed by a specific index
 * (e.g. "what hazard spawns at slot N?") without threading a mutable generator.
 * Deterministic for a given (seed, index) pair.
 */
export function seededInt(seed: number, index: number, maxExclusive: number): number {
  let x = (seed ^ index) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) % maxExclusive;
}
