import Phaser from 'phaser';
import { GAME_WIDTH, ux } from '../utils/constants';
import { fontSize } from '../utils/layout';
import { gameText } from '../utils/display';
import { MONO, MONO_CSS, type UiButtonVariant, type UiTextVariant } from './theme';

export interface UiButtonResult {
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export interface UiPanelOptions {
  width: number;
  height: number;
  raised?: boolean;
  border?: boolean;
}

const TEXT_STYLES: Record<UiTextVariant, Phaser.Types.GameObjects.Text.TextStyle> = {
  display: {
    fontFamily: MONO_CSS.fontDisplay,
    fontSize: fontSize(28),
    color: MONO_CSS.text,
    fontStyle: 'bold',
  },
  title: {
    fontFamily: MONO_CSS.fontDisplay,
    fontSize: fontSize(20),
    color: MONO_CSS.text,
    fontStyle: 'bold',
  },
  label: {
    fontFamily: MONO_CSS.fontDisplay,
    fontSize: fontSize(11),
    color: MONO_CSS.textSecondary,
  },
  body: {
    fontFamily: MONO_CSS.fontBody,
    fontSize: fontSize(15),
    color: MONO_CSS.text,
  },
  caption: {
    fontFamily: MONO_CSS.fontBody,
    fontSize: fontSize(12),
    color: MONO_CSS.textMuted,
  },
  mono: {
    fontFamily: MONO_CSS.fontDisplay,
    fontSize: fontSize(13),
    color: MONO_CSS.text,
  },
};

/** Corner bracket decoration — Mono signature mark. */
export function addCornerBrackets(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  parent?: Phaser.GameObjects.Container,
): Phaser.GameObjects.Container {
  const g = scene.add.container(x, y);
  const len = ux(10);
  const thick = ux(1.5);
  const color = MONO.borderStrong;

  const tl = scene.add.rectangle(0, 0, len, thick, color).setOrigin(0, 0);
  const tl2 = scene.add.rectangle(0, 0, thick, len, color).setOrigin(0, 0);
  const tr = scene.add.rectangle(w, 0, len, thick, color).setOrigin(1, 0);
  const tr2 = scene.add.rectangle(w, 0, thick, len, color).setOrigin(1, 0);
  const bl = scene.add.rectangle(0, h, len, thick, color).setOrigin(0, 1);
  const bl2 = scene.add.rectangle(0, h, thick, len, color).setOrigin(0, 1);
  const br = scene.add.rectangle(w, h, len, thick, color).setOrigin(1, 1);
  const br2 = scene.add.rectangle(w, h, thick, len, color).setOrigin(1, 1);

  g.add([tl, tl2, tr, tr2, bl, bl2, br, br2]);
  parent?.add(g);
  return g;
}

export function createMonoPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: UiPanelOptions,
): Phaser.GameObjects.Container {
  const { width, height, raised = false, border = true } = options;
  const panel = scene.add.container(x, y);
  const fill = raised ? MONO.surfaceRaised : MONO.surface;
  const bg = scene.add.rectangle(width / 2, height / 2, width, height, fill);
  panel.add(bg);

  if (border) {
    const stroke = scene.add.rectangle(width / 2, height / 2, width, height);
    stroke.setStrokeStyle(ux(1), MONO.border, 1);
    panel.add(stroke);
    addCornerBrackets(scene, 0, 0, width, height, panel);
  }

  return panel;
}

export function createMonoText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  variant: UiTextVariant,
  originX = 0,
  originY = 0.5,
): Phaser.GameObjects.Text {
  const style = { ...TEXT_STYLES[variant] };
  if (variant === 'label') {
    content = content.toUpperCase();
  }
  return gameText(scene, x, y, content, style).setOrigin(originX, originY);
}

