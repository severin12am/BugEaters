import Phaser from 'phaser';

/**
 * Creates game text at the current internal coordinate resolution.
 */
export function gameText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  style?: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, content, style);
}

/** Scales an image to fit a box while preserving texture aspect ratio. */
export function fitTextureInBox(
  image: Phaser.GameObjects.Image,
  maxWidth: number,
  maxHeight: number,
): void {
  const frame = image.frame;
  const w = frame.width;
  const h = frame.height;
  if (w <= 0 || h <= 0) {
    return;
  }
  const scale = Math.min(maxWidth / w, maxHeight / h);
  image.setDisplaySize(w * scale, h * scale);
}
