import Phaser from 'phaser';

/** Callback signatures for runner input events. */
export interface InputCallbacks {
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onJump: () => void;
}

export interface InputManagerOptions {
  /** When true, lane/jump input is ignored (e.g. ability HUD tap). */
  shouldConsumePointer?: (pointer: Phaser.Input.Pointer) => boolean;
}

/**
 * Unified input handler for swipe gestures and keyboard/tap controls.
 * Supports touch swipes (Telegram Mini App) and arrow keys for desktop testing.
 */
export class InputManager {
  private readonly scene: Phaser.Scene;
  private readonly callbacks: InputCallbacks;
  private readonly shouldConsumePointer?: (pointer: Phaser.Input.Pointer) => boolean;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private readonly swipeThreshold = 40;

  /**
   * @param scene - Scene that owns the input listeners.
   * @param callbacks - Handlers for lane change and jump actions.
   */
  constructor(scene: Phaser.Scene, callbacks: InputCallbacks, options: InputManagerOptions = {}) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.shouldConsumePointer = options.shouldConsumePointer;
    this.setupPointerInput();
    this.setupKeyboardInput();
  }

  /** Registers pointer down/up for swipe detection and tap-to-jump. */
  private setupPointerInput(): void {
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerStartX = pointer.x;
      this.pointerStartY = pointer.y;
    });

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.shouldConsumePointer?.(pointer)) {
        return;
      }

      const dx = pointer.x - this.pointerStartX;
      const dy = pointer.y - this.pointerStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx < this.swipeThreshold && absDy < this.swipeThreshold) {
        const screenMid = this.scene.scale.width / 2;
        if (pointer.x < screenMid) {
          this.callbacks.onMoveLeft();
        } else {
          this.callbacks.onMoveRight();
        }
        return;
      }

      if (absDx > absDy) {
        if (dx > this.swipeThreshold) {
          this.callbacks.onMoveRight();
        } else if (dx < -this.swipeThreshold) {
          this.callbacks.onMoveLeft();
        }
      } else if (dy < -this.swipeThreshold) {
        this.callbacks.onJump();
      }
    });
  }

  /** Arrow keys and space for local development. */
  private setupKeyboardInput(): void {
    const keys = this.scene.input.keyboard;
    if (!keys) {
      return;
    }

    keys.on('keydown-LEFT', () => this.callbacks.onMoveLeft());
    keys.on('keydown-RIGHT', () => this.callbacks.onMoveRight());
    keys.on('keydown-UP', () => this.callbacks.onJump());
    keys.on('keydown-SPACE', () => this.callbacks.onJump());
  }

  /** Removes all input listeners when the scene shuts down. */
  destroy(): void {
    this.scene.input.off('pointerdown');
    this.scene.input.off('pointerup');
  }
}
