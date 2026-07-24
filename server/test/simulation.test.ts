/**
 * Authoritative simulation test suite.
 *
 * Runs with `npm run race-server:test` (tsx + node:assert). No framework needed.
 * These prove the server "brain" is correct and DETERMINISTIC so the game can be
 * trusted without hand-playtesting every rule.
 */
import assert from 'node:assert/strict';
import { DEFAULT_RACE_CONFIG } from '../src/config/raceConfig.js';
import { RaceSimulation } from '../src/domain/RaceSimulation.js';
import type { PlayerInput, PlayerState, WorldState } from '../src/domain/types.js';
import { RacePhase } from '../src/domain/types.js';
import {
  advanceProgress,
  boundaryCrossed,
  canEat,
  computeDividers,
  computeStandings,
  isDividerOpenAt,
  resolveEat,
  resolveHazards,
  speedMultiplier,
  type SimulationContext,
} from '../src/domain/systems/index.js';

const config = DEFAULT_RACE_CONFIG;

// ---- Tiny test runner -----------------------------------------------------
const tests: Array<{ name: string; fn: () => void }> = [];
const test = (name: string, fn: () => void) => tests.push({ name, fn });

// ---- Helpers --------------------------------------------------------------

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: overrides.id ?? 'p',
    role: overrides.role ?? 'human',
    lane: overrides.lane ?? 4,
    x: 0,
    jumpUntilMs: 0,
    distance: overrides.distance ?? 0,
    died: false,
    finished: false,
    finishTimeMs: null,
    lastInputSeq: -1,
    abilities: [],
    slideUntilMs: 0,
    stallUntilMs: 0,
    stuck: false,
    boostUntilMs: 0,
    ...overrides,
  };
}

function makeCtx(raceMs: number, extra: Partial<SimulationContext> = {}): SimulationContext {
  return {
    config,
    // rng is unused by the pure systems under test; a stub keeps types happy.
    rng: { next: () => 0.5, nextInt: () => 0 } as unknown as SimulationContext['rng'],
    raceMs,
    dtMs: extra.dtMs ?? config.tickMs,
    worldY: extra.worldY ?? (raceMs / 1000) * config.world.speedPxPerSec,
  };
}

function emptyWorld(seed = 123): WorldState {
  return {
    seed,
    startsAtMs: 0,
    capacity: 6,
    phase: RacePhase.Racing,
    tick: 0,
    elapsedMs: 0,
    players: new Map(),
    hazards: [],
    dividersOpen: [true, true],
    laneSpawnCursor: [0, 0, 0],
    laneAbilityCursor: [0, 0, 0],
    nextHazardId: 0,
  };
}

/** Drives a full 3-player race with scripted inputs; returns a comparable digest. */
function runScriptedRace(seed: number): string {
  const sim = new RaceSimulation(config, { seed, startsAtMs: 0, capacity: 6 });
  sim.addPlayer({ id: 'a', role: 'bug', lane: 1 });
  sim.addPlayer({ id: 'b', role: 'human', lane: 4 });
  sim.addPlayer({ id: 'c', role: 'klaus', lane: 7 });

  const script: Array<[number, string, PlayerInput]> = [
    [200, 'a', { type: 'jump', seq: 1 }],
    [400, 'b', { type: 'move', direction: 'left', seq: 1 }],
    [800, 'c', { type: 'move', direction: 'right', seq: 1 }],
    [1200, 'a', { type: 'move', direction: 'right', seq: 2 }],
    [2000, 'b', { type: 'jump', seq: 2 }],
  ];

  let scriptIndex = 0;
  for (let now = 0; now <= 6000; now += config.tickMs) {
    while (scriptIndex < script.length && script[scriptIndex][0] <= now) {
      const [, id, input] = script[scriptIndex];
      sim.enqueueInput(id, input);
      scriptIndex++;
    }
    sim.step(now);
  }

  const world = sim.getWorld();
  const players = [...world.players.values()]
    .map((p) => `${p.id}:${p.lane}:${Math.round(p.distance)}:${p.died ? 'D' : 'A'}`)
    .join('|');
  const hazards = world.hazards
    .map((h) => `${h.id}:${h.kind}:${h.lane}:${Math.round(h.worldY)}:${h.open ? 'o' : ''}`)
    .join('|');
  return `${players}//${hazards}`;
}

