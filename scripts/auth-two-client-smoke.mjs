/**
 * Two live clients on one authoritative room (no browser windows).
 * Run: npm run smoke:auth-two-client
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';

const SPEED_PX_PER_SEC = 442;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'two-client-smoke-secret';
const PORT = Number(process.env.RACE_SMOKE_PORT ?? 2567);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readHealth(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`health ${response.status}`);
  }
  return response.json();
}

async function waitForHealth(url, timeoutMs = 20_000) {
  const start = Date.now();
  let lastError = 'not started';
  while (Date.now() - start < timeoutMs) {
    try {
      return await readHealth(url);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(200);
  }
  throw new Error(`race server did not become healthy: ${url} (${lastError})`);
}

async function mintTicket(httpBase, roomId, userId, role, extra = {}) {
  const response = await fetch(`${httpBase}/dev/ticket`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roomId, userId, role, maxPlayers: 6, ...extra }),
  });
  if (!response.ok) {
    throw new Error(`ticket ${userId}: ${await response.text()}`);
  }
  return response.json();
}

function joinPlayer(wsUrl, token, roomId) {
  const snapshots = [];
  const client = new Client(wsUrl);
  return client.joinOrCreate('race', { token, roomKey: roomId }).then((room) => {
    room.onMessage('snapshot', (snapshot) => {
      snapshots.push(snapshot);
    });
    return { room, snapshots, client };
  });
}

function latestSelf(snapshots, userId) {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const player = snapshots[i].players.find((entry) => entry.userId === userId);
    if (player) {
      return { snapshot: snapshots[i], player };
    }
  }
  return null;
}

async function waitUntil(label, timeoutMs, check) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) {
      return;
    }
    await sleep(50);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const httpBase = `http://127.0.0.1:${PORT}`;
const wsUrl = `ws://127.0.0.1:${PORT}`;
const roomId = `two-client-${Date.now()}`;

let server = null;
let serverLog = '';
let spawned = false;

const shutdown = () => {
  if (spawned && server && !server.killed) {
    server.kill();
  }
};
process.on('exit', shutdown);

try {
  let health;
  try {
    health = await readHealth(`${httpBase}/healthz`);
    console.log(`  using already-running race server on :${PORT}`);
  } catch {
    spawned = true;
    server = spawn('npx', ['tsx', 'server/src/index.ts'], {
      cwd: root,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(PORT),
        RACE_DEV_MODE: '1',
        RACE_TOKEN_SECRET: process.env.RACE_TOKEN_SECRET || SECRET,
        WEB_ORIGIN: '*',
      },
    });
    server.stdout.on('data', (chunk) => {
      serverLog += String(chunk);
    });
    server.stderr.on('data', (chunk) => {
      serverLog += String(chunk);
    });
    health = await waitForHealth(`${httpBase}/healthz`);
  }
  if (health && health.devMode === false) {
    throw new Error('race server is up but RACE_DEV_MODE is off — cannot mint /dev/ticket');
  }
  const startsAtMs = Date.now() + 4_000;
  const [ticketA, ticketB] = await Promise.all([
    mintTicket(httpBase, roomId, 'player-a', 'bug', { startsAtMs }),
    mintTicket(httpBase, roomId, 'player-b', 'human', { startsAtMs }),
  ]);
  assert.equal(ticketA.claims.seed, ticketB.claims.seed, 'shared seed');
  assert.equal(ticketA.claims.startsAtMs, ticketB.claims.startsAtMs, 'shared start');
  assert.equal(ticketA.claims.roomId, ticketB.claims.roomId, 'shared Colyseus room');
  assert.equal(ticketA.claims.role, 'bug');
  assert.equal(ticketB.claims.role, 'human');

  const raceRoomId = ticketA.claims.roomId;
  const a = await joinPlayer(wsUrl, ticketA.token, raceRoomId);
  const b = await joinPlayer(wsUrl, ticketB.token, raceRoomId);

  await waitUntil('both clients in the same room', 8_000, () => {
    const seenA = latestSelf(a.snapshots, 'player-a');
    const seenB = latestSelf(b.snapshots, 'player-b');
    return (
      seenA?.snapshot.players.length === 2 &&
      seenB?.snapshot.players.length === 2 &&
      Boolean(seenA.snapshot.players.find((player) => player.userId === 'player-b')) &&
      Boolean(seenB.snapshot.players.find((player) => player.userId === 'player-a'))
    );
  });

  await waitUntil('race started', 15_000, () => {
    const phaseA = a.snapshots.at(-1)?.phase;
    const phaseB = b.snapshots.at(-1)?.phase;
    return phaseA === 'racing' && phaseB === 'racing';
  });

  const before = latestSelf(a.snapshots, 'player-a');
  assert.ok(before, 'player A has a snapshot');
  a.room.send('input', {
    type: 'move',
    direction: 'left',
    seq: 1,
    clientTimeMs: Date.now(),
  });

  await waitUntil('B sees A change lane', 4_000, () => {
    const view = latestSelf(b.snapshots, 'player-a');
    return Boolean(view && view.player.lane === before.player.lane - 1);
  });

  const startCount = a.snapshots.length;
  await waitUntil('more racing snapshots', 3_000, () => a.snapshots.length >= startCount + 8);

  const racing = a.snapshots.filter((snapshot) => snapshot.phase === 'racing');
  assert.ok(racing.length >= 6, 'enough racing snapshots to check motion');
  const first = racing[0].players.find((player) => player.userId === 'player-a');
  const last = racing[racing.length - 1].players.find((player) => player.userId === 'player-a');
  assert.ok(first && last, 'player A present throughout');
  assert.ok(last.distance > first.distance, 'server distance advances while racing');

  const snapshot = racing[racing.length - 2];
  const player = snapshot.players.find((entry) => entry.userId === 'player-a');
  assert.ok(player);
  const frameA = player.distance + SPEED_PX_PER_SEC * (16 / 1000);
  const frameB = player.distance + SPEED_PX_PER_SEC * (32 / 1000);
  assert.ok(frameA > player.distance, '16ms later the road has moved');
  assert.ok(frameB > frameA, 'next frame keeps moving — no 20Hz freeze');

  const gapA = latestSelf(a.snapshots, 'player-b').player.distance - latestSelf(a.snapshots, 'player-a').player.distance;
  const gapB = latestSelf(b.snapshots, 'player-b').player.distance - latestSelf(b.snapshots, 'player-a').player.distance;
  assert.ok(Math.abs(gapA - gapB) < 30, `both screens see the same gap (A=${gapA.toFixed(1)} B=${gapB.toFixed(1)})`);

  await a.room.leave();
  await b.room.leave();
  console.log('  ✓ two clients joined one room (Bug + Human)');
  console.log('  ✓ B saw A change lane');
  console.log('  ✓ distances advanced and extrapolation keeps 60fps frames moving');
  console.log('Two-client smoke OK');
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  shutdown();
}
