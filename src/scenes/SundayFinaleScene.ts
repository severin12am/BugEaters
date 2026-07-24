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
} from '../ui/UiChrome';
import { fetchSundayFinalists, fetchWeekState, weekContextFromState } from '../tournament/tournamentApi';
import { REGISTRY_KEYS } from './BootScene';

/**
 * Sunday finale: 1–N global racers, one champion.
 */
export class SundayFinaleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SundayFinaleScene' });
  }

  create(): void {
    void this.initFinale();
  }

  private async initFinale(): Promise<void> {
    const state = await fetchWeekState();
    const week = weekContextFromState(state);

    if (!this.scene.isActive()) {
      return;
    }

    if (!week.isSundayFinale) {
      this.scene.start('WeekHubScene');
      return;
    }

    const finalists = await fetchSundayFinalists();

    addMonoScreenBackground(this);
    const cx = GAME_WIDTH / 2;
    const pad = ux(20);
    const panelW = contentWidth(20);

    createMonoText(this, cx, getContentTopY(this, 36), 'GLOBAL FINALE', 'label').setOrigin(0.5);
    createStatusPill(this, cx, getContentTopY(this, 68), `1–${week.maxSundaySlots} worldwide`, true);

    const finaleY = getContentTopY(this, 130);
    createMonoPanel(this, pad, finaleY, { width: panelW, height: ux(160), raised: true });
    createMonoText(this, pad + ux(16), finaleY + ux(28), 'One global race', 'title');
    createMonoText(
      this,
      pad + ux(16),
      finaleY + ux(58),
      `${finalists.length || week.maxSundaySlots} Sunday qualifiers race worldwide. One champion → Monday billboards.`,
      'body',
    ).setWordWrapWidth(panelW - ux(32));

    const rosterY = getContentTopY(this, 320);
    createMonoText(this, pad, rosterY, 'Qualifiers', 'label');
    const rosterLines =
      finalists.length > 0
        ? finalists.map((f) => `${f.slot}. ${f.username ?? f.userId.slice(0, 8)}`)
        : ['No qualifiers minted yet.'];
    createMonoText(this, pad + ux(16), rosterY + ux(24), rosterLines.join('\n'), 'mono').setAlign(
      'left',
    );

    const raceBtn = createMonoButton(
      this,
      cx,
      getMenuBottomY(this, 108),
      'Enter race',
      'primary',
      panelW,
    );
    bindButtonClick(raceBtn, () => {
      const sundayPass = week.passes.find((p) => p.grantsEntry === 'sunday');
      if (sundayPass) {
        this.registry.set(REGISTRY_KEYS.activePassId, sundayPass.id);
      }
      this.registry.set(REGISTRY_KEYS.passBurnConfirmed, false);
      this.scene.start('LobbyScene');
    });

    const backBtn = createMonoButton(this, cx, getMenuBottomY(this, 72), 'Back to hub', 'ghost', panelW);
    bindButtonClick(backBtn, () => this.scene.start('WeekHubScene'));
  }
}