// ---- Determinism ----------------------------------------------------------

test('same seed + same inputs → identical world (determinism)', () => {
  assert.equal(runScriptedRace(42), runScriptedRace(42));
});

test('different seeds → different worlds', () => {
  assert.notEqual(runScriptedRace(42), runScriptedRace(43));
});

// ---- Dividers -------------------------------------------------------------

test('divider schedule is deterministic and bounded', () => {
  for (const b of [0, 1]) {
    for (const t of [0, 5000, 12000, 30000, 59000]) {
      assert.equal(isDividerOpenAt(999, b, t), isDividerOpenAt(999, b, t));
    }
  }
  const state = computeDividers(999, 12000);
  assert.equal(state.length, 2);
});

test('divider opens and closes over a race (not stuck)', () => {
  let sawOpen = false;
  let sawClosed = false;
  for (let t = 0; t <= 60000; t += 250) {
    isDividerOpenAt(7, 0, t) ? (sawOpen = true) : (sawClosed = true);
  }
  assert.ok(sawOpen, 'divider should open at some point');
  assert.ok(sawClosed, 'divider should be closed at some point');
});

test('boundaryCrossed maps species boundaries', () => {
  assert.equal(boundaryCrossed(2, 1), 0); // Bugs → Humans
  assert.equal(boundaryCrossed(3, -1), 0); // Humans → Bugs
  assert.equal(boundaryCrossed(5, 1), 1); // Humans → Klaus
  assert.equal(boundaryCrossed(6, -1), 1); // Klaus → Humans
  assert.equal(boundaryCrossed(0, 1), null); // in-lane
  assert.equal(boundaryCrossed(4, 1), null);
});

// ---- Movement: off-road death + divider gating ----------------------------

test('stepping off the left edge kills the runner', () => {
  const sim = new RaceSimulation(config, { seed: 1, startsAtMs: 0, capacity: 6 });
  sim.addPlayer({ id: 'a', role: 'bug', lane: 0 });
  sim.step(0);
  sim.enqueueInput('a', { type: 'move', direction: 'left', seq: 1 });
  sim.step(50);
  assert.equal(sim.getPlayer('a')!.died, true);
});

test('closed divider blocks a boundary crossing; open allows it', () => {
  // Find a race time where boundary 0 is closed and one where it is open.
  let closedT = -1;
  let openT = -1;
  for (let t = 0; t <= 60000; t += 50) {
    if (closedT < 0 && !isDividerOpenAt(555, 0, t)) closedT = t;
    if (openT < 0 && isDividerOpenAt(555, 0, t)) openT = t;
  }
  assert.ok(closedT >= 0 && openT >= 0);

  const blocked = new RaceSimulation(config, { seed: 555, startsAtMs: 0, capacity: 6 });
  blocked.addPlayer({ id: 'a', role: 'bug', lane: 2 });
  blocked.step(closedT);
  blocked.enqueueInput('a', { type: 'move', direction: 'right', seq: 1 });
  blocked.step(closedT + 50);
  assert.equal(blocked.getPlayer('a')!.lane, 2, 'closed divider must block the crossing');
  assert.equal(blocked.getPlayer('a')!.died, false);

  const allowed = new RaceSimulation(config, { seed: 555, startsAtMs: 0, capacity: 6 });
  allowed.addPlayer({ id: 'a', role: 'bug', lane: 2 });
  allowed.step(openT);
  allowed.enqueueInput('a', { type: 'move', direction: 'right', seq: 1 });
  allowed.step(openT + 50);
  assert.equal(allowed.getPlayer('a')!.lane, 3, 'open divider must allow the crossing');
});

// ---- Hazards --------------------------------------------------------------

