import Phaser from 'phaser';
import { BRIEFCASE_BOOSTER_TEXTURE_KEY } from '../config/briefcaseAssets';
import { characterAtlasKey, characterRunAnimKey } from '../config/characterAssets';
import { PROP_TEXTURE_KEYS } from '../config/propAssets';
import { TUNING } from '../config/tuning';
import { getCharacterDisplaySize } from '../utils/characterSprites';
import {
  attachSlowStreaks,
  attachSpeedStreaks,
  clearAbilityVfx,
  playAbilityActivateVfx,
} from '../utils/abilityVfx';
import type { AbilityKind } from '../config/abilities';
import { CharacterType, COLORS, ux } from '../utils/constants';

/**
 * Shared runner used by the player and lane NPCs — Unity walk-cycle sprites.
 */
export class RunnerCharacter extends Phaser.GameObjects.Container {
  readonly characterType: CharacterType;
  protected readonly groundY: number;
  protected sprite!: Phaser.GameObjects.Sprite;
  private bloodParticles: Phaser.GameObjects.Arc[] = [];
  private readonly abilityVfxObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly speedStreakObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly slowStreakObjects: Phaser.GameObjects.GameObject[] = [];
  private speedStreakActive = false;
  private slowStreakActive = false;
  private idBadge: Phaser.GameObjects.Text | null = null;
  private isDead = false;
  private lastFootstepFrame = -1;
  private obstacleJumpActive = false;
  private statusTint: number | null = null;
  private flightPlane: Phaser.GameObjects.Image | null = null;
  private flightSmokeTimer: Phaser.Time.TimerEvent | null = null;
  private readonly flightSmoke: Phaser.GameObjects.Arc[] = [];
  private spriteBaseY = 0;
  private flightActive = false;
  private flightExiting = false;
  /** Fired on walk-cycle frames 0 and halfway (Unity animation events). */
  onFootstep: (() => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    groundY: number,
    characterType: CharacterType,
  ) {
    super(scene, x, groundY);
    this.characterType = characterType;
    this.groundY = groundY;
    this.buildVisuals();
    scene.add.existing(this);
  }

  getIsDead(): boolean {
    return this.isDead;
  }

  isObstacleJumpActive(): boolean {
    return this.obstacleJumpActive;
  }

  /** Vertical center of the collision hitbox (chest area). */
  getHitboxY(): number {
    const { height } = getCharacterDisplaySize(this.characterType);
    return this.y - height * 0.55;
  }

  /** Creates the animated sprite from baked walk atlases. */
  private buildVisuals(): void {
    const atlasKey = characterAtlasKey(this.characterType);
    this.sprite = this.scene.add.sprite(0, 0, atlasKey, 0);
    this.sprite.setOrigin(0.5, 1);
    this.applyDisplaySize();
    this.sprite.play(characterRunAnimKey(this.characterType));
    this.add(this.sprite);
  }

  getDisplayWidth(): number {
    return getCharacterDisplaySize(this.characterType).width;
  }

  /**
   * Characters stay fully opaque — darkness/light come from the veil + lamp pools only.
   * (Lowering sprite alpha looked unintentionally transparent.)
   */
  applyLampLighting(
    _brightness: number,
    _nearestLamp: { x: number; y: number } | null,
  ): void {
    if (this.isDead) {
      return;
    }
    this.sprite.setAlpha(1);
    if (this.statusTint !== null) {
      this.sprite.setTint(this.statusTint);
    } else {
      this.sprite.clearTint();
    }
  }

  private applyStatusTint(): void {
    if (this.isDead) {
      return;
    }
    if (this.statusTint !== null) {
      this.sprite.setTint(this.statusTint);
    } else {
      this.sprite.clearTint();
    }
  }

  /** Uniform size for every frame in the walk cycle. */
  private applyDisplaySize(): void {
    const { width, height } = getCharacterDisplaySize(this.characterType);
    this.sprite.setDisplaySize(width, height);
  }

