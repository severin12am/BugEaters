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
} from '../ui/UiChrome';
import { fetchWeekState, weekContextFromState } from '../tournament/tournamentApi';
import { getChainService } from '../tournament/chain/MockChainService';
import { REGISTRY_KEYS } from './BootScene';

type BlockReason =
  | 'no-pass'
  | 'no-wallet'
  | 'wrong-day'
  | 'forfeit'
  | 'not_registered'
  | 'saturday_full'
  | 'no_sunday_pass'
  | 'not_ready'
  | 'already_raced'
  | 'slot_not_open'
  | 'slot_closed';

/**
 * Blocked state screen — explains why player can't race.
 */
export class BlockedStateScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BlockedStateScene' });
  }

  create(): void {
    const reason = (this.registry.get(REGISTRY_KEYS.blockedReason) as BlockReason) ?? 'no-pass';

    void this.render(reason);
  }

  private async render(reason: BlockReason): Promise<void> {
    const state = await fetchWeekState();
    const week = weekContextFromState(state);

    if (!this.scene.isActive()) {
      return;
    }

    addMonoScreenBackground(this);
    const cx = GAME_WIDTH / 2;
    const pad = ux(20);
    const panelW = contentWidth(20);

    createMonoText(this, cx, getContentTopY(this, 40), 'CAN\'T RACE', 'label').setOrigin(0.5);

    const blockedY = getContentTopY(this, 120);
    createMonoPanel(this, pad, blockedY, { width: panelW, height: ux(180), raised: true });

    let title = '';
    let detail = '';
    let cta = 'Back to hub';

    switch (reason) {
      case 'no-pass':
        title = 'No pass for today';
        detail =
          'You need a pass to race. Win on Saturday to earn a Sunday pass, or register for Monday.';
        break;
      case 'no-wallet':
        title = 'Wallet required';
        detail = `Link a TON wallet before ${week.weekdayLabel} to access this race.`;
        cta = 'Link wallet';
        break;
      case 'forfeit':
        title = 'Forfeit';
        detail = 'You forfeited your pass. Next week, link your wallet after Monday win to secure Tuesday entry.';
        break;
      case 'wrong-day':
        title = `Not ${week.weekdayLabel} yet`;
        detail = 'This pass grants entry on a different day. Check back then.';
        break;
      case 'not_registered':
        title = 'Not registered';
        detail = 'Register for a Monday time slot before joining the race lobby.';
        cta = 'Register';
        break;
      case 'saturday_full':
        title = 'Saturday full';
        detail = 'All 6 global Saturday rooms are running. Try again next week.';
        break;
      case 'no_sunday_pass':
        title = 'No Sunday pass';
        detail = 'Only Saturday room winners hold a Sunday pass for the global finale.';
        break;
      case 'not_ready':
        title = 'Not ready';
        detail = 'Tap "I\'m ready" in the race queue before entering the lobby.';
        cta = 'Go to queue';
        break;
      case 'already_raced':
        title = 'Already raced';
        detail = 'You get one Monday race per week. Come back next Monday.';
        break;
      case 'slot_not_open':
        title = 'Too early';
        detail = 'Your slot has not opened yet. Wait on the registration screen until race time.';
        cta = 'My registration';
        break;
      case 'slot_closed':
        title = 'Slot closed';
        detail = 'The join window for your time slot has ended.';
        break;
    }

    createMonoText(this, pad + ux(16), blockedY + ux(32), title, 'title');
    createMonoText(this, pad + ux(16), blockedY + ux(72), detail, 'body')
      .setWordWrapWidth(panelW - ux(32));

    const ctaY = getMenuBottomY(this, 108);
    const button = createMonoButton(this, cx, ctaY, cta, 'primary', panelW);
    bindButtonClick(button, () => void this.onCta(reason));
  }

  private async onCta(reason: BlockReason): Promise<void> {
    if (reason === 'no-wallet') {
      try {
        await getChainService().connectWallet();
        this.registry.set(REGISTRY_KEYS.walletLinked, true);
        this.scene.start('WeekHubScene');
      } catch (err) {
        console.warn('[blocked] wallet connect failed', err);
      }
      return;
    }
    if (reason === 'not_ready') {
      this.scene.start('ReadyPanelScene');
      return;
    }
    if (reason === 'not_registered') {
      this.scene.start('MenuScene');
      return;
    }
    if (reason === 'slot_not_open') {
      this.scene.start('MondayWaitScene');
      return;
    }
    this.scene.start('WeekHubScene');
  }
}
