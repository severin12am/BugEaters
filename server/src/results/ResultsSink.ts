/**
 * =============================================================================
 * ResultsSink — where sealed race outcomes go.
 * =============================================================================
 *
 * The simulation produces authoritative standings. WHERE those standings are
 * persisted is a separate concern, expressed by this interface. Today the only
 * real implementation writes to Supabase, but you could add sinks for tests, a
 * data warehouse, or an on-chain settlement service without touching the game.
 *
 * This is a classic "port" (in ports & adapters / hexagonal architecture): the
 * game depends on the interface, not on Supabase.
 */
import type { PlayerResult } from '../domain/types.js';

/** The complete, ordered outcome of one race, ready to be persisted. */
export interface SealedRaceResult {
  readonly roomId: string;
  readonly seed: number;
  readonly startsAtMs: number;
  /** When the server sealed the result (ms). */
  readonly sealedAtMs: number;
  /** Ordered standings (placement 1..N). */
  readonly results: PlayerResult[];
}

/** A destination for sealed race results. */
export interface ResultsSink {
  /**
   * Persists a sealed result. Must be idempotent-friendly: the downstream store
   * is expected to reject duplicate submissions for the same room. Should throw
   * on failure so the caller can retry / alert.
   */
  submit(result: SealedRaceResult): Promise<void>;
}
