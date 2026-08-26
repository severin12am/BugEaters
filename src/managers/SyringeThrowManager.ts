import Phaser from 'phaser';
import { PROP_TEXTURE_KEYS } from '../config/propAssets';
import type { Player } from '../entities/Player';
import { ux } from '../utils/constants';

const ARMED_MS = 8000;
/** Sprite needle points down at rotation 0 — offset so needle aligns with a Phaser angle. */
const NEEDLE_ANGLE_OFFSET = -Math.PI / 2;

/**
 * WUHAN LAB JUICE — slingshot throw: pull back to aim, release to fling the opposite way.
 */
export class SyringeThrowManager {
  private armed = false;
  private aiming = false;
  private inputBound = false;
  private armedUntilMs = 0;
  private pullX = 0;
  private pullY = 0;
  private armedSprite: Phaser.GameObjects.Image | null = null;
  private aimGuide: Phaser.GameObjects.Graphics | null = null;
  private projectile: Phaser.GameObjects.Image | null = null;
  private projectileResolved = false;
  /** Optional hook when a throw lands (auth races send aim to the server). */
  private onThrowLand: ((worldX: number, worldY: number) => void) | null = null;

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.armed || this.aiming || this.shouldIgnorePointer(pointer.x, pointer.y)) {
      return;
    }
    this.aiming = true;
    this.updatePullFromPointer(pointer);
  };

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.armed || !this.aiming || !pointer.isDown) {
      return;
    }
    // Keep tracking even over the ability HUD — pull-back naturally ends there.
    this.updatePullFromPointer(pointer);
  };

  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (!this.armed || !this.aiming) {
      return;
    }
    this.aiming = false;
    // Do NOT ignore HUD here: releasing after a downward pull often lands on the bar.
    this.updatePullFromPointer(pointer);
    this.releaseThrow();
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly worldLayer: Phaser.GameObjects.Container,
    private readonly tryHitAt: (worldX: number, worldY: number) => boolean,
    private readonly shouldIgnorePointer: (x: number, y: number) => boolean,
    private readonly showToast: (msg: string) => void,
  ) {}

  isArmed(): boolean {
    return this.armed || this.aiming;
  }

  setOnThrowLand(handler: ((worldX: number, worldY: number) => void) | null): void {
    this.onThrowLand = handler;
  }

  arm(): void {
    this.unbindPointers();
    this.disarmProjectile();
    const now = this.scene.time.now;
    this.armed = true;
    this.aiming = false;
    this.pullX = 0;
    this.pullY = 0;
    this.armedUntilMs = now + ARMED_MS;
    this.showToast('Pull back to aim — release to throw');

    if (!this.armedSprite) {
      this.armedSprite = this.scene.add
        .image(ux(12), -ux(52), PROP_TEXTURE_KEYS.syringe)
        .setOrigin(0.5, 0.55)
        .setDepth(50);
      this.fitSyringe(this.armedSprite, ux(34));
      this.player.add(this.armedSprite);
    }
    this.armedSprite.setVisible(true);
    // Default ready pose: needle aimed forward (up the road).
    this.armedSprite.setRotation(NEEDLE_ANGLE_OFFSET + -Math.PI / 2);

    if (!this.aimGuide) {
      this.aimGuide = this.scene.add.graphics().setDepth(44);
      this.worldLayer.add(this.aimGuide);
    }
    this.aimGuide.clear();

    // Wait until the HUD activate tap fully ends, then accept the first pull.
    this.bindPointersAfterActivateTap();
  }

  update(nowMs: number): void {
    if (this.armed && !this.aiming && nowMs >= this.armedUntilMs) {
      this.cancelArm();
    }

    if (this.projectile && !this.projectileResolved && this.tryHit(this.projectile)) {
      this.finishProjectile(this.projectile);
    }
  }

  private bindPointersAfterActivateTap(): void {
    const tryBind = (): void => {
      if (!this.armed) {
        return;
      }
      // Still holding the activate tap — wait for full release.
      if (this.scene.input.activePointer?.isDown) {
        this.scene.input.once('pointerup', tryBind);
        this.scene.input.once('pointerupoutside', tryBind);
        return;
      }
      this.bindPointers();
    };
    // Defer one tick so we don't see the activate pointerup as still "down".
    this.scene.time.delayedCall(0, tryBind);
  }

  private bindPointers(): void {
    if (this.inputBound || !this.armed) {
      return;
    }
    this.inputBound = true;
    this.scene.input.on('pointerdown', this.onPointerDown);
    this.scene.input.on('pointermove', this.onPointerMove);
    this.scene.input.on('pointerup', this.onPointerUp);
    this.scene.input.on('pointerupoutside', this.onPointerUp);
  }

  private updatePullFromPointer(pointer: Phaser.Input.Pointer): void {
    const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const origin = this.throwOrigin();
    this.pullX = world.x - origin.x;
    this.pullY = world.y - origin.y;
    this.drawAim();
    this.orientHeldSyringe();
  }

  private throwOrigin(): { x: number; y: number } {
    return {
      x: this.player.x + ux(10),
      y: this.player.y - ux(50),
    };
  }

  /** Opposite of pull = launch direction. */
  private throwVector(): { x: number; y: number; power: number; angle: number } | null {
    const pullLen = Math.hypot(this.pullX, this.pullY);
    const minPull = ux(20);
    if (pullLen < minPull) {
      return null;
    }

    const maxPull = ux(140);
    const power = Phaser.Math.Clamp(pullLen / maxPull, 0.2, 1);
    const angle = Math.atan2(-this.pullY, -this.pullX);
    return {
      x: Math.cos(angle),
      y: Math.sin(angle),
      power,
      angle,
    };
  }

  private orientHeldSyringe(): void {
    if (!this.armedSprite) {
      return;
    }
    const throwVec = this.throwVector();
    if (!throwVec) {
      this.armedSprite.setRotation(NEEDLE_ANGLE_OFFSET + -Math.PI / 2);
      return;
    }
    this.armedSprite.setRotation(throwVec.angle + NEEDLE_ANGLE_OFFSET);
  }

  private drawAim(): void {
    const guide = this.aimGuide;
    if (!guide) {
      return;
    }
    guide.clear();

    const origin = this.throwOrigin();
    const throwVec = this.throwVector();
    const pullLen = Math.hypot(this.pullX, this.pullY);
    const maxPull = ux(140);

    const pullScale = pullLen > maxPull ? maxPull / pullLen : 1;
    const bandX = origin.x + this.pullX * pullScale;
    const bandY = origin.y + this.pullY * pullScale;
    guide.lineStyle(ux(2), 0xffffff, 0.35);
    guide.lineBetween(origin.x, origin.y, bandX, bandY);
    guide.fillStyle(0xffffff, 0.5);
    guide.fillCircle(bandX, bandY, ux(3));

    if (!throwVec) {
      return;
    }

    const minDist = ux(90);
    const maxDist = ux(360);
    const flight = minDist + (maxDist - minDist) * throwVec.power;
    const tipX = origin.x + throwVec.x * flight;
    const tipY = origin.y + throwVec.y * flight;

    guide.lineStyle(ux(2), 0xffffff, 0.85);
    guide.lineBetween(origin.x, origin.y, tipX, tipY);
    guide.fillStyle(0xffffff, 0.95);
    guide.fillCircle(tipX, tipY, ux(4));

    for (let t = 0.25; t < 1; t += 0.25) {
      const mx = origin.x + throwVec.x * flight * t;
      const my = origin.y + throwVec.y * flight * t;
      guide.fillStyle(0xffffff, 0.45);
      guide.fillCircle(mx, my, ux(2));
    }
  }

  private releaseThrow(): void {
    const throwVec = this.throwVector();
    this.aimGuide?.clear();
    if (!throwVec) {
      this.resetAimVisuals();
      this.showToast('Pull farther, then release');
      return;
    }

    this.armed = false;
    this.aiming = false;
    this.armedSprite?.setVisible(false);
    this.unbindPointers();

    const origin = this.throwOrigin();
    const minDist = ux(90);
    const maxDist = ux(360);
    const flight = minDist + (maxDist - minDist) * throwVec.power;
    const targetX = origin.x + throwVec.x * flight;
    const targetY = origin.y + throwVec.y * flight;

    const projectile = this.scene.add
      .image(origin.x, origin.y, PROP_TEXTURE_KEYS.syringe)
      .setOrigin(0.5, 0.55)
      .setDepth(45)
      .setRotation(throwVec.angle + NEEDLE_ANGLE_OFFSET);
    this.fitSyringe(projectile, ux(28));
    this.worldLayer.add(projectile);
    this.projectile = projectile;
    this.projectileResolved = false;

    const duration = Phaser.Math.Clamp(220 + throwVec.power * 180, 220, 420);
    this.scene.tweens.add({
      targets: projectile,
      x: targetX,
      y: targetY,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (this.projectile === projectile && !this.projectileResolved) {
          this.tryHit(projectile);
          this.finishProjectile(projectile);
        }
      },
    });
  }

  private fitSyringe(sprite: Phaser.GameObjects.Image, height: number): void {
    if (sprite.height > 0) {
      sprite.setScale(height / sprite.height);
    }
  }

  private resetAimVisuals(): void {
    this.pullX = 0;
    this.pullY = 0;
    this.aimGuide?.clear();
    this.orientHeldSyringe();
  }

  private finishProjectile(projectile: Phaser.GameObjects.Image): void {
    if (this.projectileResolved || this.projectile !== projectile) {
      return;
    }
    this.projectileResolved = true;
    projectile.setActive(false);
    this.scene.tweens.killTweensOf(projectile);
    this.fadeProjectile(projectile);
  }

  private tryHit(projectile: Phaser.GameObjects.Image): boolean {
    this.onThrowLand?.(projectile.x, projectile.y);
    return this.tryHitAt(projectile.x, projectile.y);
  }

  private fadeProjectile(projectile: Phaser.GameObjects.Image): void {
    this.scene.tweens.add({
      targets: projectile,
      alpha: 0,
      scale: projectile.scale * 0.6,
      duration: 180,
      onComplete: () => {
        projectile.destroy();
        if (this.projectile === projectile) {
          this.projectile = null;
        }
      },
    });
  }

  private cancelArm(): void {
    this.armed = false;
    this.aiming = false;
    this.armedSprite?.setVisible(false);
    this.aimGuide?.clear();
    this.unbindPointers();
  }

  private disarmProjectile(): void {
    if (this.projectile) {
      this.scene.tweens.killTweensOf(this.projectile);
      this.projectile.destroy();
    }
    this.projectile = null;
    this.projectileResolved = false;
  }

  private unbindPointers(): void {
    this.scene.input.off('pointerdown', this.onPointerDown);
    this.scene.input.off('pointermove', this.onPointerMove);
    this.scene.input.off('pointerup', this.onPointerUp);
    this.scene.input.off('pointerupoutside', this.onPointerUp);
    this.inputBound = false;
  }

  destroy(): void {
    this.unbindPointers();
    this.armedSprite?.destroy();
    this.armedSprite = null;
    this.aimGuide?.destroy();
    this.aimGuide = null;
    this.disarmProjectile();
  }
}
