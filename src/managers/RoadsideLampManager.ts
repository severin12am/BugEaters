import Phaser from 'phaser';
import { PROP_TEXTURE_KEYS } from '../config/propAssets';
import { TUNING } from '../config/tuning';
import { GAME_HEIGHT, ux } from '../utils/constants';
import { getShoulderCenters } from '../utils/roadBounds';
import { RoadScroll } from './RoadScroll';

interface LampHandle {
  sprite: Phaser.GameObjects.Image;
}

/** Draw order within the lamp layer (above actors). */
const DEPTH_LAMP_POST = 1;

/**
 * Street lamps on road shoulders — sparse, with a minimum time gap between spawns.
 * Lamps live in lampLayer (above actors) so runners pass underneath the pole art.
 */
export class RoadsideLampManager {
  private readonly lamps: LampHandle[] = [];
  private readonly unsubscribe: () => void;
  private readonly leftX: number;
  private readonly rightX: number;
  private distanceSinceLastSpawn = Infinity;
  private msSinceLastSpawn = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly container: Phaser.GameObjects.Container,
    private readonly roadScroll: RoadScroll,
    subLaneWidth: number,
    worldWidth: number,
  ) {
    const shoulders = getShoulderCenters(subLaneWidth, worldWidth);
    this.leftX = shoulders.leftX;
    this.rightX = shoulders.rightX;
    this.unsubscribe = roadScroll.onScroll((deltaY) => this.scroll(deltaY));

    const cfg = TUNING.lamps;
    for (let i = 0; i < cfg.initialCount; i++) {
      this.spawnLamp(ux(cfg.initialFirstOffset) + i * ux(cfg.initialSpacing));
    }
    this.msSinceLastSpawn = cfg.minSpacingSec * 1000;
  }

  getActiveLamps(): readonly { x: number; y: number }[] {
    return this.lamps.map((l) => ({ x: l.sprite.x, y: l.sprite.y }));
  }

  tickSpawning(deltaMs: number, raceDistance: number): void {
    const cfg = TUNING.lamps;
    this.distanceSinceLastSpawn += ux(TUNING.physics.scrollSpeed) * (deltaMs / 1000);
    this.msSinceLastSpawn += deltaMs;

    const gap = Phaser.Math.Between(ux(cfg.spacingMin), ux(cfg.spacingMax));
    const minMs = cfg.minSpacingSec * 1000;

    if (
      this.distanceSinceLastSpawn >= gap &&
      this.msSinceLastSpawn >= minMs &&
      this.roadScroll.distanceTraveled < raceDistance - ux(cfg.stopBeforeFinish)
    ) {
      const ahead = Phaser.Math.Between(ux(cfg.spawnAheadMin), ux(cfg.spawnAheadMax));
      if (this.spawnLamp(ahead)) {
        this.distanceSinceLastSpawn = 0;
        this.msSinceLastSpawn = 0;
      }
    }
  }

  /** @returns false if skipped because another lamp is too close. */
  private spawnLamp(aheadDistance: number): boolean {
    const cfg = TUNING.lamps;
    const spawnY = -aheadDistance;
    const minSep = ux(cfg.minSeparation);
    for (const lamp of this.lamps) {
      if (Math.abs(lamp.sprite.y - spawnY) < minSep) {
        return false;
      }
    }

    const side: 'left' | 'right' = Math.random() < 0.5 ? 'left' : 'right';
    const key = side === 'left' ? PROP_TEXTURE_KEYS.lampLeft : PROP_TEXTURE_KEYS.lampRight;
    const x = side === 'left' ? this.leftX : this.rightX;
    const displayH = ux(cfg.displayHeight);

    const sprite = this.scene.add
      .image(x, spawnY, key)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_LAMP_POST);
    sprite.setScale(displayH / sprite.height);
    this.container.add(sprite);
    this.lamps.push({ sprite });
    return true;
  }

  private scroll(deltaY: number): void {
    for (let i = this.lamps.length - 1; i >= 0; i--) {
      this.lamps[i].sprite.y += deltaY;
      if (this.lamps[i].sprite.y > GAME_HEIGHT + ux(80)) {
        this.lamps[i].sprite.destroy();
        this.lamps.splice(i, 1);
      }
    }
  }

  destroy(): void {
    this.unsubscribe();
    this.lamps.forEach((l) => l.sprite.destroy());
    this.lamps.length = 0;
  }
}