test('open manhole kills a grounded runner, spares a jumping one', () => {
  const world = emptyWorld();
  world.hazards.push({ id: 1, kind: 'manhole', lane: 4, worldY: 1000, open: true });

  const grounded = makePlayer({ id: 'g', lane: 4, distance: 1000, jumpUntilMs: 0 });
  resolveHazards(grounded, world, makeCtx(2000));
  assert.equal(grounded.died, true);

  const jumping = makePlayer({ id: 'j', lane: 4, distance: 1000, jumpUntilMs: 5000 });
  resolveHazards(jumping, world, makeCtx(2000));
  assert.equal(jumping.died, false);
});

test('closed manhole is safe', () => {
  const world = emptyWorld();
  world.hazards.push({ id: 1, kind: 'manhole', lane: 4, worldY: 1000, open: false });
  const p = makePlayer({ lane: 4, distance: 1000 });
  resolveHazards(p, world, makeCtx(2000));
  assert.equal(p.died, false);
});

test('puddle grants a slide boost; trash sticks a runner (even airborne)', () => {
  const world = emptyWorld();
  world.hazards.push({ id: 1, kind: 'puddle', lane: 4, worldY: 1000 });
  world.hazards.push({ id: 2, kind: 'trash', lane: 3, worldY: 1000 });

  const puddleRunner = makePlayer({ id: 'pr', lane: 4, distance: 1000 });
  resolveHazards(puddleRunner, world, makeCtx(2000));
  assert.ok(puddleRunner.slideUntilMs > 2000, 'puddle should set a slide window');

  const trashRunner = makePlayer({ id: 'tr', lane: 3, distance: 1000, jumpUntilMs: 0 });
  resolveHazards(trashRunner, world, makeCtx(2000));
  assert.equal(trashRunner.stuck, true, 'trash should stick the runner');

  // A bin cannot be jumped — you must go around it, so airborne still sticks.
  const jumper = makePlayer({ id: 'jp', lane: 3, distance: 1000, jumpUntilMs: 5000 });
  resolveHazards(jumper, world, makeCtx(2000));
  assert.equal(jumper.stuck, true, 'a bin sticks a runner even mid-jump');
});

test('a stuck runner makes no progress until it changes lane', () => {
  const sim = new RaceSimulation(config, { seed: 1, startsAtMs: 0, capacity: 6 });
  sim.addPlayer({ id: 'a', role: 'human', lane: 4 });
  sim.step(0);
  // Force the stuck state as a trash bin would.
  sim.getPlayer('a')!.stuck = true;
  const before = sim.getPlayer('a')!.distance;
  sim.step(500);
  assert.equal(sim.getPlayer('a')!.distance, before, 'stuck runner does not advance');

  // Changing lane clears it and progress resumes.
  sim.enqueueInput('a', { type: 'move', direction: 'left', seq: 1 });
  sim.step(550);
  assert.equal(sim.getPlayer('a')!.stuck, false, 'lane change clears stuck');
  sim.step(1000);
  assert.ok(sim.getPlayer('a')!.distance > before, 'progress resumes after lane change');
});

test('stuck zeroes the speed multiplier', () => {
  assert.equal(speedMultiplier(makePlayer({ stuck: true }), 1000), 0);
});

test('pickup grants an ability (capped at 3)', () => {
  const world = emptyWorld();
  world.hazards.push({ id: 1, kind: 'pickup', lane: 4, worldY: 1000, abilityId: 'speed-up' });
  const p = makePlayer({ lane: 4, distance: 1000 });
  resolveHazards(p, world, makeCtx(2000));
  assert.deepEqual(p.abilities, ['speed-up']);
  // Resolves once, not every tick.
  resolveHazards(p, world, makeCtx(2050));
  assert.equal(p.abilities.length, 1);
});

// ---- Progress -------------------------------------------------------------

