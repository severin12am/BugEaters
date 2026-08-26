/**
 * Ability system — resolves player ability activations authoritatively.
 *
 * Mirrors the solo client's 12 briefcase abilities (see `src/config/abilities.ts`).
 * The client only requests activation (+ optional aim/place); the server decides.
 */
import type { ActivateAbilityInput, Hazard, PlayerState, WorldState } from '../types.js';
import type { SimulationContext } from './context.js';
import { laneCenterX } from './movementSystem.js';

/** The visible outcome of an ability activation, surfaced to clients as an event. */
export interface AbilityEvent {
  readonly actorId: string;
  readonly abilityId: string;
  readonly raceMs: number;
  /** Ids eliminated by this activation (targeted abilities), for VFX/feedback. */
  readonly eliminatedIds?: string[];
  /** Optional placeable spawn for client VFX. */
  readonly placedHazardId?: number;
}

/** Road-spawnable ability ids — must match client `ROAD_SPAWNABLE_ABILITIES`. */
export const PICKUP_ABILITY_POOL = [
  'disable-barriers',
  'disable-obstacles',
  'enable-id',
  'flashlight',
  'flight-mode',
  'hell-mode',
  'immortality',
  'needle-spawner',
  'pos-alignment',
  'slowdown-other',
  'speed-up',
  'straw-spawner',
] as const;

const DEFAULT_DURATION_MS = 10_000;
const SPEED_UP_DURATION_MS = 10_000;
const FLIGHT_DURATION_MS = 5_000;
const SPEED_UP_MULTIPLIER = 1.5;
const NPC_SLOW_MULTIPLIER = 0.34;
const NEEDLE_RADIUS_PX = 44;
const PLACE_AHEAD_MAX_PX = 320;
const PLACE_AHEAD_MIN_PX = 16;
const ARMED_PLACE_MS = 10_000;

export { SPEED_UP_MULTIPLIER, NPC_SLOW_MULTIPLIER };

/**
 * Applies an ability if the player holds it. Returns an event to broadcast, or
 * null if the activation was invalid.
 */
export function applyAbility(
  actor: PlayerState,
  input: ActivateAbilityInput,
  world: WorldState,
  ctx: SimulationContext,
): AbilityEvent | null {
  if (isDeferredAbility(input.abilityId)) {
    // Finish an armed throw/place (ability already consumed when armed).
    if (
      input.aimX !== undefined &&
      actor.armedAbilityId === input.abilityId &&
      ctx.raceMs <= actor.armedUntilMs
    ) {
      actor.armedAbilityId = null;
      actor.armedUntilMs = 0;
      return resolveDeferred(actor, input, world, ctx);
    }

    if (!actor.abilities.includes(input.abilityId)) {
      return null;
    }

    // Arm-only (no aim yet): consume + wait for a second activate with aim.
    if (input.aimX === undefined) {
      actor.abilities = actor.abilities.filter((id) => id !== input.abilityId);
      actor.armedAbilityId = input.abilityId;
      actor.armedUntilMs = ctx.raceMs + ARMED_PLACE_MS;
      return { actorId: actor.id, abilityId: input.abilityId, raceMs: ctx.raceMs };
    }

    // One-shot activate with aim (tests / simple clients).
    actor.abilities = actor.abilities.filter((id) => id !== input.abilityId);
    return resolveDeferred(actor, input, world, ctx);
  }

  if (!actor.abilities.includes(input.abilityId)) {
    return null;
  }
  actor.abilities = actor.abilities.filter((id) => id !== input.abilityId);
  return resolveInstant(actor, input, world, ctx);
}

function isDeferredAbility(id: string): boolean {
  return id === 'needle-spawner' || id === 'enable-id' || id === 'straw-spawner';
}

function resolveDeferred(
  actor: PlayerState,
  input: ActivateAbilityInput,
  world: WorldState,
  ctx: SimulationContext,
): AbilityEvent {
  switch (input.abilityId) {
    case 'needle-spawner': {
      const eliminatedIds = ctx.config.immortal ? [] : applyTargetedElimination(actor, input, world);
      return { actorId: actor.id, abilityId: input.abilityId, raceMs: ctx.raceMs, eliminatedIds };
    }
    case 'enable-id': {
      const hazard = placeProp(actor, input, world, ctx, 'passport');
      return {
        actorId: actor.id,
        abilityId: input.abilityId,
        raceMs: ctx.raceMs,
        placedHazardId: hazard?.id,
      };
    }
    case 'straw-spawner': {
      const hazard = placeProp(actor, input, world, ctx, 'straw');
      return {
        actorId: actor.id,
        abilityId: input.abilityId,
        raceMs: ctx.raceMs,
        placedHazardId: hazard?.id,
      };
    }
    default:
      return { actorId: actor.id, abilityId: input.abilityId, raceMs: ctx.raceMs };
  }
}

