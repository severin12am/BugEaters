import Phaser from 'phaser';
import { GAME_WIDTH, ux } from '../utils/constants';
import { getContentTopY, getMenuBottomY } from '../utils/layout';
import { unlockGameAudio } from '../utils/audioAssets';
import { addMonoScreenBackground } from '../ui/grainBackground';
import {
  bindButtonClick,
  contentWidth,
  createMonoButton,
  createMonoDivider,
  createMonoPanel,
  createMonoText,
  createStatusPill,
  createWeekStrip,
} from '../ui/UiChrome';
import { getWeekContext, grantsEntryLabel } from '../tournament/weekClock';
import {
  fetchWeekState,
  resetDevSandboxWeek,
  weekContextFromState,
} from '../tournament/tournamentApi';
import { getChainService } from '../tournament/chain/MockChainService';
import {
  clearDevSessionConfirmation,
  isDevSessionUiEnabled,
} from '../tournament/devSession';
import { REGISTRY_KEYS } from './BootScene';

/**
 * Tournament week hub — primary navigation surface.
 * Routes to Monday registration or pass-day lobby based on live week context.
 */
export class WeekHubScene extends Phaser.Scene {
  private connecting = false;
  private resetting = false;
  private hubWeek: ReturnType<typeof getWeekContext> | null = null;
  private hubState: Awaited<ReturnType<typeof fetchWeekState>> | null = null;

  constructor() {
    super({ key: 'WeekHubScene' });
  }

  init(data?: {
    week?: ReturnType<typeof getWeekContext>;
    state?: Awaited<ReturnType<typeof fetchWeekState>> | null;
  }): void {
    if (data?.week) {
      this.hubWeek = data.week;
      this.hubState = data.state ?? null;
    } else {
      this.hubWeek = null;
      this.hubState = null;
    }
  }

  create(): void {
    unlockGameAudio(this);

    if (this.hubWeek) {
      this.renderHub(this.hubWeek, this.hubState);
      return;
    }

    addMonoScreenBackground(this);
    const cx = GAME_WIDTH / 2;
    createMonoText(this, cx, getContentTopY(this, 36), 'BUG EATERS', 'display').setOrigin(0.5);
    createMonoText(this, cx, getContentTopY(this, 72), 'Loading week…', 'caption').setOrigin(0.5);
    void this.loadHub();
  }

  private async loadHub(): Promise<void> {
    const state = await fetchWeekState();
    if (!this.scene.isActive()) {
      return;
    }

    this.registry.set(REGISTRY_KEYS.walletLinked, state?.walletLinked ?? false);
    this.registry.set(REGISTRY_KEYS.isChampion, state?.isChampion ?? false);

    const week = weekContextFromState(state);
    this.scene.restart({ week, state });
  }

  private renderHub(
    week: ReturnType<typeof getWeekContext>,
    state: Awaited<ReturnType<typeof fetchWeekState>> | null,
  ): void {
    this.children.removeAll(true);
    addMonoScreenBackground(this);

    const cx = GAME_WIDTH / 2;
    const pad = ux(20);
    const panelW = contentWidth(20);

    createMonoText(this, cx, getContentTopY(this, 36), 'BUG EATERS', 'display').setOrigin(0.5);

    const guideBtn = createMonoButton(
      this,
      pad + panelW - ux(24),
      getContentTopY(this, 36),
      'Guide',
      'ghost',
      ux(72),
      ux(36),
    );
    bindButtonClick(guideBtn, () => this.scene.start('EncyclopediaScene'));

    const weekCaption =
      state?.sandboxIndex != null
        ? `SANDBOX WEEK ${state.sandboxIndex} · ${week.weekdayLabel}`
        : `WEEK ${week.weekId}`;
    createMonoText(this, cx, getContentTopY(this, 72), weekCaption, 'caption').setOrigin(0.5);

    createWeekStrip(this, cx, getContentTopY(this, 118), week.weekdayKey);

    const statusY = getContentTopY(this, 168);
    createMonoPanel(this, pad, statusY, {
      width: panelW,
      height: ux(120),
      raised: true,
    });
    createMonoText(this, pad + ux(16), statusY + ux(28), week.statusHeadline, 'title');
    createMonoText(this, pad + ux(16), statusY + ux(58), week.statusDetail, 'body').setWordWrapWidth(
      panelW - ux(32),
    );

    if (week.championBillboardActive) {
      createStatusPill(this, pad + panelW - ux(16), statusY + ux(22), 'Champion live', true, 'right');
    }

    const passY = statusY + ux(140);
    createMonoText(this, pad, passY, 'Your passes', 'label');
    this.renderPassRow(pad, passY + ux(22), week.passes.length, week);

    const walletY = passY + ux(72);
    createMonoDivider(this, pad, walletY, panelW);
    createMonoText(this, pad, walletY + ux(18), 'Wallet', 'label');
    this.renderWalletRow(pad, walletY + ux(40), week);

    const ctaY = getMenuBottomY(this, isDevSessionUiEnabled() ? 188 : 148);
    const primary = createMonoButton(this, cx, ctaY, week.primaryCta, 'primary', panelW);
    bindButtonClick(primary, () => void this.onPrimaryCta(week, state));

    if (state?.isChampion) {
      const champBtn = createMonoButton(
        this,
        cx,
        getMenuBottomY(this, isDevSessionUiEnabled() ? 148 : 108),
        'Champion dashboard',
        'secondary',
        panelW,
      );
      bindButtonClick(champBtn, () => this.scene.start('ChampionDashboardScene'));
    }

    if (isDevSessionUiEnabled()) {
      const changeY = getMenuBottomY(this, 108);
      const changeBtn = createMonoButton(this, cx, changeY, 'Change week / day', 'secondary', panelW);
      bindButtonClick(changeBtn, () => {
        clearDevSessionConfirmation();
        this.scene.start('DevSessionScene');
      });

      if (state?.sandboxIndex != null) {
        const resetBtn = createMonoButton(
          this,
          cx,
          getMenuBottomY(this, 68),
          'Reset my progress (this week)',
          'ghost',
          panelW,
        );
        bindButtonClick(resetBtn, () => void this.onResetSandbox());
      }
    }

    const hintY = getMenuBottomY(this, isDevSessionUiEnabled() ? 32 : 72);
    createMonoText(this, cx, hintY, 'Swipe lanes · Tap sides · Swipe up to jump', 'caption').setOrigin(
      0.5,
    );
  }

