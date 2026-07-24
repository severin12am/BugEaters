import { CharacterType } from '../utils/constants';

/** Total runners per race (real players + bots combined). */
export const RACE_COMPOSITION = {
  [CharacterType.Bug]: 3,
  [CharacterType.Human]: 2,
  [CharacterType.Klaus]: 1,
} as const;

/** All sub-lane indices (global 0–8) in a character's main lane. */
export function getSubLaneRangeForCharacter(type: CharacterType): number[] {
  const low = type === CharacterType.Bug ? 0 : type === CharacterType.Human ? 3 : 6;
  return [low, low + 1, low + 2];
}

export interface NpcSpawnSlot {
  type: CharacterType;
  globalSubLane: number;
}

/**
 * Bot slots to fill a race roster. Real players (local + remote) occupy slots
 * first; bots only fill remaining empty slots up to each species' cap.
 *
 * Example: 2 human players in slots 3 and 5 → zero human bots (not 2 bots + 2 humans).
 */
export function getNpcSpawnSlotsForRace(occupiedRealPlayerSlots: number[]): NpcSpawnSlot[] {
  const occupied = new Set(occupiedRealPlayerSlots);
  const slots: NpcSpawnSlot[] = [];

  for (const type of [CharacterType.Bug, CharacterType.Human, CharacterType.Klaus]) {
    const range = getSubLaneRangeForCharacter(type);
    const maxCount = RACE_COMPOSITION[type];
    const realCount = range.filter((lane) => occupied.has(lane)).length;
    let botsNeeded = Math.max(0, maxCount - realCount);

    for (const globalSubLane of range) {
      if (botsNeeded <= 0) {
        break;
      }
      if (occupied.has(globalSubLane)) {
        continue;
      }
      slots.push({ type, globalSubLane });
      botsNeeded -= 1;
    }
  }

  return slots;
}

/** @deprecated Use getNpcSpawnSlotsForRace. */
export function getNpcSpawnSlots(_playerType: CharacterType): NpcSpawnSlot[] {
  return getNpcSpawnSlotsForRace([]);
}
