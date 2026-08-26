/**
 * Playtest / first-run icons: who eats whom, and what the road objects do.
 * Uses the same character atlases and prop textures as the race.
 */
import Phaser from 'phaser';
import { ABILITIES } from '../config/abilities';
import { characterAtlasKey } from '../config/characterAssets';
import { PROP_TEXTURE_KEYS } from '../config/propAssets';
import { CharacterType, CHARACTER_LABELS, ux } from '../utils/constants';
import { fitTextureInBox, gameText } from '../utils/display';
import { fontSize } from '../utils/layout';
import { MONO, MONO_CSS } from './theme';

export interface GuideIconBlock {
  container: Phaser.GameObjects.Container;
  height: number;
}

const EAT_PAIRS: ReadonlyArray<readonly [CharacterType, CharacterType]> = [
  [CharacterType.Bug, CharacterType.Klaus],
  [CharacterType.Klaus, CharacterType.Human],
  [CharacterType.Human, CharacterType.Bug],
];

/** Static portrait from the baked walk atlas (frame 0). */
export function createCharacterIcon(
  scene: Phaser.Scene,
  type: CharacterType,
  maxW: number,
  maxH: number,
): Phaser.GameObjects.Image | Phaser.GameObjects.Arc {
  const atlas = characterAtlasKey(type);
  if (scene.textures.exists(atlas)) {
    const image = scene.add.image(0, 0, atlas, 0);
    fitTextureInBox(image, maxW, maxH);
    return image;
  }
  const fallback = scene.add.circle(0, 0, Math.min(maxW, maxH) / 2, MONO.surface);
  fallback.setStrokeStyle(ux(1.5), MONO.borderStrong, 0.9);
  return fallback;
}

/** Three rows: Bug eats Klaus, Klaus eats Human, Human eats Bug. */
export function createFoodChainIconRows(scene: Phaser.Scene, width: number): GuideIconBlock {
  const root = scene.add.container(0, 0);
  const rowH = ux(62);
  const iconBox = ux(52);
  const gap = ux(6);
  const eatsW = ux(52);

  EAT_PAIRS.forEach((pair, i) => {
    const [eater, prey] = pair;
    const cy = i * (rowH + gap) + rowH / 2;
    const eaterX = width * 0.22;
    const preyX = width * 0.78;
    const midX = width * 0.5;

    const eaterIcon = createCharacterIcon(scene, eater, iconBox, iconBox);
    eaterIcon.setPosition(eaterX, cy - ux(8));
    const preyIcon = createCharacterIcon(scene, prey, iconBox, iconBox);
    preyIcon.setPosition(preyX, cy - ux(8));

    const chip = scene.add.rectangle(midX, cy - ux(8), eatsW, ux(22), MONO.blood);
    const eats = gameText(scene, midX, cy - ux(8), 'EATS', {
      fontFamily: MONO_CSS.fontDisplay,
      fontSize: fontSize(10),
      color: MONO_CSS.text,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const eaterName = gameText(scene, eaterX, cy + ux(20), CHARACTER_LABELS[eater], {
      fontFamily: MONO_CSS.fontDisplay,
      fontSize: fontSize(10),
      color: MONO_CSS.textMuted,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const preyName = gameText(scene, preyX, cy + ux(20), CHARACTER_LABELS[prey], {
      fontFamily: MONO_CSS.fontDisplay,
      fontSize: fontSize(10),
      color: MONO_CSS.textMuted,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    root.add([eaterIcon, preyIcon, chip, eats, eaterName, preyName]);
  });

  const height = EAT_PAIRS.length * (rowH + gap) - gap;
  return { container: root, height };
}

type RoadItem = {
  title: string;
  note: string;
  textureKey: string;
};

function roadItems(scene: Phaser.Scene): RoadItem[] {
  const power = ABILITIES.find((ability) => ability.spawnsOnRoad && scene.textures.exists(ability.textureKey));
  return [
    {
      title: 'TRASH',
      note: 'Stops you. Change lane — you cannot jump a bin.',
      textureKey: PROP_TEXTURE_KEYS.trashBin,
    },
    {
      title: 'HOLE',
      note: 'Open manhole kills. Closed lid is safe.',
      textureKey: PROP_TEXTURE_KEYS.manholeOpen,
    },
    {
      title: 'PUDDLE',
      note: 'Boost when you leave it.',
      textureKey: PROP_TEXTURE_KEYS.puddle,
    },
    {
      title: 'POWER',
      note: 'Pick up. Tap the armed slot to fire.',
      textureKey: power?.textureKey ?? PROP_TEXTURE_KEYS.passport,
    },
  ];
}

/** 2×2 legend: trash, hole, puddle, briefcase/power. */
export function createRoadItemLegend(scene: Phaser.Scene, width: number): GuideIconBlock {
  const root = scene.add.container(0, 0);
  const items = roadItems(scene);
  const gap = ux(10);
  const cellW = (width - gap) / 2;
  const cellH = ux(104);
  const iconBox = ux(40);

  items.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = col * (cellW + gap);
    const y = row * (cellH + gap);
    const cx = x + cellW / 2;

    const box = scene.add.rectangle(cx, y + cellH / 2, cellW, cellH, MONO.void);
    box.setStrokeStyle(ux(1), MONO.border, 0.85);
    root.add(box);

    if (scene.textures.exists(item.textureKey)) {
      const icon = scene.add.image(cx, y + ux(28), item.textureKey);
      fitTextureInBox(icon, iconBox, iconBox);
      root.add(icon);
    }

    const title = gameText(scene, cx, y + ux(52), item.title, {
      fontFamily: MONO_CSS.fontDisplay,
      fontSize: fontSize(11),
      color: MONO_CSS.text,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const note = gameText(scene, cx, y + ux(66), item.note, {
      fontFamily: MONO_CSS.fontBody,
      fontSize: fontSize(11),
      color: MONO_CSS.textMuted,
    }).setOrigin(0.5, 0);
    note.setWordWrapWidth(cellW - ux(12));
    note.setAlign('center');
    root.add([title, note]);
  });

  const height = 2 * cellH + gap;
  return { container: root, height };
}
