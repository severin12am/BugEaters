/**
 * Portable constants for the iOS port (no Phaser).
 * Copy into src/utils/constants.ts in the Expo app.
 */
import { TUNING } from '../config/tuning';

export const LOGICAL_WIDTH = 390;
export const LOGICAL_HEIGHT = 844;

/** Call with runtime DPR: Math.min(PixelRatio.get(), 2) */
export function ux(value: number, dpr: number): number {
  return Math.round(value * dpr);
}

export const RACE_DURATION_SEC = TUNING.race.durationSec;
export const LANE_COUNT = 3;

export enum CharacterType {
  Bug = 'bug',
  Human = 'human',
  Klaus = 'klaus',
}

export const COLORS = {
  black: '#000000',
  road: '#080808',
  white: '#ffffff',
  gray: '#888888',
  darkGray: '#333333',
  blood: '#cc0000',
  laneLine: '#444444',
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

/** Logical px/sec — multiply with ux() at runtime for game space. */
export function raceDistance(dpr: number): number {
  return ux(TUNING.physics.scrollSpeed, dpr) * RACE_DURATION_SEC;
}
