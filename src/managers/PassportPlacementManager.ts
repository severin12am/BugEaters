import Phaser from 'phaser';
import { ABILITY_DEFAULT_DURATION_SEC } from '../config/abilities';
import type { ObstacleManager } from './ObstacleManager';
import { DISPLAY_DPR, ux } from '../utils/constants';

export type PlaceableObstacle = 'passport' | 'straw';

/**
 * DIGITAL ID / PAPER STRAW — after activating, tap the road to drop the prop.
 * Passport auto-jumps like trash; straw is a placed prop only.
 */
export class PassportPlacementManager {
  private armed: PlaceableObstacle | null = null;
  private armedUntilMs = 0;
  private ignoreUntilMs = 0;
  private pointerHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  /** When set, placement is forwarded (auth race) instead of local ObstacleManager. */
  private authPlaceHandler:
    | ((kind: PlaceableObstacle, worldX: number, aheadLogicalPx: number) => void)
    | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly obstacleManager: ObstacleManager,
    private readonly groundY: number,
    private readonly shouldIgnorePointer: (x: number, y: number) => boolean,
    private readonly showToast: (msg: string) => void,
  ) {}

  setAuthPlaceHandler(
    handler: ((kind: PlaceableObstacle, worldX: number, aheadLogicalPx: number) => void) | null,
  ): void {
    this.authPlaceHandler = handler;
  }

  isArmed(): boolean {
    return this.armed !== null;
  }

  armPassport(durationSec = ABILITY_DEFAULT_DURATION_SEC): void {
    this.beginArm('passport', durationSec, 'Tap the road to place passport');
  }

  armStraw(durationSec = ABILITY_DEFAULT_DURATION_SEC): void {
    this.beginArm('straw', durationSec, 'Tap the road to place paper straw');
  }

  private beginArm(
    kind: PlaceableObstacle,
    durationSec: number,
    toast: string,
  ): void {
    const now = this.scene.time.now;
    this.armed = kind;
    this.armedUntilMs = now + durationSec * 1000;
    this.ignoreUntilMs = now + 200;
    this.showToast(toast);

    if (!this.pointerHandler) {
      this.pointerHandler = (pointer: Phaser.Input.Pointer) => {
        if (
          !this.armed ||
          this.scene.time.now < this.ignoreUntilMs ||
          this.shouldIgnorePointer(pointer.x, pointer.y)
        ) {
          return;
        }
        const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.placeAt(world.x, world.y);
      };
      this.scene.input.on('pointerup', this.pointerHandler);
    }
  }

  update(nowMs: number): void {
    if (this.armed && nowMs >= this.armedUntilMs) {
      this.disarm();
    }
  }

  private placeAt(worldX: number, worldY: number): void {
    if (!this.armed) {
      return;
    }

    const maxAhead = ux(320);
    // Use ground line, not race-lag player.y — keeps ahead distance predictable.
    const tapAhead = this.groundY - worldY;
    if (tapAhead < ux(16)) {
      this.showToast('Tap further ahead on the road');
      return;
    }

    const feetY = Phaser.Math.Clamp(
      this.groundY - tapAhead,
      this.groundY - maxAhead,
      this.groundY,
    );

    if (this.authPlaceHandler) {
      // Server uses logical px; game coords are DPR-scaled.
      this.authPlaceHandler(this.armed, worldX / DISPLAY_DPR, tapAhead / DISPLAY_DPR);
    } else if (this.armed === 'passport') {
      this.obstacleManager.spawnPassportAtWorld(worldX, feetY);
    } else {
      this.obstacleManager.spawnStrawAtWorld(worldX, feetY);
    }
    this.disarm();
  }

  private disarm(): void {
    this.armed = null;
  }

  destroy(): void {
    if (this.pointerHandler) {
      this.scene.input.off('pointerup', this.pointerHandler);
      this.pointerHandler = null;
    }
  }
}
