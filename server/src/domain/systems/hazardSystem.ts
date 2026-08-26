/**
 * Hazard system — the authoritative world of trash bins, puddles, manholes and
 * ability pickups.
 *
 * DESIGN
 *   - Spawns are a pure function of (seed, main lane, slot index).
 *   - Hazards live in WORLD SPACE: each has a `worldY` (px along the track).
 *
 * Effects:
 *   - manhole (open) + grounded  → death (unless BLACKROCK / flight)
 *   - trash / passport           → stuck until lane change
 *   - puddle                     → slide boost (unless BLACKROCK)
 *   - straw                      → cosmetic only
 *   - pickup                     → grants an ability (inventory cap 3)
 */
import { seededInt } from '../rng.js';
import type { Hazard, PlayerState, WorldState } from '../types.js';
import type { SimulationContext } from './context.js';
import { hellModeMainLanes, PICKUP_ABILITY_POOL } from './abilitySystem.js';
import { isAirborne } from './movementSystem.js';

/** Spawn cadence per main lane (ms) — slightly slower than solo for sticky-trash UX. */
const LANE_INTERVAL_MS = [1400, 1600, 1300];
/** trash / puddle / manhole weights — trash reduced so sticky bins feel fair. */
const LANE_WEIGHTS = [
  { trash: 0.55, puddle: 0.7, manhole: 0.45 },
  { trash: 0.45, puddle: 1, manhole: 0.55 },
  { trash: 0.4, puddle: 0.95, manhole: 0.5 },
];
/** Chance a manhole spawns open (deadly). Solo: `manholeOpenChance`. */
const MANHOLE_OPEN_CHANCE = 0.35;
/** Ability pickups spawn on a steady cadence (solo randomizes 2..4s). */
const ABILITY_INTERVAL_MS = 3_000;
/** How far ahead of its spawn slot a hazard is placed (logical px). */
const SPAWN_AHEAD_MIN = 900;
const SPAWN_AHEAD_MAX = 1400;
/** Don't spawn hazards inside the final stretch. */
const STOP_BEFORE_FINISH_PX = 500;
/**
 * Vertical tolerance (logical px) for a runner to "hit" a hazard.
 * Must exceed one tick of travel at max boost (~442 * 0.05 * 1.5 ≈ 33).
 */
/**
 * Vertical hit window (logical px). Must cover one tick at max boost
 * (~442 * 0.05 * 1.5 * 1.5 ≈ 50) plus margin so pickups/trash are not skipped.
 */
const HAZARD_HIT_TOLERANCE_PX = 64;
/**
 * When stuck on trash/passport, stand this far before the bin (logical px).
 * Keeps the runner visually tight against the obstacle instead of a big gap.
 */
const TRASH_STUCK_GAP_PX = 10;
/** Puddle slide boost duration (ms) — solo `puddleSlideDurationSec`. */
export const PUDDLE_SLIDE_MS = 2_000;
/** How long a missed trash bin stalls a grounded runner (ms). Legacy. */
export const TRASH_STALL_MS = 550;

/** Deterministic float in [0,1) for a (seed, key) pair. */
function seededFloat(seed: number, key: number): number {
  return seededInt(seed, key, 1_000_000) / 1_000_000;
}

/** Deterministic int in [min, max] for a (seed, key) pair. */
function seededRange(seed: number, key: number, min: number, max: number): number {
  return min + seededInt(seed, key, max - min + 1);
}

function totalRaceDistancePx(ctx: SimulationContext): number {
  return (ctx.config.raceDurationMs / 1000) * ctx.config.world.speedPxPerSec;
}

/**
 * Spawns hazards + pickups whose slot the world clock has newly passed.
 */
export function spawnHazards(world: WorldState, ctx: SimulationContext): void {
  const speed = ctx.config.world.speedPxPerSec;
  const spawnCutoff = totalRaceDistancePx(ctx) - STOP_BEFORE_FINISH_PX;
  const hellMains = hellModeMainLanes(world, ctx.raceMs);

  let leadY = ctx.worldY;
  for (const player of world.players.values()) {
    if (!player.died && !player.finished && player.distance > leadY) {
      leadY = player.distance;
    }
  }

  for (let lane = 0; lane < 3; lane++) {
    const hellBoost = hellMains.has(lane) ? 0.5 : 1;
    const intervalDist = ((LANE_INTERVAL_MS[lane] * hellBoost) / 1000) * speed;

    // --- Hazards (trash / puddle / manhole) ---
    while ((world.laneSpawnCursor[lane] + 1) * intervalDist <= leadY) {
      const slot = ++world.laneSpawnCursor[lane];
      const slotDist = slot * intervalDist;
      if (slotDist >= spawnCutoff) {
        continue;
      }
      world.hazards.push(makeHazard(world.seed, lane, slot, slotDist));
    }

    // --- Ability pickups (steady cadence) ---
    const abilityInterval = (ABILITY_INTERVAL_MS / 1000) * speed;
    while ((world.laneAbilityCursor[lane] + 1) * abilityInterval <= leadY) {
      const slot = ++world.laneAbilityCursor[lane];
      const slotDist = slot * abilityInterval;
      if (slotDist >= spawnCutoff) {
        continue;
      }
      world.hazards.push(makePickup(world.seed, lane, slot, slotDist));
    }
  }
}