function resolveInstant(
  actor: PlayerState,
  input: ActivateAbilityInput,
  world: WorldState,
  ctx: SimulationContext,
): AbilityEvent {
  const until = (ms: number) => ctx.raceMs + ms;

  switch (input.abilityId) {
    case 'speed-up':
      actor.boostUntilMs = until(SPEED_UP_DURATION_MS);
      break;
    case 'immortality':
      actor.eatProtectedUntilMs = until(DEFAULT_DURATION_MS);
      break;
    case 'disable-obstacles':
      actor.blackrockUntilMs = until(DEFAULT_DURATION_MS);
      break;
    case 'disable-barriers':
      actor.barriersOpenUntilMs = until(DEFAULT_DURATION_MS);
      break;
    case 'flashlight':
      actor.flashlightUntilMs = until(DEFAULT_DURATION_MS);
      break;
    case 'flight-mode':
      actor.flightUntilMs = until(FLIGHT_DURATION_MS);
      break;
    case 'hell-mode':
      actor.hellModeUntilMs = until(DEFAULT_DURATION_MS);
      break;
    case 'slowdown-other':
      actor.slowOthersUntilMs = until(DEFAULT_DURATION_MS);
      break;
    case 'pos-alignment':
      applyPositionAlignment(actor, world);
      break;
    // Deferred abilities without aim were handled above; stray activate is inert.
    default:
      break;
  }

  return { actorId: actor.id, abilityId: input.abilityId, raceMs: ctx.raceMs };
}

function applyPositionAlignment(actor: PlayerState, world: WorldState): void {
  for (const target of world.players.values()) {
    if (target.id === actor.id || target.died || target.finished) {
      continue;
    }
    target.distance = actor.distance;
  }
}

/** Places a passport (sticky like trash) or straw (cosmetic) ahead of the actor. */
function placeProp(
  actor: PlayerState,
  input: ActivateAbilityInput,
  world: WorldState,
  ctx: SimulationContext,
  kind: 'passport' | 'straw',
): Hazard | null {
  if (input.aimX === undefined) {
    return null;
  }
  const lane = nearestLane(input.aimX, ctx);
  let ahead = PLACE_AHEAD_MIN_PX + 40;
  if (typeof input.aimY === 'number' && Number.isFinite(input.aimY)) {
    // aimY = logical ahead distance from runner (positive = up the road).
    ahead = Math.max(PLACE_AHEAD_MIN_PX, Math.min(PLACE_AHEAD_MAX_PX, input.aimY));
  }
  // Placed props use a high id band so they never collide with deterministic spawns.
  const hazard: Hazard = {
    id: (0x7000_0000 + world.nextHazardId++) >>> 0,
    kind,
    lane,
    worldY: actor.distance + ahead,
  };
  world.hazards.push(hazard);
  return hazard;
}

function nearestLane(aimX: number, ctx: SimulationContext): number {
  const width = ctx.config.world.subLaneWidth;
  const count = ctx.config.world.laneCount;
  let best = 0;
  let bestDist = Infinity;
  for (let lane = 0; lane < count; lane++) {
    const x = laneCenterX(lane, ctx.config);
    const d = Math.abs(x - aimX);
    if (d < bestDist) {
      bestDist = d;
      best = lane;
    }
  }
  // Soft clamp: if aim is wildly off-road, still snap to nearest playable lane.
  void width;
  return best;
}

/** Targeted elimination near aim X (logical px). Optional aimY = rival distance. */
function applyTargetedElimination(
  actor: PlayerState,
  input: ActivateAbilityInput,
  world: WorldState,
): string[] {
  if (input.aimX === undefined) {
    return [];
  }
  const eliminated: string[] = [];
  for (const target of world.players.values()) {
    if (target.id === actor.id || target.died || target.finished) {
      continue;
    }
    if (Math.abs(target.x - input.aimX) > NEEDLE_RADIUS_PX) {
      continue;
    }
    if (typeof input.aimY === 'number' && Number.isFinite(input.aimY)) {
      if (Math.abs(target.distance - input.aimY) > NEEDLE_RADIUS_PX * 1.2) {
        continue;
      }
    }
    target.died = true;
    eliminated.push(target.id);
  }
  return eliminated;
}

/** True while any living rival is applying "slow others". */
export function isSlowedByRival(player: PlayerState, world: WorldState, raceMs: number): boolean {
  for (const other of world.players.values()) {
    if (other.id === player.id || other.died || other.finished) {
      continue;
    }
    if (raceMs < other.slowOthersUntilMs) {
      return true;
    }
  }
  return false;
}

/** True while Opened Borders is active for this runner. */
export function hasBarriersForcedOpen(player: PlayerState, raceMs: number): boolean {
  return raceMs < player.barriersOpenUntilMs;
}

/** Hell mode: denser hazard spawns on main lanes other than the actor's. */
export function hellModeMainLanes(world: WorldState, raceMs: number): Set<number> {
  const boosted = new Set<number>();
  for (const player of world.players.values()) {
    if (player.died || player.finished || raceMs >= player.hellModeUntilMs) {
      continue;
    }
    const ownMain = Math.floor(player.lane / 3);
    for (let main = 0; main < 3; main++) {
      if (main !== ownMain) {
        boosted.add(main);
      }
    }
  }
  return boosted;
}
