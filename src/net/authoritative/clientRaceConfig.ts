/**
 * Client-side race geometry constants.
 *
 * IMPORTANT: these MUST match the server's `world` config in
 * `server/src/config/raceConfig.ts`. They are duplicated here (not fetched) so
 * the client can predict local movement instantly, before the server confirms.
 * If you change lane geometry on the server, change it here too.
 *
 * The server remains authoritative: prediction is only a visual convenience and
 * is always corrected by the next authoritative snapshot (reconciliation).
 */
export const CLIENT_RACE_CONFIG = {
  laneCount: 9,
  subLaneWidth: 40,
  jumpDurationMs: 550,
  speedPxPerSec: 442,
} as const;

/** Horizontal center (world X, px) of a sub-lane — mirrors the server. */
export function laneCenterX(lane: number): number {
  return CLIENT_RACE_CONFIG.subLaneWidth + lane * CLIENT_RACE_CONFIG.subLaneWidth;
}
