import type Phaser from 'phaser';

/** Unity `AbilityTrigger` pickups — values from `Assets/Prefab/Special/Abilities`. */
export type AbilityKind =
  | 'disableBarriers'
  | 'disableObstacles'
  | 'enableID'
  | 'enableFlashLight'
  | 'flightMode'
  | 'hellMode'
  | 'immortality'
  | 'spawnNeedle'
  | 'posAligment'
  | 'slowDownOther'
  | 'speedUp'
  | 'spawnStraw';

export interface AbilityDef {
  id: string;
  kind: AbilityKind;
  name: string;
  description: string;
  /** Unity `param` — meaning depends on `kind` (e.g. speedUp multiplier). */
  param: number;
  textureKey: string;
  texturePath: string;
  /** Included in road spawners (Unity ships 11 of 12; flight mode omitted). */
  spawnsOnRoad: boolean;
}

export const ABILITY_MAX_SLOTS = 3;
export const ABILITY_SPEED_UP_DURATION_SEC = 10;
export const ABILITY_DEFAULT_DURATION_SEC = 10;
/** DAVOS BROS — short airborne window. */
export const ABILITY_FLIGHT_DURATION_SEC = 5;

const path = (slug: string) => `assets/props/abilities/${slug}.png`;

export const ABILITIES: readonly AbilityDef[] = [
  {
    id: 'disable-barriers',
    kind: 'disableBarriers',
    name: 'OPENED BORDERS',
    description: 'Who opened them?',
    param: 10,
    textureKey: 'ability-disable-barriers',
    texturePath: path('disable-barriers'),
    spawnsOnRoad: true,
  },
  {
    id: 'disable-obstacles',
    kind: 'disableObstacles',
    name: 'BLACKROCK',
    description: "We're all on the same boat",
    param: 10,
    textureKey: 'ability-disable-obstacles',
    texturePath: path('disable-obstacles'),
    spawnsOnRoad: true,
  },
  {
    id: 'enable-id',
    kind: 'enableID',
    name: 'DIGITAL ID',
    description: "It's gonna make your life easier",
    param: 10,
    textureKey: 'ability-enable-id',
    texturePath: path('enable-id'),
    spawnsOnRoad: true,
  },
  {
    id: 'flashlight',
    kind: 'enableFlashLight',
    name: 'NEXUS SAPIENS',
    description: 'Now you see',
    param: 10,
    textureKey: 'ability-flashlight',
    texturePath: path('flashlight'),
    spawnsOnRoad: true,
  },
  {
    id: 'flight-mode',
    kind: 'flightMode',
    name: 'DAVOS BROS',
    description: 'No obstacles for Davos Bros',
    param: 5,
    textureKey: 'ability-flight-mode',
    texturePath: path('flight-mode'),
    spawnsOnRoad: true,
  },
  {
    id: 'hell-mode',
    kind: 'hellMode',
    name: 'SDG',
    description: '"S" stands for slow',
    param: 10,
    textureKey: 'ability-hell-mode',
    texturePath: path('hell-mode'),
    spawnsOnRoad: true,
  },
  {
    id: 'immortality',
    kind: 'immortality',
    name: 'SHAREHOLDER',
    description: 'Nobody harms the shareholder',
    param: 10,
    textureKey: 'ability-immortality',
    texturePath: path('immortality'),
    spawnsOnRoad: true,
  },
  {
    id: 'needle-spawner',
    kind: 'spawnNeedle',
    name: 'WUHAN LAB JUICE',
    description: "It doesn't have 99.7% survival rate",
    param: 0,
    textureKey: 'ability-needle-spawner',
    texturePath: path('needle-spawner'),
    spawnsOnRoad: true,
  },
  {
    id: 'pos-alignment',
    kind: 'posAligment',
    name: 'GREAT RESET',
    description: 'Yes, The Great Reset',
    param: 0,
    textureKey: 'ability-pos-alignment',
    texturePath: path('pos-alignment'),
    spawnsOnRoad: true,
  },
  {
    id: 'slowdown-other',
    kind: 'slowDownOther',
    name: 'TAXATION WITHOUT LEGISLATION',
    description: "It's transitory anyway",
    param: 0,
    textureKey: 'ability-slowdown-other',
    texturePath: path('slowdown-other'),
    spawnsOnRoad: true,
  },
  {
    id: 'speed-up',
    kind: 'speedUp',
    name: 'CBDC RUN',
    description: 'You have 10 seconds before it expires',
    param: 1.5,
    textureKey: 'ability-speed-up',
    texturePath: path('speed-up'),
    spawnsOnRoad: true,
  },
  {
    id: 'straw-spawner',
    kind: 'spawnStraw',
    name: 'PAPER STRAW',
    description: "It's surely gonna stop it",
    param: 0,
    textureKey: 'ability-straw-spawner',
    texturePath: path('straw-spawner'),
    spawnsOnRoad: true,
  },
] as const;

const byId = new Map(ABILITIES.map((a) => [a.id, a]));

export function getAbility(id: string): AbilityDef {
  const ability = byId.get(id);
  if (!ability) {
    throw new Error(`Unknown ability: ${id}`);
  }
  return ability;
}

export const ROAD_SPAWNABLE_ABILITIES = ABILITIES.filter((a) => a.spawnsOnRoad);

export function preloadAbilityAssets(scene: Phaser.Scene): void {
  for (const ability of ABILITIES) {
    scene.load.image(ability.textureKey, ability.texturePath);
  }
}