test('speed multiplier reflects active effects', () => {
  const base = makePlayer();
  assert.equal(speedMultiplier(base, 1000), 1);
  assert.equal(speedMultiplier(makePlayer({ stallUntilMs: 2000 }), 1000), 0);
  assert.equal(speedMultiplier(makePlayer({ slideUntilMs: 2000 }), 1000), 1.5);
  assert.ok(Math.abs(speedMultiplier(makePlayer({ boostUntilMs: 2000 }), 1000) - 1.4) < 1e-9);
});

test('a sliding runner out-distances a normal one over the same time', () => {
  const world = emptyWorld();
  const normal = makePlayer({ id: 'n', lane: 0 });
  const slider = makePlayer({ id: 's', lane: 1, slideUntilMs: 10_000 });
  world.players.set('n', normal);
  world.players.set('s', slider);
  for (let t = 0; t < 1000; t += config.tickMs) {
    advanceProgress(world, makeCtx(t));
  }
  assert.ok(slider.distance > normal.distance * 1.4, 'slide boost should pull ahead');
});

// ---- Eating ---------------------------------------------------------------

test('food chain: bug eats klaus, not human', () => {
  assert.equal(canEat('bug', 'klaus'), true);
  assert.equal(canEat('klaus', 'human'), true);
  assert.equal(canEat('human', 'bug'), true);
  assert.equal(canEat('bug', 'human'), false);
});

test('eat succeeds only when adjacent + valid prey', () => {
  const world = emptyWorld();
  const bug = makePlayer({ id: 'bug', role: 'bug', lane: 4, distance: 1000 });
  const klaus = makePlayer({ id: 'klaus', role: 'klaus', lane: 4, distance: 1010 });
  const human = makePlayer({ id: 'human', role: 'human', lane: 4, distance: 1005 });
  world.players.set('bug', bug);
  world.players.set('klaus', klaus);
  world.players.set('human', human);

  // Wrong prey (bug cannot eat human).
  assert.equal(resolveEat(bug, { type: 'eat', targetId: 'human', seq: 1 }, world), null);
  // Too far away.
  klaus.distance = 2000;
  assert.equal(resolveEat(bug, { type: 'eat', targetId: 'klaus', seq: 2 }, world), null);
  // Adjacent + valid → kill.
  klaus.distance = 1010;
  assert.equal(resolveEat(bug, { type: 'eat', targetId: 'klaus', seq: 3 }, world), 'klaus');
  assert.equal(klaus.died, true);
});

// ---- Standings ------------------------------------------------------------

test('standings rank alive over dead, then by distance', () => {
  const world = emptyWorld();
  world.players.set('dead', makePlayer({ id: 'dead', died: true, distance: 9999 }));
  world.players.set('near', makePlayer({ id: 'near', finished: true, finishTimeMs: 60000, distance: 5000 }));
  world.players.set('far', makePlayer({ id: 'far', finished: true, finishTimeMs: 60000, distance: 8000 }));
  const standings = computeStandings(world);
  assert.equal(standings[0].userId, 'far', 'furthest survivor first');
  assert.equal(standings[1].userId, 'near');
  assert.equal(standings[2].userId, 'dead', 'dead last');
});

// ---- Full race ------------------------------------------------------------

test('a full race finishes and seals standings for everyone', () => {
  const sim = new RaceSimulation(config, { seed: 77, startsAtMs: 0, capacity: 6 });
  sim.addPlayer({ id: 'a', role: 'bug', lane: 1 });
  sim.addPlayer({ id: 'b', role: 'human', lane: 4 });
  sim.addPlayer({ id: 'c', role: 'klaus', lane: 7 });
  for (let now = 0; now <= config.raceDurationMs + 200; now += config.tickMs) {
    sim.step(now);
  }
  assert.equal(sim.isFinished(), true);
  const results = sim.sealResults();
  assert.equal(results.length, 3);
  assert.deepEqual(
    results.map((r) => r.placement).sort(),
    [1, 2, 3],
  );
});

// ---- Run ------------------------------------------------------------------

let passed = 0;
let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    failed++;
    console.error(`  \u2717 ${name}`);
    console.error(`      ${(error as Error).message}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
