import Phaser from 'phaser';
import { GAME_WIDTH, ux } from '../utils/constants';
import { fontSize, getContentTopY, getMenuBottomY } from '../utils/layout';
import { fitTextureInBox, gameText } from '../utils/display';
import { addMonoScreenBackground } from '../ui/grainBackground';
import {
  bindButtonClick,
  contentWidth,
  createMonoButton,
  createMonoPanel,
  createMonoText,
} from '../ui/UiChrome';
import { MONO, MONO_CSS } from '../ui/theme';
import {
  createEncyclopediaDiagram,
  createSectionGlyph,
  isDiagramId,
} from '../ui/encyclopediaDiagrams';
import {
  getAbilityGuideCards,
  getEncyclopediaSection,
  getEncyclopediaSections,
  type EncyclopediaSection,
} from '../canon/encyclopedia';

const SCROLL_PAD_TOP = ux(12);
const SCROLL_PAD_BOTTOM = ux(40);
const INDEX_CARD_H = ux(76);

/**
 * In-game encyclopedia — visual sections + mono diagrams from `content/encyclopedia.md`.
 */
export class EncyclopediaScene extends Phaser.Scene {
  private scrollY = 0;
  private maxScroll = 0;
  private scrollContainer: Phaser.GameObjects.Container | null = null;
  private scrollMaskGfx: Phaser.GameObjects.Graphics | null = null;
  private dragStartY = 0;
  private scrollStartY = 0;
  private dragging = false;

  constructor() {
    super({ key: 'EncyclopediaScene' });
  }

  create(data?: { sectionId?: string }): void {
    if (data?.sectionId) {
      const section = getEncyclopediaSection(data.sectionId);
      if (section) {
        this.showArticle(section);
        return;
      }
    }
    this.showIndex();
  }

  private clearMain(): void {
    this.scrollContainer = null;
    if (this.scrollMaskGfx) {
      this.scrollMaskGfx.destroy();
      this.scrollMaskGfx = null;
    }
    this.dragging = false;
    this.input.off('pointermove');
    this.input.off('pointerup');
    this.input.off('pointerupoutside');
    this.children.removeAll(true);
  }

  private showIndex(): void {
    this.clearMain();
    addMonoScreenBackground(this);

    const cx = GAME_WIDTH / 2;
    const pad = ux(20);
    const panelW = contentWidth(20);

    const back = createMonoButton(this, pad + ux(4), getContentTopY(this, 36), '←', 'ghost', ux(48), ux(40));
    bindButtonClick(back, () => this.scene.start('WeekHubScene'));

    createMonoText(this, cx, getContentTopY(this, 36), 'GUIDE', 'label').setOrigin(0.5);
    createMonoText(this, cx, getContentTopY(this, 72), 'How BugEaters works', 'title').setOrigin(0.5);
    createMonoText(this, cx, getContentTopY(this, 100), 'Schemes · short sections · swipe', 'caption').setOrigin(0.5);

    const sections = getEncyclopediaSections();
    const listTop = getContentTopY(this, 128);
    const gap = ux(12);
    let y = listTop + SCROLL_PAD_TOP;

    const listContainer = this.add.container(0, 0).setDepth(20);
    const listH = sections.length * (INDEX_CARD_H + gap) + SCROLL_PAD_TOP + SCROLL_PAD_BOTTOM;
    const viewH = getMenuBottomY(this, 48) - listTop;
    this.setupScroll(listTop, viewH, listContainer, listH, true);

    sections.forEach((section) => {
      const preview = sectionPreview(section.body);
      const card = this.buildIndexCard(pad, y, panelW, section, preview);
      listContainer.add(card);
      y += INDEX_CARD_H + gap;
    });
  }

