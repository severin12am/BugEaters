# BugEaters documentation

**Start here** after the root [`README.md`](../README.md).

---

## Documentation hierarchy

```
Tier 0 — PRODUCT CANON
└── APP_MASTER_SPEC.md          Tournament invariants, open/deferred decisions

Tier 1 — IMPLEMENTATION (current code)
├── CODEBASE.md                 Every src/ file and what it does
├── RACE_MECHANICS.md           Runner, obstacles, eating, scroll model
├── ABILITIES.md                12 briefcase abilities + executors
├── SCENES_AND_FLOW.md          Phaser scenes, registry, navigation
├── DEV_GUIDE.md                Build, test, Ability Lab, scripts
└── BACKEND.md                  Supabase, Realtime, Edge Functions

Tier 1 — TOURNAMENT / CRYPTO (product detail)
├── TOURNAMENT_SYSTEM_SPEC.md
├── TOURNAMENT_UI_BRIEF.md
├── TON_WEEKLY_TOURNAMENT_MODEL.md
└── TON_CRYPTO_IMPLEMENTATION_PLAN.md

Tier 2 — OPERATIONS
├── PHONE_TEST_NOW.md
└── TESTING_TOURNAMENT.md

Tier 2 — LEGACY / SNAPSHOTS
├── GAME_OVERVIEW.md            ⚠ Partially stale — use RACE_MECHANICS + CODEBASE
├── game_design.md              ⚠ Original AI prompt — historical only
└── VISION_READINESS.md

Parallel tracks
├── ios-handoff/                Native iOS port
├── BUG_ANIMATION_*.md          Art pipeline
└── content/encyclopedia.md     **Player encyclopedia master** (in-game Guide UI)
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
| New engineer | `CODEBASE.md` → `SCENES_AND_FLOW.md` → `RACE_MECHANICS.md` |
| Gameplay / balance | `RACE_MECHANICS.md` → `ABILITIES.md` → `src/config/tuning.ts` |
| Ability work | `ABILITIES.md` → `AbilityExecutor.ts` → `content/encyclopedia.md` |
| Multiplayer / backend | `BACKEND.md` → `src/net/RoomSession.ts` |
| Product / tournament | `APP_MASTER_SPEC.md` → `TOURNAMENT_SYSTEM_SPEC.md` |
| QA / phone test | `DEV_GUIDE.md` → `PHONE_TEST_NOW.md` |
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
