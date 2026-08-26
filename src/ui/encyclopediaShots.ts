/**
 * Guide photo cards — screenshot + caption + callout chips.
 * Labels sit beside the object with a pointer so they don't cover it.
 */
import Phaser from 'phaser';
import { ux } from '../utils/constants';
import { fontSize } from '../utils/layout';
import { gameText } from '../utils/display';
import { createMonoPanel } from './UiChrome';
import { MONO, MONO_CSS } from './theme';
import { GUIDE_SHOTS, getGuideShot, type CalloutPlace, type GuideShotCallout } from '../config/guideShots';

export interface ShotCardResult {
  container: Phaser.GameObjects.Container;
  height: number;
}

export function createGuideShotCard(
  scene: Phaser.Scene,
  shotId: string,
  width: number,
  heading: string | null,
  caption: string | null,
): ShotCardResult | null {
  const def = getGuideShot(shotId);
  if (!def || !scene.textures.exists(def.key)) {
    return null;
  }

  const pad = ux(14);
  const innerW = width - pad * 2;
  const source = scene.textures.get(def.key).getSourceImage() as HTMLImageElement;
  const srcW = Math.max(1, source.width);
  const srcH = Math.max(1, source.height);
  const maxImgH = ux(440);
  const fitH = innerW * (srcH / srcW);
  const imgH = Math.min(fitH, maxImgH);
  const imgW = imgH * (srcW / srcH);

  let y = pad;
  const root = scene.add.container(0, 0);

  let headingObj: Phaser.GameObjects.Text | null = null;
  if (heading) {
    headingObj = gameText(scene, pad, y, heading.toUpperCase(), {
      fontFamily: MONO_CSS.fontDisplay,
      fontSize: fontSize(16),
      color: MONO_CSS.text,
      fontStyle: 'bold',
    }).setOrigin(0, 0);
    headingObj.setWordWrapWidth(innerW, true);
    y += headingObj.height + ux(10);
  }

  const imgX = pad + (innerW - imgW) / 2;
  const photo = scene.add.image(imgX, y, def.key).setOrigin(0, 0);
  photo.setDisplaySize(imgW, imgH);

  const frame = scene.add.rectangle(imgX + imgW / 2, y + imgH / 2, imgW, imgH);
  frame.setStrokeStyle(ux(1), MONO.borderStrong, 0.45);

  const callouts = def.callouts.map((callout) =>
    pointerLabel(scene, imgX, y, imgW, imgH, callout),
  );

  y += imgH + ux(14);

  let captionObj: Phaser.GameObjects.Text | null = null;
  if (caption) {
    captionObj = gameText(scene, pad, y, caption, {
      fontFamily: MONO_CSS.fontBody,
      fontSize: fontSize(16),
      color: MONO_CSS.text,
    }).setOrigin(0, 0);
    captionObj.setWordWrapWidth(innerW, true);
    y += captionObj.height;
  }

  const height = y + pad;
  const panel = createMonoPanel(scene, 0, 0, { width, height, raised: true });
  root.add(panel);
  if (headingObj) {
    root.add(headingObj);
  }
  root.add(photo);
  root.add(frame);
  callouts.forEach((item) => root.add(item));
  if (captionObj) {
    root.add(captionObj);
  }

  return { container: root, height };
}

function pointerLabel(
  scene: Phaser.Scene,
  imgX: number,
  imgY: number,
  imgW: number,
  imgH: number,
  callout: GuideShotCallout,
): Phaser.GameObjects.Container {
  const targetX = imgX + callout.nx * imgW;
  const targetY = imgY + callout.ny * imgH;
  const place: CalloutPlace = callout.place ?? 'above';

  const label = gameText(scene, 0, 0, callout.text.toUpperCase(), {
    fontFamily: MONO_CSS.fontDisplay,
    fontSize: fontSize(13),
    color: MONO_CSS.ink,
    fontStyle: 'bold',
  }).setOrigin(0.5);
  const chipW = label.width + ux(16);
  const chipH = label.height + ux(10);

  const minX = imgX + chipW / 2 + ux(6);
  const maxX = imgX + imgW - chipW / 2 - ux(6);
  const minY = imgY + chipH / 2 + ux(6);
  const maxY = imgY + imgH - chipH / 2 - ux(6);

  let chipX: number;
  let chipY: number;
  if (callout.chipNx !== undefined && callout.chipNy !== undefined) {
    chipX = imgX + callout.chipNx * imgW;
    chipY = imgY + callout.chipNy * imgH;
  } else {
    const gap = ux(36);
    chipX = targetX;
    chipY = targetY;
    if (place === 'above') {
      chipY = targetY - chipH / 2 - gap;
    } else if (place === 'below') {
      chipY = targetY + chipH / 2 + gap;
    } else if (place === 'left') {
      chipX = targetX - chipW / 2 - gap;
    } else {
      chipX = targetX + chipW / 2 + gap;
    }
  }
  chipX = Phaser.Math.Clamp(chipX, minX, maxX);
  chipY = Phaser.Math.Clamp(chipY, minY, maxY);

  const line = scene.add.graphics();
  line.lineStyle(ux(2), MONO.white, 0.95);
  const dx = chipX - targetX;
  const dy = chipY - targetY;
  const len = Math.hypot(dx, dy) || 1;
  const inset = ux(8);
  const endX = targetX + (dx / len) * inset;
  const endY = targetY + (dy / len) * inset;
  line.beginPath();
  line.moveTo(chipX, chipY);
  line.lineTo(endX, endY);
  line.strokePath();
  line.fillStyle(MONO.white, 1);
  line.fillCircle(endX, endY, ux(3));

  const bg = scene.add.rectangle(chipX, chipY, chipW, chipH, MONO.white);
  bg.setStrokeStyle(ux(1), MONO.ink, 0.9);
  label.setPosition(chipX, chipY);

  const g = scene.add.container(0, 0);
  g.add([line, bg, label]);
  return g;
}

/** Preload all guide PNGs. Missing files fail softly (card skipped). */
export function preloadGuideShots(scene: Phaser.Scene): void {
  for (const shot of GUIDE_SHOTS) {
    scene.load.image(shot.key, shot.path);
  }
}
