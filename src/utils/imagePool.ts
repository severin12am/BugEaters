import Phaser from 'phaser';

/**
 * Recycles `Image` game objects inside one container.
 *
 * Road props (trash, puddles, pickups, server hazards) spawn and vanish a few
 * times per second for the whole race. Creating a fresh game object each time
 * and destroying it later is cheap on a desktop but shows up as GC hitches on
 * weak phones. This pool keeps a bounded free list and re-textures instead.
 */
export class ImagePool {
  private readonly free: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly container: Phaser.GameObjects.Container,
    private readonly maxFree = 24,
  ) {}

  /**
   * Returns a visible, reset image at the end of the container's draw order
   * (same place a freshly created child would land).
   */
  acquire(x: number, y: number, textureKey: string): Phaser.GameObjects.Image {
    let image = this.free.pop();
    if (image && image.scene) {
      image.setTexture(textureKey);
      image.setPosition(x, y);
      image.setActive(true).setVisible(true);
      this.container.bringToTop(image);
    } else {
      image = this.scene.add.image(x, y, textureKey);
      this.container.add(image);
    }
    image
      .setOrigin(0.5, 0.5)
      .setScale(1)
      .setAngle(0)
      .setAlpha(1)
      .setDepth(0)
      .setFlip(false, false)
      .clearTint();
    return image;
  }

  /** Hides the image and parks it for reuse (destroys when the free list is full). */
  release(image: Phaser.GameObjects.Image): void {
    if (!image.scene) {
      return;
    }
    if (this.free.length >= this.maxFree) {
      image.destroy();
      return;
    }
    image.setVisible(false).setActive(false);
    this.free.push(image);
  }

  destroy(): void {
    for (const image of this.free) {
      image.destroy();
    }
    this.free.length = 0;
  }
}
