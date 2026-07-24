import Phaser from 'phaser';
import { CharacterType, GRAVITY, JUMP_VELOCITY } from '../utils/constants';
import { RunnerCharacter } from './RunnerCharacter';

/**
 * Player-controlled runner with jump physics.
 */
export class Player extends RunnerCharacter {
  private isGrounded = true;
  private verticalVelocity = 0;
  /** True while airborne from an auto-jump over a trash bin. */
  private trashAutoJumpActive = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    groundY: number,
    characterType: CharacterType,
  ) {
    super(scene, x, groundY, characterType);
  }

  /** Applies upward velocity if the player is on the ground and alive. */
  jump(): void {
    if (!this.isGrounded || this.getIsDead()) {
      return;
    }
    this.verticalVelocity = JUMP_VELOCITY;
    this.isGrounded = false;
  }

  /** Auto-jump over a trash bin — slows race progress while airborne. */
  autoJumpOverTrash(): void {
    if (!this.isGrounded || this.getIsDead()) {
      return;
    }
    this.trashAutoJumpActive = true;
    this.jump();
  }

  isTrashAutoJumpInAir(): boolean {
    return this.trashAutoJumpActive && !this.isGrounded;
  }

  isGroundedOnTrack(): boolean {
    return this.isGrounded;
  }

  /** Updates vertical physics each frame. */
  updatePhysics(deltaMs: number): void {
    if (this.getIsDead()) {
      return;
    }

    // Grounded Y is owned by race-visual offset — don't integrate gravity here
    // or a lead position (y > groundY after puddle boost) will instantly "land"
    // and cancel trash auto-jumps on the same frame they start.
    if (this.isGrounded) {
      return;
    }

    const dt = deltaMs / 1000;
    this.verticalVelocity += GRAVITY * dt;
    this.y += this.verticalVelocity * dt;

    // Only land when falling onto the line (allows jumps that start from a lead Y).
    if (this.verticalVelocity >= 0 && this.y >= this.groundY) {
      this.y = this.groundY;
      this.verticalVelocity = 0;
      this.isGrounded = true;
      this.trashAutoJumpActive = false;
    }
  }

  getHitboxY(): number {
    return super.getHitboxY();
  }

}
