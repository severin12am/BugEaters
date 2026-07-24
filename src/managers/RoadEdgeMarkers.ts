import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { GAME_HEIGHT, ux } from '../utils/constants';
import { RoadScroll } from './RoadScroll';

/**
 * Dashed vertical lines marking the playable road boundary (left + right).
 */
export class RoadEdgeMarkers {
  private readonly dashes: Phaser.GameObjects.Rectangle[] = [];
  private readonly unsubscribe: () => void;
  private readonly dashSpan: number;

  constructor(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    roadScroll: RoadScroll,
    leftX: number,
    rightX: number,
  ) {
    const cfg = TUNING.roadEdges;
    const dashH = ux(cfg.dashLength);
    const gapH = ux(cfg.dashGap);
    this.dashSpan = dashH + gapH;
    const count = Math.ceil(GAME_HEIGHT / this.dashSpan) + 3;

    for (let i = 0; i < count; i++) {
      const y = i * this.dashSpan;
      for (const x of [leftX, rightX]) {
        const dash = scene.add
          .rectangle(x, y, ux(cfg.width), dashH, cfg.color, cfg.alpha)
          .setOrigin(0.5, 0)
          .setDepth(0);
        container.add(dash);
        this.dashes.push(dash);
      }
    }

    this.unsubscribe = roadScroll.onScroll((deltaY) => this.scroll(deltaY));
  }

  private scroll(deltaY: number): void {
    const wrapSpan = Math.ceil(GAME_HEIGHT / this.dashSpan + 3) * this.dashSpan;
    this.dashes.forEach((dash) => {
      dash.y += deltaY;
      if (dash.y > GAME_HEIGHT + ux(40)) {
        dash.y -= wrapSpan;
      }
    });
  }

  destroy(): void {
    this.unsubscribe();
    this.dashes.forEach((d) => d.destroy());
    this.dashes.length = 0;
  }
}
