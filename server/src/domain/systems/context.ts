/**
 * Shared context passed to every simulation system on each tick.
 *
 * Systems are small, focused functions that read + mutate the WorldState. They
 * never reach for globals (no `Date.now()`, no `Math.random()`); everything they
 * need to be deterministic is handed to them here.
 */
import type { RaceConfig } from '../../config/raceConfig.js';
import type { DeterministicRng } from '../rng.js';

export interface SimulationContext {
  /** Immutable race configuration. */
  readonly config: RaceConfig;
  /** Deterministic RNG for this race (seeded from the shared world seed). */
  readonly rng: DeterministicRng;
  /** Milliseconds of racing elapsed at the START of this tick. */
  readonly raceMs: number;
  /** Milliseconds elapsed since the previous simulated tick (for integration). */
  readonly dtMs: number;
  /**
   * Forward world position (px) at this tick. Hazards and progress are anchored
   * to this so every player experiences the same scrolling world.
   */
  readonly worldY: number;
}
