import { TUNING } from './tuning';
import { CharacterType } from '../utils/constants';

/** Walk-cycle frames extracted from the Unity WebGL build (old_unity_game). */
export const CHARACTER_WALK_FRAMES: Record<CharacterType, number> = {
  [CharacterType.Bug]: 10,
  [CharacterType.Human]: 6,
  [CharacterType.Klaus]: 5,
};

/** Sub-lane width in logical px — character width must not exceed this. */
const SUB_LANE_WIDTH = TUNING.lanes.subLaneSpacing;

/** Max sprite width ÷ height from exported walk frames. */
const CHARACTER_MAX_ASPECT: Record<CharacterType, number> = {
  [CharacterType.Bug]: 620 / 787,
  [CharacterType.Human]: 411 / 189,
  [CharacterType.Klaus]: 501 / 397,
};

function capHeightToSubLane(logicalHeight: number, type: CharacterType): number {
  const maxHeight = SUB_LANE_WIDTH / CHARACTER_MAX_ASPECT[type];
  return Math.min(logicalHeight, maxHeight);
}

/** Target on-screen height in logical pixels (scaled with ux in RunnerCharacter). */
export const CHARACTER_DISPLAY_HEIGHT: Record<CharacterType, number> = {
  [CharacterType.Bug]: (52 / 1.5) * 0.7,
  [CharacterType.Human]: capHeightToSubLane(20, CharacterType.Human),
  [CharacterType.Klaus]: capHeightToSubLane(22, CharacterType.Klaus),
};

/** Walk-cycle frame rate. */
export const CHARACTER_FRAME_RATE: Record<CharacterType, number> = {
  [CharacterType.Bug]: 72,
  [CharacterType.Human]: 12,
  [CharacterType.Klaus]: 12,
};

export function characterTextureKey(type: CharacterType, frameIndex: number): string {
  return `${type}-walk-${frameIndex}`;
}

export function characterAtlasKey(type: CharacterType): string {
  return `${type}-atlas`;
}

export function characterRunAnimKey(type: CharacterType): string {
  return `${type}-run`;
}

export function characterFramePath(type: CharacterType, frameIndex: number): string {
  const num = String(frameIndex).padStart(2, '0');
  return `assets/characters/${type}/${num}.png`;
}

/** Baked atlas cell size in game pixels (set during BootScene bake). */
export const CHARACTER_ATLAS_CELL_PX: Partial<
  Record<CharacterType, { width: number; height: number }>
> = {};
