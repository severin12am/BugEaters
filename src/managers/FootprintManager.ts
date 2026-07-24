import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { COLORS, ux } from '../utils/constants';

interface Footprint {
  shape: Phaser.GameObjects.Ellipse;
}

/** Small wet marks left behind after the player leaves a puddle (during speed debuff). */
export class FootprintManager {
  private readonly marks: Footprint[] = [];
  private spawnCooldownMs = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly container: Phaser.GameObjects.Container,
  ) {}

  tick(deltaMs: number, x: number, y: number, active: boolean): void {
    const cfg = TUNING.obstacles.footprints;
    if (!cfg.enabled || !active) {
      return;
    }

    this.spawnCooldownMs += deltaMs;
    if (this.spawnCooldownMs < cfg.intervalMs) {
      return;
    }
    this.spawnCooldownMs = 0;

    const r = ux(cfg.radius);
    const mark = this.scene.add
      .ellipse(x + Phaser.Math.Between(-ux(6), ux(6)), y - ux(2), r * 2, r, COLORS.gray, 0.35)
      .setDepth(2);
    this.container.add(mark);
    this.marks.push({ shape: mark });

    this.scene.tweens.add({
      targets: mark,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 0.6,
      duration: cfg.fadeMs,
      onComplete: () => {
        mark.destroy();
        const idx = this.marks.findIndex((m) => m.shape === mark);
        if (idx >= 0) {
          this.marks.splice(idx, 1);
        }
      },
    });
  }

  destroy(): void {
    this.marks.forEach((m) => m.shape.destroy());
    this.marks.length = 0;
  }
}