  /** Sync footstep SFX to walk animation like Unity Mover.Sound animation events. */
  tickFootsteps(): void {
    if (this.isDead || this.flightActive || !this.onFootstep) {
      return;
    }

    const animState = this.sprite.anims;
    const anim = animState.currentAnim;
    const frame = animState.currentFrame;
    if (!anim || !frame || !animState.isPlaying) {
      return;
    }

    const midFrame = Math.floor(anim.frames.length / 2);
    if (frame.index !== 0 && frame.index !== midFrame) {
      return;
    }
    if (this.lastFootstepFrame === frame.index) {
      return;
    }

    this.lastFootstepFrame = frame.index;
    this.onFootstep();
  }

  /** Freeze run anim during a puddle slide boost (speed streaks set separately). */
  setPuddleSlideVisual(active: boolean): void {
    if (this.isDead) {
      return;
    }

    const anim = this.sprite.anims;
    if (active) {
      anim.pause();
      this.sprite.clearTint();
    } else if (anim.isPaused && !this.flightActive && !this.flightExiting) {
      // Don't unfreeze while riding / jumping off the Davos jet.
      anim.resume();
    }
  }

  /**
   * White motion streaks — shared speed indicator (any progressMult > 1).
   */
  setSpeedStreakVisual(active: boolean): void {
    if (this.isDead || this.flightActive || this.flightExiting) {
      if (this.speedStreakActive) {
        this.speedStreakActive = false;
        clearAbilityVfx(this, this.speedStreakObjects);
      }
      return;
    }

    if (active === this.speedStreakActive) {
      return;
    }
    this.speedStreakActive = active;
    if (active) {
      // Speed and slow are mutually exclusive.
      this.setSlowStreakVisual(false);
      attachSpeedStreaks(this, this.speedStreakObjects);
    } else {
      clearAbilityVfx(this, this.speedStreakObjects);
    }
  }

  /**
   * Dark upward streaks — shared slow indicator (any progressMult < 1).
   */
  setSlowStreakVisual(active: boolean): void {
    if (this.isDead || this.flightActive || this.flightExiting) {
      if (this.slowStreakActive) {
        this.slowStreakActive = false;
        clearAbilityVfx(this, this.slowStreakObjects);
      }
      return;
    }

    if (active === this.slowStreakActive) {
      return;
    }
    this.slowStreakActive = active;
    if (active) {
      this.setSpeedStreakVisual(false);
      attachSlowStreaks(this, this.slowStreakObjects);
    } else {
      clearAbilityVfx(this, this.slowStreakObjects);
    }
  }

  isFlightModeVisual(): boolean {
    return this.flightActive || this.flightExiting;
  }

  /** Unity `бустер` burst when a briefcase is collected. */
  showBoosterBurst(
    durationMs = TUNING.obstacles.briefcaseBoosterFlashMs,
    textureKey: string = BRIEFCASE_BOOSTER_TEXTURE_KEY,
  ): void {
    if (this.isDead) {
      return;
    }

    const burst = this.scene.add.image(0, -ux(40), textureKey);
    burst.setOrigin(0.5, 0.5);
    const targetW = ux(108);
    burst.setScale(targetW / burst.width);
    burst.setAlpha(0.98);
    burst.setBlendMode(Phaser.BlendModes.ADD);
    this.add(burst);

    this.sprite.setTint(0xfff8e8);
    this.scene.time.delayedCall(durationMs * 0.55, () => {
      if (!this.isDead) {
        this.sprite.clearTint();
      }
    });

    this.scene.tweens.add({
      targets: burst,
      alpha: 0,
      scale: burst.scale * 1.35,
      duration: durationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => burst.destroy(),
    });
  }

  /** Per-ability activate visuals (new Phaser set — not Unity orange booster on all). */
  showAbilityActivateVfx(kind: AbilityKind, durationSec: number): void {
    if (this.isDead) {
      return;
    }
    playAbilityActivateVfx(this, this.abilityVfxObjects, kind, durationSec);
    this.syncAbilityVfxPositions();
  }

