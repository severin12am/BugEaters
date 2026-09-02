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
  createMonoDivider,
  createStatusPill,
} from '../ui/UiChrome';
import { openExternalLink, promptText } from '../ui/domPrompt';
import { fetchWeekState, transferBillboardRights, updateBillboardCreative } from '../tournament/tournamentApi';
import { shortAddress, tonviewerUrl } from '../ton/env';

type WeekState = NonNullable<Awaited<ReturnType<typeof fetchWeekState>>>;

/**
 * Champion dashboard: champion NFT, billboard creative, rights transfer.
 * All inputs are in-app (Telegram's WebView blocks window.prompt).
 */
export class ChampionDashboardScene extends Phaser.Scene {
  private notice: Phaser.GameObjects.Text | null = null;
  private busy = false;

  constructor() {
    super({ key: 'ChampionDashboardScene' });
  }

  create(): void {
    void this.initDashboard();
  }

  private async initDashboard(): Promise<void> {
    const state = await fetchWeekState();

    if (!this.scene.isActive()) {
      return;
    }

    if (!state?.isChampion) {
      this.scene.start('WeekHubScene');
      return;
    }

    this.render(state);
  }

  private render(state: WeekState): void {
    this.children.removeAll(true);
    addMonoScreenBackground(this);
    const cx = GAME_WIDTH / 2;
    const pad = ux(20);
    const panelW = contentWidth(20);

    createMonoText(this, cx, getContentTopY(this, 36), 'CHAMPION', 'label').setOrigin(0.5);
    createMonoText(this, cx, getContentTopY(this, 68), `Week ${state.weekId}`, 'caption').setOrigin(0.5);

    // ---- Champion token ----
    const nftY = getContentTopY(this, 96);
    createMonoPanel(this, pad, nftY, { width: panelW, height: ux(84), raised: true });
    createMonoText(this, pad + ux(16), nftY + ux(24), 'Champion NFT', 'title');
    const nftLine = this.championNftCopy(state);
    createMonoText(this, pad + ux(16), nftY + ux(52), nftLine, 'caption').setWordWrapWidth(panelW - ux(140));
    if (state.championNftAddress && state.championMintStatus === 'minted') {
      const address = state.championNftAddress;
      const view = createMonoButton(this, pad + panelW - ux(60), nftY + ux(42), 'View', 'secondary', ux(88), ux(36));
      bindButtonClick(view, () => openExternalLink(tonviewerUrl(address)));
    } else {
      createStatusPill(this, pad + panelW - ux(16), nftY + ux(24), this.mintPillLabel(state), false, 'right');
    }

    // ---- Billboard creative ----
    const billboardY = nftY + ux(100);
    createMonoPanel(this, pad, billboardY, { width: panelW, height: ux(150), raised: true });
    createMonoText(this, pad + ux(16), billboardY + ux(24), 'Monday billboards', 'title');
    createMonoText(
      this,
      pad + ux(16),
      billboardY + ux(52),
      state.billboardCreativeUrl
        ? `Creative: ${truncate(state.billboardCreativeUrl, 40)}`
        : 'No creative yet — add an image URL for your shoulder ad.',
      'caption',
    ).setWordWrapWidth(panelW - ux(32));
    createMonoText(
      this,
      pad + ux(16),
      billboardY + ux(74),
      'Shown to every Monday racer on the road shoulders after moderation.',
      'caption',
    ).setWordWrapWidth(panelW - ux(32));

    const uploadBtn = createMonoButton(
      this,
      cx,
      billboardY + ux(118),
      state.billboardCreativeUrl ? 'Change creative URL' : 'Add creative URL',
      'secondary',
      ux(260),
      ux(40),
    );
    bindButtonClick(uploadBtn, () => void this.editCreative(state));

    // ---- Rights ----
    const rightsY = billboardY + ux(170);
    createMonoDivider(this, pad, rightsY, panelW);
    createMonoText(this, pad, rightsY + ux(20), 'Billboard rights', 'label');
    createMonoPanel(this, pad, rightsY + ux(40), { width: panelW, height: ux(96), raised: false });
    createMonoText(
      this,
      pad + ux(16),
      rightsY + ux(62),
      state.billboardTransferredTo
        ? `Transferred to ${state.billboardTransferredTo.slice(0, 8)}… — they can set the creative.`
        : 'Sell the slot: transfer the rights to a sponsor’s account. Applies next Monday.',
      'caption',
    ).setWordWrapWidth(panelW - ux(32));

    const transferBtn = createMonoButton(
      this,
      cx,
      rightsY + ux(112),
      state.billboardTransferredTo ? 'Transfer again' : 'Transfer rights',
      'secondary',
      ux(260),
      ux(40),
    );
    bindButtonClick(transferBtn, () => void this.transferRights(state));

    this.notice = createMonoText(this, cx, getMenuBottomY(this, 112), '', 'caption')
      .setOrigin(0.5)
      .setAlign('center')
      .setWordWrapWidth(panelW);

    const backBtn = createMonoButton(this, cx, getMenuBottomY(this, 72), 'Back to hub', 'ghost', panelW);
    bindButtonClick(backBtn, () => this.scene.start('WeekHubScene'));
  }

