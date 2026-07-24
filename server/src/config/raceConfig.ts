/**
 * =============================================================================
 * Race configuration — the single source of truth for tunable race parameters.
 * =============================================================================
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Everything that a future designer might want to tweak about how a race behaves
 * lives here: room sizes, tick rate, race duration, world speed, lane geometry,
 * and the countdown length. Keeping these values in one typed object means:
 *
 *   1. Game rules can change WITHOUT touching the simulation or networking code.
 *   2. The values are validated once, at startup, so a bad config fails fast.
 *   3. Tests and tools can build alternative configs (e.g. tiny 3-player rooms).
 *
 * HOW TO CHANGE A RULE
 * --------------------
 * Edit `DEFAULT_RACE_CONFIG` below (or override individual fields via the
 * environment variables documented on each field). Do NOT hard-code these
 * numbers anywhere else — read them from the config object that is threaded
 * through the simulation.
 */

/**
 * Every tunable value that defines a race. This is a plain data object so it can
 * be serialized, logged, snapshotted into results, and swapped in tests.
 */
export interface RaceConfig {
  /** Fixed simulation step, in milliseconds. Lower = smoother but more CPU. */
  readonly tickMs: number;

  /**
   * How often authoritative snapshots are broadcast to clients, in milliseconds.
   * Usually equal to (or a small multiple of) `tickMs`. On mobile/Telegram
   * WebView, ~15-20Hz (50-66ms) is a good balance of smoothness and bandwidth.
   */
  readonly snapshotIntervalMs: number;

  /** Total race length once the green light drops, in milliseconds. */
  readonly raceDurationMs: number;

  /**
   * Delay between the room being full/ready and the race actually starting.
   * Gives every client time to load the scene and show a "3..2..1" countdown.
   */
  readonly countdownMs: number;

  /** Room size limits. The server refuses configs / tickets outside this band. */
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** Default room capacity used when a ticket does not specify one. */
  readonly defaultPlayers: number;

  /**
   * DEV/TESTING ONLY: when true, no player ever dies (off-road, manholes, eats
   * and targeted abilities are all non-fatal). Lets a playtest run the full race
   * without anyone dropping to the end screen. Enable with `RACE_IMMORTAL=1`.
   * Never enable in production.
   */
  readonly immortal: boolean;

  /**
   * ---- World geometry (game-specific; safe to change per game feel) ----
   * These describe the lane-runner playfield. They are intentionally grouped so
   * the movement + hazard systems read geometry from config instead of magic
   * numbers. See docs/multiplayer/INPUTS_TO_OUTCOMES.md.
   */
  readonly world: {
    /** Forward scroll speed of the world, in px/second. */
    readonly speedPxPerSec: number;
    /** Number of discrete sub-lanes a runner can occupy (0 .. laneCount-1). */
    readonly laneCount: number;
    /** Horizontal spacing between sub-lane centers, in px. */
    readonly subLaneWidth: number;
    /** How long a jump keeps a runner airborne, in milliseconds. */
    readonly jumpDurationMs: number;
  };
}

/**
 * The default race configuration. Values mirror the original single-player tuning
 * (see `src/config/tuning.ts` on the client) so the authoritative server and the
 * client renderer agree on world feel.
 *
 * NOTE: Room size is configurable from 3 to 12 players as required. The actual
 * capacity of a given room comes from the signed ticket (`maxPlayers`) so the
 * lobby/matchmaking layer in Supabase stays the source of truth — but it is
 * always clamped into the [minPlayers, maxPlayers] band defined here.
 */
export const DEFAULT_RACE_CONFIG: RaceConfig = {
  tickMs: 50, // 20Hz simulation
  snapshotIntervalMs: 50, // 20Hz broadcast
  raceDurationMs: 60_000, // 60-second race
  countdownMs: 3_000,

  minPlayers: 3,
  maxPlayers: 12,
  defaultPlayers: 6,

  immortal: false,

  world: {
    speedPxPerSec: 442,
    laneCount: 9,
    subLaneWidth: 40,
    jumpDurationMs: 550,
  },
};

/**
 * Builds a validated {@link RaceConfig}, applying environment-variable overrides
 * on top of {@link DEFAULT_RACE_CONFIG}. Call this ONCE at startup (see the
 * composition root in `runtime/serverContext.ts`).
 *
 * Supported overrides (all optional):
 *   RACE_TICK_MS, RACE_SNAPSHOT_MS, RACE_DURATION_MS, RACE_COUNTDOWN_MS,
 *   RACE_MIN_PLAYERS, RACE_MAX_PLAYERS, RACE_DEFAULT_PLAYERS
 */
export function loadRaceConfig(env: NodeJS.ProcessEnv = process.env): RaceConfig {
  const config: RaceConfig = {
    ...DEFAULT_RACE_CONFIG,
    tickMs: numberFromEnv(env.RACE_TICK_MS, DEFAULT_RACE_CONFIG.tickMs),
    snapshotIntervalMs: numberFromEnv(env.RACE_SNAPSHOT_MS, DEFAULT_RACE_CONFIG.snapshotIntervalMs),
    raceDurationMs: numberFromEnv(env.RACE_DURATION_MS, DEFAULT_RACE_CONFIG.raceDurationMs),
    countdownMs: numberFromEnv(env.RACE_COUNTDOWN_MS, DEFAULT_RACE_CONFIG.countdownMs),
    minPlayers: numberFromEnv(env.RACE_MIN_PLAYERS, DEFAULT_RACE_CONFIG.minPlayers),
    maxPlayers: numberFromEnv(env.RACE_MAX_PLAYERS, DEFAULT_RACE_CONFIG.maxPlayers),
    defaultPlayers: numberFromEnv(env.RACE_DEFAULT_PLAYERS, DEFAULT_RACE_CONFIG.defaultPlayers),
    immortal: boolFromEnv(env.RACE_IMMORTAL, DEFAULT_RACE_CONFIG.immortal),
  };
  assertValidConfig(config);
  if (config.immortal) {
    console.warn('[raceConfig] RACE_IMMORTAL is ON — players cannot die (dev/testing only)');
  }
  return config;
}

/**
 * Clamps a requested room capacity (e.g. from a ticket) into the configured
 * [minPlayers, maxPlayers] band. Centralizing this keeps the "3 to 12" rule in
 * exactly one place.
 */
export function clampRoomCapacity(requested: number, config: RaceConfig): number {
  if (!Number.isFinite(requested)) {
    return config.defaultPlayers;
  }
  return Math.max(config.minPlayers, Math.min(config.maxPlayers, Math.round(requested)));
}

/** Fails fast on nonsensical configuration so we never run a broken server. */
function assertValidConfig(config: RaceConfig): void {
  if (config.tickMs <= 0) {
    throw new Error('[raceConfig] tickMs must be > 0');
  }
  if (config.snapshotIntervalMs < config.tickMs) {
    throw new Error('[raceConfig] snapshotIntervalMs must be >= tickMs');
  }
  if (config.raceDurationMs <= 0) {
    throw new Error('[raceConfig] raceDurationMs must be > 0');
  }
  if (config.minPlayers < 1 || config.minPlayers > config.maxPlayers) {
    throw new Error('[raceConfig] minPlayers must be between 1 and maxPlayers');
  }
  if (
    config.defaultPlayers < config.minPlayers ||
    config.defaultPlayers > config.maxPlayers
  ) {
    throw new Error('[raceConfig] defaultPlayers must be within [minPlayers, maxPlayers]');
  }
  if (config.world.laneCount < 1) {
    throw new Error('[raceConfig] world.laneCount must be >= 1');
  }
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
