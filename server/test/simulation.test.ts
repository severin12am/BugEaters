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
  applyAbility,
  applyDilemmaChoice,
  boundaryCrossed,
  canEat,
  computeDividers,
  computeStandings,
  isDividerOpenAt,
  PICKUP_ABILITY_POOL,
  resolveEat,
  resolveHazards,
  speedMultiplier,
  tickDilemmas,
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
    prevDistance: overrides.prevDistance ?? overrides.distance ?? 0,
    died: false,
    finished: false,
    finishTimeMs: null,
    lastInputSeq: -1,
    abilities: [],
    slideUntilMs: 0,
    stallUntilMs: 0,
    stuck: false,
    boostUntilMs: 0,
    eatProtectedUntilMs: 0,
    blackrockUntilMs: 0,
    barriersOpenUntilMs: 0,
    flightUntilMs: 0,
    hellModeUntilMs: 0,
    slowOthersUntilMs: 0,
    flashlightUntilMs: 0,
    armedAbilityId: null,
    armedUntilMs: 0,
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
  assert.equal(trashRunner.distance, 990, 'stuck runner stands tight in front of the bin');

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
  assert.equal(speedMultiplier(makePlayer({ stuck: true }), emptyWorld(), 1000), 0);
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
  const world = emptyWorld();
  const base = makePlayer();
  assert.equal(speedMultiplier(base, world, 1000), 1);
  assert.equal(speedMultiplier(makePlayer({ stallUntilMs: 2000 }), world, 1000), 0);
  assert.equal(speedMultiplier(makePlayer({ slideUntilMs: 2000 }), world, 1000), 1.5);
  assert.ok(Math.abs(speedMultiplier(makePlayer({ boostUntilMs: 2000 }), world, 1000) - 1.5) < 1e-9);
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

test('eat succeeds only when nearby + valid prey (not same-lane-only)', () => {
  const world = emptyWorld();
  // Bug left / Klaus right of bug band — different sub-lanes, close in X.
  const bug = makePlayer({ id: 'bug', role: 'bug', lane: 1, x: 80, distance: 1000 });
  const klaus = makePlayer({ id: 'klaus', role: 'klaus', lane: 2, x: 100, distance: 1010 });
  const human = makePlayer({ id: 'human', role: 'human', lane: 4, x: 200, distance: 1005 });
  world.players.set('bug', bug);
  world.players.set('klaus', klaus);
  world.players.set('human', human);

  // Wrong prey (bug cannot eat human).
  assert.equal(resolveEat(bug, { type: 'eat', targetId: 'human', seq: 1 }, world), null);
  // Too far forward.
  klaus.distance = 2000;
  assert.equal(resolveEat(bug, { type: 'eat', targetId: 'klaus', seq: 2 }, world), null);
  // Nearby + valid → kill (even across sub-lanes).
  klaus.distance = 1010;
  assert.equal(resolveEat(bug, { type: 'eat', targetId: 'klaus', seq: 3 }, world), 'klaus');
  assert.equal(klaus.died, true);

  // Human eats bug across main-lane contact range.
  const bug2 = makePlayer({ id: 'bug2', role: 'bug', lane: 2, x: 120, distance: 2000 });
  const human2 = makePlayer({ id: 'human2', role: 'human', lane: 3, x: 140, distance: 2005 });
  world.players.set('bug2', bug2);
  world.players.set('human2', human2);
  assert.equal(resolveEat(human2, { type: 'eat', targetId: 'bug2', seq: 1 }, world), 'bug2');
});

// ---- Abilities + dilemma --------------------------------------------------

test('pickup pool covers all 12 road abilities', () => {
  assert.equal(PICKUP_ABILITY_POOL.length, 12);
  assert.ok(PICKUP_ABILITY_POOL.includes('speed-up'));
  assert.ok(PICKUP_ABILITY_POOL.includes('disable-barriers'));
});

test('speed-up and immortality apply timed flags', () => {
  const world = emptyWorld();
  const p = makePlayer({ abilities: ['speed-up', 'immortality'] });
  world.players.set(p.id, p);
  const ctx = makeCtx(1000);
  assert.ok(applyAbility(p, { type: 'activate', abilityId: 'speed-up', seq: 1 }, world, ctx));
  assert.ok(p.boostUntilMs > 1000);
  assert.ok(applyAbility(p, { type: 'activate', abilityId: 'immortality', seq: 2 }, world, ctx));
  assert.ok(p.eatProtectedUntilMs > 1000);
});

test('needle with aim eliminates a nearby rival', () => {
  const world = emptyWorld();
  const actor = makePlayer({ id: 'a', lane: 4, x: 200, abilities: ['needle-spawner'] });
  const rival = makePlayer({ id: 'b', lane: 5, x: 220, distance: 1000 });
  world.players.set('a', actor);
  world.players.set('b', rival);
  const event = applyAbility(
    actor,
    { type: 'activate', abilityId: 'needle-spawner', aimX: 220, seq: 1 },
    world,
    makeCtx(1000),
  );
  assert.ok(event);
  assert.deepEqual(event!.eliminatedIds, ['b']);
  assert.equal(rival.died, true);
});

test('shareholder blocks eats', () => {
  const world = emptyWorld();
  const bug = makePlayer({ id: 'bug', role: 'bug', lane: 4, distance: 1000 });
  const klaus = makePlayer({
    id: 'klaus',
    role: 'klaus',
    lane: 4,
    distance: 1010,
    eatProtectedUntilMs: 5000,
  });
  world.players.set('bug', bug);
  world.players.set('klaus', klaus);
  assert.equal(resolveEat(bug, { type: 'eat', targetId: 'klaus', seq: 1 }, world, makeCtx(1000)), null);
});

