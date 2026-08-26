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
import { createFoodChainIconRows, createRoadItemLegend } from '../ui/guideIcons';
import { MONO } from '../ui/theme';
import { isDevSessionUiEnabled } from '../tournament/devSession';
import { markOnboardingComplete } from '../tournament/onboarding';

type OnboardingVisual = 'road' | 'eats';

interface OnboardingStep {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  visual?: OnboardingVisual;
}

const STEPS: OnboardingStep[] = [
  {
    eyebrow: 'Race',
    title: 'How to run',
    body: 'Sixty seconds on a dark road. Dying ends your run.',
    bullets: [
      'Swipe or tap left / right to change lane',
      'Swipe up to jump',
    ],
  },
  {
    eyebrow: 'The road',
    title: 'Obstacles and boosts',
    body: 'These four things decide most races.',
    bullets: [],
    visual: 'road',
  },
  {
    eyebrow: 'Food chain',
    title: 'Who eats whom',
    body: 'Catch the one you eat. Same species: cooperate or betray.',
    bullets: [],
    visual: 'eats',
  },
];

/**
 * First-run explainer — skippable per step and as a whole; supports back.
 */
export class OnboardingScene extends Phaser.Scene {
  private stepIndex = 0;

  constructor() {
    super({ key: 'OnboardingScene' });
  }

  create(): void {
    unlockGameAudio(this);
    this.stepIndex = 0;
    this.render();
  }

  private finish(): void {
    markOnboardingComplete();
    if (isDevSessionUiEnabled()) {
      this.scene.start('DevSessionScene');
      return;
    }
    this.scene.start('WeekHubScene');
  }

  private goNext(): void {
    if (this.stepIndex >= STEPS.length - 1) {
      this.finish();
      return;
    }
    this.stepIndex += 1;
    this.render();
  }

  private goBack(): void {
    if (this.stepIndex <= 0) {
      return;
    }
    this.stepIndex -= 1;
    this.render();
  }

  private render(): void {
    this.children.removeAll(true);
    addMonoScreenBackground(this);

    const cx = GAME_WIDTH / 2;
    const pad = ux(20);
    const panelW = contentWidth(20);
    const step = STEPS[this.stepIndex];
    const isFirst = this.stepIndex === 0;
    const isLast = this.stepIndex === STEPS.length - 1;

    const skip = createMonoButton(
      this,
      pad + panelW - ux(40),
      getContentTopY(this, 36),
      'Skip',
      'ghost',
      ux(80),
      ux(40),
    );
    bindButtonClick(skip, () => this.finish());

    createMonoText(this, cx, getContentTopY(this, 36), 'BUG EATERS', 'label').setOrigin(0.5);

    this.renderDots(cx, getContentTopY(this, 72));

    const cardY = getContentTopY(this, 100);
    const cardH = getMenuBottomY(this, 140) - cardY;
    createMonoPanel(this, pad, cardY, { width: panelW, height: cardH, raised: true });

    const innerW = panelW - ux(40);
    createMonoText(this, pad + ux(20), cardY + ux(22), step.eyebrow, 'caption', 0, 0.5);
    createMonoText(this, pad + ux(20), cardY + ux(48), step.title, 'title', 0, 0.5).setWordWrapWidth(
      innerW,
    );

    const body = createMonoText(this, pad + ux(20), cardY + ux(86), step.body, 'body', 0, 0);
    body.setWordWrapWidth(innerW);

    let cursorY = cardY + ux(86) + body.height + ux(16);

    if (step.visual === 'road') {
      const legend = createRoadItemLegend(this, innerW);
      legend.container.setPosition(pad + ux(20), cursorY);
      cursorY += legend.height + ux(12);
    } else if (step.visual === 'eats') {
      const chain = createFoodChainIconRows(this, innerW);
      chain.container.setPosition(pad + ux(20), cursorY);
      cursorY += chain.height + ux(12);
    }

    for (const line of step.bullets) {
      const bullet = createMonoText(this, pad + ux(20), cursorY, `·  ${line}`, 'caption', 0, 0);
      bullet.setWordWrapWidth(innerW);
      bullet.setColor('#8a8a8a');
      cursorY += bullet.height + ux(12);
    }

    createMonoText(
      this,
      cx,
      getMenuBottomY(this, 118),
      `${this.stepIndex + 1} / ${STEPS.length}`,
      'caption',
    ).setOrigin(0.5);

    const navY = getMenuBottomY(this, 64);
    const btnH = ux(52);
    const gap = ux(10);

    if (isFirst) {
      const next = createMonoButton(this, cx, navY, 'Next', 'primary', panelW, btnH);
      bindButtonClick(next, () => this.goNext());
    } else {
      const half = (panelW - gap) / 2;
      const back = createMonoButton(this, pad + half / 2, navY, 'Back', 'secondary', half, btnH);
      bindButtonClick(back, () => this.goBack());

      const next = createMonoButton(
        this,
        pad + half + gap + half / 2,
        navY,
        isLast ? "Let's go" : 'Next',
        'primary',
        half,
        btnH,
      );
      bindButtonClick(next, () => this.goNext());
    }
  }

  private renderDots(cx: number, y: number): void {
    const gap = ux(10);
    const size = ux(6);
    const totalW = STEPS.length * size + (STEPS.length - 1) * gap;
    let x = cx - totalW / 2 + size / 2;

    for (let i = 0; i < STEPS.length; i++) {
      const active = i === this.stepIndex;
      this.add.circle(x, y, size / 2, active ? MONO.white : MONO.border, 1).setDepth(10);
      x += size + gap;
    }
  }
}
