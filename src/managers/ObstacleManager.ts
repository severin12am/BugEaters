import Phaser from 'phaser';
import { getAbility, ROAD_SPAWNABLE_ABILITIES } from '../config/abilities';
import { PROP_TEXTURE_KEYS } from '../config/propAssets';
import { MainLaneObstacleTuning, TUNING } from '../config/tuning';
import { GAME_HEIGHT, ux } from '../utils/constants';
import { ImagePool } from '../utils/imagePool';
import { subLaneCenterX } from './SubLaneManager';
import { RoadScroll } from './RoadScroll';
import { createRng, type Rng } from '../utils/rng';

export type ObstacleType = 'trash' | 'puddle' | 'manhole' | 'ability' | 'passport' | 'straw';
export type ManholeState = 'closed' | 'open';

export interface ObstacleHandle {
  sprite: Phaser.GameObjects.Image;
  type: ObstacleType;
  mainLane: number;
  globalSubLanes: number[];
  sizeScale: number;
  passed: boolean;
  /**
   * Runners that already auto-jumped this trash/passport.
   * Per-runner so one jump doesn't cancel everyone else's.
   */
  jumpClearedBy?: WeakSet<object>;
  /** Runners that already fell into this open manhole. */
  manholeFellInBy?: WeakSet<object>;
  manholeState?: ManholeState;
  /** Open-hole radius in world px (sprite origin is the hole center). */
  manholeOpening?: {
    radiusX: number;
    radiusY: number;
  };
  /** Previous frame sprite.y — swept manhole collision. */
  prevY?: number;
  /** Trash only: frozen in place (stops scrolling) while blocking the player. */
  pinned?: boolean;
  /** Ability pickup id (Unity `AbilityTrigger` prefab). */
  abilityId?: string;
}

const DEPTH_PUDDLE = 2;
const DEPTH_TRASH = 3;
const DEPTH_MANHOLE = 2;
const DEPTH_ABILITY = 4;
const DEPTH_PASSPORT = 3;
const DEPTH_STRAW = 2;

/**
 * Trash bins (block progress), puddles (slide boost in Phaser), manholes, ability pickups.
 */
export class ObstacleManager {
  private readonly obstacles: ObstacleHandle[] = [];
  private readonly unsubscribe: () => void;
  /** Next world-distance (px) at which each lane spawns; deterministic from seed. */
  private readonly nextSpawnWorldDist = [0, 0, 0];
  private readonly nextAbilitySpawnWorldDist = [0, 0, 0];
  private readonly subLaneWidth: number;
  /** Seeded PRNG — drives ALL spawn randomness so every client agrees. */
  private readonly rng: Rng;
  private obstacleSpawnPaused = false;
  /** SDG — only these main lanes get the 3× spawn rate (excludes activator's lane). */
  private hellBoostLanes: number[] | null = null;
  /** DAVOS — skip spawning in this main lane while active. */
  private flightClearMainLane: number | null = null;
  /** Playtest: multiply manhole spawn weight (1 = normal). */
  private manholeSpawnMultiplier = 1;
  /** Playtest: multiply ability/briefcase spawn rate (1 = normal). */
  private abilitySpawnMultiplier = 1;
  /** Playtest: when set, only these ability ids spawn as road pickups. */
  private abilitySpawnFilter: readonly string[] | null = null;
  /** Recycled prop images — avoids create/destroy churn every spawn. */
  private readonly pool: ImagePool;

  constructor(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    private readonly roadScroll: RoadScroll,
    seed: number,
  ) {
    this.subLaneWidth = ux(TUNING.lanes.subLaneSpacing);
    this.rng = createRng(seed);
    this.pool = new ImagePool(scene, container);
    this.resetSchedule();
    this.unsubscribe = roadScroll.onScroll((deltaY) => this.scrollObstacles(deltaY));
  }

  /** Pooled image, already parented to the props container at the top of its draw order. */
  private acquireSprite(x: number, y: number, textureKey: string): Phaser.GameObjects.Image {
    const sprite = this.pool.acquire(x, y, textureKey);
    sprite.setVisible(isOnScreenY(y));
    return sprite;
  }

