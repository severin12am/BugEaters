import Phaser from 'phaser';

const GRAIN_SIZE = 64;

/** Fine light grain on near-black asphalt. */
export function createGrainTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('asphalt-grain')) {
    return;
  }

  scene.textures.addCanvas('asphalt-grain', makeGrainCanvas(0x080808, 0x161616, 220));
}

function makeGrainCanvas(baseRgb: number, speckRgb: number, speckCount: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = GRAIN_SIZE;
  canvas.height = GRAIN_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }

  const base = splitColor(baseRgb);
  const speck = splitColor(speckRgb);
  ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
  ctx.fillRect(0, 0, GRAIN_SIZE, GRAIN_SIZE);

  for (let i = 0; i < speckCount; i++) {
    const x = Math.floor(Math.random() * GRAIN_SIZE);
    const y = Math.floor(Math.random() * GRAIN_SIZE);
    const light = Math.random() > 0.55;
    const shade = light ? speck : base;
    const alpha = light ? 0.06 + Math.random() * 0.14 : 0.02 + Math.random() * 0.05;
    ctx.fillStyle = `rgba(${shade.r},${shade.g},${shade.b},${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }

  return canvas;
}

function splitColor(hex: number): { r: number; g: number; b: number } {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
  };
}