  private buildIndexCard(
    x: number,
    y: number,
    width: number,
    section: EncyclopediaSection,
    preview: string,
  ): Phaser.GameObjects.Container {
    const card = this.add.container(0, 0);
    const panel = createMonoPanel(this, x, y, { width, height: INDEX_CARD_H, raised: false });
    const glyph = createSectionGlyph(this, section.id, ux(40));
    glyph.setPosition(x + ux(32), y + INDEX_CARD_H / 2);

    const textX = x + ux(64);
    const wrapW = width - ux(80);
    const title = createMonoText(this, textX, y + ux(18), section.title, 'body', 0, 0)
      .setOrigin(0, 0)
      .setWordWrapWidth(wrapW);
    // Keep title to one visual line
    if (title.height > ux(22)) {
      title.setText(truncateToWidth(section.title, title, wrapW));
    }

    const subtitle = createMonoText(this, textX, y + ux(42), preview, 'caption', 0, 0)
      .setOrigin(0, 0)
      .setWordWrapWidth(wrapW);
    if (subtitle.height > ux(18)) {
      subtitle.setText(truncateToWidth(preview, subtitle, wrapW));
    }

    const hit = this.add
      .rectangle(x + width / 2, y + INDEX_CARD_H / 2, width, INDEX_CARD_H, 0x000000, 0)
      .setInteractive({ useHandCursor: true });

    let pressY = 0;
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      pressY = p.y;
    });
    hit.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.y - pressY) > ux(8)) {
        return;
      }
      this.showArticle(section);
    });

    card.add([panel, glyph, title, subtitle, hit]);
    return card;
  }

  private showArticle(section: EncyclopediaSection): void {
    this.clearMain();
    addMonoScreenBackground(this);

    const cx = GAME_WIDTH / 2;
    const pad = ux(20);
    const panelW = contentWidth(20);
    const wrapW = panelW - ux(32);
    const contentX = pad + ux(16);

    const back = createMonoButton(this, pad + ux(4), getContentTopY(this, 36), '←', 'ghost', ux(48), ux(40));
    bindButtonClick(back, () => this.showIndex());

    const titleMaxW = panelW - ux(100);
    const title = createMonoText(
      this,
      cx,
      getContentTopY(this, 36),
      section.title.toUpperCase(),
      'label',
    ).setOrigin(0.5);
    title.setWordWrapWidth(titleMaxW);
    if (title.width > titleMaxW) {
      title.setText(truncateToWidth(section.title.toUpperCase(), title, titleMaxW));
    }

    const bodyTop = getContentTopY(this, 76);
    const bodyBottom = getMenuBottomY(this, 28);
    const viewH = bodyBottom - bodyTop;

    const contentContainer = this.add.container(0, 0).setDepth(20);
    let y = bodyTop + SCROLL_PAD_TOP;

    const blocks = parseGuideBlocks(section.body);
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      if (block.kind === 'spacer') {
        y += ux(block.gap);
        continue;
      }

      if (block.kind === 'diagram') {
        if (!isDiagramId(block.id)) {
          continue;
        }
        const diagram = createEncyclopediaDiagram(this, block.id, panelW);
        diagram.container.setPosition(pad, y);
        contentContainer.add(diagram.container);
        y += diagram.height + ux(18);
        continue;
      }

      if (block.kind === 'heading') {
        const next = blocks[i + 1];
        const bodyText = next?.kind === 'para' ? next.text : null;
        if (bodyText) {
          i += 1;
        }
        const sectionCard = this.buildSectionCard(pad, y, panelW, block.text, bodyText);
        contentContainer.add(sectionCard.container);
        y += sectionCard.height + ux(14);
        continue;
      }

      if (block.kind === 'para') {
        const t = createMonoText(this, contentX, y, block.text, 'body', 0, 0)
          .setOrigin(0, 0)
          .setWordWrapWidth(wrapW);
        contentContainer.add(t);
        y += t.height + ux(14);
      }
    }

    if (section.id === 'abilities') {
      y += ux(4);
      const cards = getAbilityGuideCards();
      for (const ability of cards) {
        const card = this.buildAbilityCard(pad, y, panelW, ability);
        contentContainer.add(card.container);
        y += card.height + ux(12);
      }
    }

    const contentH = y - bodyTop + SCROLL_PAD_BOTTOM;
    this.setupScroll(bodyTop, viewH, contentContainer, contentH);

    if (contentH > viewH) {
      createMonoText(this, cx, bodyBottom - ux(4), 'Swipe to scroll', 'caption').setOrigin(0.5, 1);
    }
  }

  private buildSectionCard(
    x: number,
    y: number,
    width: number,
    heading: string,
    body: string | null,
  ): { container: Phaser.GameObjects.Container; height: number } {
    const root = this.add.container(0, 0);
    const inset = ux(16);
    const wrapW = width - inset * 2;

    const title = gameText(this, x + inset, y + inset, heading.toUpperCase(), {
      fontFamily: MONO_CSS.fontDisplay,
      fontSize: fontSize(12),
      color: MONO_CSS.text,
      fontStyle: 'bold',
    })
      .setOrigin(0, 0)
      .setWordWrapWidth(wrapW);

    let innerH = title.height + ux(10);
    const rule = this.add
      .rectangle(x + inset, y + inset + innerH, Math.min(wrapW, ux(40)), ux(2), MONO.white, 0.5)
      .setOrigin(0, 0);
    innerH += ux(12);

    let para: Phaser.GameObjects.Text | null = null;
    if (body) {
      para = createMonoText(this, x + inset, y + inset + innerH, body, 'body', 0, 0)
        .setOrigin(0, 0)
        .setWordWrapWidth(wrapW);
      innerH += para.height;
    }

    const height = inset * 2 + innerH;
    const panel = createMonoPanel(this, x, y, { width, height, raised: true });
    root.add(panel);
    root.add(title);
    root.add(rule);
    if (para) {
      root.add(para);
    }

    return { container: root, height };
  }

  private buildAbilityCard(
    x: number,
    y: number,
    width: number,
    ability: { name: string; textureKey: string; effect: string },
  ): { container: Phaser.GameObjects.Container; height: number } {
    const root = this.add.container(0, 0);
    const pad = ux(14);
    const iconBox = ux(48);
    const textW = width - pad * 2 - iconBox - ux(12);

    const name = gameText(this, x + pad + iconBox + ux(12), y + pad, ability.name, {
      fontFamily: MONO_CSS.fontDisplay,
      fontSize: fontSize(12),
      color: MONO_CSS.text,
      fontStyle: 'bold',
    })
      .setOrigin(0, 0)
      .setWordWrapWidth(textW);

    const effect = createMonoText(
      this,
      x + pad + iconBox + ux(12),
      y + pad + name.height + ux(6),
      ability.effect,
      'caption',
      0,
      0,
    )
      .setOrigin(0, 0)
      .setWordWrapWidth(textW)
      .setColor(MONO_CSS.textSecondary);

    const height = Math.max(iconBox + pad * 2, pad + name.height + ux(6) + effect.height + pad);
    const panel = createMonoPanel(this, x, y, { width, height, raised: false });

    const iconBg = this.add.rectangle(
      x + pad + iconBox / 2,
      y + pad + iconBox / 2,
      iconBox,
      iconBox,
      MONO.void,
    );
    iconBg.setStrokeStyle(ux(1), MONO.border, 0.9);

    root.add([panel, iconBg, name, effect]);

    if (this.textures.exists(ability.textureKey)) {
      const icon = this.add.image(x + pad + iconBox / 2, y + pad + iconBox / 2, ability.textureKey);
      fitTextureInBox(icon, iconBox - ux(10), iconBox - ux(10));
      root.add(icon);
    }

    return { container: root, height };
  }

  private setupScroll(
    viewportTop: number,
    viewportH: number,
    content: Phaser.GameObjects.Container,
    contentH: number,
    behindButtons = false,
  ): void {
    this.scrollY = 0;
    this.maxScroll = Math.max(0, contentH - viewportH);
    this.scrollContainer = content;

    if (this.scrollMaskGfx) {
      this.scrollMaskGfx.destroy();
    }
    const maskGfx = this.make.graphics({ x: 0, y: 0 });
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(0, viewportTop, GAME_WIDTH, viewportH);
    this.scrollMaskGfx = maskGfx;
    content.setMask(maskGfx.createGeometryMask());

    const hit = this.add
      .rectangle(GAME_WIDTH / 2, viewportTop + viewportH / 2, GAME_WIDTH, viewportH, 0x000000, 0)
      .setInteractive({ useHandCursor: false });
    hit.setDepth(behindButtons ? 5 : 50);

    let dragMoved = false;

    hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      dragMoved = false;
      this.dragStartY = pointer.y;
      this.scrollStartY = this.scrollY;
    });

    const endDrag = () => {
      this.dragging = false;
    };

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging || !this.scrollContainer) {
        return;
      }
      const dy = pointer.y - this.dragStartY;
      if (Math.abs(dy) > ux(6)) {
        dragMoved = true;
      }
      if (!dragMoved) {
        return;
      }
      this.scrollY = Phaser.Math.Clamp(this.scrollStartY - dy, 0, this.maxScroll);
      this.scrollContainer.y = -this.scrollY;
    });

    this.input.on('pointerup', endDrag);
    this.input.on('pointerupoutside', endDrag);
  }
}

