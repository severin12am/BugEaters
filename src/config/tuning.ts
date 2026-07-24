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
    /** Menu character preview scale (fits phone without clipping). */
    menuCharacterScale: 0.68,
  },

  /** Unity ability lane spawners (`forObstacles: 0`, minT 7 / maxT 15). */
  abilities: {
    /** Temporary playtest density — restore after ability balance testing. */
    spawnIntervalMinSec: 2,
    spawnIntervalMaxSec: 4,
    displayHeight: 34 * 0.8,
    /** Stagger first ability spawn after race start (logical px). */
    initialDelayPx: 120,
    /** NPC slow from `slowDownOther` (Unity `slowDownStrength` ≈ reverse crawl). */
    npcSlowProgressMultiplier: 0.34,
  },

  /** Sub-lane layout & camera. */
  lanes: {
    subLaneSpacing: 40,
    /** Slightly >9 playable lanes zooms in and crops shoulder periphery. */
    onScreenLanesAcross: 9.35,
    cameraFollowLerp: 0.14,
    cameraFollowLerpFast: 0.4,
    cameraScreenPadding: 20,
  },

  /** Runner movement & physics. */
  physics: {
    scrollSpeed: 442,
    jumpVelocity: -420,
    gravity: 900,
    groundOffset: 180,
    /** Screen px per px of race lag when rivals pull ahead (solo NPC / local debuff only). */
    npcAheadVisualScale: 0.35,
    /** Max upward lag (logical px) — solo mode keeps debuffed runners on camera. */
    maxRaceVisualLagPx: 64,
    /** Max downward lead when boosted ahead of world scroll (logical px). */
    maxRaceVisualLeadPx: 72,
    /** Extra logical px above screen top for rivals far ahead (before hard cap). */
    npcAheadVisualOffScreenMargin: 40,
    laneSwitchTweenMs: 150,
    laneRepelPx: 12,
    laneRepelMs: 140,
  },

  /**
   * Multiplayer race presentation — rivals are placed from real progress gaps,
   * not the solo debuff cap. Tune here if the pack feels too spread out / tight.
   */
  multiplayer: {
    rivalVisual: {
      /**
       * Progress gap (as a fraction of {@link RACE_DISTANCE}) that maps to the
       * full ahead or behind band. Example: 0.08 → an 8% race lead fills the screen.
       */
      referenceGapFraction: 0.08,
      /** Runners won't render above this Y (logical px from top of screen). */
      minRunnerYFromTop: 200,
      /** Max distance below the anchor line for rivals who are behind (logical px). */
      maxBehindPx: 90,
    },
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
    trashDisplayHeight: 32,
    /** Multiplier on trash height (1.4 = 40% bigger). */
    trashSizeMultiplier: 1.5,
    puddleDisplayHeightMin: 22,
    puddleSizeScaleMin: 1,
    puddleSizeScaleMax: 3,
    /** Puddle scale at or above this uses two sub-lanes. */
    puddleTwoLaneScaleThreshold: 1.85,
    /** Puddle slide boost duration (seconds) — anim freezes while sliding. */
    puddleSlideDurationSec: 2,
    /** Progress multiplier during puddle slide. */
    puddleSlideBoostMultiplier: 1.5,
    /** Unity `Белая полоска` spray interval while sliding (ms). */
    puddleSlideTrailIntervalMs: 65,
    puddleSlideTrailFadeMs: 420,
    /** Race progress while auto-jumping a bin (0 = world pulls ahead). */
    trashJumpProgressMultiplier: 0,
    /** Trigger jump when bin feet are this far above runner feet (logical px). */
    trashJumpTriggerAheadPx: 58,
    /** Small tolerance after bin passes runner feet (logical px). */
    trashJumpTriggerBehindPx: 2,
    /** Brief NPC-only slowdown after brushing a bin (not used by the player). */
    trashNpcBrushMultiplier: 0.55,
    trashNpcBrushDurationMs: 500,
    /** `бустер` burst flash when an ability activates (ms). */
    briefcaseBoosterFlashMs: 900,
    /** On-screen diameter of the manhole disc (open and closed share this). */
    manholeDisplayHeight: 38,
    /** Multiplier on manhole diameter. */
    manholeSizeMultiplier: 0.82,
    /**
     * Source disc diameter in the 500×500 PNGs (closed lid / open hole ring).
     * Both states scale from this so they render the same size.
     */
    manholeSourceDiameterPx: 200,
    /** Chance a manhole spawns open (fall in) vs closed/safe. */
    manholeOpenChance: 0.35,
    /**
     * Open-manhole hole in texture space (500×500 PNG). Sprite origin is set to
     * this center so rotation spins the lid around the hole; collision is a
     * circle of `radiusFraction * displayWidth` at sprite.x/y.
     */
    manholeOpening: {
      /** Hole center X / texture width (`manhole-open.png`). */
      originXFraction: 0.506,
      /** Hole center Y / texture height. */
      originYFraction: 0.506,
      /** Hole radius / texture width. */
      radiusFraction: 0.188,
    },
    /** Closed lid pivot (keeps open/closed placement consistent). */
    manholeClosedOrigin: {
      originXFraction: 0.492,
      originYFraction: 0.49,
    },
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
      },
      {
        mainLane: 1,
        spawnIntervalMs: 1300,
        trashWeight: 0.8,
        puddleWeight: 1,
        manholeWeight: 0.5,
      },
      {
        mainLane: 2,
        spawnIntervalMs: 1000,
        trashWeight: 0.7,
        puddleWeight: 0.9,
        manholeWeight: 0.45,
      },
    ] as const,
  },

  /** Street lamps on left/right shoulders. */
  lamps: {
    initialCount: 2,
    initialFirstOffset: 320,
    initialSpacing: 720,
    spacingMin: 640,
    spacingMax: 960,
    /** Hard floor: no two lamps closer than this along the road (logical px). */
    minSeparation: 560,
    minSpacingSec: 3.5,
    spawnAheadMin: 500,
    spawnAheadMax: 900,
    stopBeforeFinish: 400,
    displayHeight: 29,
    /** Push lamp posts further onto the shoulder, away from the road edge. */
    shoulderOutset: 28,
  },

  /** Dashed boundary between playable road and outer void. */
  roadEdges: {
    width: 1.5,
    color: 0x666666,
    alpha: 0.9,
    dashLength: 14,
    dashGap: 12,
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
    /** 1 = finish line Y tracks remaining race distance 1:1 with scroll progress. */
    approachFactor: 1,
    verticalOffset: 0,
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
    obstaclePadX: 2,
    obstaclePadY: 4,
    trashPadX: 0,
    trashPadY: 2,
    /** Horizontal shrink for trash jump trigger (logical px). */
    trashJumpPadX: 0,
    /** Feet alignment tolerance for puddles (logical px). */
    puddleFeetSlop: 10,
    /** Horizontal shrink for puddle contact (logical px). */
    puddlePadX: 0,
  },

  eating: {
    horizontalReach: 26,
    verticalReach: 32,
    requireGrounded: true,
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