  private async onResetSandbox(): Promise<void> {
    if (this.resetting) {
      return;
    }
    this.resetting = true;
    try {
      await resetDevSandboxWeek();
      this.scene.restart();
    } catch (err) {
      console.warn('[hub] reset sandbox failed', err);
      this.resetting = false;
    }
  }

  private renderPassRow(
    x: number,
    y: number,
    passCount: number,
    week: ReturnType<typeof getWeekContext>,
  ): void {
    if (passCount === 0) {
      createMonoText(this, x, y + ux(14), 'No passes yet — win races to advance.', 'caption');
      return;
    }

    week.passes.forEach((pass, i) => {
      const chipX = x + i * ux(148);
      const chip = createMonoPanel(this, chipX, y, { width: ux(136), height: ux(44), border: true });
      createMonoText(this, chipX + ux(10), y + ux(14), grantsEntryLabel(pass.grantsEntry), 'mono');
      createMonoText(this, chipX + ux(10), y + ux(30), `Won ${grantsEntryLabel(pass.wonOn)}`, 'caption');
      chip.setAlpha(0.95);
    });
  }

  private renderWalletRow(x: number, y: number, week: ReturnType<typeof getWeekContext>): void {
    if (week.walletLinked && week.walletAddress) {
      const display =
        week.walletAddress.length > 12
          ? `${week.walletAddress.slice(0, 4)}…${week.walletAddress.slice(-4)}`
          : week.walletAddress;
      createMonoText(this, x, y, display, 'mono');
      createStatusPill(this, x + ux(200), y, 'Linked', true);
      return;
    }

    createMonoText(
      this,
      x,
      y,
      week.requiresWallet ? 'Required from Tuesday onward' : 'Optional on Monday',
      'caption',
    );

    const connect = createMonoButton(this, x + ux(248), y, 'Connect', 'secondary', ux(120), ux(40));
    bindButtonClick(connect, () => void this.connectWallet());
  }

  private async connectWallet(): Promise<void> {
    if (this.connecting) {
      return;
    }
    this.connecting = true;

    const cx = GAME_WIDTH / 2;
    const overlay = this.add.container(0, 0).setDepth(200);
    const dim = this.add.rectangle(cx, this.scale.height / 2, GAME_WIDTH, this.scale.height, 0x000000, 0.75);
    const panel = createMonoPanel(this, cx - contentWidth(24) / 2, this.scale.height / 2 - ux(80), {
      width: contentWidth(24),
      height: ux(120),
      raised: true,
    });
    const msg = createMonoText(
      this,
      cx,
      this.scale.height / 2 - ux(20),
      'Connecting to wallet…\nConfirm in your wallet app',
      'body',
    )
      .setOrigin(0.5)
      .setAlign('center');

    overlay.add([dim, panel, msg]);

    try {
      const chain = getChainService();
      await chain.connectWallet();
      this.registry.set(REGISTRY_KEYS.walletLinked, true);
      overlay.destroy();
      this.connecting = false;
      this.scene.restart();
    } catch (err) {
      overlay.destroy();
      this.connecting = false;
      console.warn('[hub] wallet connect failed', err);
    }
  }

  private onPrimaryCta(
    week: ReturnType<typeof getWeekContext>,
    state: Awaited<ReturnType<typeof fetchWeekState>> | null,
  ): void {
    if (week.isMondayWeb2) {
      this.registry.set(REGISTRY_KEYS.passBurnConfirmed, false);
      if (state?.registration?.raced_at) {
        this.registry.set(REGISTRY_KEYS.blockedReason, 'already_raced');
        this.scene.start('BlockedStateScene');
        return;
      }
      if (state?.registration?.slot_id) {
        this.scene.start('MondayWaitScene');
        return;
      }
      this.scene.start('MenuScene');
      return;
    }

    if (week.isSundayFinale) {
      const hasSundayPass = week.passes.some((p) => p.grantsEntry === 'sunday');
      if (!hasSundayPass) {
        this.registry.set(REGISTRY_KEYS.blockedReason, 'no_sunday_pass');
        this.scene.start('BlockedStateScene');
        return;
      }
      this.registry.set(REGISTRY_KEYS.passBurnConfirmed, false);
      this.scene.start('SundayFinaleScene');
      return;
    }

    if (week.requiresWallet && !week.walletLinked) {
      this.registry.set(REGISTRY_KEYS.blockedReason, 'no-wallet');
      this.scene.start('BlockedStateScene');
      return;
    }

    const todayPass = week.passes.find((p) => p.grantsEntry === week.weekday);
    if (week.requiresPass && !todayPass) {
      this.registry.set(REGISTRY_KEYS.blockedReason, 'no-pass');
      this.scene.start('BlockedStateScene');
      return;
    }

    if (todayPass) {
      this.registry.set(REGISTRY_KEYS.activePassId, todayPass.id);
    }

    this.registry.set(REGISTRY_KEYS.passBurnConfirmed, false);
    this.scene.start('ReadyPanelScene');
  }
}
