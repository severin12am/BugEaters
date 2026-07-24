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
} from '../ui/UiChrome';
import { fetchWeekState, transferBillboardRights, updateBillboardCreative } from '../tournament/tournamentApi';

/**
 * Champion dashboard: submit billboard, transfer rights, moderation status.
 */
export class ChampionDashboardScene extends Phaser.Scene {
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

    addMonoScreenBackground(this);
    const cx = GAME_WIDTH / 2;
    const pad = ux(20);
    const panelW = contentWidth(20);

    createMonoText(this, cx, getContentTopY(this, 36), 'CHAMPION', 'label').setOrigin(0.5);
    createMonoText(this, cx, getContentTopY(this, 68), `Week ${state.weekId}`, 'caption').setOrigin(0.5);

    const billboardY = getContentTopY(this, 100);
    createMonoPanel(this, pad, billboardY, {
      width: panelW,
      height: ux(200),
      raised: true,
    });
    createMonoText(this, pad + ux(16), billboardY + ux(28), 'Monday billboards', 'title');
    createMonoText(
      this,
      pad + ux(16),
      billboardY + ux(58),
      'Paste an image URL for your shoulder ad creative.',
      'caption',
    ).setWordWrapWidth(panelW - ux(32));

    const uploadBtn = createMonoButton(
      this,
      cx,
      billboardY + ux(160),
      'Save creative URL',
      'secondary',
      ux(260),
      ux(40),
    );
    bindButtonClick(uploadBtn, () => {
      const url = window.prompt('Billboard image URL');
      if (url) {
        void updateBillboardCreative(url).catch((err) => console.warn('[champion] save failed', err));
      }
    });

    const rightsY = billboardY + ux(230);
    createMonoDivider(this, pad, rightsY, panelW);
    createMonoText(this, pad, rightsY + ux(20), 'Billboard rights', 'label');
    createMonoPanel(this, pad, rightsY + ux(50), { width: panelW, height: ux(100), raised: false });
    createMonoText(
      this,
      pad + ux(16),
      rightsY + ux(70),
      'Transferable to sponsor · rights apply next Monday',
      'caption',
    ).setWordWrapWidth(panelW - ux(32));

    const transferBtn = createMonoButton(
      this,
      cx,
      rightsY + ux(150),
      'Transfer rights',
      'secondary',
      ux(260),
      ux(40),
    );
    bindButtonClick(transferBtn, () => {
      const toUser = window.prompt('Recipient user UUID');
      if (toUser) {
        void transferBillboardRights(toUser).catch((err) => console.warn('[champion] transfer failed', err));
      }
    });

    const backBtn = createMonoButton(this, cx, getMenuBottomY(this, 72), 'Back to hub', 'ghost', panelW);
    bindButtonClick(backBtn, () => this.scene.start('WeekHubScene'));
  }
}
