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
import { MONO } from '../ui/theme';
import { isDevSessionUiEnabled } from '../tournament/devSession';
import { markOnboardingComplete } from '../tournament/onboarding';

interface OnboardingStep {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
}

const STEPS: OnboardingStep[] = [
  {
    eyebrow: 'Welcome',
    title: 'BugEaters',
    body: 'A weekly global tournament in Telegram — real players race as Bug, Human, or Klaus.',
    bullets: [
      'No bots in tournament races',
      'Monday is free — no wallet needed',
      'One champion every Sunday',
    ],
  },
  {
    eyebrow: 'The week',
    title: 'Race through the week',
    body: 'Win today to earn tomorrow\'s pass. The week ends with one worldwide finale.',
    bullets: [
      'Mon — free entry, pick a time slot',
      'Tue–Sat — burn a day pass to race',
      'Sun — finale; champion gets Monday billboard rights',
    ],
  },
  {
    eyebrow: 'Controls',
    title: 'How to race',
    body: 'Sixty seconds. Only survivors move on — dying ends your run.',
    bullets: [
      'Swipe or tap left / right to change lane',
      'Swipe up to jump',
      'Trash stops you (change lane) · puddles boost · open manholes kill',
    ],
  },
  {
    eyebrow: 'Food chain',
    title: 'Eat or be eaten',
    body: 'Three species on a 9-lane road. Cross-species eating is fair game.',
    bullets: [
      'Bug eats Human · Human eats Klaus · Klaus eats Bug',
      'Same-species: cooperate or betray',
      'Pick up briefcases — tap to fire powers',
    ],
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

    // Top: skip whole flow
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

    // Progress dots
    this.renderDots(cx, getContentTopY(this, 72));

    // Card
    const cardY = getContentTopY(this, 100);
    const cardH = getMenuBottomY(this, 140) - cardY;
    createMonoPanel(this, pad, cardY, { width: panelW, height: cardH, raised: true });

    createMonoText(this, pad + ux(20), cardY + ux(28), step.eyebrow, 'caption', 0, 0.5);
    createMonoText(this, pad + ux(20), cardY + ux(58), step.title, 'title', 0, 0.5)
      .setWordWrapWidth(panelW - ux(40));

    const body = createMonoText(
      this,
      pad + ux(20),
      cardY + ux(100),
      step.body,
      'body',
      0,
      0,
    );
    body.setWordWrapWidth(panelW - ux(40));

    let bulletY = cardY + ux(100) + body.height + ux(24);
    for (const line of step.bullets) {
      const bullet = createMonoText(
        this,
        pad + ux(20),
        bulletY,
        `·  ${line}`,
        'caption',
        0,
        0,
      );
      bullet.setWordWrapWidth(panelW - ux(40));
      bullet.setColor('#8a8a8a');
      bulletY += bullet.height + ux(14);
    }

    // Step counter
    createMonoText(
      this,
      cx,
      getMenuBottomY(this, 118),
      `${this.stepIndex + 1} / ${STEPS.length}`,
      'caption',
    ).setOrigin(0.5);

    // Nav row
    const navY = getMenuBottomY(this, 64);
    const btnH = ux(52);
    const gap = ux(10);

    if (isFirst) {
      const next = createMonoButton(this, cx, navY, 'Next', 'primary', panelW, btnH);
      bindButtonClick(next, () => this.goNext());
    } else {
      const half = (panelW - gap) / 2;
      const back = createMonoButton(
        this,
        pad + half / 2,
        navY,
        'Back',
        'secondary',
        half,
        btnH,
      );
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
      this.add
        .circle(x, y, size / 2, active ? MONO.white : MONO.border, 1)
        .setDepth(10);
      x += size + gap;
    }
  }
}
