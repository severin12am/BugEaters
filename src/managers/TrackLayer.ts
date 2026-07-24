import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { COLORS, GAME_HEIGHT, ux } from '../utils/constants';
import { RoadScroll } from './RoadScroll';

/**
 * Scrolling track band built from repeating tiles.
 * Tile positions are updated exclusively through RoadScroll.
 */
export class TrackLayer {
  private readonly tiles: Phaser.GameObjects.Rectangle[] = [];
  private readonly tileHeight: number;
  private readonly unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    roadScroll: RoadScroll,
    worldWidth: number,
  ) {
    this.tileHeight = ux(TUNING.track.tileHeight);
    const count = Math.ceil(GAME_HEIGHT / this.tileHeight) + 2;

    for (let i = 0; i < count; i++) {
      const tile = scene.add
        .rectangle(
          worldWidth / 2,
          i * this.tileHeight + this.tileHeight / 2,
          worldWidth,
          this.tileHeight,
          COLORS.darkGray,
          0.35,
        )
        .setDepth(0);
      container.add(tile);
      this.tiles.push(tile);
    }

    this.unsubscribe = roadScroll.onScroll((deltaY) => this.scroll(deltaY));
  }

  private scroll(deltaY: number): void {
    const wrapSpan = this.tiles.length * this.tileHeight;

    this.tiles.forEach((tile) => {
      tile.y += deltaY;
      if (tile.y > GAME_HEIGHT + this.tileHeight) {
        tile.y -= wrapSpan;
      }
    });
  }

  destroy(): void {
    this.unsubscribe();
    this.tiles.forEach((tile) => tile.destroy());
    this.tiles.length = 0;
  }
}
