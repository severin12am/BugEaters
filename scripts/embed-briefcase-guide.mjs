import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imgDir = path.join(root, 'public/assets/props/abilities');
const out = path.join(root, 'public/briefcase-guide.html');

const abilities = [
  { id: 'disable-barriers', name: 'OPENED BORDERS', description: 'Who opened them?', spawnsOnRoad: true, note: 'Disables lane dividers ~10s' },
  { id: 'disable-obstacles', name: 'BLACKROCK', description: "We're all on the same boat", spawnsOnRoad: true, note: 'Obstacles stop blocking you' },
  { id: 'enable-id', name: 'DIGITAL ID', description: "It's gonna make your life easier", spawnsOnRoad: true, note: 'Shows ID on rivals (needs NPC)', npc: true },
  { id: 'flashlight', name: 'NEXUS SAPIENS', description: 'Now you see', spawnsOnRoad: true, note: 'Brightens the road' },
  { id: 'flight-mode', name: 'DAVOS BROS', description: 'No obstacles for Davos Bros', spawnsOnRoad: false, note: 'Not spawned on road in Unity' },
  { id: 'hell-mode', name: 'SDG', description: '"S" stands for slow', spawnsOnRoad: true, note: '3× obstacle spawn rate' },
  { id: 'immortality', name: 'SHAREHOLDER', description: 'Nobody harms the shareholder', spawnsOnRoad: true, note: 'Invulnerable ~10s' },
  { id: 'needle-spawner', name: 'WUHAN LAB JUICE', description: "It doesn't have 99.7% survival rate", spawnsOnRoad: true, note: 'Not implemented yet', dev: true },
  { id: 'pos-alignment', name: 'GREAT RESET', description: 'Yes, The Great Reset', spawnsOnRoad: true, note: 'Pulls rivals to your row (needs NPC)', npc: true },
  { id: 'slowdown-other', name: 'TAXATION WITHOUT LEGISLATION', description: "It's transitory anyway", spawnsOnRoad: true, note: 'Slows rivals (needs NPC)', npc: true },
  { id: 'speed-up', name: 'CBDC RUN', description: 'You have 10 seconds before it expires', spawnsOnRoad: true, note: '5× speed ~10s' },
  { id: 'straw-spawner', name: 'PAPER STRAW', description: "It's surely gonna stop it", spawnsOnRoad: true, note: 'Not implemented yet', dev: true },
];

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function tags(a) {
  const t = [];
  t.push(a.spawnsOnRoad ? '<span class="tag road">on road</span>' : '<span class="tag">lab only</span>');
  if (a.npc) t.push('<span class="tag npc">needs rival</span>');
  if (a.dev) t.push('<span class="tag dev">stub</span>');
  return t.join('');
}

const cards = abilities
  .map((a) => {
    const b64 = fs.readFileSync(path.join(imgDir, `${a.id}.png`)).toString('base64');
    return `    <article class="card">
      <div class="icon-wrap">
        <img src="data:image/png;base64,${b64}" alt="${esc(a.name)}" width="64" height="48" />
      </div>
      <div class="meta">
        <h2 class="name">${esc(a.name)}</h2>
        <p class="desc">${esc(a.description)}</p>
        <p class="note">${esc(a.note)}</p>
        <div class="tags">${tags(a)}</div>
      </div>
    </article>`;
  })
  .join('\n\n');

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#080808" />
    <title>Briefcase guide — BugEaters</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html { -webkit-text-size-adjust: 100%; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background: #080808;
        color: #f0f0f0;
        line-height: 1.4;
        padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
      }
      header { text-align: center; margin-bottom: 20px; }
      h1 { margin: 0 0 6px; font-size: 1.35rem; font-weight: 700; letter-spacing: 0.04em; }
      .subtitle { margin: 0; color: #888; font-size: 0.85rem; }
      .grid { display: grid; grid-template-columns: 1fr; gap: 12px; max-width: 480px; margin: 0 auto; }
      @media (min-width: 520px) { .grid { grid-template-columns: 1fr 1fr; max-width: 720px; } }
      .card {
        display: flex; gap: 14px; align-items: flex-start;
        background: #121212; border: 1px solid #333; border-radius: 12px; padding: 12px 14px;
      }
      .icon-wrap {
        flex: 0 0 72px; width: 72px; height: 56px;
        display: flex; align-items: center; justify-content: center;
        background: #0a0a0a; border-radius: 8px; border: 1px solid #2a2a2a;
      }
      .icon-wrap img { max-width: 64px; max-height: 48px; width: auto; height: auto; object-fit: contain; }
      .meta { min-width: 0; flex: 1; }
      .name { margin: 0 0 4px; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.03em; color: #fff; }
      .desc { margin: 0 0 4px; font-size: 0.78rem; color: #aaa; }
      .note { margin: 0 0 6px; font-size: 0.72rem; color: #666; }
      .tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .tag { font-size: 0.65rem; padding: 2px 7px; border-radius: 999px; background: #1e1e1e; color: #777; border: 1px solid #333; }
      .tag.road { color: #8fd48f; border-color: #2a4a2a; }
      .tag.dev { color: #d4a574; border-color: #4a3a2a; }
      .tag.npc { color: #74a8d4; border-color: #2a3a4a; }
      footer { max-width: 480px; margin: 24px auto 0; text-align: center; font-size: 0.75rem; color: #555; }
    </style>
  </head>
  <body>
    <header>
      <h1>Briefcase guide</h1>
      <p class="subtitle">Offline — all icons embedded in this file</p>
    </header>
    <main class="grid">
${cards}
    </main>
    <footer>
      <p>Single file — send to your phone and open in Safari / Chrome.</p>
    </footer>
  </body>
</html>
`;

fs.writeFileSync(out, html);
console.log(`Wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