  clearAbilityVfx(): void {
    clearAbilityVfx(this, this.abilityVfxObjects);
  }

  /** Body-center Y in container space (follows hover / jump pose). */
  getAbilityVfxAnchorY(): number {
    const { height } = getCharacterDisplaySize(this.characterType);
    return this.sprite.y - height * Math.abs(this.sprite.scaleY) * 0.5;
  }

  /** Keep ring/star locked to the rider while on the jet. */
  syncAbilityVfxPositions(): void {
    const y = this.getAbilityVfxAnchorY();
    for (const obj of this.abilityVfxObjects) {
      if (
        obj instanceof Phaser.GameObjects.Ellipse ||
        obj instanceof Phaser.GameObjects.Star
      ) {
        obj.setY(y);
      }
    }
  }

  /** Unity `enableID` — floating label above a rival. */
  setIdBadgeVisible(visible: boolean, label: string): void {
    if (!visible) {
      this.idBadge?.destroy();
      this.idBadge = null;
      return;
    }

    const { height } = getCharacterDisplaySize(this.characterType);
    if (!this.idBadge) {
      this.idBadge = this.scene.add
        .text(0, -height - ux(10), label, {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: `${ux(10)}px`,
          color: '#a8ffff',
          backgroundColor: '#111111aa',
          padding: { x: ux(4), y: ux(2) },
        })
        .setOrigin(0.5, 1);
      this.add(this.idBadge);
    } else {
      this.idBadge.setText(label);
    }
    this.idBadge.setVisible(true);
  }

  /**
   * DAVOS BROS — jet rises from below, player jumps on, freeze pose, smoke from tail.
   * On end: player jumps off, jet flies away upward.
   */
  setFlightModeVisual(active: boolean, _durationSec = 5): void {
    if (this.isDead && active) {
      return;
    }
    if (active && (this.flightActive || this.flightExiting)) {
      return;
    }
    if (!active && (!this.flightActive || this.flightExiting)) {
      return;
    }

    this.clearFlightSmoke();
    this.scene.tweens.killTweensOf(this.sprite);
    if (this.flightPlane) {
      this.scene.tweens.killTweensOf(this.flightPlane);
    }

    if (!active) {
      this.playFlightExit();
      return;
    }

    this.flightActive = true;
    this.flightExiting = false;
    // Keep the whole runner (jet + rider) above other characters.
    this.setDepth(40);

    const hoverScale = 1.12;
    // Plane hovers modestly above the road; rider sits on its center.
    const planeHoverY = -ux(52);
    const seatY = planeHoverY + ux(4);

    this.sprite.setAlpha(1);
    this.sprite.clearTint();
    this.sprite.anims.pause();
    this.sprite.anims.stop();

    if (!this.flightPlane) {
      this.flightPlane = this.scene.add
        .image(0, ux(90), PROP_TEXTURE_KEYS.davosPlane)
        .setOrigin(0.5, 0.5)
        .setAngle(0);
      const planeW = ux(144) * hoverScale;
      if (this.flightPlane.width > 0) {
        this.flightPlane.setScale(planeW / this.flightPlane.width);
      }
      // Behind the rider sprite, still above world peers via container depth.
      this.addAt(this.flightPlane, 0);
    }
    this.flightPlane.setVisible(true);
    this.flightPlane.setPosition(0, ux(90));
    this.flightPlane.setAlpha(1);

    this.scene.tweens.add({
      targets: this.flightPlane,
      y: planeHoverY,
      duration: 480,
      ease: 'Cubic.easeOut',
    });

    this.sprite.setScale(1);
    this.sprite.setY(this.spriteBaseY);
    this.scene.tweens.add({
      targets: this.sprite,
      y: seatY - ux(34),
      scale: hoverScale,
      duration: 280,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.syncAbilityVfxPositions(),
      onComplete: () => {
        if (!this.flightActive) {
          return;
        }
        this.scene.tweens.add({
          targets: this.sprite,
          y: seatY,
          duration: 220,
          ease: 'Bounce.easeOut',
          onUpdate: () => this.syncAbilityVfxPositions(),
          onComplete: () => {
            if (!this.flightActive) {
              return;
            }
            this.syncAbilityVfxPositions();
            this.startFlightSmoke();
          },
        });
      },
    });
  }

