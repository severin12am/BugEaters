import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { COLORS, GAME_HEIGHT, ux } from '../utils/constants';
import { RoadScroll } from './RoadScroll';

type ScrollTile = Phaser.GameObjects.Rectangle | Phaser.GameObjects.TileSprite;

/** Scrolling asphalt only on the playable lane strip (sub-lanes 0–8). */
export class RoadSurface {
  private readonly tiles: ScrollTile[] = [];
  private readonly tileHeight: number;
  private readonly tilesPerBand: number;
  private readonly unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    roadScroll: RoadScroll,
    roadWidth: number,
    roadCenterX: number,
  ) {
    this.tileHeight = ux(TUNING.track.tileHeight);
    this.tilesPerBand = Math.ceil(GAME_HEIGHT / this.tileHeight) + 2;

    for (let i = 0; i < this.tilesPerBand; i++) {
      const y = i * this.tileHeight + this.tileHeight / 2;
      const base = scene.add
        .rectangle(roadCenterX, y, roadWidth, this.tileHeight, COLORS.road, 1)
        .setDepth(-2);
      container.add(base);
      this.tiles.push(base);

      const grain = scene.add
        .tileSprite(roadCenterX, y, roadWidth, this.tileHeight, 'asphalt-grain')
        .setDepth(-1)
        .setAlpha(0.14);
      container.add(grain);
      this.tiles.push(grain);
    }

    this.unsubscribe = roadScroll.onScroll((deltaY) => this.scroll(deltaY));
  }

  private scroll(deltaY: number): void {
    const wrapSpan = this.tilesPerBand * this.tileHeight;
    this.tiles.forEach((tile) => {
      if (tile instanceof Phaser.GameObjects.TileSprite) {
        tile.tilePositionY += deltaY * 0.25;
      }
      tile.y += deltaY;
      if (tile.y > GAME_HEIGHT + this.tileHeight) {
        tile.y -= wrapSpan;
      }
    });
  }

  destroy(): void {
    this.unsubscribe();
    this.tiles.forEach((t) => t.destroy());
    this.tiles.length = 0;
  }
}
