import Phaser from 'phaser';
import {
  CHARACTER_ATLAS_CELL_PX,
  CHARACTER_DISPLAY_HEIGHT,
  CHARACTER_FRAME_RATE,
  CHARACTER_WALK_FRAMES,
  characterAtlasKey,
  characterFramePath,
  characterRunAnimKey,
  characterTextureKey,
} from '../config/characterAssets';
import { CharacterType } from './constants';
import { DISPLAY_DPR } from './layout';

/** Loads walk-cycle PNGs from public/assets/characters/. */
export function preloadCharacterAssets(scene: Phaser.Scene): void {
  for (const type of Object.values(CharacterType)) {
    const frameCount = CHARACTER_WALK_FRAMES[type];
    for (let i = 1; i <= frameCount; i++) {
      scene.load.image(characterTextureKey(type, i), characterFramePath(type, i));
    }
  }
}

interface FrameLayout {
  baseW: number;
  baseH: number;
}

/**
 * Bakes each walk cycle into one atlas with uniform frame cells.
 * Frames are scaled so every pose shares the same width (fixes size pulsing).
 */
export function bakeCharacterAtlases(scene: Phaser.Scene): void {
  for (const type of Object.values(CharacterType)) {
    const frameCount = CHARACTER_WALK_FRAMES[type];
    const sourceKeys = Array.from({ length: frameCount }, (_, i) =>
      characterTextureKey(type, i + 1),
    );
    const targetH = Math.round(CHARACTER_DISPLAY_HEIGHT[type] * DISPLAY_DPR);

    const layouts: FrameLayout[] = sourceKeys.map((key) => {
      const img = scene.textures.get(key).getSourceImage() as HTMLImageElement;
      const aspect = img.width / img.height;
      const baseH = targetH;
      const baseW = Math.round(targetH * aspect);
      return { baseW, baseH };
    });

    const cellW = Math.max(...layouts.map((l) => l.baseW));
    const cellH = Math.max(
      ...layouts.map((l) => Math.round((l.baseH * cellW) / l.baseW)),
    );

    const atlasKey = characterAtlasKey(type);
    const canvas = document.createElement('canvas');
    canvas.width = cellW * frameCount;
    canvas.height = cellH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      continue;
    }
    ctx.imageSmoothingEnabled = true;

    sourceKeys.forEach((key, i) => {
      const img = scene.textures.get(key).getSourceImage() as HTMLImageElement;
      const { baseW, baseH } = layouts[i];
      const scale = cellW / baseW;
      const drawW = cellW;
      const drawH = Math.round(baseH * scale);
      const x = i * cellW;
      const y = cellH - drawH;
      ctx.drawImage(img, 0, 0, img.width, img.height, x, y, drawW, drawH);
    });

    scene.textures.addCanvas(atlasKey, canvas);
    const texture = scene.textures.get(atlasKey);
    for (let i = 0; i < frameCount; i++) {
      texture.add(i, 0, i * cellW, 0, cellW, cellH);
    }

    CHARACTER_ATLAS_CELL_PX[type] = { width: cellW, height: cellH };

    for (const key of sourceKeys) {
      scene.textures.remove(key);
    }
  }
}

/** Fixed on-screen size for a baked atlas (same for every animation frame). */
export function getCharacterDisplaySize(
  type: CharacterType,
): { width: number; height: number } {
  const cell = CHARACTER_ATLAS_CELL_PX[type];
  if (!cell) {
    const h = Math.round(CHARACTER_DISPLAY_HEIGHT[type] * DISPLAY_DPR);
    return { width: h, height: h };
  }
  return { width: cell.width, height: cell.height };
}

/** Registers one looping run animation per character type (uses baked atlases). */
export function registerCharacterAnimations(scene: Phaser.Scene): void {
  for (const type of Object.values(CharacterType)) {
    const animKey = characterRunAnimKey(type);
    const atlasKey = characterAtlasKey(type);
    const frameCount = CHARACTER_WALK_FRAMES[type];
    const frameRate = CHARACTER_FRAME_RATE[type];

    // Recreate so frame-rate tweaks always apply (exists() would keep a stale rate).
    if (scene.anims.exists(animKey)) {
      scene.anims.remove(animKey);
    }

    scene.anims.create({
      key: animKey,
      frames: scene.anims.generateFrameNumbers(atlasKey, {
        start: 0,
        end: frameCount - 1,
      }),
      frameRate,
      repeat: -1,
    });
  }
}
