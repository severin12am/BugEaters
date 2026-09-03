import Phaser from 'phaser';
import { PROP_TEXTURE_KEYS } from '../config/propAssets';
import { TUNING } from '../config/tuning';
import { ux } from './layout';

/**
 * Source PNGs exported from Unity are huge relative to how they are drawn
 * (puddle 1280×1236 → ~130 px tall on screen; paper straw 1000×1000 → ~56 px).
 * The GPU has to keep every one resident and sample across them with no
 * mipmaps, which costs texture memory and bandwidth on phones.
 *
 * At boot we redraw those textures into canvases sized ~2× their largest
 * on-screen height (enough headroom for rotation + linear filtering), then swap
 * them in under the same texture key. All consumers scale by `sprite.height`,
 * so nothing else changes.
 *
 * Manholes are intentionally NOT shrunk: `TUNING.obstacles.manholeSourceDiameterPx`
 * is an absolute pixel measure of the 500×500 PNG.
 */

interface ShrinkTarget {
  key: string;
  /** Largest height (logical px) this prop is ever drawn at in the race. */
  maxDisplayHeightLogical: number;
}

const OVERSAMPLE = 2;

function shrinkTargets(): ShrinkTarget[] {
  const obstacles = TUNING.obstacles;
  return [
    {
      key: PROP_TEXTURE_KEYS.puddle,
      maxDisplayHeightLogical: obstacles.puddleDisplayHeightMin * obstacles.puddleSizeScaleMax,
    },
    {
      key: PROP_TEXTURE_KEYS.trashBin,
      maxDisplayHeightLogical: obstacles.trashDisplayHeight * obstacles.trashSizeMultiplier,
    },
    { key: PROP_TEXTURE_KEYS.paperStraw, maxDisplayHeightLogical: 32 },
    { key: PROP_TEXTURE_KEYS.passport, maxDisplayHeightLogical: 40 },
    { key: PROP_TEXTURE_KEYS.syringe, maxDisplayHeightLogical: 40 },
    { key: PROP_TEXTURE_KEYS.lampLeft, maxDisplayHeightLogical: TUNING.lamps.displayHeight },
    { key: PROP_TEXTURE_KEYS.lampRight, maxDisplayHeightLogical: TUNING.lamps.displayHeight },
  ];
}

/** Shrinks every oversized prop texture. Safe to call once, right after preload. */
export function shrinkOversizedPropTextures(scene: Phaser.Scene): void {
  for (const target of shrinkTargets()) {
    const targetH = Math.max(64, ux(target.maxDisplayHeightLogical) * OVERSAMPLE);
    shrinkTextureToHeight(scene, target.key, targetH);
  }
}

/**
 * Replaces `key` with a canvas copy whose height is `targetH` (aspect kept).
 * No-op when the texture is already that small or is not a plain image.
 */
export function shrinkTextureToHeight(scene: Phaser.Scene, key: string, targetH: number): boolean {
  if (!scene.textures.exists(key)) {
    return false;
  }
  const texture = scene.textures.get(key);
  const source = texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const srcW = source.width;
  const srcH = source.height;
  if (!srcW || !srcH || srcH <= targetH) {
    return false;
  }

  const finalH = Math.round(targetH);
  const finalW = Math.max(1, Math.round((srcW * finalH) / srcH));

  // Halve step by step so large ratios do not alias (single-step drawImage
  // resampling from 1280px to ~260px drops detail unevenly).
  let current: HTMLImageElement | HTMLCanvasElement = source;
  let curW = srcW;
  let curH = srcH;
  while (curH / 2 >= finalH) {
    const nextW = Math.max(1, Math.round(curW / 2));
    const nextH = Math.max(1, Math.round(curH / 2));
    const stage = drawScaled(current, curW, curH, nextW, nextH);
    if (!stage) {
      return false;
    }
    current = stage;
    curW = nextW;
    curH = nextH;
  }
  const finalCanvas = drawScaled(current, curW, curH, finalW, finalH);
  if (!finalCanvas) {
    return false;
  }

  scene.textures.remove(key);
  scene.textures.addCanvas(key, finalCanvas);
  return true;
}

function drawScaled(
  source: HTMLImageElement | HTMLCanvasElement,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, dstW, dstH);
  return canvas;
}
