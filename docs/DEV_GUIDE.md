# Developer guide

---

## Prerequisites

- Node.js 18+
- npm
- Optional: Supabase CLI for backend deploy
- Optional: ngrok for Telegram phone testing

---

## Commands

```bash
npm install
npm run dev          # Vite dev server, http://localhost:5173
npm run build        # TypeScript check + production bundle → dist/
npm run preview      # Static serve dist/
npm run preview -- --host --port 4173   # LAN + phone access
```

Environment: copy `.env.example` → `.env.local`

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon key |
| `VITE_FORCED_SEED` | Fixed RNG seed for obstacles |

---

## URL parameters

| Param | Example | Effect |
|-------|---------|--------|
| `abilityLab` | `?abilityLab=1` | Boot → GameScene lab mode |
| `tournamentDay` | `?tournamentDay=tuesday` | Override weekday in Week Hub |
| `seed` | `?seed=42` | Force obstacle/divider seed |

Implementation: `src/dev/abilityLab.ts`, `src/tournament/weekClock.ts`, `src/net/env.ts`.

---

## Ability Lab

**Purpose:** Test all 12 abilities without tournament flow or timer pressure.

**Enable:** `http://localhost:5173/?abilityLab=1`

**Behavior** (`GameScene` when `isLab`):

- Skips Week Hub; starts as Human on lane 4.
- One Bug NPC ahead (`labNpcInitialRaceDistance: ux(120)`).
- **God mode** — no death from hazards/eating (toggle in panel).
- **Infinite timer** — shows elapsed LAB time.
- **Ability Lab panel** — buttons fire each ability; overlay guide.

**Files:**

- `src/dev/abilityLab.ts` — URL detection
- `src/managers/AbilityLabPanel.ts` — UI
- `BootScene` — routes to GameScene with registry flags

---

## Phone / Telegram testing

1. `npm run build && npm run preview -- --host --port 4173`
2. `ngrok http 4173` (or stable tunnel)
3. Set BotFather Web App / menu button URL
4. Ensure `TELEGRAM_BOT_TOKEN` in Supabase Edge Function secrets

Full steps: [`PHONE_TEST_NOW.md`](PHONE_TEST_NOW.md), [`TESTING_TOURNAMENT.md`](TESTING_TOURNAMENT.md).

**Ability Lab on phone:** append `?abilityLab=1` to tunnel URL.

---

## Balancing gameplay

**Single file:** `src/config/tuning.ts`

| Want to change | Key |
|----------------|-----|
| Race length | `race.durationSec` |
| Scroll speed | `physics.scrollSpeed` |
| Jump feel | `physics.jumpVelocity`, `physics.gravity` |
| Trash jump timing | `obstacles.trashJumpTriggerAheadPx` |
| Manhole size | `obstacles.manholeDisplayHeight`, `manholeSizeMultiplier` |
| SDG hell multiplier | Code: `ObstacleManager.setHellModeLanes` (currently 2×) |
| Taxation slow | `abilities.npcSlowProgressMultiplier` |
| CBDC speed | `abilities.ts` → `speed-up.param` (1.3) |
| Eating reach | `eating.horizontalReach`, `verticalReach` |

After edits: `npm run build` and hard-refresh client.

Lighting separate file: `src/config/lighting.ts`.

---

## Scripts (`scripts/`)

| Script | When to run |
|--------|-------------|
| `python scripts/export_unity_props.py` | Refresh passport/syringe/straw from Unity textures |
| `python scripts/extract_unity_audio.py` | Re-extract SFX from Unity project |
| `node scripts/embed-briefcase-guide.mjs` | Rebuild offline ability guide with embedded icons |
| `python scripts/verify_assets.py` | Check required PNGs exist |

Unity project path is hardcoded in export scripts (Windows path to `full unity bug eaters`).

---

## Project structure quick map

See [`CODEBASE.md`](CODEBASE.md) for full file listing.

```
src/scenes/GameScene.ts     ← race loop
src/managers/AbilityExecutor.ts
src/config/tuning.ts        ← balance
src/config/abilities.ts     ← ability defs
supabase/functions/         ← Edge Functions
public/assets/              ← art + audio
```

---

## Debugging tips

| Issue | Check |
|-------|-------|
| Solo race won't start | GameScene requires session or `?abilityLab=1` |
| Obstacles differ between clients | Same room `seed`? |
| Timer desync in MP | `starts_at` wall clock vs `useWallClock` |
| Grey screen edges | Camera backdrop sync in `updateCameraFollow` |
| Ability no effect | `AbilityExecutor.activate` switch + timed expiry |
| NPC not dying from syringe | `SyringeThrowManager` → `npcManager` wired in GameScene |

---

## Typecheck & build

```bash
npx tsc --noEmit    # types only
npm run build       # full production build
```

Vite bundles to `dist/` — deploy that folder to static hosting (Vercel, Cloudflare Pages, etc.).

---

## Related docs

- [`RACE_MECHANICS.md`](RACE_MECHANICS.md) — how the race works
- [`ABILITIES.md`](ABILITIES.md) — ability behaviors
- [`BACKEND.md`](BACKEND.md) — Supabase setup
- [`SCENES_AND_FLOW.md`](SCENES_AND_FLOW.md) — navigation