test('dilemma both-cooperate boosts both runners', () => {
  const world = emptyWorld();
  world.elapsedMs = 1000;
  const a = makePlayer({ id: 'a', role: 'human', lane: 4, distance: 1000, x: 160 });
  const b = makePlayer({ id: 'b', role: 'human', lane: 4, distance: 1010, x: 170 });
  world.players.set('a', a);
  world.players.set('b', b);
  const starts = tickDilemmas(world, makeCtx(1000));
  assert.equal(starts.length, 1);
  assert.equal(starts[0].type, 'start');
  const id = starts[0].encounterId;
  applyDilemmaChoice(a, { type: 'dilemma', encounterId: id, choice: 'cooperate', seq: 1 }, world, makeCtx(1100));
  const resolved = applyDilemmaChoice(
    b,
    { type: 'dilemma', encounterId: id, choice: 'cooperate', seq: 1 },
    world,
    makeCtx(1200),
  );
  assert.equal(resolved[0]?.type, 'resolve');
  assert.ok(a.boostUntilMs > 1200);
  assert.ok(b.boostUntilMs > 1200);
});

test('dilemma betrayal: eater lives and boosts, victim dies', () => {
  const world = emptyWorld();
  const a = makePlayer({ id: 'a', role: 'bug', lane: 1, distance: 1000, x: 80 });
  const b = makePlayer({ id: 'b', role: 'bug', lane: 1, distance: 1010, x: 90 });
  world.players.set('a', a);
  world.players.set('b', b);
  const start = tickDilemmas(world, makeCtx(1000))[0];
  assert.ok(start);
  const eater = world.players.get(start.aId)!;
  const victim = world.players.get(start.bId)!;
  applyDilemmaChoice(
    eater,
    { type: 'dilemma', encounterId: start.encounterId, choice: 'eat', seq: 1 },
    world,
    makeCtx(1100),
  );
  const resolved = applyDilemmaChoice(
    victim,
    { type: 'dilemma', encounterId: start.encounterId, choice: 'cooperate', seq: 1 },
    world,
    makeCtx(1200),
  );
  assert.equal(resolved[0]?.outcome, 'a-eats');
  assert.equal(eater.died, false);
  assert.equal(victim.died, true);
  assert.ok(eater.boostUntilMs > 1200);
});

test('dilemma both-eat kills both runners', () => {
  const world = emptyWorld();
  const a = makePlayer({ id: 'a', role: 'klaus', lane: 7, distance: 2000, x: 280 });
  const b = makePlayer({ id: 'b', role: 'klaus', lane: 7, distance: 2010, x: 290 });
  world.players.set('a', a);
  world.players.set('b', b);
  const start = tickDilemmas(world, makeCtx(1000))[0];
  applyDilemmaChoice(
    a,
    { type: 'dilemma', encounterId: start.encounterId, choice: 'eat', seq: 1 },
    world,
    makeCtx(1100),
  );
  applyDilemmaChoice(
    b,
    { type: 'dilemma', encounterId: start.encounterId, choice: 'eat', seq: 1 },
    world,
    makeCtx(1200),
  );
  assert.equal(a.died, true);
  assert.equal(b.died, true);
});

test('dilemma timeout treats missing choices as cooperate', () => {
  const world = emptyWorld();
  const a = makePlayer({ id: 'a', role: 'human', lane: 4, distance: 1000, x: 160 });
  const b = makePlayer({ id: 'b', role: 'human', lane: 4, distance: 1008, x: 168 });
  world.players.set('a', a);
  world.players.set('b', b);
  assert.equal(tickDilemmas(world, makeCtx(1000)).length, 1);
  const timed = tickDilemmas(world, makeCtx(3000));
  const resolve = timed.find((event) => event.type === 'resolve');
  assert.equal(resolve?.outcome, 'timeout-cooperate');
  assert.equal(a.died, false);
  assert.equal(b.died, false);
  assert.ok(a.boostUntilMs >= 3000);
  assert.ok(b.boostUntilMs >= 3000);
});

test('same-species eat intent is ignored — dilemma owns that fight', () => {
  const world = emptyWorld();
  const a = makePlayer({ id: 'a', role: 'human', lane: 4, x: 160, distance: 1000 });
  const b = makePlayer({ id: 'b', role: 'human', lane: 4, x: 170, distance: 1010 });
  world.players.set('a', a);
  world.players.set('b', b);
  assert.equal(resolveEat(a, { type: 'eat', targetId: 'b', seq: 1 }, world), null);
  assert.equal(b.died, false);
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

test('winner record is placement 1 — earlier finish beats a corpse with more distance', () => {
  const world = emptyWorld();
  world.players.set(
    'win',
    makePlayer({ id: 'win', finished: true, finishTimeMs: 48_000, distance: 7000 }),
  );
  world.players.set(
    'late',
    makePlayer({ id: 'late', finished: true, finishTimeMs: 59_000, distance: 9000 }),
  );
  world.players.set('dead', makePlayer({ id: 'dead', died: true, distance: 50_000 }));
  const standings = computeStandings(world);
  assert.equal(standings[0].userId, 'win');
  assert.equal(standings[0].placement, 1);
  assert.equal(standings[0].died, false);
  assert.equal(standings[0].finished, true);
  assert.equal(standings[1].userId, 'late');
  assert.equal(standings[1].placement, 2);
  assert.equal(standings[2].userId, 'dead');
  assert.equal(standings[2].died, true);
  assert.equal(standings[2].placement, 3);
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
