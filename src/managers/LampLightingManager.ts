import Phaser from 'phaser';
import { LIGHTING_TUNING } from '../config/lighting';
import { GAME_HEIGHT, ux } from '../utils/constants';
import { LampPoint, sampleLampLight } from '../utils/lampLight';
import type { RunnerCharacter } from '../entities/RunnerCharacter';
import { FlashlightConeVfx } from '../utils/flashlightCone';

interface RunnerPoint {
  x: number;
  y: number;
  runner: RunnerCharacter;
}

/**
 * Unity-style lighting: darkness veil, intense ADD pools, alpha visibility, cast shadows.
 */
export class LampLightingManager {
  private readonly pools: Phaser.GameObjects.Image[] = [];
  private readonly castShadows: Phaser.GameObjects.Ellipse[] = [];
  private readonly poolTextureKey = 'lamp-pool-gradient-soft';
  private readonly flashlightCone: FlashlightConeVfx;
  private darknessVeil: Phaser.GameObjects.Rectangle | null = null;
  private flashlightBoost = false;
  private backdropWidth = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly propsContainer: Phaser.GameObjects.Container,
    private readonly darknessContainer: Phaser.GameObjects.Container,
    private readonly lightContainer: Phaser.GameObjects.Container,
    surfaceWidth: number,
    surfaceCenterX: number,
  ) {
    this.backdropWidth = surfaceWidth;
    this.ensurePoolTexture();
    this.flashlightCone = new FlashlightConeVfx(scene, lightContainer);
    this.darknessVeil = scene.add
      .rectangle(surfaceCenterX, GAME_HEIGHT / 2, surfaceWidth, GAME_HEIGHT, 0x000000, 1)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.darknessContainer.add(this.darknessVeil);
  }

  private ensurePoolTexture(): void {
    if (this.scene.textures.exists(this.poolTextureKey)) {
      return;
    }

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const cx = size / 2;
    const cy = size / 2;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.08, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.18, 'rgba(255,255,255,0.78)');
    gradient.addColorStop(0.32, 'rgba(255,255,255,0.52)');
    gradient.addColorStop(0.48, 'rgba(255,255,255,0.34)');
    gradient.addColorStop(0.62, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(0.76, 'rgba(255,255,255,0.1)');
    gradient.addColorStop(0.88, 'rgba(255,255,255,0.04)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    this.scene.textures.addCanvas(this.poolTextureKey, canvas);
  }

  setFlashlightBoost(active: boolean): void {
    this.flashlightBoost = active;
  }

  /** @deprecated Use updateFlashlightCone via GameScene.updateLighting */
  setFlashlightPoint(_point: LampPoint | null): void {
    // No-op — cone VFX replaced circular pool
  }

  updateFlashlightCone(
    active: boolean,
    playerX: number,
    feetY: number,
    subLaneWidth: number,
    characterHeight: number,
  ): void {
    this.flashlightCone.setActive(active, playerX, feetY, subLaneWidth, characterHeight);
  }

  /** Keep the darkness veil covering the full camera view (prevents grey edge lines). */
  syncToCamera(scrollX: number, viewWidth: number): void {
    const width = Math.max(this.backdropWidth, viewWidth + ux(16));
    const centerX = scrollX + viewWidth / 2;
    this.darknessVeil?.setPosition(centerX, GAME_HEIGHT / 2).setSize(width, GAME_HEIGHT);
  }

  update(lamps: readonly LampPoint[], runners: readonly RunnerPoint[]): void {
    const cfg = LIGHTING_TUNING;

    if (!cfg.enabled) {
      this.pools.forEach((p) => p.setVisible(false));
      this.castShadows.forEach((s) => s.setVisible(false));
      this.darknessVeil?.setVisible(false);
      for (const { runner } of runners) {
        runner.applyLampLighting(1, null);
      }
      return;
    }

    const veilAlpha = this.flashlightBoost
      ? cfg.darknessVeilAlpha * cfg.flashlightVeilMultiplier
      : cfg.darknessVeilAlpha;
    this.darknessVeil?.setVisible(true).setAlpha(veilAlpha);

    const basePoolSize = ux(cfg.poolDiameter);
    const radius = ux(cfg.lampInfluenceRadius);

    let poolIndex = 0;
    for (const lamp of lamps) {
      if (lamp.y < -ux(80) || lamp.y > GAME_HEIGHT + ux(80)) {
        continue;
      }

      let pool = this.pools[poolIndex];
      if (!pool) {
        pool = this.scene.add
          .image(0, 0, this.poolTextureKey)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.lightContainer.add(pool);
        this.pools[poolIndex] = pool;
      }

      const poolScale = lamp.poolScale ?? 1;
      const alphaScale = lamp.alphaScale ?? 1;
      pool.setVisible(true);
      pool.setPosition(lamp.x, lamp.y);
      pool.setDisplaySize(basePoolSize * poolScale, basePoolSize * poolScale);
      pool.setAlpha(cfg.poolMaxAlpha * alphaScale);
      poolIndex++;
    }

    for (let i = poolIndex; i < this.pools.length; i++) {
      this.pools[i]?.setVisible(false);
    }

    let shadowIndex = 0;
    for (const { x, y, runner } of runners) {
      const { brightness, nearest } = sampleLampLight(x, y, lamps, radius);
      runner.applyLampLighting(brightness, nearest);

      if (brightness < 0.08 || !nearest) {
        continue;
      }

      const dx = x - nearest.x;
      const dy = y - nearest.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angleRad = Math.atan2(dy, dx);

      const t = Phaser.Math.Clamp(dist / radius, 0, 1);
      const length = Phaser.Math.Linear(
        ux(cfg.castShadowLengthMin),
        ux(cfg.castShadowLengthMax),
        t,
      );
      const width = runner.getDisplayWidth() * cfg.castShadowWidthFactor;

      const offset = length * 0.58;
      const shadowX = x + Math.cos(angleRad) * offset;
      const shadowY = y + Math.sin(angleRad) * offset - ux(4);

      let shadow = this.castShadows[shadowIndex];
      if (!shadow) {
        shadow = this.scene.add.ellipse(0, 0, width, length, 0x000000, cfg.castShadowAlpha);
        shadow.setOrigin(0.5, 0.5);
        this.propsContainer.add(shadow);
        this.castShadows[shadowIndex] = shadow;
      }

      shadow.setVisible(true);
      shadow.setPosition(shadowX, shadowY);
      shadow.setSize(width, length);
      shadow.setRotation(angleRad + Math.PI / 2);
      shadow.setAlpha(cfg.castShadowAlpha * brightness);
      shadowIndex++;
    }

    for (let i = shadowIndex; i < this.castShadows.length; i++) {
      this.castShadows[i]?.setVisible(false);
    }
  }

  destroy(): void {
    this.flashlightCone.destroy();
    this.pools.forEach((p) => p.destroy());
    this.pools.length = 0;
    this.castShadows.forEach((s) => s.destroy());
    this.castShadows.length = 0;
    this.darknessVeil?.destroy();
    this.darknessVeil = null;
  }
}
