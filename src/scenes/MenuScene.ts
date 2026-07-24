import Phaser from 'phaser';
import { GAME_WIDTH, ux } from '../utils/constants';
import { getContentTopY, getMenuBottomY } from '../utils/layout';
import { unlockGameAudio } from '../utils/audioAssets';
import { addMonoScreenBackground } from '../ui/grainBackground';
import {
  bindButtonClick,
  contentWidth,
  createMonoButton,
  createMonoPanel,
  createMonoText,
} from '../ui/UiChrome';
import { MONO, MONO_CSS } from '../ui/theme';
import { TOURNAMENT_CONFIG } from '../tournament/tournamentConfig';
import type { MondayTimeSlot } from '../tournament/types';
import { fetchWeekState, registerMondaySlot, weekContextFromState } from '../tournament/tournamentApi';
import { REGISTRY_KEYS } from './BootScene';

/**
 * Monday registration — pick a UTC time slot only. Role is assigned randomly in the lobby.
 */
export class MenuScene extends Phaser.Scene {
  private selectedSlotId: string = TOURNAMENT_CONFIG.mondayTimeSlots[0].id;
  private slotBackgrounds: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private slotLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private registering = false;
  private errorText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    unlockGameAudio(this);
    void this.initMenu();
  }

  private async initMenu(): Promise<void> {
    const state = await fetchWeekState();
    const week = weekContextFromState(state);

    if (!this.scene.isActive()) {
      return;
    }

    if (!week.isMondayWeb2) {
      this.scene.start('WeekHubScene');
      return;
    }

    if (state?.registration?.raced_at) {
      this.registry.set(REGISTRY_KEYS.blockedReason, 'already_raced');
      this.scene.start('BlockedStateScene');
      return;
    }

    if (state?.registration?.slot_id) {
      this.scene.start('MondayWaitScene');
      return;
    }

    this.renderMenu();
  }

  private renderMenu(): void {
    addMonoScreenBackground(this);

    const cx = GAME_WIDTH / 2;
    const pad = ux(20);
    const panelW = contentWidth(20);

    const back = createMonoButton(this, pad + ux(4), getContentTopY(this, 36), '←', 'ghost', ux(48), ux(40));
    bindButtonClick(back, () => this.scene.start('WeekHubScene'));

    createMonoText(this, cx, getContentTopY(this, 36), 'MONDAY', 'label').setOrigin(0.5);
    createMonoText(this, cx, getContentTopY(this, 72), 'Pick a race time', 'title').setOrigin(0.5);

    const infoY = getContentTopY(this, 108);
    createMonoPanel(this, pad, infoY, { width: panelW, height: ux(72), raised: true });
    createMonoText(this, pad + ux(16), infoY + ux(20), 'Your runner is assigned randomly', 'body');
    createMonoText(this, pad + ux(16), infoY + ux(44), 'One race per Monday · no wallet needed', 'caption');

    const slotLabelY = getContentTopY(this, 200);
    createMonoText(this, pad, slotLabelY, 'Time slot (UTC)', 'label');
    this.renderTimeSlots(pad, slotLabelY + ux(28));

    const registerY = getMenuBottomY(this, 108);
    const register = createMonoButton(this, cx, registerY, 'Register', 'primary', panelW);
    bindButtonClick(register, () => void this.onRegister());

    createMonoText(this, cx, getMenuBottomY(this, 52), 'We notify you when your slot opens', 'caption').setOrigin(
      0.5,
    );

    this.errorText = createMonoText(this, cx, getMenuBottomY(this, 24), '', 'caption')
      .setOrigin(0.5)
      .setColor('#ff6666')
      .setWordWrapWidth(panelW - ux(24))
      .setAlign('center');
  }

  private async onRegister(): Promise<void> {
    if (this.registering) {
      return;
    }
    this.registering = true;

    try {
      await registerMondaySlot(this.selectedSlotId);
      this.registry.set(REGISTRY_KEYS.tournamentTimeSlot, this.selectedSlotId);
      this.scene.start('MondayWaitScene');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'register failed';
      if (message === 'already_raced') {
        this.registry.set(REGISTRY_KEYS.blockedReason, 'already_raced');
        this.scene.start('BlockedStateScene');
      } else if (message === 'not_authenticated') {
        this.showRegisterError('Login failed. Check TELEGRAM_BOT_TOKEN in Supabase secrets.');
      } else {
        console.warn('[menu] register failed', err);
        this.showRegisterError(message);
      }
    } finally {
      this.registering = false;
    }
  }

  private showRegisterError(message: string): void {
    this.errorText?.setText(message);
  }

  private renderTimeSlots(x: number, y: number): void {
    const slots = TOURNAMENT_CONFIG.mondayTimeSlots as readonly MondayTimeSlot[];
    const gap = ux(10);
    const chipW = ux(168);
    const chipH = ux(44);
    let col = 0;
    let row = 0;

    slots.forEach((slot) => {
      const chipX = x + col * (chipW + gap);
      const chipY = y + row * (chipH + gap);

      const bg = this.add
        .rectangle(chipX + chipW / 2, chipY + chipH / 2, chipW, chipH, MONO.surface)
        .setStrokeStyle(ux(1), MONO.border, 0.8)
        .setInteractive({ useHandCursor: true });

      const label = createMonoText(this, chipX + ux(12), chipY + chipH / 2, slot.label.replace(' UTC', ''), 'mono').setOrigin(
        0,
        0.5,
      );

      this.slotBackgrounds.set(slot.id, bg);
      this.slotLabels.set(slot.id, label);
      bg.on('pointerdown', () => {
        this.selectedSlotId = slot.id;
        this.updateSlotHighlight();
      });

      col += 1;
      if (col >= 2) {
        col = 0;
        row += 1;
      }
    });

    this.updateSlotHighlight();
  }

  private updateSlotHighlight(): void {
    this.slotBackgrounds.forEach((bg, id) => {
      const active = id === this.selectedSlotId;
      bg.setFillStyle(active ? MONO.white : MONO.surface);
      bg.setStrokeStyle(ux(1), active ? MONO.borderStrong : MONO.border, active ? 1 : 0.8);
      this.slotLabels.get(id)?.setColor(active ? MONO_CSS.ink : MONO_CSS.text);
    });
  }
}
