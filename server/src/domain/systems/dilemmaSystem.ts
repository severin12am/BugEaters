/**
 * Prisoner's Dilemma — same-species proximity encounter (authoritative).
 *
 * Mirrors solo `PrisonersDilemmaManager` / `PRISONERS_DILEMMA_TUNING`, but the
 * server owns start, choices, timeout, and outcomes so both clients cannot cheat.
 */
import type { DilemmaChoice, DilemmaChoiceInput, PlayerId, PlayerState, WorldState } from '../types.js';
import type { SimulationContext } from './context.js';

const PROXIMITY_REACH_PX = 28;
const CHOICE_TIMEOUT_MS = 2_000;
const COOPERATE_BOOST_MS = 4_000;
const BETRAY_BOOST_MS = 5_000;

export interface DilemmaEvent {
  readonly type: 'start' | 'resolve';
  readonly encounterId: string;
  readonly raceMs: number;
  readonly aId: string;
  readonly bId: string;
  readonly deadlineRaceMs?: number;
  readonly outcome?: DilemmaOutcome;
  readonly diedIds?: string[];
  readonly boostedIds?: string[];
}

export type DilemmaOutcome =
  | 'both-cooperate'
  | 'a-eats'
  | 'b-eats'
  | 'both-eat'
  | 'timeout-cooperate';

interface ActiveDilemma {
  readonly id: string;
  readonly aId: PlayerId;
  readonly bId: PlayerId;
  readonly startedAtMs: number;
  readonly deadlineMs: number;
  aChoice: DilemmaChoice | null;
  bChoice: DilemmaChoice | null;
  resolved: boolean;
}

/** Bookkeeping hung off WorldState via a WeakMap so types stay lean. */
const dilemmasByWorld = new WeakMap<WorldState, {
  active: Map<string, ActiveDilemma>;
  seenPairs: Set<string>;
}>();

