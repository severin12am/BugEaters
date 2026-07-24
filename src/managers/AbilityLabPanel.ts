import Phaser from 'phaser';
import { ABILITIES, type AbilityDef } from '../config/abilities';
import { COLORS, GAME_WIDTH, ux } from '../utils/constants';
import { fitTextureInBox, gameText } from '../utils/display';
import { fontSize, getHudSecondRowY } from '../utils/layout';

export interface AbilityLabPanelOptions {
  onActivate: (abilityId: string) => void;
  onExit: () => void;
  isGodMode: () => boolean;
  onGodModeChange: (enabled: boolean) => void;
}

/**
 * Dev overlay — tap any briefcase to fire it, open a visual guide, toggle god mode.
 */
export class AbilityLabPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly guideRoot: Phaser.GameObjects.Container;
  private readonly tested = new Set<string>();
  private readonly checkmarks = new Map<string, Phaser.GameObjects.Text>();
  private godMode = true;
  private godLabel!: Phaser.GameObjects.Text;
  private guideVisible = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: AbilityLabPanelOptions,
  ) {
    const rowY = getHudSecondRowY(scene) + ux(36);
    this.root = scene.add.container(0, 0).setDepth(250);

    const title = gameText(scene, GAME_WIDTH / 2, rowY - ux(28), 'ABILITY LAB', {
      fontSize: fontSize(11),
      color: '#aaaaaa',
    }).setOrigin(0.5);
    const npcHint = gameText(scene, GAME_WIDTH / 2, rowY - ux(12), 'Bug rival ahead — test slow / ID / reset on him', {
      fontSize: fontSize(9),
      color: '#666666',
    }).setOrigin(0.5);
    this.root.add([title, npcHint]);

    const btnW = ux(54);
    const btnH = ux(44);
    const gap = ux(6);
    const cols = 4;
    const gridW = cols * btnW + (cols - 1) * gap;
    const startX = GAME_WIDTH / 2 - gridW / 2 + btnW / 2;

    ABILITIES.forEach((ability, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * (btnW + gap);
      const y = rowY + row * (btnH + gap);

      const bg = scene.add
        .rectangle(x, y, btnW, btnH, 0x141414, 0.92)
        .setStrokeStyle(ux(1), 0x555555)
        .setInteractive({ useHandCursor: true });
      const icon = scene.add.image(x, y - ux(4), ability.textureKey);
      fitTextureInBox(icon, btnW - ux(10), btnH - ux(16));

      const mark = gameText(scene, x + btnW / 2 - ux(8), y - btnH / 2 + ux(6), '', {
        fontSize: fontSize(10),
        color: '#66ff66',
      }).setOrigin(1, 0);
      this.checkmarks.set(ability.id, mark);

      bg.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.fireAbility(ability);
      });

      this.root.add([bg, icon, mark]);
    });

    const controlsY = rowY + 2 * (btnH + gap) + ux(18);
    const guideBtn = this.makeButton(GAME_WIDTH / 2 - ux(88), controlsY, 'Guide', ux(72), () =>
      this.toggleGuide(),
    );
    const godBtn = this.makeButton(GAME_WIDTH / 2, controlsY, 'God: ON', ux(88), () => {
      this.godMode = !this.godMode;
      this.options.onGodModeChange(this.godMode);
      this.godLabel.setText(this.godMode ? 'God: ON' : 'God: OFF');
    });
    this.godLabel = godBtn.label;

    const exitBtn = this.makeButton(GAME_WIDTH / 2 + ux(88), controlsY, 'Exit', ux(64), () =>
      this.options.onExit(),
    );
    this.root.add([
      guideBtn.bg,
      guideBtn.label,
      godBtn.bg,
      godBtn.label,
      exitBtn.bg,
      exitBtn.label,
    ]);

    this.guideRoot = scene.add.container(0, 0).setDepth(300).setVisible(false);
    this.buildGuideOverlay();
  }

  private fireAbility(ability: AbilityDef): void {
    this.tested.add(ability.id);
    this.checkmarks.get(ability.id)?.setText('✓');
    this.options.onActivate(ability.id);
  }

  private makeButton(
    x: number,
    y: number,
    label: string,
    width: number,
    onClick: () => void,
  ): { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text } {
    const bg = this.scene.add
      .rectangle(x, y, width, ux(30), 0x222222, 0.95)
      .setStrokeStyle(ux(1), COLORS.laneLine)
      .setInteractive({ useHandCursor: true });
    const text = gameText(this.scene, x, y, label, {
      fontSize: fontSize(11),
      color: '#ffffff',
    }).setOrigin(0.5);
    bg.on('pointerup', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      onClick();
    });
    return { bg, label: text };
  }

  private buildGuideOverlay(): void {
    const backdrop = this.scene.add
      .rectangle(GAME_WIDTH / 2, this.scene.scale.height / 2, GAME_WIDTH, this.scene.scale.height, 0x000000, 0.88)
      .setInteractive();
    backdrop.on('pointerup', () => this.toggleGuide(false));

    const heading = gameText(this.scene, GAME_WIDTH / 2, ux(56), 'Briefcase guide', {
      fontSize: fontSize(18),
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const sub = gameText(
      this.scene,
      GAME_WIDTH / 2,
      ux(82),
      'Tap outside to close — match road pickups to these icons',
      { fontSize: fontSize(11), color: '#888888' },
    ).setOrigin(0.5);

    this.guideRoot.add([backdrop, heading, sub]);

    const cardW = ux(168);
    const cardH = ux(118);
    const gapX = ux(10);
    const gapY = ux(10);
    const cols = 2;
    const gridW = cols * cardW + gapX;
    const startX = GAME_WIDTH / 2 - gridW / 2 + cardW / 2;
    let startY = ux(108);

    ABILITIES.forEach((ability, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);

      const card = this.scene.add.rectangle(x, y, cardW, cardH, 0x121212, 0.98).setStrokeStyle(ux(1), 0x444444);
      const icon = this.scene.add.image(x - cardW / 2 + ux(36), y - ux(8), ability.textureKey);
      fitTextureInBox(icon, ux(52), ux(40));

      const name = gameText(this.scene, x - cardW / 2 + ux(72), y - ux(22), ability.name, {
        fontSize: fontSize(10),
        color: '#ffffff',
        fontStyle: 'bold',
        wordWrap: { width: cardW - ux(78) },
      }).setOrigin(0, 0.5);

      const desc = gameText(this.scene, x - cardW / 2 + ux(72), y + ux(6), ability.description, {
        fontSize: fontSize(9),
        color: '#aaaaaa',
        wordWrap: { width: cardW - ux(78) },
      }).setOrigin(0, 0);

      const slug = gameText(this.scene, x - cardW / 2 + ux(8), y + cardH / 2 - ux(14), ability.id, {
        fontSize: fontSize(8),
        color: '#666666',
      }).setOrigin(0, 0.5);

      this.guideRoot.add([card, icon, name, desc, slug]);
    });

    const closeBtn = this.scene.add
      .rectangle(GAME_WIDTH / 2, this.scene.scale.height - ux(48), ux(120), ux(36), 0x333333)
      .setInteractive({ useHandCursor: true });
    const closeLabel = gameText(this.scene, GAME_WIDTH / 2, this.scene.scale.height - ux(48), 'Close', {
      fontSize: fontSize(13),
      color: '#ffffff',
    }).setOrigin(0.5);
    closeBtn.on('pointerup', () => this.toggleGuide(false));
    this.guideRoot.add([closeBtn, closeLabel]);
  }

  private toggleGuide(force?: boolean): void {
    this.guideVisible = force ?? !this.guideVisible;
    this.guideRoot.setVisible(this.guideVisible);
  }

  containsPointer(x: number, y: number): boolean {
    if (this.guideVisible) {
      return true;
    }
    const bounds = this.root.getBounds();
    return bounds.contains(x, y);
  }

  getHudObjects(): Phaser.GameObjects.GameObject[] {
    const list: Phaser.GameObjects.GameObject[] = [];
    this.root.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.GameObject) {
        list.push(child);
      }
    });
    this.guideRoot.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.GameObject) {
        list.push(child);
      }
    });
    return list;
  }

  isGodModeEnabled(): boolean {
    return this.godMode;
  }

  destroy(): void {
    this.root.destroy(true);
    this.guideRoot.destroy(true);
  }
}