type GuideBlock =
  | { kind: 'para'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'diagram'; id: string }
  | { kind: 'spacer'; gap: number };

function parseGuideBlocks(body: string): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  const lines = body.split('\n');
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith(':::diagram ')) {
      const id = trimmed.slice(':::diagram '.length).trim();
      blocks.push({ kind: 'diagram', id });
      i += 1;
      // skip optional blank after fence
      continue;
    }

    if (trimmed.startsWith('### ability:')) {
      // Handled separately via getAbilityGuideCards
      break;
    }

    if (trimmed.startsWith('### ')) {
      blocks.push({ kind: 'heading', text: trimmed.slice(4).trim() });
      i += 1;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      blocks.push({ kind: 'heading', text: trimmed.replace(/^##\s+/, '').trim() });
      i += 1;
      continue;
    }

    if (trimmed === '---') {
      blocks.push({ kind: 'spacer', gap: 10 });
      i += 1;
      continue;
    }

    // Collect paragraph until blank / special fence / heading
    const paraLines: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (
        !t ||
        t.startsWith(':::') ||
        t.startsWith('### ') ||
        t.startsWith('## ') ||
        t === '---'
      ) {
        break;
      }
      paraLines.push(t);
      i += 1;
    }

    if (paraLines.length > 0) {
      const text = paraLines
        .join(' ')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        blocks.push({ kind: 'para', text });
      }
    }
  }

  return blocks;
}

function sectionPreview(body: string): string {
  const plain = body
    .replace(/:::diagram[^\n]*/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/^-\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
  return plain.length > 64 ? `${plain.slice(0, 61)}…` : plain;
}

function truncateToWidth(text: string, sample: Phaser.GameObjects.Text, maxW: number): string {
  if (sample.width <= maxW) {
    return text;
  }
  let lo = 0;
  let hi = text.length;
  let best = text;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = `${text.slice(0, mid).trimEnd()}…`;
    sample.setText(candidate);
    if (sample.width <= maxW) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  sample.setText(best);
  return best;
}
