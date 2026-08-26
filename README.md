# BugEaters

A **60-second lane runner** built as a **Telegram Mini App** (Phaser 3 + TypeScript + Vite). Three species — Bug, Human, Klaus — race on a dark road under street-lamp lighting, dodge hazards, eat each other in a food chain, and use **12 briefcase abilities** picked up during the run.

**Production direction:** weekly global tournament (Monday free → pass-gated Tue–Sun → Sunday finale). See product canon in [`docs/APP_MASTER_SPEC.md`](docs/APP_MASTER_SPEC.md).

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc + vite → dist/
npm run preview      # serve dist/ (use --host for phone)
```

Copy `.env.example` → `.env.local` and set Supabase vars for multiplayer. Without them the client runs in **offline / ability-lab** modes only (GameScene gates non-tournament solo).

---

## Documentation index

| Doc | What it covers |
|-----|----------------|
| [**docs/MODEL_AUDIT_GUIDE.md**](docs/MODEL_AUDIT_GUIDE.md) | **Start here for AI/code audits** — dual paths, symptom→file, server map |
| [**docs/README.md**](docs/README.md) | Full doc hierarchy |
| [**docs/CODEBASE.md**](docs/CODEBASE.md) | **Every source file — what it does** |
| [**docs/RACE_MECHANICS.md**](docs/RACE_MECHANICS.md) | Gameplay as implemented today |
| [**docs/ABILITIES.md**](docs/ABILITIES.md) | All 12 briefcase abilities + code paths |
| [**docs/SCENES_AND_FLOW.md**](docs/SCENES_AND_FLOW.md) | Scenes, registry keys, navigation |
| [**docs/DEV_GUIDE.md**](docs/DEV_GUIDE.md) | Ability Lab, phone test, scripts, tuning |
| [**docs/BACKEND.md**](docs/BACKEND.md) | Supabase, Edge Functions, networking |
| [**docs/APP_MASTER_SPEC.md**](docs/APP_MASTER_SPEC.md) | Product canon (tournament invariants) |
| [**content/encyclopedia.md**](content/encyclopedia.md) | **Player encyclopedia** (in-game Guide — single source) |

Legacy: [`GAME_OVERVIEW.md`](GAME_OVERVIEW.md) has useful multiplayer detail but **obsolete mechanics** (trash carry, old flow). Prefer the docs above.

---

## Repo layout

```
d:\BE\
├── src/                 # Phaser client (see docs/CODEBASE.md)
├── public/assets/       # Characters, props, audio, ability PNGs
├── supabase/            # Migrations + Edge Functions
├── scripts/             # Unity export, asset tools, guide embed
├── docs/                # Specifications & guides
├── old_unity_game/      # Original Unity WebGL reference
└── ios-handoff/         # Native iOS port brief (separate track)
```

---

## Dev shortcuts

| URL param | Effect |
|-----------|--------|
| `?abilityLab=1` | Skip to GameScene with one Bug NPC, infinite timer, ability test panel |
| `?tournamentDay=monday` | Force tournament weekday in Week Hub (also `tuesday` … `sunday`) |
| `?seed=12345` | Fixed obstacle/divider RNG seed |
| `VITE_FORCED_SEED` | Same as seed via env |

Phone testing: see [`docs/DEV_GUIDE.md`](docs/DEV_GUIDE.md) and [`docs/PHONE_TEST_NOW.md`](docs/PHONE_TEST_NOW.md).

---

## Stack

| Layer | Technology |
|-------|------------|
| Client | Phaser 3.87, TypeScript, Vite 6 |
| Backend | Supabase (Postgres, Realtime, Edge Functions) |
| Target | Telegram Mini App (touch-first) |

---

*For “what code does what”, start with [`docs/CODEBASE.md`](docs/CODEBASE.md).*
