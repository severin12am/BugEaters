/**
 * Stylized mono diagrams for the Encyclopedia / Guide.
 * Outline Graphics + Space Mono labels — matches BugEaters chrome.
 */

import Phaser from 'phaser';
import { ux } from '../utils/constants';
import { fontSize } from '../utils/layout';
import { gameText } from '../utils/display';
import { addCornerBrackets, createMonoPanel } from './UiChrome';
import { MONO, MONO_CSS } from './theme';

export interface DiagramResult {
  container: Phaser.GameObjects.Container;
  height: number;
}

export type DiagramId =
  | 'week-arc'
  | 'lanes'
  | 'food-chain'
  | 'controls'
  | 'obstacles'
  | 'pass-flow'
  | 'monday-flow'
  | 'lobby'
  | 'briefcase'
  | 'finale'
  | 'billboard'
  | 'hub-map';

const DIAGRAM_BUILDERS: Record<
  DiagramId,
  (scene: Phaser.Scene, width: number) => DiagramResult
> = {
  'week-arc': drawWeekArc,
  lanes: drawLanes,
  'food-chain': drawFoodChain,
  controls: drawControls,
  obstacles: drawObstacles,
  'pass-flow': drawPassFlow,
  'monday-flow': drawMondayFlow,
  lobby: drawLobby,
  briefcase: drawBriefcase,
  finale: drawFinale,
  billboard: drawBillboard,
  'hub-map': drawHubMap,
};

export function isDiagramId(value: string): value is DiagramId {
  return value in DIAGRAM_BUILDERS;
}

export function createEncyclopediaDiagram(
  scene: Phaser.Scene,
  id: DiagramId,
  width: number,
): DiagramResult {
  return DIAGRAM_BUILDERS[id](scene, width);
}

function frame(
  scene: Phaser.Scene,
  width: number,
  height: number,
): { root: Phaser.GameObjects.Container; inner: Phaser.GameObjects.Container; pad: number } {
  const pad = ux(14);
  const root = scene.add.container(0, 0);
  const panel = createMonoPanel(scene, 0, 0, { width, height, raised: true });
  const inner = scene.add.container(0, 0);
  root.add([panel, inner]);
  return { root, inner, pad };
}

function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 11,
  color: string = MONO_CSS.text,
): Phaser.GameObjects.Text {
  return gameText(scene, x, y, text.toUpperCase(), {
    fontFamily: MONO_CSS.fontDisplay,
    fontSize: fontSize(size),
    color,
    fontStyle: 'bold',
  }).setOrigin(0.5);
}

function caption(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  wrap?: number,
): Phaser.GameObjects.Text {
  const t = gameText(scene, x, y, text, {
    fontFamily: MONO_CSS.fontBody,
    fontSize: fontSize(11),
    color: MONO_CSS.textMuted,
  }).setOrigin(0.5, 0);
  if (wrap) {
    t.setWordWrapWidth(wrap);
  }
  return t;
}

function arrow(
  g: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: number = MONO.white,
  alpha = 0.85,
): void {
  g.lineStyle(ux(1.5), color, alpha);
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.strokePath();

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = ux(6);
  g.fillStyle(color, alpha);
  g.fillTriangle(
    x2,
    y2,
    x2 - Math.cos(angle - 0.45) * head,
    y2 - Math.sin(angle - 0.45) * head,
    x2 - Math.cos(angle + 0.45) * head,
    y2 - Math.sin(angle + 0.45) * head,
  );
}

function chip(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  cx: number,
  cy: number,
  w: number,
  h: number,
  text: string,
  filled = false,
): void {
  const bg = scene.add.rectangle(cx, cy, w, h, filled ? MONO.white : MONO.surface);
  if (!filled) {
    bg.setStrokeStyle(ux(1), MONO.borderStrong, 0.7);
  }
  parent.add(bg);
  parent.add(
    gameText(scene, cx, cy, text.toUpperCase(), {
      fontFamily: MONO_CSS.fontDisplay,
      fontSize: fontSize(10),
      color: filled ? MONO_CSS.ink : MONO_CSS.text,
      fontStyle: 'bold',
    }).setOrigin(0.5),
  );
}