function book(world: WorldState) {
  let state = dilemmasByWorld.get(world);
  if (!state) {
    state = { active: new Map(), seenPairs: new Set() };
    dilemmasByWorld.set(world, state);
  }
  return state;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Scan for new encounters + resolve timeouts. Call once per racing tick. */
export function tickDilemmas(world: WorldState, ctx: SimulationContext): DilemmaEvent[] {
  const events: DilemmaEvent[] = [];
  const state = book(world);

  // Timeouts → both cooperate.
  for (const encounter of state.active.values()) {
    if (encounter.resolved) {
      continue;
    }
    if (ctx.raceMs >= encounter.deadlineMs) {
      if (!encounter.aChoice) {
        encounter.aChoice = 'cooperate';
      }
      if (!encounter.bChoice) {
        encounter.bChoice = 'cooperate';
      }
      events.push(...resolveEncounter(encounter, world, ctx, 'timeout-cooperate'));
    }
  }

  // Start new encounters for close same-role pairs.
  const living = [...world.players.values()].filter((p) => !p.died && !p.finished);
  for (let i = 0; i < living.length; i++) {
    for (let j = i + 1; j < living.length; j++) {
      const a = living[i];
      const b = living[j];
      if (a.role !== b.role) {
        continue;
      }
      if (ctx.raceMs < a.flightUntilMs || ctx.raceMs < b.flightUntilMs) {
        continue;
      }
      if (Math.abs(a.distance - b.distance) > PROXIMITY_REACH_PX) {
        continue;
      }
      if (Math.abs(a.x - b.x) > PROXIMITY_REACH_PX * 1.5) {
        continue;
      }
      const key = pairKey(a.id, b.id);
      if (state.seenPairs.has(key)) {
        continue;
      }
      // Don't stack while either is already choosing.
      if (playerInActiveDilemma(state, a.id) || playerInActiveDilemma(state, b.id)) {
        continue;
      }

      state.seenPairs.add(key);
      const id = `${key}:${ctx.raceMs}`;
      const encounter: ActiveDilemma = {
        id,
        aId: a.id,
        bId: b.id,
        startedAtMs: ctx.raceMs,
        deadlineMs: ctx.raceMs + CHOICE_TIMEOUT_MS,
        aChoice: null,
        bChoice: null,
        resolved: false,
      };
      state.active.set(id, encounter);
      events.push({
        type: 'start',
        encounterId: id,
        raceMs: ctx.raceMs,
        aId: a.id,
        bId: b.id,
        deadlineRaceMs: encounter.deadlineMs,
      });
    }
  }

  return events;
}

function playerInActiveDilemma(
  state: { active: Map<string, ActiveDilemma> },
  id: PlayerId,
): boolean {
  for (const e of state.active.values()) {
    if (!e.resolved && (e.aId === id || e.bId === id)) {
      return true;
    }
  }
  return false;
}

/** Apply a player's dilemma choice. Returns resolve events when both have chosen. */
export function applyDilemmaChoice(
  actor: PlayerState,
  input: DilemmaChoiceInput,
  world: WorldState,
  ctx: SimulationContext,
): DilemmaEvent[] {
  const state = book(world);
  const encounter = state.active.get(input.encounterId);
  if (!encounter || encounter.resolved) {
    return [];
  }
  if (actor.id !== encounter.aId && actor.id !== encounter.bId) {
    return [];
  }
  if (input.choice !== 'cooperate' && input.choice !== 'eat') {
    return [];
  }

  if (actor.id === encounter.aId) {
    encounter.aChoice = input.choice;
  } else {
    encounter.bChoice = input.choice;
  }

  if (encounter.aChoice && encounter.bChoice) {
    return resolveEncounter(encounter, world, ctx);
  }
  return [];
}

function resolveEncounter(
  encounter: ActiveDilemma,
  world: WorldState,
  ctx: SimulationContext,
  forcedOutcome?: DilemmaOutcome,
): DilemmaEvent[] {
  if (encounter.resolved) {
    return [];
  }
  encounter.resolved = true;

  const a = world.players.get(encounter.aId);
  const b = world.players.get(encounter.bId);
  const aChoice = encounter.aChoice ?? 'cooperate';
  const bChoice = encounter.bChoice ?? 'cooperate';

  let outcome: DilemmaOutcome = forcedOutcome ?? matrix(aChoice, bChoice);
  const diedIds: string[] = [];
  const boostedIds: string[] = [];

  if (ctx.config.immortal && (outcome === 'a-eats' || outcome === 'b-eats' || outcome === 'both-eat')) {
    // Soften kills under immortality — treat as cooperate boost instead.
    outcome = 'both-cooperate';
  }

  switch (outcome) {
    case 'both-cooperate':
    case 'timeout-cooperate':
      if (a && !a.died) {
        a.boostUntilMs = Math.max(a.boostUntilMs, ctx.raceMs + COOPERATE_BOOST_MS);
        boostedIds.push(a.id);
      }
      if (b && !b.died) {
        b.boostUntilMs = Math.max(b.boostUntilMs, ctx.raceMs + COOPERATE_BOOST_MS);
        boostedIds.push(b.id);
      }
      break;
    case 'a-eats':
      if (b && !b.died) {
        b.died = true;
        diedIds.push(b.id);
      }
      if (a && !a.died) {
        a.boostUntilMs = Math.max(a.boostUntilMs, ctx.raceMs + BETRAY_BOOST_MS);
        boostedIds.push(a.id);
      }
      break;
    case 'b-eats':
      if (a && !a.died) {
        a.died = true;
        diedIds.push(a.id);
      }
      if (b && !b.died) {
        b.boostUntilMs = Math.max(b.boostUntilMs, ctx.raceMs + BETRAY_BOOST_MS);
        boostedIds.push(b.id);
      }
      break;
    case 'both-eat':
      if (a && !a.died) {
        a.died = true;
        diedIds.push(a.id);
      }
      if (b && !b.died) {
        b.died = true;
        diedIds.push(b.id);
      }
      break;
  }

  return [
    {
      type: 'resolve',
      encounterId: encounter.id,
      raceMs: ctx.raceMs,
      aId: encounter.aId,
      bId: encounter.bId,
      outcome,
      diedIds,
      boostedIds,
    },
  ];
}

function matrix(aChoice: DilemmaChoice, bChoice: DilemmaChoice): DilemmaOutcome {
  if (aChoice === 'cooperate' && bChoice === 'cooperate') {
    return 'both-cooperate';
  }
  if (aChoice === 'eat' && bChoice === 'cooperate') {
    return 'a-eats';
  }
  if (aChoice === 'cooperate' && bChoice === 'eat') {
    return 'b-eats';
  }
  return 'both-eat';
}
