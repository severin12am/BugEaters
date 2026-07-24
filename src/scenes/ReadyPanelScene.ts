import Phaser from 'phaser';
import { GAME_WIDTH, ux } from '../utils/constants';
import { getMenuBottomY, getContentTopY } from '../utils/layout';
import { addMonoScreenBackground } from '../ui/grainBackground';
import {
  bindButtonClick,
  contentWidth,
  createMonoButton,
  createMonoPanel,
  createMonoText,
  createStatusPill,
  createWeekStrip,
} from '../ui/UiChrome';
import { fetchWeekState, tapReady, weekContextFromState } from '../tournament/tournamentApi';
import { REGISTRY_KEYS } from './BootScene';

/**
 * Tue–Sun: player has pass, waits in queue for race to form.
 */
export class ReadyPanelScene extends Phaser.Scene {
  private readyCount = 0;
  private pollTimer: Phaser.Time.TimerEvent | null = null;
  private readyLabel!: Phaser.GameObjects.Text;
  private week = weekContextFromState(null);

  constructor() {
    super({ key: 'ReadyPanelScene' });
  }

  create(): void {
    void this.initPanel();
  }

  private async initPanel(): Promise<void> {
    const state = await fetchWeekState();
    this.week = weekContextFromState(state);

    if (!this.scene.isActive()) {
      return;
    }

    if (this.week.isMondayWeb2) {
      this.scene.start('MenuScene');
      return;
    }

    addMonoScreenBackground(this);
    const cx = GAME_WIDTH / 2;
    const pad = ux(20);
    const panelW = contentWidth(20);

    createMonoText(this, cx, getContentTopY(this, 36), 'RACE QUEUE', 'label').setOrigin(0.5);
    createWeekStrip(this, cx, getContentTopY(this, 78), this.week.weekdayKey);

    const queueY = getContentTopY(this, 140);
    createMonoPanel(this, pad, queueY, { width: panelW, height: ux(140), raised: true });
    createMonoText(this, pad + ux(16), queueY + ux(28), 'Waiting for players…', 'title');
    this.readyLabel = createMonoText(
      this,
      pad + ux(16),
      queueY + ux(60),
      `Players ready: ${state?.readyCount ?? 0}`,
      'caption',
    );
    createMonoText(this, pad + ux(16), queueY + ux(80), 'Your pass will burn in the lobby.', 'body');

    createStatusPill(this, cx, queueY + ux(110), 'Queue open', true);

    const readyBtn = createMonoButton(
      this,
      cx,
      getMenuBottomY(this, 148),
      'I\'m ready',
      'primary',
      panelW,
    );
    bindButtonClick(readyBtn, () => void this.onReady());

    const lobbyBtn = createMonoButton(this, cx, getMenuBottomY(this, 108), 'Enter lobby', 'secondary', panelW);
    bindButtonClick(lobbyBtn, () => {
      this.registry.set(REGISTRY_KEYS.passBurnConfirmed, false);
      this.scene.start('LobbyScene');
    });

    const backBtn = createMonoButton(this, cx, getMenuBottomY(this, 72), 'Back to hub', 'ghost', panelW);
    bindButtonClick(backBtn, () => this.scene.start('WeekHubScene'));

    this.pollTimer = this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => void this.refreshCount(),
    });
  }

  private async refreshCount(): Promise<void> {
    const state = await fetchWeekState();
    if (!this.scene.isActive() || !state) {
      return;
    }
    this.readyCount = state.readyCount;
    this.readyLabel.setText(`Players ready: ${this.readyCount}`);
  }

  private async onReady(): Promise<void> {
    try {
      const result = await tapReady();
      this.readyCount = result.readyCount;
      this.readyLabel.setText(`Players ready: ${this.readyCount}`);
      this.registry.set(REGISTRY_KEYS.activePassId, result.passId);
      createStatusPill(this, GAME_WIDTH / 2, getContentTopY(this, 300), 'You are ready', true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ready failed';
      if (message === 'no-wallet') {
        this.registry.set(REGISTRY_KEYS.blockedReason, 'no-wallet');
        this.scene.start('BlockedStateScene');
        return;
      }
      if (message === 'no-pass') {
        this.registry.set(REGISTRY_KEYS.blockedReason, 'no-pass');
        this.scene.start('BlockedStateScene');
        return;
      }
      console.warn('[ready] tap_ready failed', err);
    }
  }

  shutdown(): void {
    this.pollTimer?.destroy();
    this.pollTimer = null;
  }
}
