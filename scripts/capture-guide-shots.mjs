/**
 * Capture real GameScene photos for the in-game Guide (First steps).
 *
 * Requires Vite:  npm run dev -- --port 5173 --strictPort
 * Chrome:         default path, or CHROME_PATH=
 *
 *   node scripts/capture-guide-shots.mjs
 *
 * Writes public/assets/guide/{runner,you,others,obstacles,boosts}.png
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'assets', 'guide');
const scratchDir = path.join(root, 'scripts', '.playtest-artifacts', 'guide');
const BASE = process.env.PLAYTEST_URL ?? 'http://127.0.0.1:5173/';
const CHROME =
  process.env.CHROME_PATH ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

mkdirSync(outDir, { recursive: true });
mkdirSync(scratchDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function clamp01(n) {
  return round(Math.min(0.88, Math.max(0.12, n)));
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
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${label} (last=${last})`);
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

async function prepareGuideView(page) {
  await page.evaluate(() => {
    const scene = window.game?.scene?.getScene('GameScene');
    if (!scene) {
      return;
    }
    scene.triggerDeath = () => {};
    scene.hudObjects?.forEach((obj) => {
      obj.setVisible?.(false);
      obj.list?.forEach((child) => child.setVisible?.(false));
    });
    scene.uiCamera?.setVisible(false);
    const lighting = scene.lightingManager;
    if (lighting && !lighting.__guideCapturePatched) {
      lighting.__guideCapturePatched = true;
      const orig = lighting.update.bind(lighting);
      lighting.update = function (lamps, runners) {
        orig(lamps, runners);
        this.darknessVeil?.setVisible(false).setAlpha(0);
      };
      lighting.darknessVeil?.setVisible(false).setAlpha(0);
    }
  });
}

async function pauseRace(page, paused) {
  await page.evaluate((stop) => {
    const game = window.game;
    if (stop) {
      game.scene.pause('GameScene');
    } else {
      game.scene.resume('GameScene');
    }
  }, paused);
}

async function setNpcsVisible(page, visible) {
  await page.evaluate((show) => {
    const npcs = window.game.scene.getScene('GameScene').npcManager?.npcs ?? [];
    npcs.forEach((npc) => npc.runner?.setVisible(show));
  }, visible);
}

async function worldMeta(page) {
  return page.evaluate(() => {
    const game = window.game;
    const scene = game?.scene?.getScene('GameScene');
    if (!scene) {
      return null;
    }
    const cam = scene.cameras.main;
    const gw = game.scale.width;
    const gh = game.scale.height;
    const toNorm = (gx, gy) => ({
      nx: ((gx - cam.scrollX) * cam.zoom) / gw,
      ny: ((gy - cam.scrollY) * cam.zoom) / gh,
    });
    const player = scene.player
      ? { ...toNorm(scene.player.x, scene.player.y), x: scene.player.x, y: scene.player.y }
      : null;
    const others = (scene.npcManager?.getActiveRunners?.() ?? []).map((npc) => ({
      ...toNorm(npc.x, npc.y),
      lane: npc.globalSubLane,
    }));
    const obstacles = (scene.obstacleManager?.getAll?.() ?? []).map((obs) => ({
      type: obs.type,
      state: obs.manholeState ?? null,
      abilityId: obs.abilityId ?? null,
      ...toNorm(obs.sprite.x, obs.sprite.y),
    }));
    return { player, others, obstacles, gw, gh };
  });
}

async function composeHazards(page, kind) {
  await page.evaluate((mode) => {
    const scene = window.game.scene.getScene('GameScene');
    const om = scene.obstacleManager;
    const gh = window.game.scale.height;
    [...om.getAll()].forEach((obs) => om.removeObstacle(obs));

    const place = (method, lane, ny) => {
      om[method](lane, 0);
      const obs = om.getAll()[om.getAll().length - 1];
      if (obs) {
        obs.sprite.y = gh * ny;
        obs.pinned = true;
      }
      return obs;
    };

    if (mode === 'runner') {
      place('spawnTrash', 0, 0.22);
      place('spawnPuddle', 2, 0.16);
    }

    if (mode === 'clear') {
      return;
    }

    if (mode === 'obstacles') {
      place('spawnTrash', 0, 0.36);
      // Prefer an open hole in the human third so the camera actually sees it.
      for (let i = 0; i < 16; i += 1) {
        const hole = place('spawnManhole', 1, 0.28);
        if (hole?.manholeState === 'open') {
          break;
        }
        if (hole) {
          om.removeObstacle(hole);
        }
      }
    }

    if (mode === 'boosts') {
      place('spawnPuddle', 1, 0.4);
      place('spawnAbility', 1, 0.22);
    }
  }, kind);
}

async function fanOthers(page) {
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('GameScene');
    const npcs = scene.npcManager?.npcs ?? [];
    const visible = npcs.filter((npc) => npc.runner?.visible && !npc.runner.getIsDead?.());
    const groundY = scene.groundY;
    const offsets = [240, 390, 150, 520, 95];
    visible.forEach((npc, i) => {
      npc.runner.y = groundY - offsets[i % offsets.length];
    });
  });
}

async function canvasBox(page) {
  const canvas = await page.$('canvas');
  if (!canvas) {
    throw new Error('no canvas');
  }
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('canvas has no box');
  }
  return box;
}

function clampClip(box, clipNorm) {
  const x = box.x + box.width * clipNorm.x;
  const y = box.y + box.height * clipNorm.y;
  const width = box.width * clipNorm.w;
  const height = box.height * clipNorm.h;
  return {
    x: Math.max(box.x, x),
    y: Math.max(box.y, y),
    width: Math.min(width, box.x + box.width - Math.max(box.x, x)),
    height: Math.min(height, box.y + box.height - Math.max(box.y, y)),
  };
}

function inClip(pt, clip) {
  return {
    nx: (pt.nx - clip.x) / clip.w,
    ny: (pt.ny - clip.y) / clip.h,
  };
}

async function shot(page, filename, clipNorm) {
  const box = await canvasBox(page);
  const clip = clipNorm ? clampClip(box, clipNorm) : box;
  const dest = path.join(scratchDir, filename);
  await page.screenshot({ path: dest, clip, type: 'png' });
  copyFileSync(dest, path.join(outDir, filename));
  return dest;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 },
});

const logs = [];
const meta = {};

try {
  const page = await browser.newPage();
  page.on('console', (msg) => logs.push(`console.${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('bugeaters.onboarding.v1', '1');
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitUntil('menu', 25_000, async () => (await sceneKey(page)) === 'DevSessionScene');
  await page.evaluate(() => {
    const scene = window.game?.scene?.getScene('DevSessionScene');
    if (!scene) {
      return;
    }
    scene.registry.set('roomSession', null);
    scene.registry.set('roomMembers', null);
    scene.registry.set('authLocalRace', null);
    scene.registry.set('soloPractice', true);
    scene.registry.set('selectedCharacter', 'human');
    scene.registry.set('passBurnConfirmed', true);
    window.game.scene.stop('DevSessionScene');
    window.game.scene.start('GameScene');
  });
  await waitUntil('race', 15_000, async () => (await sceneKey(page)) === 'GameScene');
  await sleep(900);
  await prepareGuideView(page);
  await sleep(200);

  await pauseRace(page, true);
  await prepareGuideView(page);
  await setNpcsVisible(page, false);
  await composeHazards(page, 'runner');
  const runnerClip = { x: 0.04, y: 0.04, w: 0.92, h: 0.9 };
  meta.runner = await worldMeta(page);
  await shot(page, 'runner.png', runnerClip);
  console.log('  wrote runner.png');

  await composeHazards(page, 'clear');
  const youClip = { x: 0.28, y: 0.52, w: 0.44, h: 0.4 };
  meta.you = await worldMeta(page);
  await shot(page, 'you.png', youClip);
  console.log('  wrote you.png');

  await setNpcsVisible(page, true);
  await composeHazards(page, 'clear');
  await fanOthers(page);
  const othersClip = { x: 0.02, y: 0.12, w: 0.96, h: 0.8 };
  meta.others = await worldMeta(page);
  await shot(page, 'others.png', othersClip);
  console.log('  wrote others.png');

  await setNpcsVisible(page, false);
  await composeHazards(page, 'obstacles');
  await prepareGuideView(page);
  const obsClip = { x: 0.04, y: 0.12, w: 0.92, h: 0.8 };
  meta.obstacles = await worldMeta(page);
  await shot(page, 'obstacles.png', obsClip);
  console.log('  wrote obstacles.png');

  await composeHazards(page, 'boosts');
  const boostClip = { x: 0.04, y: 0.12, w: 0.92, h: 0.8 };
  meta.boosts = await worldMeta(page);
  await shot(page, 'boosts.png', boostClip);
  console.log('  wrote boosts.png');

  const clips = {
    runner: runnerClip,
    you: youClip,
    others: othersClip,
    obstacles: obsClip,
    boosts: boostClip,
  };
  const callouts = {};
  for (const [id, clip] of Object.entries(clips)) {
    const snapshot = meta[id];
    if (!snapshot) {
      continue;
    }
    const chips = [];
    if (snapshot.player && (id === 'you' || id === 'others')) {
      const p = inClip(snapshot.player, clip);
      chips.push({ text: 'YOU', nx: clamp01(p.nx), ny: clamp01(p.ny - 0.16) });
    }
    if (id === 'others') {
      const above = (snapshot.others ?? [])
        .filter((npc) => npc.ny < (snapshot.player?.ny ?? 1) - 0.1 && npc.nx > 0.1 && npc.nx < 0.9)
        .sort((a, b) => a.ny - b.ny);
      const pick = above[0];
      if (pick) {
        const p = inClip(pick, clip);
        chips.push({ text: 'OTHERS', nx: clamp01(p.nx), ny: clamp01(p.ny - 0.04) });
      }
    }
    if (id === 'obstacles') {
      for (const obs of snapshot.obstacles ?? []) {
        const p = inClip(obs, clip);
        if (obs.type === 'trash') {
          chips.push({ text: 'TRASH', nx: clamp01(p.nx), ny: clamp01(p.ny - 0.1) });
        }
        if (obs.type === 'manhole') {
          chips.push({ text: 'HOLE', nx: clamp01(p.nx), ny: clamp01(p.ny) });
        }
      }
    }
    if (id === 'boosts') {
      for (const obs of snapshot.obstacles ?? []) {
        const p = inClip(obs, clip);
        if (obs.type === 'puddle') {
          chips.push({ text: 'PUDDLE', nx: clamp01(p.nx), ny: clamp01(p.ny - 0.06) });
        }
        if (obs.type === 'ability') {
          chips.push({ text: 'BRIEFCASE', nx: clamp01(p.nx), ny: clamp01(p.ny - 0.08) });
        }
      }
    }
    if (id === 'runner') {
      callouts[id] = [{ text: 'UP THE ROAD', nx: 0.5, ny: 0.14 }];
    } else {
      callouts[id] = chips;
    }
  }

  writeFileSync(path.join(scratchDir, 'callouts.json'), JSON.stringify({ callouts, meta }, null, 2));
  console.log('  guide shots ready in public/assets/guide/');
  console.log(JSON.stringify(callouts, null, 2));
} catch (error) {
  console.error(error);
  writeFileSync(path.join(scratchDir, 'capture-error.txt'), `${error}\n\n${logs.join('\n')}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