export function createMonoButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  variant: UiButtonVariant,
  width = ux(260),
  height = ux(52),
): UiButtonResult {
  const container = scene.add.container(x, y);
  let fill: number = MONO.white;
  let textColor: string = MONO_CSS.ink;
  let strokeColor: number | null = null;

  switch (variant) {
    case 'secondary':
      fill = MONO.surface;
      textColor = MONO_CSS.text;
      strokeColor = MONO.borderStrong;
      break;
    case 'ghost':
      fill = MONO.void;
      textColor = MONO_CSS.textSecondary;
      strokeColor = MONO.border;
      break;
    case 'danger':
      fill = MONO.blood;
      textColor = '#ffffff';
      break;
    default:
      break;
  }

  const bg = scene.add
    .rectangle(0, 0, width, height, fill)
    .setInteractive({ useHandCursor: true });

  if (strokeColor !== null) {
    bg.setStrokeStyle(ux(1), strokeColor, variant === 'secondary' ? 0.9 : 0.5);
  }

  const text = gameText(scene, 0, 0, label.toUpperCase(), {
    fontFamily: MONO_CSS.fontDisplay,
    fontSize: fontSize(variant === 'ghost' ? 13 : 15),
    color: textColor,
    fontStyle: 'bold',
  }).setOrigin(0.5);

  container.add([bg, text]);

  bg.on('pointerover', () => {
    if (variant === 'primary') {
      bg.setFillStyle(MONO.textSecondary);
    } else if (variant === 'secondary') {
      bg.setFillStyle(MONO.surfaceRaised);
    }
  });
  bg.on('pointerout', () => bg.setFillStyle(fill));

  return { container, background: bg, label: text };
}

export function bindButtonClick(button: UiButtonResult, onClick: () => void): void {
  button.background.on('pointerdown', onClick);
}

/** Horizontal hairline divider. */
export function createMonoDivider(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  parent?: Phaser.GameObjects.Container,
): Phaser.GameObjects.Rectangle {
  const line = scene.add.rectangle(x + width / 2, y, width, ux(1), MONO.border, 0.9);
  parent?.add(line);
  return line;
}

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const WEEK_LABELS: Record<WeekdayKey, string> = {
  mon: 'M',
  tue: 'T',
  wed: 'W',
  thu: 'T',
  fri: 'F',
  sat: 'S',
  sun: 'S',
};

/** Seven-day tournament strip with active day highlight. */
export function createWeekStrip(
  scene: Phaser.Scene,
  centerX: number,
  y: number,
  active: WeekdayKey,
): Phaser.GameObjects.Container {
  const keys: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const gap = ux(6);
  const cell = ux(40);
  const totalW = keys.length * cell + (keys.length - 1) * gap;
  const startX = centerX - totalW / 2;
  const strip = scene.add.container(0, 0);

  keys.forEach((key, i) => {
    const cx = startX + i * (cell + gap) + cell / 2;
    const isActive = key === active;
    const isPast = keys.indexOf(key) < keys.indexOf(active);

    const bg = scene.add.rectangle(
      cx,
      y,
      cell,
      cell,
      isActive ? MONO.white : MONO.surface,
    );
    if (!isActive) {
      bg.setStrokeStyle(ux(1), isPast ? MONO.border : MONO.border, 0.6);
    }

    const label = gameText(scene, cx, y, WEEK_LABELS[key], {
      fontFamily: MONO_CSS.fontDisplay,
      fontSize: fontSize(14),
      color: isActive ? MONO_CSS.ink : isPast ? MONO_CSS.textSecondary : MONO_CSS.textMuted,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    strip.add([bg, label]);
  });

  return strip;
}

/** Small status pill for pass / wallet / live states. */
export function createStatusPill(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  active = false,
  anchor: 'left' | 'center' | 'right' = 'center',
): Phaser.GameObjects.Container {
  const padX = ux(12);
  const padY = ux(6);
  const container = scene.add.container(x, y);
  const label = gameText(scene, 0, 0, text.toUpperCase(), {
    fontFamily: MONO_CSS.fontDisplay,
    fontSize: fontSize(10),
    color: active ? MONO_CSS.ink : MONO_CSS.textSecondary,
    fontStyle: 'bold',
  }).setOrigin(0.5);

  const w = label.width + padX * 2;
  const h = label.height + padY * 2;
  const bg = scene.add.rectangle(0, 0, w, h, active ? MONO.white : MONO.surface);
  bg.setStrokeStyle(ux(1), MONO.border, 0.8);
  container.add([bg, label]);

  if (anchor === 'right') {
    container.x -= w / 2;
  } else if (anchor === 'left') {
    container.x += w / 2;
  }

  return container;
}

export function contentWidth(pad = 20): number {
  return GAME_WIDTH - ux(pad * 2);
}
