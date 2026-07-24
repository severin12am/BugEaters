import Phaser from 'phaser';
import { CharacterType } from '../utils/constants';
import { RunnerCharacter } from './RunnerCharacter';

/** AI runner that stays in its home lane — used to test the eat chain. */
export class LaneNpc extends RunnerCharacter {
  constructor(
    scene: Phaser.Scene,
    x: number,
    groundY: number,
    characterType: CharacterType,
  ) {
    super(scene, x, groundY, characterType);
  }

  /** Called by NpcManager after a respawn delay so interactions can be retested. */
  respawn(): void {
    this.setVisible(true);
    this.setActive(true);
    this.resetRunner();
  }

  hideAfterDeath(): void {
    // Delay so manhole fade / tip-over can play first.
    this.scene.time.delayedCall(500, () => {
      if (this.getIsDead()) {
        this.setVisible(false);
        this.setActive(false);
      }
    });
  }
}
