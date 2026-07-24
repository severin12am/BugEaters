import { CharacterType } from './constants';

/**
 * Rock-paper-scissors food chain for BugEaters:
 * Bug → Klaus → Human → Bug
 */
const EATS: Record<CharacterType, CharacterType> = {
  [CharacterType.Bug]: CharacterType.Klaus,
  [CharacterType.Klaus]: CharacterType.Human,
  [CharacterType.Human]: CharacterType.Bug,
};

/** True when `eater` can consume `prey` in the lane interaction rules. */
export function canEat(eater: CharacterType, prey: CharacterType): boolean {
  return EATS[eater] === prey;
}
