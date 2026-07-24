// Mirror of src/utils/eatingRules.ts, kept dependency-free for Deno.
// Food chain: Bug -> Klaus -> Human -> Bug.
export type CharacterType = 'bug' | 'human' | 'klaus';

const EATS: Record<CharacterType, CharacterType> = {
  bug: 'klaus',
  klaus: 'human',
  human: 'bug',
};

export function canEat(eater: CharacterType, prey: CharacterType): boolean {
  return EATS[eater] === prey;
}
