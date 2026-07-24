import Phaser from 'phaser';
import type { AbilityKind } from '../config/abilities';
import type { RunnerCharacter } from '../entities/RunnerCharacter';
import { getCharacterDisplaySize } from './characterSprites';
import { ux } from './constants';

/** Clears timed ability visuals attached to a runner. */
export function clearAbilityVfx(runner: RunnerCharacter, objects: Phaser.GameObjects.GameObject[]): void {
  objects.forEach((obj) => {
    runner.scene.tweens.killTweensOf(obj);
    obj.destroy();
  });
  objects.length = 0;
}

/** Thin white ring — SHAREHOLDER. */
function attachDefensiveRing(
  runner: RunnerCharacter,
  objects: Phaser.GameObjects.GameObject[],
  durationSec: number,
): void {
  const { width, height } = getCharacterDisplaySize(runner.characterType);
  const ring = runner.scene.add.ellipse(
    0,
    runner.getAbilityVfxAnchorY(),
    width * 1.08,
    height * 1.05,
    0xffffff,
    0,
  );
  ring.setStrokeStyle(ux(2), 0xffffff, 0.75);
  runner.add(ring);
  objects.push(ring);

  runner.scene.tweens.add({
    targets: ring,
    scaleX: 1.12,
    scaleY: 1.08,
    alpha: 0.5,
    duration: 700,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  runner.scene.time.delayedCall(durationSec * 1000, () => {
    const idx = objects.indexOf(ring);
    if (idx !== -1) {
      objects.splice(idx, 1);
    }
    ring.destroy();
  });
}

/**
 * WHITE 6-point seal — BLACKROCK.
 * Soft disk with short protrusions (not a sharp star).
 */
function attachBlackrockStar(
  runner: RunnerCharacter,
  objects: Phaser.GameObjects.GameObject[],
  durationSec: number,
): void {
  // Inner ≈ outer → circle with mild points; outline only.
  const star = runner.scene.add.star(
    0,
    runner.getAbilityVfxAnchorY(),
    6,
    ux(11),
    ux(14),
    0xffffff,
    0,
  );
  star.setStrokeStyle(ux(2), 0xffffff, 0.9);
  runner.add(star);
  objects.push(star);

  runner.scene.tweens.add({
    targets: star,
    angle: 360,
    duration: 4800,
    repeat: -1,
    ease: 'Linear',
  });
  runner.scene.tweens.add({
    targets: star,
    alpha: 0.6,
    duration: 650,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  runner.scene.time.delayedCall(durationSec * 1000, () => {
    const idx = objects.indexOf(star);
    if (idx !== -1) {
      objects.splice(idx, 1);
    }
    star.destroy();
  });
}

/**
 * Vertical motion streaks behind the runner — shared speed indicator
 * (puddle boost + CBDC RUN). Loops until cleared.
 */
export function attachSpeedStreaks(
  runner: RunnerCharacter,
  objects: Phaser.GameObjects.GameObject[],
): void {
  if (objects.length > 0) {
    return;
  }

  for (let i = 0; i < 4; i++) {
    const startY = ux(18 + i * 10);
    const streak = runner.scene.add.rectangle(
      ux(-4 + i * 3),
      startY,
      ux(3),
      ux(18 + i * 6),
      0xffffff,
      0.32 - i * 0.06,
    );
    runner.add(streak);
    objects.push(streak);

    runner.scene.tweens.add({
      targets: streak,
      y: startY + ux(28),
      alpha: 0,
      duration: 300 + i * 50,
      repeat: -1,
      ease: 'Cubic.easeOut',
      onRepeat: () => {
        streak.y = startY;
        streak.setAlpha(0.32 - i * 0.06);
      },
    });
  }
}

/**
 * Dark streaks drifting upward in front of the runner — shared slow indicator
 * (trash jump, TAXATION, trash brush, any progressMult < 1). Loops until cleared.
 */
export function attachSlowStreaks(
  runner: RunnerCharacter,
  objects: Phaser.GameObjects.GameObject[],
): void {
  if (objects.length > 0) {
    return;
  }

  for (let i = 0; i < 4; i++) {
    const startY = -ux(8 + i * 9);
    const alpha = 0.4 - i * 0.07;
    const streak = runner.scene.add.rectangle(
      ux(2 - i * 3),
      startY,
      ux(3),
      ux(14 + i * 5),
      0x2a2a2a,
      alpha,
    );
    runner.add(streak);
    objects.push(streak);

    runner.scene.tweens.add({
      targets: streak,
      y: startY - ux(22),
      alpha: 0,
      duration: 420 + i * 55,
      repeat: -1,
      ease: 'Cubic.easeOut',
      onRepeat: () => {
        streak.y = startY;
        streak.setAlpha(alpha);
      },
    });
  }
}

export function playAbilityActivateVfx(
  runner: RunnerCharacter,
  objects: Phaser.GameObjects.GameObject[],
  kind: AbilityKind,
  durationSec: number,
): void {
  switch (kind) {
    case 'immortality':
      attachDefensiveRing(runner, objects, durationSec);
      break;
    case 'disableObstacles':
      attachBlackrockStar(runner, objects, durationSec);
      break;
    // speedUp streaks are driven by setSpeedStreakVisual (same as puddle boost).
    default:
      break;
  }
}
