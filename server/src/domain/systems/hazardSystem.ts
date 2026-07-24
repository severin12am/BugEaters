/**
 * Hazard system — the authoritative world of trash bins, puddles, manholes and
 * ability pickups.
 *
 * DESIGN
 *   - Spawns are a pure function of (seed, main lane, slot index). We use the
 *     stateless seeded hash — NOT the mutable RNG — so the exact same layout is
 *     produced no matter how tick timing jitters. This is what lets clients
 *     render precisely what the server simulated.
 *   - Hazards live in WORLD SPACE: each has a `worldY` (px along the track). A
 *     player interacts with a hazard when their own `distance` crosses it in the
 *     same sub-lane. Because progress is per-player, a boosted runner reaches
 *     hazards sooner — exactly like the single-player feel.
 *
 * Effects (mirroring `TUNING.obstacles` on the client):
 *   - manhole (open) + grounded  → death
 *   - trash + grounded           → stall (no forward progress briefly)
 *   - trash + airborne           → cleared, no effect
 *   - puddle                     → slide boost (faster) for a short window
 *   - pickup                     → grants an ability (inventory cap 3)
 */
import { seededInt } from '../rng.js';
import type { Hazard, PlayerState, WorldState } from '../types.js';
import type { SimulationContext } from './context.js';
import { isAirborne } from './movementSystem.js';

/** Spawn cadence per main lane (ms), from solo `TUNING.obstacles.byMainLane`. */
const LANE_INTERVAL_MS = [1100, 1300, 1000];
/** trash / puddle / manhole weights per main lane (solo tuning). */
const LANE_WEIGHTS = [
  { trash: 1, puddle: 0.6, manhole: 0.4 },
  { trash: 0.8, puddle: 1, manhole: 0.5 },
  { trash: 0.7, puddle: 0.9, manhole: 0.45 },
];
/** Chance a manhole spawns open (deadly). Solo: `manholeOpenChance`. */
const MANHOLE_OPEN_CHANCE = 0.35;
/** Ability pickups spawn on a steady cadence (solo randomizes 2..4s). */
const ABILITY_INTERVAL_MS = 3_000;
/** How far ahead of its spawn slot a hazard is placed (px). */
const SPAWN_AHEAD_MIN = 500;
const SPAWN_AHEAD_MAX = 900;
/** Don't spawn hazards inside the final stretch. */
const STOP_BEFORE_FINISH_PX = 500;
/** Vertical tolerance (px) for a runner to "hit" a hazard. > one tick's travel. */
const HAZARD_HIT_TOLERANCE_PX = 30;
/** Puddle slide boost duration (ms) — solo `puddleSlideDurationSec`. */
export const PUDDLE_SLIDE_MS = 2_000;
/** How long a missed trash bin stalls a grounded runner (ms). */
export const TRASH_STALL_MS = 550;
/** Abilities a road pickup can grant (server understands these effects). */
const PICKUP_ABILITY_POOL = ['speed-up', 'needle-spawner'];

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
 * Spawns hazards + pickups whose slot the world clock has newly passed. Each main
 * lane advances on its own cadence; a slot's contents are fully determined by
 * (seed, lane, slot) so the layout is reproducible and timing-independent.
 */
export function spawnHazards(world: WorldState, ctx: SimulationContext): void {
  const speed = ctx.config.world.speedPxPerSec;
  const spawnCutoff = totalRaceDistancePx(ctx) - STOP_BEFORE_FINISH_PX;

  // Spawn ahead of the LEADING edge: whichever is further, the world scroll front
  // or the furthest runner. A boosted/sliding runner can outrun the world front;
  // keying spawns off the leader guarantees every hazard first appears AHEAD of
  // everyone (it scrolls in from the top) instead of popping in beside/behind a
  // runner who has pulled in front of the world clock.
  let leadY = ctx.worldY;
  for (const player of world.players.values()) {
    if (!player.died && !player.finished && player.distance > leadY) {
      leadY = player.distance;
    }
  }

  for (let lane = 0; lane < 3; lane++) {
    const intervalDist = (LANE_INTERVAL_MS[lane] / 1000) * speed;

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
  // Independent hash streams per concern so they don't correlate.
  const key = (lane * 1_000_003 + slot) >>> 0;
  const sub = seededInt(seed ^ 0x1111, key, 3); // 0..2 within the main lane
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
 * Mutates the player (death, stall, slide, pickups) and records which hazards a
 * player has already resolved so effects fire once.
 */
export function resolveHazards(player: PlayerState, world: WorldState, ctx: SimulationContext): void {
  if (player.died || player.finished) {
    return;
  }
  for (const hazard of world.hazards) {
    if (hazard.lane !== player.lane) {
      continue;
    }
    if (Math.abs(hazard.worldY - player.distance) > HAZARD_HIT_TOLERANCE_PX) {
      continue;
    }
    const already = hazard.resolvedBy?.has(player.id) ?? false;

    switch (hazard.kind) {
      case 'manhole':
        if (hazard.open && !isAirborne(player, ctx.raceMs) && !ctx.config.immortal) {
          player.died = true;
        }
        break;
          case 'trash':
            if (already) {
              break;
            }
            // A trash bin physically blocks the runner: you cannot jump a bin,
            // you must go AROUND it by changing lane. Stays stuck (zero forward
            // progress) until a successful lane change clears it (movementSystem).
            player.stuck = true;
            markResolved(hazard, player.id);
            break;
      case 'puddle':
        if (already) {
          break;
        }
        player.slideUntilMs = ctx.raceMs + PUDDLE_SLIDE_MS;
        markResolved(hazard, player.id);
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

function markResolved(hazard: Hazard, playerId: string): void {
  (hazard.resolvedBy ??= new Set<string>()).add(playerId);
}

/** Removes hazards that every runner has scrolled well past. */
export function pruneHazards(world: WorldState, ctx: SimulationContext): void {
  // Prune behind the slowest living runner so nobody misses a hazard.
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