  private releaseSprite(sprite: Phaser.GameObjects.Image): void {
    this.pool.release(sprite);
  }

  /** Solo-practice / debug: raise manhole share of obstacle spawns. */
  setManholeSpawnMultiplier(multiplier: number): void {
    this.manholeSpawnMultiplier = Math.max(0, multiplier);
  }

  /** Solo-practice / debug: raise briefcase pickup spawn rate. */
  setAbilitySpawnMultiplier(multiplier: number): void {
    this.abilitySpawnMultiplier = Math.max(0.01, multiplier);
  }

  /** Solo-practice / debug: restrict which briefcase abilities can spawn. */
  setAbilitySpawnFilter(abilityIds: readonly string[] | null): void {
    this.abilitySpawnFilter = abilityIds;
  }

  /** BLACKROCK — no longer pauses spawns; kept for legacy callers. */
  setObstacleSpawnPaused(paused: boolean): void {
    this.obstacleSpawnPaused = paused;
  }

  /** SDG — flood the two lanes that are not the player's main lane. */
  setHellModeLanes(playerMainLane: number | null, active: boolean): void {
    if (!active || playerMainLane === null) {
      this.hellBoostLanes = null;
      return;
    }
    this.hellBoostLanes = [0, 1, 2].filter((lane) => lane !== playerMainLane);
  }

  /** DAVOS BROS — wipe and suppress obstacles in one main lane. */
  setFlightClearMainLane(mainLane: number | null): void {
    if (this.flightClearMainLane !== null && mainLane === null) {
      this.flightClearMainLane = null;
      return;
    }
    this.flightClearMainLane = mainLane;
    if (mainLane !== null) {
      this.clearMainLane(mainLane);
    }
  }

