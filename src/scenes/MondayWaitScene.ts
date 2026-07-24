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
  createWeekStrip,
} from '../ui/UiChrome';
import { fetchWeekState, weekContextFromState } from '../tournament/tournamentApi';
import {
  formatCountdown,
  getSlotPhase,
  getSlotWindow,
  type SlotPhase,
} from '../tournament/mondaySchedule';
import { isDevSessionUiEnabled, isSandboxWeekId } from '../tournament/devSession';
import { REGISTRY_KEYS } from './BootScene';

/**
 * After Monday registration — wait for slot time, then enter lobby.
 */
export class MondayWaitScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private detailText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private joinBtn: ReturnType<typeof createMonoButton> | null = null;
  private pollTimer: Phaser.Time.TimerEvent | null = null;
  private slotId = '';
  private weekId = '';
  private phase: SlotPhase = 'before';

  constructor() {
    super({ key: 'MondayWaitScene' });
  }

  create(): void {
    void this.initWait();
  }

  private async initWait(): Promise<void> {
    const state = await fetchWeekState();
    const week = weekContextFromState(state);

    if (!this.scene.isActive()) {
      return;
    }

    if (!week.isMondayWeb2 || !state?.registration?.slot_id) {
      this.scene.start('WeekHubScene');
      return;
    }

    if (state.registration.raced_at) {
      this.registry.set(REGISTRY_KEYS.blockedReason, 'already_raced');
      this.scene.start('BlockedStateScene');
      return;
    }

    this.slotId = state.registration.slot_id;
    this.weekId = state.weekId;
    this.renderWait();
  }

  private renderWait(): void {
    addMonoScreenBackground(this);

    const cx = GAME_WIDTH / 2;
    const pad = ux(20);
    const panelW = contentWidth(20);
    const window = getSlotWindow(this.weekId, this.slotId);

    createMonoText(this, cx, getContentTopY(this, 36), 'REGISTERED', 'label').setOrigin(0.5);
    createWeekStrip(this, cx, getContentTopY(this, 78), 'mon');

    const panelY = getContentTopY(this, 130);
    createMonoPanel(this, pad, panelY, { width: panelW, height: ux(160), raised: true });

    createMonoText(this, pad + ux(16), panelY + ux(24), window?.label ?? 'Your slot', 'title');
    this.statusText = createMonoText(this, pad + ux(16), panelY + ux(58), '', 'body');
    this.detailText = createMonoText(this, pad + ux(16), panelY + ux(88), '', 'caption').setWordWrapWidth(
      panelW - ux(32),
    );
    this.phaseText = createMonoText(this, cx, panelY + ux(130), '', 'mono').setOrigin(0.5);

    this.joinBtn = createMonoButton(this, cx, getMenuBottomY(this, 148), 'Enter lobby', 'primary', panelW);
    bindButtonClick(this.joinBtn, () => {
      // Sandbox / dev session: always allow. Real weeks: only while slot is open.
      const canEnter =
        this.phase === 'open' || isSandboxWeekId(this.weekId) || isDevSessionUiEnabled();
      if (!canEnter) {
        this.detailText.setText(
          this.phase === 'before'
            ? 'Lobby still closed — wait for the countdown, then tap again.'
            : 'This slot is closed. Pick a sandbox week in Change day/week.',
        );
        return;
      }
      this.registry.set(REGISTRY_KEYS.passBurnConfirmed, true);
      this.registry.set(REGISTRY_KEYS.selectedCharacter, null);
      this.scene.start('LobbyScene');
    });

    const backBtn = createMonoButton(this, cx, getMenuBottomY(this, 72), 'Back to hub', 'ghost', panelW);
    bindButtonClick(backBtn, () => this.scene.start('WeekHubScene'));

    this.refreshStatus();
    this.pollTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.refreshStatus(),
    });
  }

  private refreshStatus(): void {
    // Sandbox playtest weeks: server keeps the window open; skip wall-clock wait.
    if (isSandboxWeekId(this.weekId)) {
      this.phase = 'open';
      this.statusText.setText('Race window open (playtest)');
      this.detailText.setText('Sandbox week — slot time is forced open. Enter lobby when ready.');
      this.phaseText.setText('Tap Enter lobby');
      this.joinBtn?.container.setAlpha(1);
      return;
    }

    const window = getSlotWindow(this.weekId, this.slotId);
    if (!window) {
      this.statusText.setText('Unknown slot');
      return;
    }

    const now = Date.now();
    this.phase = getSlotPhase(now, window);

    if (this.phase === 'before') {
      this.statusText.setText(`Opens in ${formatCountdown(window.opensAtMs - now)}`);
      if (isDevSessionUiEnabled()) {
        this.detailText.setText('Dev: Enter lobby is unlocked for playtesting.');
        this.phaseText.setText('Tap Enter lobby');
        this.joinBtn?.container.setAlpha(1);
      } else {
        this.detailText.setText('Stay here — tap Enter lobby when the window opens.');
        this.phaseText.setText('Waiting for slot');
        this.joinBtn?.container.setAlpha(0.4);
      }
    } else if (this.phase === 'open') {
      this.statusText.setText('Race window open');
      this.detailText.setText(
        `Join within ${formatCountdown(window.closesAtMs - now)}. Everyone in this slot races together.`,
      );
      this.phaseText.setText('Tap Enter lobby');
      this.joinBtn?.container.setAlpha(1);
    } else {
      this.statusText.setText('Slot closed');
      this.detailText.setText('This time slot has ended. Come back next Monday.');
      this.phaseText.setText('Closed');
      this.joinBtn?.container.setAlpha(0.4);
    }
  }

  shutdown(): void {
    this.pollTimer?.destroy();
    this.pollTimer = null;
  }
}