function makeHazard(seed: number, lane: number, slot: number, slotDist: number): Hazard {
  const key = (lane * 1_000_003 + slot) >>> 0;
  const sub = seededInt(seed ^ 0x1111, key, 3);
  const globalLane = lane * 3 + sub;
  const ahead = seededRange(seed ^ 0x2222, key, SPAWN_AHEAD_MIN, SPAWN_AHEAD_MAX);
  const worldY = slotDist + ahead;

  const kind = pickKind(seed, key, lane);
  const id = hazardId(lane, slot, 'h');
  if (kind === 'manhole') {
    const open = seededFloat(seed ^ 0x3333, key) < MANHOLE_OPEN_CHANCE;
    return {
      id,
      kind: 'manhole',
      lane: globalLane,
      worldY,
      open,
      angle: seededInt(seed ^ 0x4444, key, 360),
    };
  }
  return { id, kind, lane: globalLane, worldY };
}

function makePickup(seed: number, lane: number, slot: number, slotDist: number): Hazard {
  const key = (lane * 7_000_003 + slot) >>> 0;
  const sub = seededInt(seed ^ 0x5555, key, 3);
  const globalLane = lane * 3 + sub;
  const ahead = seededRange(seed ^ 0x6666, key, SPAWN_AHEAD_MIN, SPAWN_AHEAD_MAX);
  const abilityId = PICKUP_ABILITY_POOL[seededInt(seed ^ 0x7777, key, PICKUP_ABILITY_POOL.length)];
  return {
    id: hazardId(lane, slot, 'p'),
    kind: 'pickup',
    lane: globalLane,
    worldY: slotDist + ahead,
    abilityId,
  };
}

/** Stable, collision-free hazard id from its deterministic coordinates. */
function hazardId(lane: number, slot: number, tag: 'h' | 'p'): number {
  const base = tag === 'h' ? 0 : 0x4000_0000;
  return (base + lane * 100_000 + slot) >>> 0;
}

function pickKind(seed: number, key: number, lane: number): 'trash' | 'puddle' | 'manhole' {
  const w = LANE_WEIGHTS[lane];
  const total = w.trash + w.puddle + w.manhole;
  let roll = seededFloat(seed ^ 0x8888, key) * total;
  if (roll < w.trash) {
    return 'trash';
  }
  roll -= w.trash;
  if (roll < w.puddle) {
    return 'puddle';
  }
  return 'manhole';
}

/**
 * Resolves hazard interactions for one player at their current forward distance.
 */
export function resolveHazards(player: PlayerState, world: WorldState, ctx: SimulationContext): void {
  if (player.died || player.finished) {
    return;
  }
  // DAVOS — airborne window: skip all hazard resolution (pickups included).
  if (ctx.raceMs < player.flightUntilMs) {
    return;
  }

  const blackrock = ctx.raceMs < player.blackrockUntilMs;
  const airborne = isAirborne(player, ctx.raceMs);

  for (const hazard of world.hazards) {
    if (hazard.lane !== player.lane) {
      continue;
    }
    if (!hazardTouchesRunner(player, hazard.worldY)) {
      continue;
    }
    const already = hazard.resolvedBy?.has(player.id) ?? false;

    switch (hazard.kind) {
      case 'manhole':
        if (hazard.open && !airborne && !blackrock && !ctx.config.immortal) {
          player.died = true;
        }
        break;
      case 'trash':
      case 'passport':
        if (already) {
          break;
        }
        // Sticky bin / passport: change lane to go around.
        player.stuck = true;
        // Snap tight to the bin so "stuck in front" reads clearly (not a big gap).
        player.distance = hazard.worldY - TRASH_STUCK_GAP_PX;
        markResolved(hazard, player.id);
        break;
      case 'puddle':
        if (already || blackrock) {
          if (blackrock && !already) {
            markResolved(hazard, player.id);
          }
          break;
        }
        player.slideUntilMs = ctx.raceMs + PUDDLE_SLIDE_MS;
        markResolved(hazard, player.id);
        break;
      case 'straw':
        // Cosmetic prop — no gameplay effect.
        if (!already) {
          markResolved(hazard, player.id);
        }
        break;
      case 'pickup':
        if (already) {
          break;
        }
        if (hazard.abilityId && player.abilities.length < 3) {
          player.abilities = [...player.abilities, hazard.abilityId];
        }
        markResolved(hazard, player.id);
        break;
    }
  }
}

/** Near the hazard now, or crossed it this tick (stops boost skip-through). */
function hazardTouchesRunner(player: PlayerState, hazardY: number): boolean {
  if (Math.abs(hazardY - player.distance) <= HAZARD_HIT_TOLERANCE_PX) {
    return true;
  }
  const a = player.prevDistance;
  const b = player.distance;
  const lo = Math.min(a, b) - HAZARD_HIT_TOLERANCE_PX * 0.25;
  const hi = Math.max(a, b) + HAZARD_HIT_TOLERANCE_PX * 0.25;
  return hazardY >= lo && hazardY <= hi;
}

function markResolved(hazard: Hazard, playerId: string): void {
  (hazard.resolvedBy ??= new Set<string>()).add(playerId);
}

/** Removes hazards that every runner has scrolled well past. */
export function pruneHazards(world: WorldState, ctx: SimulationContext): void {
  let minDistance = ctx.worldY;
  for (const player of world.players.values()) {
    if (!player.died && !player.finished) {
      minDistance = Math.min(minDistance, player.distance);
    }
  }
  const cutoff = minDistance - HAZARD_HIT_TOLERANCE_PX * 4;
  for (let i = world.hazards.length - 1; i >= 0; i--) {
    if (world.hazards[i].worldY < cutoff) {
      world.hazards.splice(i, 1);
    }
  }
}
