/**
 * Central tuning file — adjust gameplay feel here.
 * All values use logical pixels (before device DPR scaling) unless marked as seconds/ms.
 */
export const TUNING = {
  /** Race timing. */
  race: {
    durationSec: 60,
  },

  /** HUD layout (logical px below Telegram safe-area top). */
  hud: {
    topPadding: 52,
    rowGap: 38,
    menuTitleOffset: 40,
    menuSubtitleOffset: 95,
  },

  /** Sub-lane layout & camera. */
  lanes: {
    subLaneSpacing: 40,
    onScreenLanesAcross: 9,
    cameraFollowLerp: 0.14,
    cameraFollowLerpFast: 0.4,
    cameraScreenPadding: 20,
  },

  /** Runner movement & physics. */
  physics: {
    scrollSpeed: 340,
    jumpVelocity: -420,
    gravity: 900,
    groundOffset: 180,
    /** Screen px per px of race lag when rivals pull ahead (keep low — gap is capped). */
    npcAheadVisualScale: 0.35,
    /** Max upward lag (logical px) — keeps runners on camera when progress slows. */
    maxRaceVisualLagPx: 64,
    /** Extra logical px above screen top for rivals far ahead (before hard cap). */
    npcAheadVisualOffScreenMargin: 40,
    laneSwitchTweenMs: 150,
    laneRepelPx: 12,
    laneRepelMs: 140,
  },

  /**
   * Obstacle spawning — shared defaults plus per main-lane overrides.
   * mainLane: 0 = Bugs, 1 = Humans, 2 = Klaus.
   */
  obstacles: {
    initialCount: 4,
    initialFirstOffset: 400,
    initialSpacing: 380,
    spawnAheadMin: 500,
    spawnAheadMax: 900,
    stopBeforeFinish: 500,
    trashDisplayHeight: 28,
    /** Multiplier on trash height (1.4 = 40% bigger). */
    trashSizeMultiplier: 1.4,
    puddleDisplayHeightMin: 22,
    puddleSizeScaleMin: 1,
    puddleSizeScaleMax: 3,
    /** Puddle scale at or above this uses two sub-lanes. */
    puddleTwoLaneScaleThreshold: 1.85,
    /** Slowdown applied after leaving a puddle (seconds). */
    puddleDebuffDurationSec: 5,
    /** Each carried bin multiplies race speed (0.72 = 28% slower per bin, stacks). */
    trashCarrySlowMultiplierPerBin: 0.72,
    /** Vertical window for picking up a bin (logical px, tight). */
    trashPickupTriggerPx: 14,
    /** Bin feet this far below runner feet can still be picked up (logical px). */
    trashPickupPassBelowPx: 6,
    /** Max tiny carry badges drawn on the runner sprite. */
    trashCarryMaxVisibleBadges: 4,
    /** Size of each carry badge (logical px). */
    trashCarryBadgeSize: 7,
    /** Brief NPC-only slowdown after brushing a bin (not used by the player). */
    trashNpcBrushMultiplier: 0.55,
    trashNpcBrushDurationMs: 500,
    manholeDisplayHeight: 26,
    /** Multiplier on manhole height (1.4 = 40% bigger). */
    manholeSizeMultiplier: 1.4,
    /** Extra scale for open manhole art (PNG has more padding than closed). */
    manholeOpenVisualMultiplier: 1.48,
    /** Chance a manhole spawns open (fall in) vs closed/safe. */
    manholeOpenChance: 0.35,
    /** Wet footprints after puddles (disabled for now). */
    footprints: {
      enabled: false,
      intervalMs: 120,
      radius: 4,
      fadeMs: 900,
    },
    /** Per main-lane spawn & behaviour (tweak independently later). */
    byMainLane: [
      {
        mainLane: 0,
        spawnIntervalMs: 1100,
        trashWeight: 1,
        puddleWeight: 0.6,
        manholeWeight: 0.4,
        puddleSpeedMultiplier: 0.55,
      },
      {
        mainLane: 1,
        spawnIntervalMs: 1300,
        trashWeight: 0.8,
        puddleWeight: 1,
        manholeWeight: 0.5,
        puddleSpeedMultiplier: 0.5,
      },
      {
        mainLane: 2,
        spawnIntervalMs: 1000,
        trashWeight: 0.7,
        puddleWeight: 0.9,
        manholeWeight: 0.45,
        puddleSpeedMultiplier: 0.6,
      },
    ] as const,
  },

  /** Street lamps on left/right shoulders. */
  lamps: {
    initialCount: 2,
    initialFirstOffset: 280,
    initialSpacing: 560,
    spacingMin: 440,
    spacingMax: 840,
    minSpacingSec: 3,
    spawnAheadMin: 500,
    spawnAheadMax: 900,
    stopBeforeFinish: 400,
    displayHeight: 24,
  },

  /** Main-lane divider lines (between Bugs|Humans|Klaus). */
  laneDividers: {
    width: 1.5,
    color: 0x888888,
    alpha: 0.9,
    interruptIntervalMinSec: 8,
    interruptIntervalMaxSec: 15,
    interruptDurationMinSec: 3,
    interruptDurationMaxSec: 8,
    collisionMargin: 4,
  },

  death: {
    screenDelayMs: 1500,
  },

  finishLine: {
    showWithinDistance: 800,
    approachFactor: 0.15,
    verticalOffset: 200,
    stripeCount: 16,
    height: 12,
  },

  track: {
    tileHeight: 64,
  },

  collision: {
    verticalTolerance: 30,
    horizontalTolerance: 18,
    jumpClearance: 5,
    playerHitboxUp: 20,
    obstaclePadX: 4,
    obstaclePadY: 8,
    trashPadX: 4,
    trashPadY: 4,
    /** Extra-tight horizontal pad for trash pickup (logical px). */
    trashPickupPadX: 2,
    /** Runner half-width for trash overlap (logical px). */
    trashRunnerHalfWidth: 14,
    /** Bin feet vs runner feet — tight overlap (logical px). */
    trashFeetContactSlop: 18,
  },

  eating: {
    horizontalReach: 26,
    verticalReach: 32,
    requireGrounded: true,
    npcRespawnMs: 3500,
  },

  /** Audio — matches Unity PhraseManager, Mover.Sound, and Lamp AudioSource. */
  audio: {
    phrases: {
      firstDelaySec: 2,
      intervalSec: 15,
      volume: 0.5,
    },
    steps: {
      volume: 0.1,
    },
    lamp: {
      volume: 0.3,
    },
  },
} as const;

export type GameTuning = typeof TUNING;

export type MainLaneObstacleTuning = (typeof TUNING.obstacles.byMainLane)[number];
