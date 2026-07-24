/**
 * Prisoner's Dilemma when two runners of the same species get close.
 */
export const PRISONERS_DILEMMA_TUNING = {
  /** How close (logical px) before a choice is offered. */
  proximityReach: 28,
  /** Time allowed to pick cooperate / eat (ms). */
  choiceTimeoutMs: 2000,
  /** How long the auto-cooperate choice stays visible before resolving (ms). */
  autoCooperateFlashMs: 450,
  /** Speed multiplier after both cooperate. */
  cooperateBoostMultiplier: 1.5,
  cooperateBoostDurationSec: 4,
  /** Speed multiplier for the eater after betraying. */
  betrayBoostMultiplier: 1.5,
  betrayBoostDurationSec: 5,
  /** NPCs always cooperate (solo filler + same-species rival). */
  npcCooperateChance: 1,
} as const;

export type DilemmaChoice = 'cooperate' | 'eat';

export type DilemmaOutcome =
  | 'both-cooperate'
  | 'player-eats'
  | 'player-eaten'
  | 'both-eat'
  | 'timeout-cooperate';