  private championNftCopy(state: WeekState): string {
    switch (state.championMintStatus) {
      case 'minted':
        return `Minted to your wallet · ${shortAddress(state.championNftAddress)}`;
      case 'minting':
        return 'Minting on TON — usually under a minute.';
      case 'failed':
        return 'Mint hit a snag; the server retries automatically.';
      default:
        return state.walletLinked
          ? 'Queued — the champion token mints to your linked wallet.'
          : 'Link a TON wallet on the hub to receive your champion token.';
    }
  }

  private mintPillLabel(state: WeekState): string {
    if (!state.walletLinked) {
      return 'Wallet needed';
    }
    return state.championMintStatus === 'minting' ? 'Minting' : 'Queued';
  }

  private async editCreative(state: WeekState): Promise<void> {
    if (this.busy) {
      return;
    }
    const url = await promptText({
      title: 'Billboard creative',
      hint: 'Public HTTPS image URL (PNG/JPG). It appears on the road shoulders during Monday races once approved.',
      placeholder: 'https://…/billboard.png',
      initialValue: state.billboardCreativeUrl ?? '',
      validate: (value) => (/^https:\/\/\S+$/iu.test(value) ? null : 'Enter a full https:// URL'),
    });
    if (!url) {
      return;
    }
    this.busy = true;
    try {
      await updateBillboardCreative(url);
      this.notice?.setText('Creative saved — pending moderation.');
      const fresh = await fetchWeekState();
      if (fresh && this.scene.isActive()) {
        this.render(fresh);
        this.notice?.setText('Creative saved — pending moderation.');
      }
    } catch (err) {
      this.notice?.setText(`Save failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      this.busy = false;
    }
  }

  private async transferRights(state: WeekState): Promise<void> {
    if (this.busy) {
      return;
    }
    const toUser = await promptText({
      title: 'Transfer billboard rights',
      hint: 'Paste the sponsor’s BugEaters account id (UUID shown on their hub). Rights move immediately; the creative stays editable by them.',
      placeholder: '00000000-0000-0000-0000-000000000000',
      initialValue: state.billboardTransferredTo ?? '',
      confirmLabel: 'Transfer',
      validate: (value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value) ? null : 'That is not an account id',
    });
    if (!toUser) {
      return;
    }
    this.busy = true;
    try {
      await transferBillboardRights(toUser);
      const fresh = await fetchWeekState();
      if (fresh && this.scene.isActive()) {
        this.render(fresh);
        this.notice?.setText('Rights transferred.');
      }
    } catch (err) {
      this.notice?.setText(`Transfer failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      this.busy = false;
    }
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