  /** Jump off the jet; plane dives down and disappears off-screen. */
  private playFlightExit(): void {
    this.flightExiting = true;
    const plane = this.flightPlane;
    const peakY = this.sprite.y - ux(40);

    this.scene.tweens.add({
      targets: this.sprite,
      y: peakY,
      duration: 160,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.syncAbilityVfxPositions(),
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.sprite,
          y: this.spriteBaseY,
          scale: 1,
          duration: 300,
          ease: 'Cubic.easeIn',
          onUpdate: () => this.syncAbilityVfxPositions(),
          onComplete: () => {
            this.applyDisplaySize();
            this.sprite.setAlpha(1);
            this.sprite.clearTint();
            this.sprite.anims.play(characterRunAnimKey(this.characterType), true);
            this.syncAbilityVfxPositions();
            this.flightActive = false;
            this.flightExiting = false;
            this.setDepth(0);
          },
        });
      },
    });

    if (plane) {
      this.scene.tweens.add({
        targets: plane,
        y: ux(260),
        duration: 420,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          plane.destroy();
          if (this.flightPlane === plane) {
            this.flightPlane = null;
          }
        },
      });
    } else {
      this.flightActive = false;
      this.flightExiting = false;
      this.setDepth(0);
    }
  }

  private startFlightSmoke(): void {
    this.clearFlightSmoke();
    this.flightSmokeTimer = this.scene.time.addEvent({
      delay: 45,
      loop: true,
      callback: () => this.emitFlightSmoke(),
    });
  }

  private clearFlightSmoke(): void {
    this.flightSmokeTimer?.remove();
    this.flightSmokeTimer = null;
    for (const puff of this.flightSmoke) {
      this.scene.tweens.killTweensOf(puff);
      puff.destroy();
    }
    this.flightSmoke.length = 0;
  }

  /** Smoke from the tail (rear of nose-up jet = toward bottom of screen). */
  private emitFlightSmoke(): void {
    if (this.isDead || !this.flightActive || !this.flightPlane?.visible) {
      return;
    }
    const plane = this.flightPlane;
    const tailY = plane.y + plane.displayHeight * 0.45;
    for (let i = 0; i < 3; i++) {
      const puff = this.scene.add.circle(
        plane.x + Phaser.Math.Between(-ux(8), ux(8)),
        tailY + Phaser.Math.Between(0, ux(6)),
        Phaser.Math.Between(ux(6), ux(14)),
        0xffffff,
        0.42,
      );
      this.add(puff);
      this.flightSmoke.push(puff);
      this.scene.tweens.add({
        targets: puff,
        y: puff.y + ux(70),
        x: puff.x + Phaser.Math.Between(-ux(18), ux(18)),
        scale: 2.1,
        alpha: 0,
        duration: Phaser.Math.Between(480, 760),
        ease: 'Cubic.easeOut',
        onComplete: () => {
          const idx = this.flightSmoke.indexOf(puff);
          if (idx !== -1) {
            this.flightSmoke.splice(idx, 1);
          }
          puff.destroy();
        },
      });
    }
  }

  /** Faster walk cycle while a briefcase speed boost is active. */
  setSpeedBoostVisual(active: boolean, timeScale = 1): void {
    if (this.isDead || this.flightActive || this.flightExiting) {
      return;
    }

    const anim = this.sprite.anims;
    if (active && !anim.isPaused) {
      anim.timeScale = timeScale;
    } else if (!active) {
      anim.timeScale = 1;
    }
  }

  /** Brief brush slowdown visual for NPCs (not permanent carry). */
  setTrashStruggleVisual(active: boolean): void {
    if (this.isDead) {
      return;
    }

    const anim = this.sprite.anims;
    if (active) {
      anim.timeScale = 0.55;
      this.statusTint = 0xb8b0a8;
    } else if (this.statusTint === 0xb8b0a8) {
      anim.timeScale = 1;
      this.statusTint = null;
    }
    this.applyStatusTint();
  }

  /** TAXATION — slower gait + purple tint (distinct from trash struggle). */
  setSlowdownVisual(active: boolean): void {
    if (this.isDead) {
      return;
    }

    const anim = this.sprite.anims;
    if (active) {
      if (!anim.isPaused) {
        anim.timeScale = 0.68;
      }
      this.statusTint = 0x9a8ec8;
    } else if (this.statusTint === 0x9a8ec8) {
      if (!anim.isPaused) {
        anim.timeScale = 1;
      }
      this.statusTint = null;
    }
    this.applyStatusTint();
  }

  /** Auto-hop over trash/passport barriers (NPCs use a short arc tween). */
  autoJumpOverObstacle(): void {
    if (this.isDead || this.obstacleJumpActive) {
      return;
    }

    this.obstacleJumpActive = true;
    // Hop from current on-screen Y (race lag may not be groundY).
    const baseY = this.y;
    const peakY = baseY - ux(38);
    this.scene.tweens.add({
      targets: this,
      y: peakY,
      duration: 200,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.obstacleJumpActive = false;
      },
    });
  }

  /**
   * Death animation.
   * @param options.blood — splash + tip-over (default). Set false for manhole fall.
   */
  die(options?: { blood?: boolean }): void {
    if (this.isDead) {
      return;
    }
    this.isDead = true;
    this.sprite.anims.stop();

    const withBlood = options?.blood !== false;
    if (!withBlood) {
      // Drop into the hole — short fade, no blood / squash.
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        y: this.y + ux(10),
        duration: 110,
        ease: 'Sine.easeIn',
      });
      return;
    }

    this.sprite.setTint(COLORS.blood);

    // Parent to this container (inside worldContainer) so the UI camera — which
    // ignores the world — does not draw a second un-scrolled splash to the side.
    for (let i = 0; i < 12; i++) {
      const particle = this.scene.add.circle(
        Phaser.Math.Between(-ux(20), ux(20)),
        -ux(20) + Phaser.Math.Between(-ux(10), ux(10)),
        Phaser.Math.Between(ux(3), ux(8)),
        COLORS.blood,
      );
      particle.setDepth(100);
      this.add(particle);
      this.bloodParticles.push(particle);

      this.scene.tweens.add({
        targets: particle,
        y: particle.y + Phaser.Math.Between(ux(30), ux(80)),
        alpha: 0,
        scale: 0.3,
        duration: Phaser.Math.Between(400, 800),
        onComplete: () => particle.destroy(),
      });
    }

    this.scene.tweens.add({
      targets: this,
      angle: 90,
      y: this.groundY + ux(10),
      duration: 400,
      ease: 'Power2',
    });
  }

  /** Resets runner state (not used by the player). */
  protected resetRunner(): void {
    this.isDead = false;
    this.angle = 0;
    this.y = this.groundY;
    this.bloodParticles.forEach((p) => p.destroy());
    this.bloodParticles.length = 0;
    this.sprite.clearTint();
    this.sprite.play(characterRunAnimKey(this.characterType));
    this.applyLampLighting(0, null);
  }

  destroy(fromScene?: boolean): void {
    this.setIdBadgeVisible(false, '');
    this.clearAbilityVfx();
    this.setSpeedStreakVisual(false);
    this.setSlowStreakVisual(false);
    this.clearFlightSmoke();
    this.flightPlane?.destroy();
    this.flightPlane = null;
    this.bloodParticles.forEach((p) => p.destroy());
    super.destroy(fromScene);
  }
}
