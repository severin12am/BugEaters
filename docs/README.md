# BugEaters documentation

**Start here** after the root [`README.md`](../README.md).

**Auditing the codebase (humans or other models):** open [`MODEL_AUDIT_GUIDE.md`](./MODEL_AUDIT_GUIDE.md) first — dual race paths, symptom→file map, server layout, verification.

---

## Documentation hierarchy

```
Tier 0 — PRODUCT CANON
└── APP_MASTER_SPEC.md          Tournament invariants, open/deferred decisions

Tier 0.5 — AUDIT HANDOFF
└── MODEL_AUDIT_GUIDE.md        Find code fast; solo vs auth; smoke checks

Tier 1 — IMPLEMENTATION (current code)
├── CODEBASE.md                 Every src/ file and what it does
├── RACE_MECHANICS.md           Runner, obstacles, eating, scroll model
├── ABILITIES.md                12 briefcase abilities + executors
├── SCENES_AND_FLOW.md          Phaser scenes, registry, navigation
├── DEV_GUIDE.md                Build, test, Ability Lab, scripts
├── AUTHORITATIVE_RACE_SERVER.md Race-server env / Docker
├── multiplayer/*               Auth architecture, inputs, prediction
└── BACKEND.md                  Supabase, Realtime, Edge Functions

Tier 1 — TOURNAMENT / CRYPTO (product detail)
├── TOURNAMENT_SYSTEM_SPEC.md
├── TOURNAMENT_UI_BRIEF.md
├── TON_WEEKLY_TOURNAMENT_MODEL.md
└── TON_CRYPTO_IMPLEMENTATION_PLAN.md

Tier 2 — OPERATIONS
├── DEPLOY_NOW.md
├── PHONE_TEST_NOW.md
└── TESTING_TOURNAMENT.md

Tier 2 — LEGACY / SNAPSHOTS
├── GAME_OVERVIEW.md            ⚠ Partially stale — use RACE_MECHANICS + CODEBASE
├── game_design.md              ⚠ Original AI prompt — historical only
└── VISION_READINESS.md

Parallel tracks
├── ios-handoff/                Native iOS port
├── BUG_ANIMATION_*.md          Art pipeline
└── content/encyclopedia.md     **Player encyclopedia master** (in-game Guide UI; first chapter uses photos in `public/assets/guide/`)
```

### Conflict rules

| If X conflicts with Y | Winner |
|------------------------|--------|
| Tier 1 tournament docs vs **APP_MASTER_SPEC §2–6** | **APP_MASTER_SPEC** |
| Legacy docs vs **RACE_MECHANICS / ABILITIES / CODEBASE** | **Implementation docs** |
| Docs vs **running code** | **Code** for behavior; **APP_MASTER_SPEC** for intended product |

---

## By role

| Role | Read |
|------|------|
| **AI / code auditor** | **`MODEL_AUDIT_GUIDE.md`** → owner files → `APP_MASTER_SPEC.md` |
| New engineer | `MODEL_AUDIT_GUIDE.md` → `CODEBASE.md` → `SCENES_AND_FLOW.md` |
| Gameplay / balance | `RACE_MECHANICS.md` → `ABILITIES.md` → `src/config/tuning.ts` + `server/.../raceConfig.ts` |
| Ability work | `ABILITIES.md` → `abilitySystem.ts` (auth) + `AbilityExecutor.ts` (solo) |
| Multiplayer / auth race | `MODEL_AUDIT_GUIDE.md` §1–4 → `multiplayer/ARCHITECTURE.md` → `server/src/domain/` |
| Legacy Realtime | `BACKEND.md` → `src/net/RoomSession.ts` |
| Product / tournament | `APP_MASTER_SPEC.md` → `TOURNAMENT_SYSTEM_SPEC.md` |
| QA / phone test | `PHONE_TEST_NOW.md` → `DEPLOY_NOW.md` |
| Players / copy | [`content/encyclopedia.md`](../content/encyclopedia.md) → in-game **Guide** |

---

## What is documented vs not

| Area | Status |
|------|--------|
| Client race + abilities | **Fully documented** (Tier 1 implementation docs) |
| Player encyclopedia | **`content/encyclopedia.md`** → Week hub **Guide** button |
| Tournament product | **Documented** (APP_MASTER_SPEC + tournament specs) |
| Tournament backend | **Partially built** — schema exists; advancement/pass mint not production-ready |
| TON / NFT | **Planning docs only** — client uses mocks |
| iOS native | **Separate** ios-handoff/ |