function drawWeekArc(scene: Phaser.Scene, width: number): DiagramResult {
  const height = ux(118);
  const { root, inner, pad } = frame(scene, width, height);
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const tags = ['FREE', '', '', '', '', '×6', 'FINAL'];
  const cell = ux(34);
  const gap = ux(6);
  const total = days.length * cell + (days.length - 1) * gap;
  const startX = pad + (width - pad * 2 - total) / 2;
  const y = ux(42);

  days.forEach((d, i) => {
    const cx = startX + i * (cell + gap) + cell / 2;
    const isMon = i === 0;
    const isSun = i === 6;
    const bg = scene.add.rectangle(
      cx,
      y,
      cell,
      cell,
      isSun ? MONO.white : MONO.surface,
    );
    if (!isSun) {
      bg.setStrokeStyle(ux(1.5), isMon ? MONO.borderStrong : MONO.border, 0.9);
    }
    inner.add(bg);
    inner.add(
      gameText(scene, cx, y, d, {
        fontFamily: MONO_CSS.fontDisplay,
        fontSize: fontSize(13),
        color: isSun ? MONO_CSS.ink : MONO_CSS.text,
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );
    if (tags[i]) {
      inner.add(
        gameText(scene, cx, y + ux(28), tags[i], {
          fontFamily: MONO_CSS.fontDisplay,
          fontSize: fontSize(8),
          color: MONO_CSS.textMuted,
        }).setOrigin(0.5),
      );
    }
    if (i < days.length - 1) {
      const g = scene.add.graphics();
      arrow(g, cx + cell / 2 + ux(1), y, cx + cell / 2 + gap - ux(1), y, MONO.textSecondary, 0.7);
      inner.add(g);
    }
  });

  inner.add(caption(scene, width / 2, height - ux(28), "Win today → earn tomorrow's pass", width - pad * 2));
  return { container: root, height };
}

function drawLanes(scene: Phaser.Scene, width: number): DiagramResult {
  const height = ux(150);
  const { root, inner, pad } = frame(scene, width, height);
  const roadX = pad;
  const roadY = ux(28);
  const roadW = width - pad * 2;
  const roadH = ux(88);

  const road = scene.add.rectangle(roadX + roadW / 2, roadY + roadH / 2, roadW, roadH, MONO.void);
  road.setStrokeStyle(ux(1.5), MONO.borderStrong, 0.5);
  inner.add(road);

  const bands = [
    { label: 'BUG', sub: '×3' },
    { label: 'HUMAN', sub: '×3' },
    { label: 'KLAUS', sub: '×3' },
  ];
  const bandW = roadW / 3;
  const g = scene.add.graphics();
  bands.forEach((band, i) => {
    const x0 = roadX + i * bandW;
    const cx = x0 + bandW / 2;
    if (i > 0) {
      g.lineStyle(ux(2), 0x888888, 0.95);
      g.beginPath();
      g.moveTo(x0, roadY + ux(4));
      g.lineTo(x0, roadY + roadH - ux(4));
      g.strokePath();
    }
    // faint sub-lane ticks
    g.lineStyle(ux(1), MONO.border, 0.55);
    for (let s = 1; s < 3; s++) {
      const sx = x0 + (bandW * s) / 3;
      g.beginPath();
      g.moveTo(sx, roadY + ux(10));
      g.lineTo(sx, roadY + roadH - ux(10));
      g.strokePath();
    }
    inner.add(label(scene, cx, roadY + roadH / 2 - ux(8), band.label, 12));
    inner.add(
      gameText(scene, cx, roadY + roadH / 2 + ux(12), band.sub, {
        fontFamily: MONO_CSS.fontDisplay,
        fontSize: fontSize(10),
        color: MONO_CSS.textMuted,
      }).setOrigin(0.5),
    );
  });

  // edge death marks
  g.lineStyle(ux(2), MONO.blood, 0.85);
  g.beginPath();
  g.moveTo(roadX, roadY);
  g.lineTo(roadX, roadY + roadH);
  g.moveTo(roadX + roadW, roadY);
  g.lineTo(roadX + roadW, roadY + roadH);
  g.strokePath();
  inner.add(g);

  inner.add(caption(scene, width / 2, height - ux(26), 'Edges kill · dividers open on a race seed', width - pad * 2));
  return { container: root, height };
}

function drawFoodChain(scene: Phaser.Scene, width: number): DiagramResult {
  const height = ux(168);
  const { root, inner, pad } = frame(scene, width, height);
  const cx = width / 2;
  const cy = ux(78);
  const r = ux(46);
  const nodes = [
    { name: 'BUG', ang: -Math.PI / 2 },
    { name: 'HUMAN', ang: Math.PI / 6 },
    { name: 'KLAUS', ang: (5 * Math.PI) / 6 },
  ];

  const g = scene.add.graphics();
  const pts = nodes.map((n) => ({
    ...n,
    x: cx + Math.cos(n.ang) * r,
    y: cy + Math.sin(n.ang) * r,
  }));

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    // shorten arrow so it doesn't enter the node circle
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const inset = ux(22);
    arrow(
      g,
      a.x + (dx / len) * inset,
      a.y + (dy / len) * inset,
      b.x - (dx / len) * inset,
      b.y - (dy / len) * inset,
    );
  }
  inner.add(g);

  pts.forEach((p) => {
    const ring = scene.add.circle(p.x, p.y, ux(20), MONO.surface);
    ring.setStrokeStyle(ux(1.5), MONO.borderStrong, 0.9);
    inner.add(ring);
    inner.add(label(scene, p.x, p.y, p.name, 9));
  });

  inner.add(
    caption(scene, cx, height - ux(28), 'Same species → cooperate or betray', width - pad * 2),
  );
  return { container: root, height };
}

function drawControls(scene: Phaser.Scene, width: number): DiagramResult {
  const height = ux(132);
  const { root, inner, pad } = frame(scene, width, height);
  const cells = [
    { title: 'LANE', hint: 'Swipe / tap\nleft · right' },
    { title: 'JUMP', hint: 'Swipe up' },
    { title: 'POWER', hint: 'Tap armed\nbriefcase' },
  ];
  const cellW = (width - pad * 2 - ux(16)) / 3;
  const cellH = ux(88);
  const y = ux(22);

  cells.forEach((cell, i) => {
    const x = pad + i * (cellW + ux(8));
    const box = scene.add.rectangle(x + cellW / 2, y + cellH / 2, cellW, cellH, MONO.void);
    box.setStrokeStyle(ux(1), MONO.border, 0.9);
    inner.add(box);

    const g = scene.add.graphics();
    const icx = x + cellW / 2;
    const icy = y + ux(28);
    g.lineStyle(ux(2), MONO.white, 0.9);
    if (i === 0) {
      // left-right chevrons
      g.beginPath();
      g.moveTo(icx - ux(16), icy);
      g.lineTo(icx - ux(8), icy - ux(6));
      g.lineTo(icx - ux(8), icy + ux(6));
      g.closePath();
      g.fillStyle(MONO.white, 0.9);
      g.fillPath();
      g.beginPath();
      g.moveTo(icx + ux(16), icy);
      g.lineTo(icx + ux(8), icy - ux(6));
      g.lineTo(icx + ux(8), icy + ux(6));
      g.closePath();
      g.fillPath();
      g.lineBetween(icx - ux(6), icy, icx + ux(6), icy);
    } else if (i === 1) {
      g.fillStyle(MONO.white, 0.9);
      g.fillTriangle(icx, icy - ux(10), icx - ux(8), icy + ux(4), icx + ux(8), icy + ux(4));
      g.lineBetween(icx, icy + ux(4), icx, icy + ux(14));
    } else {
      // briefcase slot
      g.strokeRect(icx - ux(12), icy - ux(8), ux(24), ux(16));
      g.fillStyle(MONO.white, 0.9);
      g.fillRect(icx - ux(4), icy - ux(12), ux(8), ux(5));
    }
    inner.add(g);
    inner.add(label(scene, icx, y + ux(52), cell.title, 10));
    const hint = caption(scene, icx, y + ux(64), cell.hint, cellW - ux(8));
    hint.setAlign('center');
    inner.add(hint);
  });

  return { container: root, height };
}

function drawObstacles(scene: Phaser.Scene, width: number): DiagramResult {
  const height = ux(128);
  const { root, inner, pad } = frame(scene, width, height);
  const items = [
    { title: 'TRASH', note: 'stops you · change lane', draw: 'trash' as const },
    { title: 'PUDDLE', note: 'exit = boost', draw: 'puddle' as const },
    { title: 'MANHOLE', note: 'open = death', draw: 'hole' as const },
  ];
  const cellW = (width - pad * 2 - ux(16)) / 3;
  const y = ux(20);

  items.forEach((item, i) => {
    const x = pad + i * (cellW + ux(8)) + cellW / 2;
    const g = scene.add.graphics();
    g.lineStyle(ux(2), item.draw === 'hole' ? MONO.blood : MONO.white, 0.9);
    if (item.draw === 'trash') {
      g.strokeRect(x - ux(12), y + ux(8), ux(24), ux(22));
      g.lineBetween(x - ux(8), y + ux(8), x - ux(8), y + ux(2));
      g.lineBetween(x + ux(8), y + ux(8), x + ux(8), y + ux(2));
      g.lineBetween(x - ux(10), y + ux(2), x + ux(10), y + ux(2));
    } else if (item.draw === 'puddle') {
      g.strokeEllipse(x, y + ux(18), ux(36), ux(16));
      g.lineStyle(ux(1.5), MONO.textSecondary, 0.7);
      g.lineBetween(x - ux(10), y + ux(18), x + ux(14), y + ux(18));
    } else {
      g.strokeCircle(x, y + ux(18), ux(12));
      g.lineStyle(ux(1.5), MONO.blood, 0.5);
      g.strokeCircle(x, y + ux(18), ux(5));
    }
    inner.add(g);
    inner.add(label(scene, x, y + ux(52), item.title, 10));
    inner.add(caption(scene, x, y + ux(68), item.note, cellW - ux(6)));
  });

  return { container: root, height };
}

function drawPassFlow(scene: Phaser.Scene, width: number): DiagramResult {
  const height = ux(110);
  const { root, inner, pad } = frame(scene, width, height);
  const steps = ['WALLET', 'PASS', 'BURN', 'ROLE'];
  const chipW = ux(64);
  const chipH = ux(36);
  const gap = ux(18);
  const total = steps.length * chipW + (steps.length - 1) * gap;
  const startX = pad + (width - pad * 2 - total) / 2;
  const y = ux(44);

  const g = scene.add.graphics();
  steps.forEach((step, i) => {
    const cx = startX + i * (chipW + gap) + chipW / 2;
    chip(scene, inner, cx, y, chipW, chipH, step, i === 2);
    if (i < steps.length - 1) {
      arrow(g, cx + chipW / 2 + ux(2), y, cx + chipW / 2 + gap - ux(2), y, MONO.textSecondary, 0.75);
    }
  });
  inner.add(g);
  inner.add(caption(scene, width / 2, height - ux(26), 'One pass = one race. Burn locks entry.', width - pad * 2));
  return { container: root, height };
}

function drawMondayFlow(scene: Phaser.Scene, width: number): DiagramResult {
  const height = ux(118);
  const { root, inner, pad } = frame(scene, width, height);
  const steps = ['REGISTER', 'WAIT', 'LOBBY', 'RACE'];
  const chipW = ux(68);
  const chipH = ux(34);
  const gap = ux(12);
  const total = steps.length * chipW + (steps.length - 1) * gap;
  const startX = Math.max(pad, (width - total) / 2);
  const y = ux(40);

  const g = scene.add.graphics();
  steps.forEach((step, i) => {
    const cx = startX + i * (chipW + gap) + chipW / 2;
    chip(scene, inner, cx, y, chipW, chipH, step, i === steps.length - 1);
    if (i < steps.length - 1) {
      arrow(g, cx + chipW / 2 + ux(1), y, cx + chipW / 2 + gap - ux(1), y, MONO.textSecondary, 0.75);
    }
  });
  inner.add(g);
  inner.add(
    caption(scene, width / 2, height - ux(28), 'Slots 12 · 16 · 18 · 21 UTC · one Monday race', width - pad * 2),
  );
  return { container: root, height };
}

function drawLobby(scene: Phaser.Scene, width: number): DiagramResult {
  const height = ux(120);
  const { root, inner, pad } = frame(scene, width, height);
  const rosterY = ux(36);
  const slotW = ux(36);
  const gap = ux(8);
  const slots = 6;
  const total = slots * slotW + (slots - 1) * gap;
  const startX = (width - total) / 2;

  for (let i = 0; i < slots; i++) {
    const cx = startX + i * (slotW + gap) + slotW / 2;
    const filled = i < 4;
    const box = scene.add.rectangle(cx, rosterY, slotW, slotW, filled ? MONO.surfaceRaised : MONO.void);
    box.setStrokeStyle(ux(1), filled ? MONO.borderStrong : MONO.border, filled ? 0.9 : 0.5);
    inner.add(box);
    if (filled) {
      inner.add(
        gameText(scene, cx, rosterY, String(i + 1), {
          fontFamily: MONO_CSS.fontDisplay,
          fontSize: fontSize(12),
          color: MONO_CSS.text,
          fontStyle: 'bold',
        }).setOrigin(0.5),
      );
    }
  }

  // countdown pill
  const pill = scene.add.rectangle(width / 2, ux(78), ux(120), ux(28), MONO.white);
  inner.add(pill);
  inner.add(
    gameText(scene, width / 2, ux(78), 'READY → 10s', {
      fontFamily: MONO_CSS.fontDisplay,
      fontSize: fontSize(11),
      color: MONO_CSS.ink,
      fontStyle: 'bold',
    }).setOrigin(0.5),
  );
  inner.add(caption(scene, width / 2, height - ux(22), 'Empty seats stay empty — no bots', width - pad * 2));
  return { container: root, height };
}

function drawBriefcase(scene: Phaser.Scene, width: number): DiagramResult {
  const height = ux(112);
  const { root, inner, pad } = frame(scene, width, height);
  const slotW = ux(72);
  const slotH = ux(44);
  const gap = ux(10);
  const total = 3 * slotW + 2 * gap;
  const startX = (width - total) / 2;
  const y = ux(40);

  for (let i = 0; i < 3; i++) {
    const cx = startX + i * (slotW + gap) + slotW / 2;
    const armed = i === 2;
    const box = scene.add.rectangle(cx, y, slotW, slotH, armed ? MONO.white : MONO.surface);
    if (!armed) {
      box.setStrokeStyle(ux(1.5), MONO.border, 0.9);
    }
    inner.add(box);
    inner.add(
      gameText(scene, cx, y, armed ? 'ARMED' : `SLOT ${i + 1}`, {
        fontFamily: MONO_CSS.fontDisplay,
        fontSize: fontSize(10),
        color: armed ? MONO_CSS.ink : MONO_CSS.textMuted,
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );
  }
  inner.add(caption(scene, width / 2, height - ux(26), 'Newest pickup arms · tap to fire · max 3', width - pad * 2));
  return { container: root, height };
}

function drawFinale(scene: Phaser.Scene, width: number): DiagramResult {
  const height = ux(140);
  const { root, inner } = frame(scene, width, height);
  const g = scene.add.graphics();

  // Saturday: 6 small rooms
  const room = ux(28);
  const gap = ux(8);
  const rowW = 3 * room + 2 * gap;
  const left = (width - rowW) / 2;
  for (let i = 0; i < 6; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = left + col * (room + gap) + room / 2;
    const cy = ux(34) + row * (room + gap);
    const box = scene.add.rectangle(cx, cy, room, room, MONO.surface);
    box.setStrokeStyle(ux(1), MONO.border, 0.9);
    inner.add(box);
    inner.add(
      gameText(scene, cx, cy, 'R', {
        fontFamily: MONO_CSS.fontDisplay,
        fontSize: fontSize(10),
        color: MONO_CSS.textMuted,
      }).setOrigin(0.5),
    );
  }
  inner.add(label(scene, width / 2, ux(18), 'SAT · 6 ROOMS', 9, MONO_CSS.textMuted));

  // arrow down to sunday
  arrow(g, width / 2, ux(96), width / 2, ux(108), MONO.textSecondary, 0.8);
  inner.add(g);

  chip(scene, inner, width / 2, ux(122), ux(140), ux(28), 'SUN · 1 CHAMPION', true);
  return { container: root, height };
}

function drawBillboard(scene: Phaser.Scene, width: number): DiagramResult {
  const height = ux(120);
  const { root, inner, pad } = frame(scene, width, height);
  const roadY = ux(70);
  const roadH = ux(28);
  const road = scene.add.rectangle(width / 2, roadY, width - pad * 2, roadH, MONO.void);
  road.setStrokeStyle(ux(1), MONO.border, 0.8);
  inner.add(road);

  // shoulder boards
  const boards = [
    { x: pad + ux(36), label: 'AD' },
    { x: width - pad - ux(36), label: 'AD' },
  ];
  boards.forEach((b) => {
    const board = scene.add.rectangle(b.x, ux(40), ux(48), ux(28), MONO.white);
    inner.add(board);
    inner.add(
      gameText(scene, b.x, ux(40), b.label, {
        fontFamily: MONO_CSS.fontDisplay,
        fontSize: fontSize(11),
        color: MONO_CSS.ink,
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );
    const post = scene.add.rectangle(b.x, ux(58), ux(3), ux(12), MONO.borderStrong);
    inner.add(post);
  });

  // runner mark
  const runner = scene.add.circle(width / 2, roadY, ux(5), MONO.white);
  inner.add(runner);
  inner.add(caption(scene, width / 2, height - ux(22), "Champion owns next Monday's shoulders", width - pad * 2));
  return { container: root, height };
}

function drawHubMap(scene: Phaser.Scene, width: number): DiagramResult {
  const height = ux(128);
  const { root, inner, pad } = frame(scene, width, height);
  const nodes = [
    { x: 0.2, y: 0.35, t: 'HUB' },
    { x: 0.5, y: 0.28, t: 'LOBBY' },
    { x: 0.8, y: 0.35, t: 'RACE' },
    { x: 0.5, y: 0.72, t: 'END' },
  ];
  const g = scene.add.graphics();
  const pts = nodes.map((n) => ({
    ...n,
    px: pad + n.x * (width - pad * 2),
    py: ux(20) + n.y * (height - ux(40)),
  }));
  const links: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ];
  links.forEach(([a, b]) => {
    g.lineStyle(ux(1.5), MONO.border, 0.8);
    g.beginPath();
    g.moveTo(pts[a].px, pts[a].py);
    g.lineTo(pts[b].px, pts[b].py);
    g.strokePath();
  });
  inner.add(g);
  pts.forEach((p, i) => {
    chip(scene, inner, p.px, p.py, ux(56), ux(28), p.t, i === 0);
  });
  return { container: root, height };
}

/** Tiny geometric mark for index cards — one glyph per section. */
export function createSectionGlyph(
  scene: Phaser.Scene,
  sectionId: string,
  size = ux(36),
): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const bg = scene.add.rectangle(0, 0, size, size, MONO.surface);
  bg.setStrokeStyle(ux(1), MONO.border, 0.9);
  c.add(bg);
  addCornerBrackets(scene, -size / 2, -size / 2, size, size, c);

  const g = scene.add.graphics();
  g.lineStyle(ux(1.5), MONO.white, 0.9);
  const s = size * 0.28;

  switch (sectionId) {
    case 'overview':
      g.strokeCircle(0, 0, s);
      g.fillStyle(MONO.white, 0.9);
      g.fillCircle(0, 0, s * 0.35);
      break;
    case 'week':
      for (let i = -2; i <= 2; i++) {
        g.strokeRect(i * (s * 0.45) - s * 0.12, -s * 0.35, s * 0.24, s * 0.7);
      }
      break;
    case 'monday':
      g.strokeRect(-s, -s * 0.5, s * 2, s);
      g.lineBetween(-s * 0.4, 0, s * 0.4, 0);
      break;
    case 'passes':
      g.strokeRect(-s * 0.7, -s * 0.5, s * 1.4, s);
      g.lineBetween(-s * 0.2, -s * 0.1, s * 0.3, -s * 0.1);
      break;
    case 'lobby':
      g.strokeRect(-s, -s * 0.6, s * 0.85, s * 1.2);
      g.strokeRect(s * 0.15, -s * 0.6, s * 0.85, s * 1.2);
      break;
    case 'racers':
      g.lineBetween(-s, s * 0.6, -s, -s * 0.6);
      g.lineBetween(0, s * 0.6, 0, -s * 0.6);
      g.lineBetween(s, s * 0.6, s, -s * 0.6);
      break;
    case 'racing':
      g.fillStyle(MONO.white, 0.9);
      g.fillTriangle(0, -s, -s * 0.7, s * 0.5, s * 0.7, s * 0.5);
      break;
    case 'sunday':
      g.strokeCircle(0, 0, s);
      g.fillStyle(MONO.white, 0.9);
      g.fillTriangle(0, -s * 0.5, -s * 0.35, s * 0.35, s * 0.35, s * 0.35);
      break;
    case 'champion':
      g.strokeRect(-s, -s * 0.4, s * 2, s * 0.8);
      g.lineBetween(0, s * 0.4, 0, s * 0.85);
      break;
    case 'abilities':
      g.strokeRect(-s * 0.8, -s * 0.5, s * 1.6, s);
      g.fillRect(-s * 0.25, -s * 0.75, s * 0.5, s * 0.3);
      break;
    case 'hub':
      g.strokeRect(-s, -s, s * 0.85, s * 0.85);
      g.strokeRect(s * 0.15, -s, s * 0.85, s * 0.85);
      g.strokeRect(-s * 0.4, s * 0.15, s * 0.85, s * 0.85);
      break;
    case 'glossary':
      g.strokeRect(-s * 0.7, -s, s * 1.4, s * 2);
      g.lineBetween(-s * 0.35, -s * 0.4, s * 0.35, -s * 0.4);
      g.lineBetween(-s * 0.35, 0, s * 0.2, 0);
      g.lineBetween(-s * 0.35, s * 0.4, s * 0.35, s * 0.4);
      break;
    default:
      g.strokeRect(-s, -s, s * 2, s * 2);
  }

  c.add(g);
  return c;
}
