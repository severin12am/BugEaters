/**
 * Client netcode tests — extrapolation + clock smoothing.
 * Run: npm run test:client-net
 */
import assert from 'node:assert/strict';
import { DEFAULT_RACE_CONFIG } from '../src/config/raceConfig.js';
import { CLIENT_RACE_CONFIG } from '../../src/net/authoritative/clientRaceConfig.js';
import {
  BOOST_MULTIPLIER,
  CLOCK_SMOOTH_ALPHA,
  MAX_EXTRAPOLATE_SEC,
  SLOW_MULTIPLIER,
  extrapolateDistance,
  snapshotAgeSec,
  smoothClockOffset,
  speedMultiplierFromSnapshot,
} from '../../src/net/authoritative/distanceExtrapolator.js';

const tests: Array<{ name: string; fn: () => void }> = [];
const test = (name: string, fn: () => void) => tests.push({ name, fn });

test('client world speed matches the authoritative server', () => {
  assert.equal(CLIENT_RACE_CONFIG.speedPxPerSec, DEFAULT_RACE_CONFIG.world.speedPxPerSec);
});

test('stalled / dead / finished runners do not invent forward motion', () => {
  assert.equal(speedMultiplierFromSnapshot({ stalled: true }), 0);
  assert.equal(speedMultiplierFromSnapshot({ died: true }), 0);
  assert.equal(speedMultiplierFromSnapshot({ finished: true }), 0);
  assert.equal(extrapolateDistance(100, 0, 0.2), 100);
});

test('boost and slow match server multipliers', () => {
  assert.equal(speedMultiplierFromSnapshot({ boosted: true }), BOOST_MULTIPLIER);
  assert.equal(speedMultiplierFromSnapshot({ slowed: true }), SLOW_MULTIPLIER);
  assert.equal(speedMultiplierFromSnapshot({ sliding: true, boosted: true }), 1.5 * 1.5);
});

test('60fps frames between 20Hz snapshots keep moving (no stair-step freeze)', () => {
  const snapshotDistance = 1_000;
  const snapshotTime = 10_000;
  const frames: number[] = [];
  for (let now = snapshotTime; now < snapshotTime + 50; now += 16) {
    const dt = snapshotAgeSec(now, snapshotTime);
    frames.push(
      extrapolateDistance(snapshotDistance, 1, dt, CLIENT_RACE_CONFIG.speedPxPerSec),
    );
  }
  assert.ok(frames.length >= 3, 'several frames inside one snapshot interval');
  for (let i = 1; i < frames.length; i++) {
    assert.ok(frames[i]! > frames[i - 1]!, `frame ${i} must advance the road`);
  }
  const expected = snapshotDistance + CLIENT_RACE_CONFIG.speedPxPerSec * (48 / 1000);
  assert.ok(Math.abs(frames[frames.length - 1]! - expected) < 0.01);
});

test('a late packet still advances every frame, then caps so a disconnect cannot warp', () => {
  const start = 0;
  const at200 = extrapolateDistance(0, 1, snapshotAgeSec(200, start));
  const at400 = extrapolateDistance(0, 1, snapshotAgeSec(400, start));
  const at2000 = extrapolateDistance(0, 1, snapshotAgeSec(2_000, start));
  assert.ok(at200 > 80 && at200 < 100);
  assert.equal(snapshotAgeSec(2_000, start), MAX_EXTRAPOLATE_SEC);
  assert.equal(at400, at2000);
});

test('two runners share the same dt so the gap stays identical on both screens', () => {
  const dt = snapshotAgeSec(10_040, 10_000);
  const a = extrapolateDistance(1_000, 1, dt);
  const b = extrapolateDistance(1_200, 1, dt);
  assert.ok(Math.abs(b - a - 200) < 1e-9);
});

test('clock smoothing ignores jitter and snaps on a huge jump', () => {
  const first = smoothClockOffset(null, 180);
  assert.equal(first, 180);
  const next = smoothClockOffset(first, 220);
  assert.equal(next, 180 * (1 - CLOCK_SMOOTH_ALPHA) + 220 * CLOCK_SMOOTH_ALPHA);
  const reset = smoothClockOffset(next, next + 5_000);
  assert.equal(reset, next + 5_000);
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(error);
  }
}
if (failed > 0) {
  console.error(`\n${failed} client-net test(s) failed`);
  process.exit(1);
}
console.log(`\n${tests.length} client-net tests passed`);
