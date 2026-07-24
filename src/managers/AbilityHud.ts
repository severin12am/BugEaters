import Phaser from 'phaser';
import { ABILITY_MAX_SLOTS, getAbility } from '../config/abilities';
import { COLORS, GAME_WIDTH, ux } from '../utils/constants';
import { fitTextureInBox } from '../utils/display';
import { fontSize, getAbilityHudSlotSize, getAbilityHudY } from '../utils/layout';
import type { AbilityInventory } from './AbilityInventory';

export interface AbilityHudOptions {
  onActivate: () => void;
  onArm?: (slotIndex: number) => void;
}

/**
 * Bottom ability bar — three slots. Tap a filled slot to arm it; tap the armed slot to use.
 */
export class AbilityHud {
  private readonly root: Phaser.GameObjects.Container;
  private readonly slotBgs: Phaser.GameObjects.Rectangle[] = [];
  private readonly slotIcons: Phaser.GameObjects.Image[] = [];
  private readonly toastText: Phaser.GameObjects.Text;
  private toastTimer: Phaser.Time.TimerEvent | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly inventory: AbilityInventory,
    options: AbilityHudOptions,
  ) {
    const y = getAbilityHudY(scene);
    const { width: slotW, height: slotH } = getAbilityHudSlotSize();
    const gap = ux(10);
    const totalW = ABILITY_MAX_SLOTS * slotW + (ABILITY_MAX_SLOTS - 1) * gap;
    const startX = GAME_WIDTH / 2 - totalW / 2 + slotW / 2;
    const iconPadX = ux(6);
    const iconPadY = ux(4);

    this.root = scene.add.container(0, 0).setDepth(200);

    for (let i = 0; i < ABILITY_MAX_SLOTS; i++) {
      const x = startX + i * (slotW + gap);
      const bg = scene.add
        .rectangle(x, y, slotW, slotH, 0x1a1a1a, 0.85)
        .setStrokeStyle(ux(2), 0x444444)
        .setInteractive({ useHandCursor: true });
      const icon = scene.add.image(x, y, 'ability-speed-up').setVisible(false);
      fitTextureInBox(icon, slotW - iconPadX * 2, slotH - iconPadY * 2);

      bg.on('pointerup', (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        const slots = this.inventory.readonlySlots();
        if (!slots[i]) {
          return;
        }
        if (i !== this.inventory.armedIndex) {
          options.onArm?.(i);
          return;
        }
        options.onActivate();
      });

      this.slotBgs.push(bg);
      this.slotIcons.push(icon);
      this.root.add([bg, icon]);
    }

    this.toastText = scene.add
      .text(GAME_WIDTH / 2, y - ux(36), '', {
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: fontSize(11),
        color: '#cccccc',
        align: 'center',
        wordWrap: { width: GAME_WIDTH - ux(40) },
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.root.add(this.toastText);
  }

  getHudObjects(): Phaser.GameObjects.GameObject[] {
    return [this.root, ...this.slotBgs, ...this.slotIcons, this.toastText];
  }

  refresh(): void {
    const slots = this.inventory.readonlySlots();
    const armed = this.inventory.armedIndex;

    for (let i = 0; i < ABILITY_MAX_SLOTS; i++) {
      const id = slots[i];
      const icon = this.slotIcons[i];
      const bg = this.slotBgs[i];

      if (id) {
        const ability = getAbility(id);
        icon.setTexture(ability.textureKey).setVisible(true);
        const { width: slotW, height: slotH } = getAbilityHudSlotSize();
        fitTextureInBox(icon, slotW - ux(12), slotH - ux(8));
        const isArmed = i === armed;
        bg.setStrokeStyle(ux(isArmed ? 3 : 2), isArmed ? COLORS.white : 0x444444);
        bg.setAlpha(isArmed ? 1 : 0.75);
        icon.setAlpha(isArmed ? 1 : 0.65);
      } else {
        icon.setVisible(false);
        bg.setStrokeStyle(ux(2), 0x333333);
        bg.setAlpha(0.45);
      }
    }
  }

  showToast(message: string, durationMs = 2200): void {
    this.toastTimer?.remove();
    this.toastText.setText(message);
    this.scene.tweens.killTweensOf(this.toastText);
    this.toastText.setAlpha(1);
    this.toastTimer = this.scene.time.delayedCall(durationMs, () => {
      this.scene.tweens.add({
        targets: this.toastText,
        alpha: 0,
        duration: 350,
      });
    });
  }

  destroy(): void {
    this.toastTimer?.remove();
    this.root.destroy();
  }
}
