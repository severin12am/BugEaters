/**
 * Authoritative race smoke checks (no browser).
 * Run: node scripts/auth-race-smoke.mjs
 * Optional live Fly: RACE_SMOKE_URL=https://bugeaters-race.fly.dev node scripts/auth-race-smoke.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runTsx(file) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', file], {
      cwd: root,
      shell: true,
      stdio: 'inherit',
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${file} exit ${code}`))));
  });
}

async function runUnitSuite() {
  await runTsx('server/test/simulation.test.ts');
  await runTsx('server/test/devTicketWaves.test.ts');
  await runTsx('server/test/clientDistanceExtrapolator.test.ts');
}

async function liveHealthCheck() {
  const base = process.env.RACE_SMOKE_URL;
  if (!base) {
    console.log('  (skip live) set RACE_SMOKE_URL to probe Fly /healthz + /dev/ticket');
    return;
  }
  const health = await fetch(`${base.replace(/\/$/, '')}/healthz`);
  assert.equal(health.ok, true, '/healthz should be ok');
  const body = { roomId: `smoke-${Date.now()}`, role: 'bug', maxPlayers: 6 };
  const t1 = await fetch(`${base.replace(/\/$/, '')}/dev/ticket`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, userId: 'smoke-a' }),
  });
  const t2 = await fetch(`${base.replace(/\/$/, '')}/dev/ticket`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, userId: 'smoke-b', role: 'human' }),
  });
  assert.equal(t1.ok, true, 'ticket A');
  assert.equal(t2.ok, true, 'ticket B');
  const a = await t1.json();
  const b = await t2.json();
  assert.equal(a.claims.seed, b.claims.seed, 'same room seed');
  assert.equal(a.claims.startsAtMs, b.claims.startsAtMs, 'same start time');
  assert.equal(a.claims.roomId, b.claims.roomId, 'same Colyseus room');
  console.log('  ✓ live Fly ticket pair matches (seed + start)');
}

console.log('Auth race smoke');
await runUnitSuite();
await liveHealthCheck();
console.log('\nSmoke OK');
