/**
 * Hands-on two-window playtest of the real Phaser game.
 * Uses installed Chrome. Run after Vite + race-server are up:
 *   node scripts/play-auth-browser.mjs
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'scripts', '.playtest-artifacts');
const BASE = process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5173/';
const CHROME =
  process.env.CHROME_PATH ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

mkdirSync(outDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(label, timeoutMs, check) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < timeoutMs) {
    const value = await check();
    if (value) {
      return value;
    }
    last = String(value);
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${label} (last=${last})`);
}

async function openPlayer(browser, name, logs) {
  const page = await browser.newPage();
  attachLogs(page, name, logs);
  page.setDefaultTimeout(15_000);
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('bugeaters.onboarding.v1', '1');
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitUntil(`${name} Phaser ready`, 25_000, () =>
    page.evaluate(() => {
      const game = window.game;
      return Boolean(game?.scene && (game.scene.isActive('DevSessionScene') || game.scene.isActive('GameScene')));
    }),
  );
  return page;
}

async function sceneKey(page) {
  return page.evaluate(() => {
    const game = window.game;
    if (!game) {
      return null;
    }
    for (const key of ['GameScene', 'EndScene', 'OnboardingScene', 'DevSessionScene']) {
      if (game.scene.isActive(key)) {
        return key;
      }
    }
    return game.scene.getScenes(true)[0]?.scene?.key ?? null;
  });
}

function attachLogs(page, name, bucket) {
  page.on('console', (msg) => {
    bucket.push(`${name} console.${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => {
    bucket.push(`${name} pageerror: ${error.message}`);
  });
  page.on('requestfailed', (request) => {
    bucket.push(`${name} requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      bucket.push(`${name} http ${response.status()}: ${response.url()}`);
    }
  });
}

async function clickMenuButton(page, label) {
  const pos = await page.evaluate((want) => {
    const game = window.game;
    const scene = game?.scene?.getScene('DevSessionScene');
    const canvas = game?.canvas;
    if (!scene || !canvas) {
      return null;
    }
    const texts = [];
    const walk = (node, onHit) => {
      if (typeof node?.text === 'string') {
        texts.push(node.text);
        if (node.text.toUpperCase() === want) {
          onHit(node.parentContainer ?? node);
        }
      }
      const kids = node?.list ?? [];
      for (const child of kids) {
        walk(child, onHit);
      }
    };
    let button = null;
    walk({ list: scene.children?.list ?? [] }, (hit) => {
      button = hit;
    });
    if (!button) {
      return { error: 'button-not-found', texts };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / game.scale.width;
    const scaleY = rect.height / game.scale.height;
    return {
      x: rect.left + button.x * scaleX,
      y: rect.top + button.y * scaleY,
    };
  }, label);
  if (!pos || pos.error || typeof pos.x !== 'number') {
    throw new Error(`could not click ${label}: ${JSON.stringify(pos)}`);
  }
  await page.mouse.click(pos.x, pos.y);
}

async function mintTicket(roomId, userId, role) {
  const response = await fetch('http://127.0.0.1:2567/dev/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId,
      userId,
      role,
      maxPlayers: 6,
      startsAtMs: Date.now() + 4_000,
    }),
  });
  if (!response.ok) {
    throw new Error(`/dev/ticket ${userId} failed ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function startLocalRace(page, ticket) {
  page.setDefaultTimeout(15_000);
  const started = await page.evaluate((data) => {
    const scene = window.game?.scene?.getScene('DevSessionScene');
    if (!scene) {
      return { ok: false, reason: 'no-dev-scene' };
    }
    scene.registry.set('roomSession', null);
    scene.registry.set('roomMembers', null);
    scene.registry.set('soloPractice', true);
    scene.registry.set('selectedCharacter', data.claims.role);
    scene.registry.set('passBurnConfirmed', true);
    scene.registry.set('authLocalRace', {
      roomId: data.claims.roomId ?? data.roomId,
      userId: data.claims.userId,
      role: data.claims.role,
      globalSubLane: data.claims.globalSubLane,
      startsAtMs: data.claims.startsAtMs,
      seed: data.claims.seed,
      maxPlayers: data.claims.maxPlayers ?? 6,
      token: data.token,
    });
    window.game.scene.stop('DevSessionScene');
    window.game.scene.start('GameScene');
    return {
      ok: true,
      keys: Object.keys(window.game.scene.keys),
      active: window.game.scene.getScenes(true).map((entry) => entry.sys.settings.key),
    };
  }, ticket);
  if (!started.ok) {
    throw new Error(`could not start GameScene: ${started.reason}`);
  }
  console.log(`  start result keys=${started.keys?.join(',')} active=${started.active.join(', ')}`);
  await sleep(400);
}

async function raceProbe(page) {
  return page.evaluate(() => {
    const scene = window.game?.scene?.getScene('GameScene');
    if (!scene) {
      return { scene: null };
    }
    const view = scene.authRace?.getRenderState?.() ?? null;
    return {
      scene: 'GameScene',
      authActive: Boolean(scene.authRaceActive),
      phase: view?.phase ?? null,
      raceMs: view?.raceMs ?? 0,
      selfLane: view?.self?.lane ?? null,
      selfDistance: view?.self?.distance ?? null,
      remotes: (view?.remotePlayers ?? []).map((remote) => ({
        id: remote.userId,
        lane: remote.lane,
        distance: remote.distance,
      })),
    };
  });
}

async function sampleDistances(page, ms = 480) {
  return page.evaluate((durationMs) => {
    const scene = window.game?.scene?.getScene('GameScene');
    return new Promise((resolve) => {
      const samples = [];
      const start = performance.now();
      const tick = () => {
        const view = scene?.authRace?.getRenderState?.();
        samples.push({
          t: performance.now() - start,
          distance: view?.self?.distance ?? null,
          phase: view?.phase ?? null,
        });
        if (performance.now() - start < durationMs) {
          setTimeout(tick, 16);
        } else {
          resolve(samples);
        }
      };
      setTimeout(tick, 16);
    });
  }, ms);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 430, height: 900, deviceScaleFactor: 2 },
});

const logs = [];

try {
  const pageA = await openPlayer(browser, 'A', logs);
  const pageB = await openPlayer(browser, 'B', logs);
  await pageA.screenshot({ path: path.join(outDir, '01-a-menu.png') });
  await pageB.screenshot({ path: path.join(outDir, '01-b-menu.png') });

  assert.equal(await sceneKey(pageA), 'DevSessionScene', 'A should be on the playtest menu');
  assert.equal(await sceneKey(pageB), 'DevSessionScene', 'B should be on the playtest menu');
  const raceUrl = await pageA.evaluate(async () => {
    const mod = await import('/src/net/authoritative/env.ts');
    return { url: mod.RACE_SERVER_URL, configured: mod.isRaceServerConfigured, dev: mod.isRaceDevMode };
  });
  logs.push(`client race env: ${JSON.stringify(raceUrl)}`);
  console.log(`  client race env: ${JSON.stringify(raceUrl)}`);

  const roomId = `playtest-${Date.now()}`;
  const [ticketA, ticketB] = await Promise.all([
    mintTicket(roomId, 'player-a', 'bug'),
    mintTicket(roomId, 'player-b', 'human'),
  ]);
  await startLocalRace(pageA, ticketA);
  await waitUntil('A in GameScene', 15_000, async () => (await sceneKey(pageA)) === 'GameScene');
  await startLocalRace(pageB, ticketB);
  await waitUntil('B in GameScene', 15_000, async () => (await sceneKey(pageB)) === 'GameScene');
  await pageA.screenshot({ path: path.join(outDir, '02-a-joined.png') });
  await pageB.screenshot({ path: path.join(outDir, '02-b-joined.png') });
  console.log('  GameScene screenshots saved');

  await waitUntil('both connected', 12_000, async () => {
    const a = await raceProbe(pageA);
    const b = await raceProbe(pageB);
    console.log(`  probe A=${JSON.stringify(a)} B=${JSON.stringify(b)}`);
    return a.authActive && b.authActive && a.remotes.length >= 1 && b.remotes.length >= 1;
  });

  await pageA.screenshot({ path: path.join(outDir, '02-a-joined.png') });
  await pageB.screenshot({ path: path.join(outDir, '02-b-joined.png') });

  await waitUntil('race running', 20_000, async () => {
    const a = await raceProbe(pageA);
    const b = await raceProbe(pageB);
    return a.phase === 'racing' && b.phase === 'racing';
  });

  await pageA.screenshot({ path: path.join(outDir, '03-a-racing.png') });
  await pageB.screenshot({ path: path.join(outDir, '03-b-racing.png') });

  const before = await raceProbe(pageA);
  await pageA.keyboard.press('ArrowRight');
  await sleep(250);
  await pageA.keyboard.press('ArrowRight');
  await sleep(400);
  const after = await raceProbe(pageA);
  const seenByB = await raceProbe(pageB);

  await pageA.screenshot({ path: path.join(outDir, '04-a-after-move.png') });
  await pageB.screenshot({ path: path.join(outDir, '04-b-sees-a.png') });

  const samples = await sampleDistances(pageA, 500);
  const moving = samples.filter((sample) => typeof sample.distance === 'number');
  assert.ok(moving.length >= 10, `too few distance samples: ${moving.length}`);
  let advances = 0;
  let freezes = 0;
  for (let i = 1; i < moving.length; i++) {
    const delta = moving[i].distance - moving[i - 1].distance;
    if (delta > 0.05) {
      advances += 1;
    } else if (delta === 0) {
      freezes += 1;
    }
  }
  const freezeRatio = freezes / Math.max(1, moving.length - 1);

  const report = {
    before,
    after,
    seenByB,
    sampleCount: moving.length,
    advances,
    freezes,
    freezeRatio,
    firstDistance: moving[0].distance,
    lastDistance: moving[moving.length - 1].distance,
  };
  writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

  assert.ok(after.selfLane !== before.selfLane, `A lane should change (was ${before.selfLane}, now ${after.selfLane})`);
  assert.ok(
    seenByB.remotes.some((remote) => remote.lane === after.selfLane),
    `B should see A on lane ${after.selfLane}: ${JSON.stringify(seenByB.remotes)}`,
  );
  assert.ok(moving[moving.length - 1].distance > moving[0].distance, 'road must keep advancing');
  assert.ok(
    freezeRatio < 0.25,
    `road froze too often between frames (${(freezeRatio * 100).toFixed(0)}% zero-delta) — still hitching`,
  );

  console.log('  ✓ two Chrome windows opened the real game');
  console.log('  ✓ both joined Local multiplayer and saw each other');
  console.log(`  ✓ A moved lane ${before.selfLane} → ${after.selfLane}; B saw it`);
  console.log(
    `  ✓ ${moving.length} frames sampled, ${(freezeRatio * 100).toFixed(0)}% freezes, distance ${moving[0].distance.toFixed(1)} → ${moving[moving.length - 1].distance.toFixed(1)}`,
  );
  console.log(`  screenshots: ${outDir}`);
} catch (error) {
  writeFileSync(path.join(outDir, 'logs.txt'), logs.join('\n'));
  console.error(logs.slice(-40).join('\n'));
  throw error;
} finally {
  await browser.close();
}
