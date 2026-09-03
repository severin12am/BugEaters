import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { GAME_HEIGHT, ux } from '../utils/constants';
import { RoadScroll } from './RoadScroll';

const DASH_TEXTURE_KEY = 'road-edge-dash';
const DASH_TEXTURE_W = 4;
const DASH_TEXTURE_H = 64;

/**
 * Dashed vertical lines marking the playable road boundary (left + right).
 *
 * Each side is ONE full-height TileSprite over a tiny "dash + gap" texture that
 * scrolls via `tilePositionY`. The previous version kept ~70 Rectangle game
 * objects alive and moved every one of them each frame.
 */
export class RoadEdgeMarkers {
  private readonly strips: Phaser.GameObjects.TileSprite[] = [];
  private readonly unsubscribe: () => void;
  private readonly tileScaleY: number;

  constructor(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    roadScroll: RoadScroll,
    leftX: number,
    rightX: number,
  ) {
    const cfg = TUNING.roadEdges;
    const dashW = Math.max(1, ux(cfg.width));
    const dashH = ux(cfg.dashLength);
    const gapH = ux(cfg.dashGap);
    const period = dashH + gapH;
    ensureDashTexture(scene, dashH / period, cfg.color);
    // Texture is power-of-two; tile scale maps one texture period onto one
    // on-screen dash+gap period (keeps edges crisp, no POT resampling).
    this.tileScaleY = period / DASH_TEXTURE_H;

    for (const x of [leftX, rightX]) {
      const strip = scene.add
        .tileSprite(x, 0, dashW, GAME_HEIGHT + period, DASH_TEXTURE_KEY)
        .setOrigin(0.5, 0)
        .setTileScale(dashW / DASH_TEXTURE_W, this.tileScaleY)
        .setAlpha(cfg.alpha)
        .setDepth(0);
      container.add(strip);
      this.strips.push(strip);
    }

    this.unsubscribe = roadScroll.onScroll((deltaY) => this.scroll(deltaY));
  }

  private scroll(deltaY: number): void {
    // tilePosition is in texture px; negative = pattern moves down with the road.
    const step = deltaY / this.tileScaleY;
    for (const strip of this.strips) {
      strip.tilePositionY -= step;
    }
  }

  destroy(): void {
    this.unsubscribe();
    this.strips.forEach((s) => s.destroy());
    this.strips.length = 0;
  }
}

/** One dash period: a filled dash on top, transparent gap below. */
function ensureDashTexture(scene: Phaser.Scene, dashFraction: number, color: number): void {
  if (scene.textures.exists(DASH_TEXTURE_KEY)) {
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = DASH_TEXTURE_W;
  canvas.height = DASH_TEXTURE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, DASH_TEXTURE_W, Math.round(DASH_TEXTURE_H * dashFraction));
  scene.textures.addCanvas(DASH_TEXTURE_KEY, canvas);
}
