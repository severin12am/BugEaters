import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT } from '../utils/constants';
import { RoadScroll } from './RoadScroll';

/**
 * Scrolling asphalt only on the playable lane strip (sub-lanes 0–8).
 *
 * One full-height base rectangle plus ONE full-height grain TileSprite whose
 * `tilePositionY` scrolls. The previous version stacked ~15 rectangle + ~15
 * TileSprite tiles (each TileSprite owns its own GL texture), which cost ~30
 * transforms and texture binds per frame for a visually identical result.
 */
export class RoadSurface {
  private readonly base: Phaser.GameObjects.Rectangle;
  private readonly grain: Phaser.GameObjects.TileSprite | null;
  private readonly unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    roadScroll: RoadScroll,
    roadWidth: number,
    roadCenterX: number,
  ) {
    this.base = scene.add
      .rectangle(roadCenterX, GAME_HEIGHT / 2, roadWidth, GAME_HEIGHT, COLORS.road, 1)
      .setDepth(-2);
    container.add(this.base);

    if (scene.textures.exists('asphalt-grain')) {
      this.grain = scene.add
        .tileSprite(roadCenterX, GAME_HEIGHT / 2, roadWidth, GAME_HEIGHT, 'asphalt-grain')
        .setDepth(-1)
        .setAlpha(0.14);
      container.add(this.grain);
    } else {
      this.grain = null;
    }

    this.unsubscribe = roadScroll.onScroll((deltaY) => this.scroll(deltaY));
  }

  private scroll(deltaY: number): void {
    if (!this.grain) {
      return;
    }
    // Old tiles moved down at road speed while their texture crawled up at
    // 0.25× — net grain drift 0.75× road speed. Keep that feel.
    this.grain.tilePositionY -= deltaY * 0.75;
  }

  destroy(): void {
    this.unsubscribe();
    this.base.destroy();
    this.grain?.destroy();
  }
}
