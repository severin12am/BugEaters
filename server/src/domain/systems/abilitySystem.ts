/**
 * Ability system — resolves player ability activations authoritatively.
 *
 * GAME-SPECIFIC: abilities are one of the fastest-changing parts of a game. This
 * file is the single place where an ability's *effect on the world* is decided.
 * The client only requests activation; the server decides what actually happens.
 *
 * Design intent: keep each ability's effect small and data-driven so new ones
 * can be added without touching the simulation loop.
 */
import type { ActivateAbilityInput, PlayerState, WorldState } from '../types.js';
import type { SimulationContext } from './context.js';

/** The visible outcome of an ability activation, surfaced to clients as an event. */
export interface AbilityEvent {
  readonly actorId: string;
  readonly abilityId: string;
  readonly raceMs: number;
  /** Ids eliminated by this activation (targeted abilities), for VFX/feedback. */
  readonly eliminatedIds?: string[];
}

/** Duration of the `speed-up` self boost (ms). */
const SPEED_UP_DURATION_MS = 3_000;

/**
 * Applies an ability if the player actually holds it. Returns an event to
 * broadcast, or null if the activation was invalid (and thus ignored).
 *
 * The player must "own" the ability — the server is the authority on inventory,
 * so a client cannot fire abilities it never picked up.
 */
export function applyAbility(
  actor: PlayerState,
  input: ActivateAbilityInput,
  world: WorldState,
  ctx: SimulationContext,
): AbilityEvent | null {
  if (!actor.abilities.includes(input.abilityId)) {
    return null;
  }
  // Consume the ability from inventory.
  actor.abilities = actor.abilities.filter((id) => id !== input.abilityId);

  // TODO(game-rules): grow this into a data-driven ability registry (id ->
  // handler) as more abilities gain real effects. Unknown ids are accepted but
  // inert so a new client ability never crashes an in-flight race.
  let eliminatedIds: string[] | undefined;
  switch (input.abilityId) {
    case 'needle-spawner':
      eliminatedIds = ctx.config.immortal ? [] : applyTargetedElimination(actor, input, world);
      break;
    case 'speed-up':
      actor.boostUntilMs = ctx.raceMs + SPEED_UP_DURATION_MS;
      break;
    default:
      break;
  }

  return { actorId: actor.id, abilityId: input.abilityId, raceMs: ctx.raceMs, eliminatedIds };
}

/** Reference targeted ability: eliminates rivals near the aim point. */
function applyTargetedElimination(
  actor: PlayerState,
  input: ActivateAbilityInput,
  world: WorldState,
): string[] {
  if (input.aimX === undefined) {
    return [];
  }
  const RADIUS_PX = 44;
  const eliminated: string[] = [];
  for (const target of world.players.values()) {
    if (target.id === actor.id || target.died || target.finished) {
      continue;
    }
    if (Math.abs(target.x - input.aimX) <= RADIUS_PX) {
      target.died = true;
      eliminated.push(target.id);
    }
  }
  return eliminated;
}
