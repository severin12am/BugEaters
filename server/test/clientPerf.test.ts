/**
 * Client performance-profile tests — device tier heuristics + race frame monitor.
 * Run: npm run test:client-perf
 */
import assert from 'node:assert/strict';
import {
  FRAME_MONITOR,
  FrameMonitor,
  PERF_PROFILE,
  detectLowEndDevice,
  screenPixelDprCap,
} from '../../src/utils/perf.js';

const tests: Array<{ name: string; fn: () => void }> = [];
const test = (name: string, fn: () => void) => tests.push({ name, fn });

test('outside a browser the profile is the sharp default tier', () => {
  assert.equal(PERF_PROFILE.tier, 'high');
  assert.equal(PERF_PROFILE.dprCap, 2);
  assert.equal(PERF_PROFILE.source, 'default');
});

test('low RAM flags a weak phone; a modern phone does not', () => {
  assert.equal(detectLowEndDevice({ deviceMemory: 2, hardwareConcurrency: 8 }), true);
  assert.equal(detectLowEndDevice({ deviceMemory: 3 }), true);
  assert.equal(detectLowEndDevice({ deviceMemory: 8, hardwareConcurrency: 8 }), false);
  assert.equal(detectLowEndDevice({}), false);
});

test('few cores only counts on Android (Safari clamps hardwareConcurrency)', () => {
  const android = 'Mozilla/5.0 (Linux; Android 11; SM-A125F) Chrome/120 Mobile';
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1';
  assert.equal(detectLowEndDevice({ hardwareConcurrency: 4, userAgent: android }), true);
  assert.equal(detectLowEndDevice({ hardwareConcurrency: 4, userAgent: iphone }), false);
  assert.equal(detectLowEndDevice({ hardwareConcurrency: 8, userAgent: android }), false);
});

test('screen cap never renders more pixels than the phone has', () => {
  // iPhone 14: 390×844 @3 — the tier cap (2) stays the limit.
  assert.equal(screenPixelDprCap(390, 844, { width: 390, height: 844, dpr: 3 }), 3);
  // iPhone 8: 375×667 @2 → 1334 device px tall vs 844 logical → 1.58.
  assert.equal(screenPixelDprCap(390, 844, { width: 375, height: 667, dpr: 2 }), 1.58);
  // Small Android 360×640 @1.5 → 960 px tall → 1.14.
  assert.equal(screenPixelDprCap(390, 844, { width: 360, height: 640, dpr: 1.5 }), 1.14);
  // Landscape report still pairs the short side with logical width.
  assert.equal(screenPixelDprCap(390, 844, { width: 667, height: 375, dpr: 2 }), 1.58);
  // Never below 1; unknown screen → no cap.
  assert.equal(screenPixelDprCap(390, 844, { width: 200, height: 300, dpr: 1 }), 1);
  assert.equal(screenPixelDprCap(390, 844, {}), Number.POSITIVE_INFINITY);
});

test('frame monitor ignores warm-up and huge tab-switch gaps', () => {
  const monitor = new FrameMonitor();
  // Warm-up: nothing sampled yet.
  for (let ms = 0; ms < FRAME_MONITOR.warmupMs; ms += 16) {
    monitor.sample(16);
  }
  const warmFrames = monitor.sampledFrames;
  monitor.sample(5_000); // backgrounded tab — not a hitch
  assert.equal(monitor.sampledFrames, warmFrames);
  assert.equal(monitor.ranPoorly(), false);
});

test('a smooth 60fps race is never marked poor', () => {
  const monitor = new FrameMonitor();
  for (let i = 0; i < 4_000; i++) {
    monitor.sample(16.7);
  }
  assert.ok(monitor.sampledFrames >= FRAME_MONITOR.minFrames);
  assert.ok(monitor.slowShare < 0.01);
  assert.ok(Math.abs(monitor.averageFps - 60) < 1);
  assert.equal(monitor.ranPoorly(), false);
});

test('a race with sustained hitches is marked poor, a short sample is not', () => {
  const poor = new FrameMonitor();
  // Alternate 33ms (hitch) and 16ms (fine) → 50% slow.
  for (let i = 0; i < 4_000; i++) {
    poor.sample(i % 2 === 0 ? 34 : 16);
  }
  assert.ok(poor.slowShare >= FRAME_MONITOR.slowShareThreshold);
  assert.equal(poor.ranPoorly(), true);

  const brief = new FrameMonitor();
  for (let ms = 0; ms < FRAME_MONITOR.warmupMs + 100; ms += 34) {
    brief.sample(34);
  }
  assert.ok(brief.sampledFrames < FRAME_MONITOR.minFrames);
  assert.equal(brief.ranPoorly(), false);
});

test('live fps readout tracks the recent window', () => {
  const monitor = new FrameMonitor();
  for (let ms = 0; ms < FRAME_MONITOR.warmupMs + 1_000; ms += 20) {
    monitor.sample(20);
  }
  assert.ok(Math.abs(monitor.fps - 50) < 1);
  assert.equal(monitor.recentSlowShare, 0);
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
  console.error(`\n${failed} client-perf test(s) failed`);
  process.exit(1);
}
console.log(`\n${tests.length} client-perf tests passed`);
