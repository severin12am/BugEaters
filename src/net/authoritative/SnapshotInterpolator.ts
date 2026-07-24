/**
 * =============================================================================
 * SnapshotInterpolator — smooth rendering of remote players.
 * =============================================================================
 *
 * Snapshots arrive ~20 times a second, but we render at 60fps. If we drew remote
 * runners at the latest snapshot each frame they would visibly stutter/teleport.
 *
 * SOLUTION: buffer the last few snapshots and render remote players slightly in
 * the PAST (a small "interpolation delay"). At each frame we find the two
 * snapshots that straddle `renderTime = now - delay` and linearly interpolate
 * between them. This trades a tiny, constant latency for perfectly smooth motion
 * — the right trade-off on mobile / Telegram WebView.
 *
 * The local player is NOT interpolated here; it is predicted (see InputPredictor).
 */
import type { PlayerSnapshotDto, SnapshotMessage } from './protocol.js';

/** How far in the past we render remote players, in ms. ~2 snapshot intervals. */
const DEFAULT_INTERPOLATION_DELAY_MS = 100;
/** How many snapshots to retain for interpolation. */
const BUFFER_SIZE = 12;

/** A remote player's smoothed render state. */
export interface InterpolatedPlayer {
  userId: string;
  role: string;
  lane: number;
  x: number;
  distance: number;
  jumpUntilMs: number;
  died: boolean;
  finished: boolean;
  sliding: boolean;
  stalled: boolean;
  boosted: boolean;
}

export class SnapshotInterpolator {
  private readonly buffer: SnapshotMessage[] = [];
  /** Local clock minus server clock, measured from snapshots. */
  private clockOffsetMs = 0;

  constructor(private readonly delayMs = DEFAULT_INTERPOLATION_DELAY_MS) {}

  /** Ingests a new authoritative snapshot. */
  push(snapshot: SnapshotMessage): void {
    // Track the offset so we can convert local render time to server time.
    this.clockOffsetMs = Date.now() - snapshot.serverTimeMs;
    this.buffer.push(snapshot);
    // Keep the buffer bounded and ordered.
    if (this.buffer.length > BUFFER_SIZE) {
      this.buffer.shift();
    }
  }

  /** The most recent snapshot, or null if none received yet. */
  latest(): SnapshotMessage | null {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
  }

  /**
   * Returns interpolated states for every remote player (i.e. excluding
   * `selfUserId`) at the current render time.
   */
  interpolateRemotePlayers(selfUserId: string): InterpolatedPlayer[] {
    const renderServerTime = Date.now() - this.clockOffsetMs - this.delayMs;
    const [older, newer, t] = this.findStraddling(renderServerTime);
    if (!newer) {
      return [];
    }

    const result: InterpolatedPlayer[] = [];
    for (const newPlayer of newer.players) {
      if (newPlayer.userId === selfUserId) {
        continue;
      }
      const oldPlayer = older?.players.find((p) => p.userId === newPlayer.userId);
      result.push(oldPlayer ? lerpPlayer(oldPlayer, newPlayer, t) : toInterpolated(newPlayer));
    }
    return result;
  }

  /**
   * Interpolated forward distance for ANY player (including the local one) at the
   * SAME render clock used for remote players. This is what makes the on-screen
   * gap between two runners identical on both screens: both distances are sampled
   * from one shared moment in the past, not "self live vs rivals delayed".
   */
  sampleDistance(userId: string): number | null {
    const renderServerTime = Date.now() - this.clockOffsetMs - this.delayMs;
    const [older, newer, t] = this.findStraddling(renderServerTime);
    if (!newer) {
      return null;
    }
    const newPlayer = newer.players.find((p) => p.userId === userId);
    if (!newPlayer) {
      return null;
    }
    const oldPlayer = older?.players.find((p) => p.userId === userId);
    if (!oldPlayer) {
      return newPlayer.distance;
    }
    return oldPlayer.distance + (newPlayer.distance - oldPlayer.distance) * t;
  }

  reset(): void {
    this.buffer.length = 0;
    this.clockOffsetMs = 0;
  }

  /**
   * Finds the two buffered snapshots surrounding `serverTime` and the blend
   * factor `t` in [0, 1] between them.
   */
  private findStraddling(
    serverTime: number,
  ): [older: SnapshotMessage | null, newer: SnapshotMessage | null, t: number] {
    if (this.buffer.length === 0) {
      return [null, null, 0];
    }
    for (let i = this.buffer.length - 1; i >= 1; i--) {
      const newer = this.buffer[i];
      const older = this.buffer[i - 1];
      if (older.serverTimeMs <= serverTime && serverTime <= newer.serverTimeMs) {
        const span = newer.serverTimeMs - older.serverTimeMs || 1;
        const t = (serverTime - older.serverTimeMs) / span;
        return [older, newer, t];
      }
    }
    // Render time is outside the buffer: fall back to the newest snapshot.
    return [null, this.buffer[this.buffer.length - 1], 0];
  }
}

function lerpPlayer(a: PlayerSnapshotDto, b: PlayerSnapshotDto, t: number): InterpolatedPlayer {
  return {
    userId: b.userId,
    role: b.role,
    // Lane is discrete; snap to the destination once past the halfway point.
    lane: t < 0.5 ? a.lane : b.lane,
    x: a.x + (b.x - a.x) * t,
    distance: a.distance + (b.distance - a.distance) * t,
    jumpUntilMs: b.jumpUntilMs,
    died: b.died,
    finished: b.finished,
    sliding: b.sliding ?? false,
    stalled: b.stalled ?? false,
    boosted: b.boosted ?? false,
  };
}

function toInterpolated(p: PlayerSnapshotDto): InterpolatedPlayer {
  return {
    userId: p.userId,
    role: p.role,
    lane: p.lane,
    x: p.x,
    distance: p.distance,
    jumpUntilMs: p.jumpUntilMs,
    died: p.died,
    finished: p.finished,
    sliding: p.sliding ?? false,
    stalled: p.stalled ?? false,
    boosted: p.boosted ?? false,
  };
}
