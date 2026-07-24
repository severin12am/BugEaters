import { CharacterType } from '../utils/constants';
import { TOURNAMENT_CONFIG } from './tournamentConfig';

/** Weighted random role preserving configured species ratio (e.g. 3:2:1). */
export function assignRoleFromRatio(): CharacterType {
  const { bug, human, klaus } = TOURNAMENT_CONFIG.speciesRatio;
  const total = bug + human + klaus;
  const roll = Math.random() * total;
  if (roll < bug) {
    return CharacterType.Bug;
  }
  if (roll < bug + human) {
    return CharacterType.Human;
  }
  return CharacterType.Klaus;
}