  clearMainLane(mainLane: number): void {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      if (obs.mainLane !== mainLane || obs.type === 'ability') {
        continue;
      }
      this.releaseSprite(obs.sprite);
      this.obstacles.splice(i, 1);
    }
  }

  isInFlightClearedLane(mainLane: number): boolean {
    return this.flightClearMainLane === mainLane;
  }

  /** PAPER STRAW — place at tap location (decorative prop). */
  spawnStrawAtWorld(worldX: number, worldY: number): void {
    this.spawnPlacedProp(worldX, worldY, 'straw', PROP_TEXTURE_KEYS.paperStraw, DEPTH_STRAW, 1, 1);
  }

  /** DIGITAL ID — passport barrier at tap location (auto-jump like trash). */
  spawnPassportAtWorld(worldX: number, worldY: number): void {
    this.spawnPlacedProp(
      worldX,
      worldY,
      'passport',
      PROP_TEXTURE_KEYS.passport,
      DEPTH_PASSPORT,
      0.95,
      2,
    );
  }

  private spawnPlacedProp(
    worldX: number,
    worldY: number,
    type: 'passport' | 'straw',
    textureKey: string,
    depth: number,
    heightScale: number,
    laneSpan: 1 | 2,
  ): void {
    const tappedLane = this.globalSubLaneFromWorldX(worldX);
    const mainLane = Math.floor(tappedLane / 3);
    const globalSubLanes = this.lanesForTap(tappedLane, laneSpan);
    const x =
      globalSubLanes.length === 2
        ? (subLaneCenterX(globalSubLanes[0], this.subLaneWidth) +
            subLaneCenterX(globalSubLanes[1], this.subLaneWidth)) /
          2
        : subLaneCenterX(globalSubLanes[0], this.subLaneWidth);
    const displayH = ux(TUNING.obstacles.trashDisplayHeight * heightScale);

    const sprite = this.acquireSprite(x, worldY, textureKey)
      .setOrigin(0.5, 1)
      .setDepth(depth);
    if (sprite.width > 0) {
      sprite.setScale(displayH / sprite.height);
    } else {
      sprite.setDisplaySize(type === 'passport' ? ux(34) : ux(28), displayH);
    }
    // Passport art is narrow — match trash-ish width so lane overlap is reliable.
    if (type === 'passport') {
      const minW = ux(TUNING.lanes.subLaneSpacing) * (laneSpan === 2 ? 1.35 : 0.85);
      if (sprite.displayWidth < minW) {
        sprite.setDisplaySize(minW, sprite.displayHeight);
      }
    }

    this.obstacles.push({
      sprite,
      type,
      mainLane,
      globalSubLanes,
      sizeScale: 1,
      passed: false,
      jumpClearedBy: new WeakSet<object>(),
    });
  }

  /** 1–2 sub-lanes covering the tap, kept inside one main lane. */
  private lanesForTap(tappedLane: number, span: 1 | 2): number[] {
    if (span === 1) {
      return [tappedLane];
    }
    const mainLane = Math.floor(tappedLane / 3);
    const laneStart = mainLane * 3;
    const local = tappedLane - laneStart;
    if (local <= 1) {
      return [laneStart + local, laneStart + local + 1];
    }
    return [laneStart + 1, laneStart + 2];
  }

  private globalSubLaneFromWorldX(worldX: number): number {
    const half = this.subLaneWidth / 2;
    const index = Math.round((worldX - half - this.subLaneWidth / 2) / this.subLaneWidth);
    return Phaser.Math.Clamp(index, 0, 8);
  }

  /** World-distance covered per spawn interval for a lane. */
  private laneIntervalDist(laneCfg: MainLaneObstacleTuning): number {
    return (
      (laneCfg.spawnIntervalMs / 1000) *
      this.roadScroll.worldSpeedPxPerSec
    );
  }

  private abilityIntervalDist(): number {
    const cfg = TUNING.abilities;
    const sec = this.rng.floatBetween(cfg.spawnIntervalMinSec, cfg.spawnIntervalMaxSec);
    return (sec * this.roadScroll.worldSpeedPxPerSec) / this.abilitySpawnMultiplier;
  }

  private resetSchedule(): void {
    for (const laneCfg of TUNING.obstacles.byMainLane) {
      this.nextSpawnWorldDist[laneCfg.mainLane] = this.laneIntervalDist(laneCfg);
      this.nextAbilitySpawnWorldDist[laneCfg.mainLane] =
        this.abilityIntervalDist() + ux(TUNING.abilities.initialDelayPx);
    }
  }

  reset(): void {
    this.obstacles.forEach((obs) => this.releaseSprite(obs.sprite));
    this.obstacles.length = 0;
    this.resetSchedule();
  }

  spawnInitial(): void {
    const cfg = TUNING.obstacles;
    for (let i = 0; i < cfg.initialCount; i++) {
      const mainLane = i % 3;
      this.spawn(
        mainLane,
        ux(cfg.initialFirstOffset) + i * ux(cfg.initialSpacing),
      );
    }
  }

  tickSpawning(_deltaMs: number, raceDistance: number): void {
    const cfg = TUNING.obstacles;
    const worldDist = this.roadScroll.worldDistanceTraveled;
    const spawnCutoff = raceDistance - ux(cfg.stopBeforeFinish);

    for (const laneCfg of cfg.byMainLane) {
      const lane = laneCfg.mainLane;
      if (this.flightClearMainLane === lane) {
        continue;
      }
      const hellActive = this.hellBoostLanes?.includes(lane) ?? false;
      const intervalDist = this.laneIntervalDist(laneCfg);
      const abilityInterval = this.abilityIntervalDist();

      if (!this.obstacleSpawnPaused) {
        const laneInterval = intervalDist / (hellActive ? 2 : 1);
        while (worldDist >= this.nextSpawnWorldDist[lane]) {
          if (this.nextSpawnWorldDist[lane] < spawnCutoff) {
            const overshoot = worldDist - this.nextSpawnWorldDist[lane];
            const ahead = this.rng.between(ux(cfg.spawnAheadMin), ux(cfg.spawnAheadMax));
            // SDG floods hazards only — puddles are a speed boost, not a curse.
            this.spawn(lane, ahead - overshoot, hellActive);
          }
          this.nextSpawnWorldDist[lane] += laneInterval;
        }
      }

      while (worldDist >= this.nextAbilitySpawnWorldDist[lane]) {
        if (this.nextAbilitySpawnWorldDist[lane] < spawnCutoff) {
          const overshoot = worldDist - this.nextAbilitySpawnWorldDist[lane];
          const ahead = this.rng.between(ux(cfg.spawnAheadMin), ux(cfg.spawnAheadMax));
          this.spawnAbility(lane, ahead - overshoot);
        }
        this.nextAbilitySpawnWorldDist[lane] += abilityInterval;
      }
    }
  }

  getAll(): readonly ObstacleHandle[] {
    return this.obstacles;
  }

  removeObstacle(obs: ObstacleHandle): void {
    const index = this.obstacles.indexOf(obs);
    if (index === -1) {
      return;
    }
    this.releaseSprite(obs.sprite);
    this.obstacles.splice(index, 1);
  }

  getLaneTuning(mainLane: number): MainLaneObstacleTuning {
    return TUNING.obstacles.byMainLane[mainLane];
  }

  private pickSpawnKind(
    laneCfg: MainLaneObstacleTuning,
    excludePuddles = false,
  ): ObstacleType {
    const manholeWeight = laneCfg.manholeWeight * this.manholeSpawnMultiplier;
    const puddleWeight = excludePuddles ? 0 : laneCfg.puddleWeight;
    const total = laneCfg.trashWeight + puddleWeight + manholeWeight;
    let roll = this.rng.next() * total;
    if (roll < laneCfg.trashWeight) {
      return 'trash';
    }
    roll -= laneCfg.trashWeight;
    if (roll < puddleWeight) {
      return 'puddle';
    }
    return 'manhole';
  }

  private resolveSubLaneSpan(
    mainLane: number,
    span: 1 | 2,
  ): { x: number; globalSubLanes: number[] } {
    const startSub = span === 2 ? this.rng.between(0, 1) : this.rng.between(0, 2);
    const g0 = mainLane * 3 + startSub;
    const lanes = span === 2 ? [g0, g0 + 1] : [g0];
    const x =
      span === 2
        ? (subLaneCenterX(lanes[0], this.subLaneWidth) + subLaneCenterX(lanes[1], this.subLaneWidth)) /
          2
        : subLaneCenterX(g0, this.subLaneWidth);
    return { x, globalSubLanes: lanes };
  }

  private spawn(
    mainLane: number,
    aheadDistance: number,
    hellModeHazardsOnly = false,
  ): void {
    const kind = this.pickSpawnKind(this.getLaneTuning(mainLane), hellModeHazardsOnly);

    if (kind === 'trash') {
      this.spawnTrash(mainLane, aheadDistance);
    } else if (kind === 'puddle') {
      this.spawnPuddle(mainLane, aheadDistance);
    } else {
      this.spawnManhole(mainLane, aheadDistance);
    }
  }

  private spawnAbility(mainLane: number, aheadDistance: number): void {
    const cfg = TUNING.abilities;
    const pool = this.abilitySpawnFilter
      ? ROAD_SPAWNABLE_ABILITIES.filter((a) => this.abilitySpawnFilter!.includes(a.id))
      : ROAD_SPAWNABLE_ABILITIES;
    if (pool.length === 0) {
      return;
    }
    const pick = pool[this.rng.between(0, pool.length - 1)];
    const ability = getAbility(pick.id);
    const rotation = this.rng.between(-18, 18);
    const { x, globalSubLanes } = this.resolveSubLaneSpan(mainLane, 1);
    const displayH = ux(cfg.displayHeight);

    const sprite = this.acquireSprite(x, -aheadDistance, ability.textureKey)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_ABILITY)
      .setAngle(rotation);
    sprite.setScale(displayH / sprite.height);

    this.obstacles.push({
      sprite,
      type: 'ability',
      mainLane,
      globalSubLanes,
      sizeScale: 1,
      passed: false,
      abilityId: ability.id,
    });
  }

  private spawnTrash(mainLane: number, aheadDistance: number): void {
    const cfg = TUNING.obstacles;
    const rotation = this.rng.between(-38, 38);
    const span: 1 | 2 = Math.abs(rotation) > 12 || this.rng.next() < 0.45 ? 2 : 1;
    const { x, globalSubLanes } = this.resolveSubLaneSpan(mainLane, span);
    const displayH = ux(cfg.trashDisplayHeight * cfg.trashSizeMultiplier);

    const sprite = this.acquireSprite(x, -aheadDistance, PROP_TEXTURE_KEYS.trashBin)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_TRASH)
      .setAngle(rotation);
    sprite.setScale(displayH / sprite.height);

    this.obstacles.push({
      sprite,
      type: 'trash',
      mainLane,
      globalSubLanes,
      sizeScale: cfg.trashSizeMultiplier,
      passed: false,
      jumpClearedBy: new WeakSet<object>(),
    });
  }

  private spawnPuddle(mainLane: number, aheadDistance: number): void {
    const cfg = TUNING.obstacles;
    const sizeScale = this.rng.floatBetween(cfg.puddleSizeScaleMin, cfg.puddleSizeScaleMax);
    const span: 1 | 2 = sizeScale >= cfg.puddleTwoLaneScaleThreshold ? 2 : 1;
    const { x, globalSubLanes } = this.resolveSubLaneSpan(mainLane, span);
    const displayH = ux(cfg.puddleDisplayHeightMin * sizeScale);

    const sprite = this.acquireSprite(x, -aheadDistance, PROP_TEXTURE_KEYS.puddle)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_PUDDLE);
    sprite.setScale(displayH / sprite.height);

    this.obstacles.push({
      sprite,
      type: 'puddle',
      mainLane,
      globalSubLanes,
      sizeScale,
      passed: false,
    });
  }

  private spawnManhole(mainLane: number, aheadDistance: number): void {
    const cfg = TUNING.obstacles;
    const isOpen = this.rng.next() < cfg.manholeOpenChance;
    const state: ManholeState = isOpen ? 'open' : 'closed';
    const key = isOpen ? PROP_TEXTURE_KEYS.manholeOpen : PROP_TEXTURE_KEYS.manholeClosed;
    const { x, globalSubLanes } = this.resolveSubLaneSpan(mainLane, 1);
    // Same on-screen disc size for open and closed (scale from source circle, not padding).
    const displayD = ux(cfg.manholeDisplayHeight * cfg.manholeSizeMultiplier);
    const scale = displayD / cfg.manholeSourceDiameterPx;

    // Pivot on the hole (open) / lid center (closed) so rotation doesn't swing the kill zone.
    const origin = isOpen ? cfg.manholeOpening : cfg.manholeClosedOrigin;
    const rotation = this.rng.between(0, 359);
    const sprite = this.acquireSprite(x, -aheadDistance, key)
      .setOrigin(origin.originXFraction, origin.originYFraction)
      .setDepth(DEPTH_MANHOLE)
      .setAngle(rotation)
      .setScale(scale);

    const radius = sprite.displayWidth * cfg.manholeOpening.radiusFraction;
    this.obstacles.push({
      sprite,
      type: 'manhole',
      mainLane,
      globalSubLanes,
      sizeScale: 1,
      passed: false,
      manholeFellInBy: new WeakSet<object>(),
      manholeState: state,
      manholeOpening: isOpen ? { radiusX: radius, radiusY: radius } : undefined,
    });
  }

  private scrollObstacles(deltaY: number): void {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      const sprite = obs.sprite;
      obs.prevY = sprite.y;
      if (!obs.pinned) {
        sprite.y += deltaY;
        if (sprite.y > GAME_HEIGHT + ux(80)) {
          this.releaseSprite(sprite);
          this.obstacles.splice(i, 1);
          continue;
        }
      }
      // Props spawn up to ~900 logical px above the screen; don't pay their
      // transform + batch cost until they are close to view. Collision uses
      // sprite x/y, never visibility, so gameplay is unaffected.
      sprite.setVisible(isOnScreenY(sprite.y));
    }
  }

  destroy(): void {
    this.unsubscribe();
    this.reset();
    this.pool.destroy();
  }
}

/** Generous vertical window — origin is at the prop's feet, art extends upward. */
function isOnScreenY(y: number): boolean {
  return y > -ux(40) && y < GAME_HEIGHT + ux(200);
}
