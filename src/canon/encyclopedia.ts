/**
 * Player encyclopedia — parsed from the single master file `content/encyclopedia.md`.
 *
 * Ability display names come from `src/config/abilities.ts` (no duplicate names).
 * Effect copy for each ability lives only in the `### ability:<id>` blocks in the MD file.
 * Diagrams use `:::diagram <id>` fences (see `encyclopediaDiagrams.ts`).
 */

import { ABILITIES } from '../config/abilities';
import encyclopediaMd from '../../content/encyclopedia.md?raw';

export interface EncyclopediaSection {
  id: string;
  title: string;
  body: string;
}

export interface AbilityGuideCard {
  id: string;
  name: string;
  textureKey: string;
  effect: string;
}

const ABILITY_HEADING = /^### ability:([a-z0-9-]+)\s*$/im;

function parseSections(markdown: string): EncyclopediaSection[] {
  const chunks = markdown.split(/\n(?=## )/);
  const sections: EncyclopediaSection[] = [];

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed.startsWith('## ')) {
      continue;
    }

    const firstLineEnd = trimmed.indexOf('\n');
    const headerLine = firstLineEnd === -1 ? trimmed : trimmed.slice(0, firstLineEnd);
    const rest = firstLineEnd === -1 ? '' : trimmed.slice(firstLineEnd + 1).trim();

    const headerBody = headerLine.slice(3).trim();
    const pipe = headerBody.indexOf(' | ');
    const id = pipe >= 0 ? headerBody.slice(0, pipe).trim() : slugify(headerBody);
    const title = pipe >= 0 ? headerBody.slice(pipe + 3).trim() : headerBody;

    sections.push({ id, title, body: rest });
  }

  return sections;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractAbilityCards(body: string): AbilityGuideCard[] {
  const byId = new Map(ABILITIES.map((a) => [a.id, a]));
  const cards: AbilityGuideCard[] = [];
  const re = new RegExp(ABILITY_HEADING.source, 'gm');
  let match: RegExpExecArray | null;

  while ((match = re.exec(body)) !== null) {
    const abilityId = match[1];
    const ability = byId.get(abilityId);
    const contentStart = match.index + match[0].length;
    const nextHeading = body.slice(contentStart).search(/\n### ability:/);
    const blockEnd = nextHeading === -1 ? body.length : contentStart + nextHeading;
    const effectText = body
      .slice(contentStart, blockEnd)
      .trim()
      .replace(/\*\*/g, '');

    if (ability) {
      cards.push({
        id: ability.id,
        name: ability.name,
        textureKey: ability.textureKey,
        effect: effectText,
      });
    }
  }

  return cards;
}

/** Intro copy for abilities (everything before the first ability block). */
function abilityIntro(body: string): string {
  const introEnd = body.search(ABILITY_HEADING);
  return introEnd === -1 ? body : body.slice(0, introEnd).trim();
}

function prepareSections(raw: string): EncyclopediaSection[] {
  return parseSections(raw).map((section) => {
    if (section.id !== 'abilities') {
      return section;
    }
    return {
      ...section,
      body: abilityIntro(section.body),
    };
  });
}

let cached: EncyclopediaSection[] | null = null;
let cachedAbilityCards: AbilityGuideCard[] | null = null;

/** All encyclopedia sections (from `content/encyclopedia.md`). */
export function getEncyclopediaSections(): EncyclopediaSection[] {
  if (!cached) {
    cached = prepareSections(encyclopediaMd);
  }
  return cached;
}

export function getEncyclopediaSection(id: string): EncyclopediaSection | undefined {
  return getEncyclopediaSections().find((s) => s.id === id);
}

/** Ability cards for the Guide — names/icons from config, effects from MD. */
export function getAbilityGuideCards(): AbilityGuideCard[] {
  if (!cachedAbilityCards) {
    const raw = parseSections(encyclopediaMd).find((s) => s.id === 'abilities');
    cachedAbilityCards = raw ? extractAbilityCards(raw.body) : [];
  }
  return cachedAbilityCards;
}

/** Path to the master file (for docs cross-links). */
export const ENCYCLOPEDIA_MASTER_PATH = 'content/encyclopedia.md';
