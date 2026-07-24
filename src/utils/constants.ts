/**
 * Global game constants for BugEaters.
 * Gameplay numbers live in config/tuning.ts — this file wires them into the engine.
 */

import { TUNING } from '../config/tuning';
import { DISPLAY_DPR, GAME_HEIGHT, GAME_WIDTH, ux } from './layout';

export { DISPLAY_DPR, GAME_HEIGHT, GAME_WIDTH, ux };

/** Re-export tuning for convenient access in scenes. */
export { TUNING };

export const RACE_DURATION_SEC = TUNING.race.durationSec;

/** Lane indices: 0 = Bugs (left), 1 = Humans (center), 2 = Klaus (right). */
export const LANE_COUNT = 3;

export const BASE_SCROLL_SPEED = ux(TUNING.physics.scrollSpeed);
export const JUMP_VELOCITY = ux(TUNING.physics.jumpVelocity);
export const GRAVITY = ux(TUNING.physics.gravity);
export const RACE_DISTANCE = BASE_SCROLL_SPEED * RACE_DURATION_SEC;

export enum CharacterType {
  Bug = 'bug',
  Human = 'human',
  Klaus = 'klaus',
}

export const COLORS = {
  black: 0x000000,
  /** Road + world fill — near black. */
  road: 0x080808,
  white: 0xffffff,
  gray: 0x888888,
  darkGray: 0x333333,
  blood: 0xcc0000,
  laneLine: 0x444444,
} as const;

export const CHARACTER_LABELS: Record<CharacterType, string> = {
  [CharacterType.Bug]: 'BUG',
  [CharacterType.Human]: 'HUMAN',
  [CharacterType.Klaus]: 'KLAUS',
};

export const CHARACTER_DESCRIPTIONS: Record<CharacterType, string> = {
  [CharacterType.Bug]: 'Fast swarm runner',
  [CharacterType.Human]: 'Balanced survivor',
  [CharacterType.Klaus]: 'Chaos in the right lane',
};
