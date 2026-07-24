/**
 * Deterministic seeded PRNG (mulberry32).
 *
 * The multiplayer world (obstacles, lane dividers) is generated entirely from a
 * room seed so every client computes the identical hazards with no network
 * sync. For that to hold, ALL randomness in those systems must come from one of
 * these generators and be drawn in a fixed order.
 */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive (matches Phaser.Math.Between). */
  between(min: number, max: number): number;
  /** Float in [min, max). */
  floatBetween(min: number, max: number): number;
  /** Uniformly pick an element. */
  pick<T>(items: readonly T[]): T;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed >>> 0);
  return {
    next,
    between(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    floatBetween(min: number, max: number): number {
      return min + next() * (max - min);
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)];
    },
  };
}

/** Stable 32-bit hash of a string (e.g. a room id) into a usable seed. */
export function hashStringToSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Derive an independent child seed from a base seed and an integer salt. */
export function deriveSeed(base: number, salt: number): number {
  let h = (base ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A fresh random seed for solo play. */
export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0);
}
