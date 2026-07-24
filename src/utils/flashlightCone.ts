import Phaser from 'phaser';
import { LIGHTING_TUNING } from '../config/lighting';
import { ux } from './constants';

const CONE_TEXTURE_KEY = 'flashlight-cone-gradient';

function ensureConeTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(CONE_TEXTURE_KEY)) {
    return;
  }

  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const apexHalfW = w * 0.06;
  const cfg = LIGHTING_TUNING;

  ctx.clearRect(0, 0, w, h);

  // Brightest near the apex (character), fading forward.
  const gradient = ctx.createLinearGradient(w / 2, h, w / 2, 0);
  gradient.addColorStop(0, `rgba(255,255,255,${cfg.flashlightConeAlpha * 0.85})`);
  gradient.addColorStop(0.2, `rgba(255,255,255,${cfg.flashlightConeAlpha * 0.7})`);
  gradient.addColorStop(0.5, `rgba(255,255,255,${cfg.flashlightConeAlpha * 0.4})`);
  gradient.addColorStop(0.8, `rgba(255,255,255,${cfg.flashlightConeAlpha * 0.15})`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.beginPath();
  ctx.moveTo(w / 2 - apexHalfW, h);
  ctx.lineTo(w / 2 + apexHalfW, h);
  ctx.lineTo(w, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  scene.textures.addCanvas(CONE_TEXTURE_KEY, canvas);
}

/**
 * Single ADD-blended cone ahead of the runner — NEXUS SAPIENS.
 * Apex sits above the player; beam widens to ~3 sub-lanes toward the top of the screen.
 */
export class FlashlightConeVfx {
  private cone: Phaser.GameObjects.Image | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly lightContainer: Phaser.GameObjects.Container,
  ) {
    ensureConeTexture(scene);
  }

  setActive(
    active: boolean,
    playerX: number,
    feetY: number,
    subLaneWidth: number,
    characterHeight: number,
  ): void {
    if (!active) {
      this.cone?.setVisible(false);
      return;
    }

    const cfg = LIGHTING_TUNING;
    const coneLen = ux(cfg.flashlightConeLength);
    const halfW = (subLaneWidth * cfg.flashlightConeSubLanes) / 2;
    const apexY = feetY - characterHeight * cfg.flashlightApexHeightFraction;

    if (!this.cone) {
      this.cone = this.scene.add
        .image(playerX, apexY, CONE_TEXTURE_KEY)
        .setOrigin(0.5, 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(2);
      this.lightContainer.add(this.cone);
    }

    this.cone.setVisible(true);
    this.cone.setPosition(playerX, apexY);
    this.cone.setDisplaySize(halfW * 2, coneLen);
    this.cone.setAlpha(cfg.flashlightConeAlpha);
  }

  destroy(): void {
    this.cone?.destroy();
    this.cone = null;
  }
}
