# BugEaters — App Master Specification

**Status:** Canonical product + implementation reference (updated August 2026)  
**Audience:** Product owner, designers, client engineers, backend, blockchain  

> **This is the single source of truth.**  
> Read this file first. All other docs are **children** — they add detail for a role or era; they do not override §2–6 here.
>
> **In-game player encyclopedia:** [`content/encyclopedia.md`](../content/encyclopedia.md) — the only file for player-facing copy in the Telegram UI. Ability **names** are pulled from `src/config/abilities.ts` at runtime; ability **effect text** lives in the `### ability:<id>` blocks in that file. Do not duplicate player explanations elsewhere.
>
> **Live deploy / phone test:** [`DEPLOY_NOW.md`](./DEPLOY_NOW.md) · [`PHONE_TEST_NOW.md`](./PHONE_TEST_NOW.md) — URLs and ops steps; product law stays in this file.
>
> **Code / model audit:** [`MODEL_AUDIT_GUIDE.md`](./MODEL_AUDIT_GUIDE.md) — dual race paths, symptom→file index, server map. Use that to find code; use **this file** for product law.

---

## Documentation hierarchy

```
Tier 0 — CANONICAL (you are here)
└── docs/APP_MASTER_SPEC.md
    What is fixed · adaptive · open · deferred · built today

Tier 0.5 — AUDIT HANDOFF
└── docs/MODEL_AUDIT_GUIDE.md   Find relevant code; solo vs authoritative

Tier 1 — DOMAIN SPECS (detail; defer to Tier 0 for decisions)
├── docs/TOURNAMENT_SYSTEM_SPEC.md      … backend flows, invariants, RPC/DB sketch
├── docs/TON_WEEKLY_TOURNAMENT_MODEL.md  … week chain narrative, pass economy
├── docs/TON_CRYPTO_IMPLEMENTATION_PLAN.md … TON Connect, TEP-62, infra phases
├── docs/TOURNAMENT_UI_BRIEF.md         … screen inventory + UX state machine
└── GAME_OVERVIEW.md                      … race gameplay & client architecture (⚠ stale on tournament)

Tier 2 — SNAPSHOTS (historical; do not treat as law)
├── docs/VISION_READINESS.md              … readiness audit at a point in time
└── docs/TON_CRYPTO_DECISION_QUESTIONNAIRE.md … Q&A log; superseded by §3–6 below

Tier 3 — CODE (ground truth for what is shipped)
├── src/tournament/                       … week context, config defaults, mocks
├── src/scenes/                           … Phaser scenes & navigation
├── src/ui/                               … Mono design system
├── server/                               … Colyseus authoritative race simulation
└── supabase/                             … auth, matchmaking, race / tournament

Ops (not product law — defer to this file for *what*; these for *how/where*)
├── docs/DEPLOY_NOW.md                    … Fly + Cloudflare Pages deploy steps
├── docs/PHONE_TEST_NOW.md                … current BotFather / phone URL
├── docs/AUTHORITATIVE_RACE_SERVER.md     … race-server env / Docker
├── fly.toml · Dockerfile.race-server     … race host config
└── ecosystem.config.cjs                  … Colyseus Cloud PM2 entry (optional alt host)

Parallel tracks (not under tournament canon)
├── ios-handoff/                          … native iOS port brief
└── docs/BUG_ANIMATION_*.md               … art pipeline only
```

### Conflict rules

| If X conflicts with Y | Winner |
|------------------------|--------|
| Tier 1 doc vs **§2–6 of this file** | **This file** (product) |
| Tier 2 vs Tier 0 or Tier 1 | **Tier 0 / Tier 1** |
| Docs vs **running code** | **Code** for “what exists”; **Tier 0** for “what should exist” |
| `GAME_OVERVIEW.md` vs tournament docs | **Tier 0** for tournament; `GAME_OVERVIEW` for race mechanics until synced |

### Where to go by role

| Role | Path |
|------|------|
| Product owner | **§2–6** (fixed / open / deferred) → resolve **§5** before locking v1 |
| Backend engineer | This file **§7–11** → `TOURNAMENT_SYSTEM_SPEC.md` · race host **§3 / §11b** |
| Blockchain engineer | This file **§8** → `TON_CRYPTO_IMPLEMENTATION_PLAN.md` |
| Client / UI | This file **§9–10** → `TOURNAMENT_UI_BRIEF.md` → `src/scenes/` |
| Deploy / phone test | **§11b** → `DEPLOY_NOW.md` → `PHONE_TEST_NOW.md` |
| Code / AI auditor | `MODEL_AUDIT_GUIDE.md` → owner files → this file §2–6 for product |
| New contributor pitch | **§16** one-paragraph → `TON_WEEKLY_TOURNAMENT_MODEL.md` |

---

## How this file is organized

| Section | Meaning |
|---------|---------|
| **§2 Fixed invariants** | Product law — do not break |
| **§3 Fixed decisions** | You decided — implement unless moved to §5 |
| **§4 Adaptive config** | Tunable defaults — API/`game_config`, not hardcoded |
| **§5 Open** | You have **not** decided — blocks final spec |
| **§6 Deferred** | Explicitly out of scope for now |
| **§7–11** | Flows, NFT, client, UI, backend audit |
| **§12–14** | Implementation snapshot & contradictions |

---

## 1. What BugEaters is

BugEaters is a **weekly global tournament** delivered as a **Telegram Mini App**: a Phaser 3 lane-runner where real humans race on a near-black road with Bug / Human / Klaus roles, pass-gated advancement through the week, and a **single worldwide Sunday champion** who earns **Monday in-race billboard** rights (transferable to sponsors).

**Stack today:** Phaser 3.87 · Vite 6 · TypeScript · Supabase (auth, matchmaking, tournament) · **Colyseus authoritative race server** on **Fly.io** · Mini App static host on **Cloudflare Pages** · TON Connect planned, not wired.

**Live playtest URLs (Aug 2026):**
| Role | URL |
|------|-----|
| Telegram Mini App (BotFather Web App) | `https://bugeaters-cey.pages.dev` |
| Authoritative race server (HTTP health) | `https://bugeaters-race.fly.dev/healthz` |
| Authoritative race server (WebSocket) | `wss://bugeaters-race.fly.dev` |

**Visual identity (fixed):** Mono black/white UI chrome; road `#080808`; blood red `#cc0000` for death only; Space Mono + Inter typography in menus.

---

## 2. Fixed — product invariants

These define what BugEaters *is*. Backend, chain, and client must enforce them. Changing any of these is a product change, not a tuning knob.

| ID | Rule |
|----|------|
| I1 | **Weekly tournament cycle** with a global **Sunday finale** and **one worldwide winner** per week |
| I2 | **Monday = Web2 only** — no wallet, no NFT, no pass |
| I3 | **Tuesday–Sunday = pass-gated** — wallet + valid week-scoped pass + burn |
| I4 | Passes are **week-scoped only**; **one pass = one race** |
| I5 | Pass **burns in the lobby at ready-to-start**, not when the player taps “ready” on the hub |
| I6 | **No NPCs ever** — roster is real users only; empty slots stay empty |
| I7 | **Max Saturday rooms = max Sunday passes = max Sunday runners** — same configured number **N** (default **6**) |
| I8 | **One global Sunday room** per week |
| I9 | **Sunday passes minted only from Saturday room winners** (winner-only per Saturday room) |
| I10 | **No overflow selection** — no “pick 6 winners from 20 pass holders” |
| I11 | **Role assignment on pass days** follows configured **species ratio** (default **3 Bug : 2 Human : 1 Klaus**), scaled to room size **N** — not independent random ⅓ rolls |
| I12 | **Monday:** player **chooses** Bug / Human / Klaus |
| I13 | **Tuesday–Sunday:** role is **assigned** after pass burn (player does not pick on the menu) |
| I14 | If fewer players qualify for Sunday than **N**, **fewer play** — no NPC or bot fill |
| I15 | **Champion reward** = **Monday shoulder billboards** (in-race, near lamp strips); rights **transferable** to buyer/marketer |
| I16 | **Multiplayer only** in production tournament mode |
| I17 | **One linked TON wallet** per Telegram user (Tue+); Monday winner who never links before deadline **forfeits** awarded pass |

---

## 3. Fixed — resolved product decisions

Decisions you have already made (from stakeholder Q&A). These are not “maybe” unless listed again in §5.

| Topic | Decision |
|-------|----------|
| Week start | Tournament week rolls **Monday** (anchor **Monday 00:00 UTC** — exact end-of-week boundary still open, see §5) |
| Monday entry | Free Web2 registration; pick character; optional **time slot** registration |
| Pass chain | Win day *D* (or buy pass) → burn to enter day *D+1* |
| Pass distribution | **Dynamic progressive** — forgiving early in the week, **stricter toward Sunday** |
| Saturday | **≤ N rooms worldwide** (default N=6); **winner-only** per room → Sunday pass |
| Sunday | **One global race**; **1–N runners**; **one champion** (even if N=1, that player is champion) |
| Scheduling model | **Register / tap ready + time preference** + timezone awareness — **not** pure “6 tap ready = instant room” |
| Matchmaking intent | Real humans only; variable room size **N = who actually ready + burned** (see §5 for min N tension) |
| Lanes (v1) | **3 sub-lanes per main lane** (9 total); dynamic lane scaling **deferred** |
| Wallet | **TON Connect**; mock in client until integrated |
| Pass tradability | Passes can be **sold/bought** until burned (exact marketplace mechanics **deferred**) |
| Build crypto in planning phase | Chain was **planning-only**; client has **mocks** for wallet/burn/pass |
| Saturday → Sunday cap | **Resolved:** structural cap via max Saturday rooms — not a post-hoc “select 6 from many winners” |
| Multiplayer fairness | **Dedicated authoritative race server** (Colyseus) owns the 60s sim; clients send inputs and render snapshots. Supabase keeps auth / lobby / tournament durability |
| Race server host | **Fly.io** app `bugeaters-race` (Docker via `Dockerfile.race-server` + `fly.toml`). Colyseus Cloud remains an optional alternate host (`defineServer` + `ecosystem.config.cjs`) |
| Mini App static host | **Cloudflare Pages** project `bugeaters` → `https://bugeaters-cey.pages.dev` (BotFather Web App URL) |
| Local tunnels (ngrok / trycloudflare) | **Dev-only / obsolete for phone playtests** once Pages + Fly are live |

---

## 4. Adaptive — configurable (defaults OK, do not hardcode in UI/logic)

Ops may tune these via `game_config` / API without changing product identity. Client and UI should **read from API**, not scatter literals.

| Config key (suggested) | Default | Purpose |
|------------------------|---------|---------|
| `max_saturday_rooms` | `6` | Saturday room cap = Sunday pass cap = Sunday field max |
| `species_ratio` | `{ bug: 3, human: 2, klaus: 1 }` | Target composition |
| `species_ratio_scale_mode` | TBD algorithm | How to round ratio when N ≠ 6 |
| `week_start_timezone` | `UTC` | Week rollover |
| `week_start_dow` | `monday` | Tournament start day |
| `progressive_curve` | JSON by weekday | How many advance per room vs population |
| `low_population_threshold` | TBD | “Forgiving” band (e.g. award all finishers) |
| `advancement_requires_finish` | `true` (likely) | Whether `died` counts for advancement |
| `min_players_to_start` | TBD (see §5) | Minimum ready players to start Tue–Sun race |
| `wallet_link_deadline_hours` | TBD | After Monday win, link wallet within N hours |
| `pass_burn_refund_on_abort` | `false` (recommended) | Lobby dies after burn |
| `saturday_winner_slots_per_room` | `1` | Sunday passes per Saturday room |
| `ready_ttl_minutes` | TBD | How long “ready” stays active |
| `monday_scheduling_mode` | `register_time_slot` | vs open queue |
| `monday_time_slots` | 12/16/18/21 UTC | Client default in `tournamentConfig.ts` |
| `billboard_requires_moderation` | `true` (likely) | Champion creative |
| `ton_network` | `testnet` / `mainnet` | Launch |
| `week_id` format | Monday date `YYYY-MM-DD` in client | ISO week vs date **open** |

**Principle:** If ops might tune it for cold start vs scale, it belongs in config — not in `join-room` magic numbers.

---

## 5. Open — not decided yet

These block a fully locked implementation spec. Marked **OPEN** until you choose.

### 5.1 Product / rules

| # | Topic | Notes |
|---|-------|-------|
| O1 | **Minimum players to start** Tue–Fri race | Questionnaire once said **6**; system spec implies **N ≥ 1** (whoever ready). **Pick one.** |
| O2 | **Proportional roles when N = 1, 2, 5** | Exact Bug/Human/Klaus counts for non-6 rooms |
| O3 | **Advancement when player `died` vs `finished`** | Forgiving early-week modes — does death disqualify? |
| O4 | **Progressive curve numbers** | Shape is decided; exact slot counts per weekday/population are not |
| O5 | **Saturday overflow** | More Saturday pass holders than seats across N rooms — queue, turn away, or other? (Sunday cap itself is **fixed**) |
| O6 | **1-player Sunday presentation** | Champion if alone is **fixed**; auto-win vs still run the race is **open** |
| O7 | **Monday single-player slot** | If only 1 registered for a slot — run anyway, cancel, or merge? |
| O8 | **Tuesday–Friday scheduling** | Same time-slot model as Monday or simpler ready queue only? |
| O9 | **Week boundary end** | Exact Sunday end instant (23:59 UTC vs Monday 00:00 rollover) |
| O10 | **Burn abort refund** | Default recommendation: no refund + strong UI warning |
| O11 | **Wallet link deadline** | Hours after Monday win before Tuesday pass forfeit |
| O12 | **Spectator mode** | Sunday non-finalists — watch only or normal app only? |

### 5.2 Creative / commercial

| # | Topic |
|---|-------|
| O13 | **Billboard creative spec** — pixel size, aspect ratio, tap URL, `#ad` / sponsored label |
| O14 | **Moderation SLA** — who approves champion uploads, turnaround |
| O15 | **Sponsor settlement** — off-platform deal vs on-chain payment |

### 5.3 Technical

| # | Topic |
|---|-------|
| O16 | **`week_id` string format** — ISO week vs Monday UTC date |
| O17 | **`ton_proof` on wallet link** — required or optional |
| O18 | **Mint authority** — server treasury mint vs user mint (recommendation: server) |
| O19 | **Burn orchestration** — on-chain burn tx vs DB mark + optional chain |
| O20 | **Testnet vs mainnet** launch path |
| O21 | **HTML overlay vs pure Phaser** for TON Connect and file upload |
| O22 | **Notification deep-link** — push → lobby directly? |
| O23 | **Localization** |

---

## 6. Deferred — explicitly not deciding now

Not blocking v1 backend/UI shell; do not implement unless scope expands.

| Topic |
|-------|
| Champion **fixed burn bundle** (extra NFT mechanics) |
| **TON prize pool** for winner |
| Champion NFT **tradability rules** beyond billboard rights |
| Royalty / **fee flywheel** |
| **Dynamic sub-lane scaling** (beyond 3×3) |
| Full **NFT marketplace** UX |
| **iOS native** port (separate doc exists) |

---

## 7. Weekly flow (fixed structure, adaptive numbers)

```
Monday 00:00 UTC ────────────────────────────────────────► Sunday (finale)
     │ Mon              Tue–Fri           Sat              Sun
     │ Web2             Pass + burn       ≤N rooms         1 global room
     │ pick role        assigned role     winner→Sun pass  1–N runners
     │ register slot    wallet required   elim day         1 champion
     └─ following Mon: champion shoulder billboards (if winner exists)
```

### Monday (fixed behavior)
1. Telegram auth (existing Supabase flow).
2. Register + pick **time slot** (UTC).
3. Player **picks** Bug / Human / Klaus.
4. Enter lobby → race with **real humans only**.
5. Results → **progressive advancement** → Tuesday pass awarded to winners (mock today).
6. Prompt **link wallet** before deadline or **forfeit** pass.

### Tuesday–Friday (fixed behavior)
1. Require **linked wallet** + **valid pass for today**.
2. **Tap ready** (+ time preference — detail open).
3. Matchmaking → lobby → **burn pass modal** → **role reveal** (ratio-scaled).
4. Race → advancement toward next day (curve adaptive).

### Saturday (fixed behavior)
1. Same as pass days, but **≤ N concurrent rooms worldwide**.
2. **Winner-only** per room → **one Sunday pass** per room winner.
3. At most **N** Sunday passes total for the week.

### Sunday (fixed behavior)
1. **One global room**; only Sunday pass holders (1–N).
2. **One worldwide winner** → champion.
3. Champion gets **Monday billboard** rights (next cycle).

---

## 8. NFT & wallet model

### Fixed intent
| Asset | Scope | Consumption |
|-------|-------|-------------|
| Weekday pass NFT | Single target day within `week_id` | Burn at lobby ready-to-start |
| Sunday pass NFT | Sunday finale only | Burn at lobby |
| Billboard rights | Following Monday | Not burned in v1; transferable entitlement |

### Open / deferred
- Exact TEP-62 metadata fields
- On-chain max supply vs DB-enforced cap
- Real TON Connect + burn transactions
- Secondary market UI

### Client today
- **Mock:** wallet connect toggles registry flag; pass chips from `weekClock`; burn modal in lobby; role from client-side weighted random (`roleAssign.ts`) — **not authoritative**.

---

## 9. Game client (race layer)

### Fixed gameplay (implemented)
- 60-second race, 3 main lanes × 3 sub-lanes
- Trash, puddles, eating rules, abilities, Prisoner’s Dilemma (peer-only when no NPCs)
- Supabase synchronized start, presence roster, eliminations via referee
- Mono UI design system for tournament screens

### Fixed for tournament mode
- **No NPCs** in `GameScene` (removed)
- **No solo race** if no multiplayer session — redirects to Week Hub (GameScene gate)
- **Remaining gap:** `LobbyScene` still falls back to solo on Supabase auth/join failure — should route to **BlockedState** instead for production

### Open in game layer
- Monday **billboard rendering** in race (shoulder props near lamps) — not built
- HUD **week/day badge** — not built
- Server-authoritative **role assignment** and **advancement** on end screen

---

## 10. UI surfaces

| Screen | Purpose | Status |
|--------|---------|--------|
| **Week Hub** | Week id, day strip, status, passes, wallet, primary CTA | **Built** — routes Mon→Menu, Tue+→Lobby (not ReadyPanel yet) |
| **Monday register** | Character + time slots | **Built** (`MenuScene`) |
| **Ready panel** | Tap ready, queue state | **Built** (`ReadyPanelScene`) — **not wired from hub** |
| **Wallet connect** | TON Connect | **Mock** on hub |
| **Pass inventory** | By day, expiry | **Partial** — mock chips only |
| **Lobby v2** | Roster, burn, role reveal, countdown | **Built** — burn gated |
| **Blocked states** | No pass / wallet / forfeit / wrong day | **Built** (`BlockedStateScene`) — **not wired from hub** |
| **Sunday finale** | Global framing, qualifier list | **Built** (`SundayFinaleScene`) — **not wired from hub** |
| **End / advancement** | Pass earned, wallet prompt | **Partial** — static mock copy |
| **Champion dashboard** | Upload billboard, transfer rights | **Built** — mock actions, **not wired from hub** |
| **Spectator** | Watch Sunday | **Not built** (open) |

**Dev override:** `?tournamentDay=tuesday` forces weekday for UI testing.

---

## 11. Backend & data (audit)

### Exists today (generic multiplayer, not tournament)
- Supabase: profiles, Telegram auth, `join-room`, matchmaking, race rooms, results, referee
- Realtime: presence, snapshots, eliminations
- **No** `week_id`, passes, burns, Saturday room cap, advancement engine, `game_config`, wallet link/forfeit

### Required for production (not built)
- `game_config` table / API
- Pass inventory + mint/burn records (DB-first OK before chain)
- Weekday gating on `join-room`
- Saturday room allocator (global cap N)
- Sunday global room selector
- Progressive advancement job after results
- Wallet link + forfeit cron
- Champion billboard storage + moderation queue

### 11b. Hosting & live playtest (August 2026)

| Piece | Provider | Notes |
|-------|----------|-------|
| Mini App (`dist/`) | Cloudflare Pages | Free tier; set BotFather Web App / menu button to production URL |
| Authoritative race | Fly.io | Always-on small VM; `wss://`; playtest may keep `RACE_DEV_MODE=1` for `/dev/ticket` until Edge `race-ticket` is wired |
| Auth / lobby / passes | Supabase | Unchanged project |
| Secrets | Fly secrets + Pages build env | `RACE_TOKEN_SECRET` must match Supabase when leaving dev tickets |

**Player-facing race rules (copy):** only **survivors** move on in the tournament narrative; trash **stops** the runner (change lane to go around) on the authoritative path — see encyclopedia + onboarding.

**Ops runbooks:** [`DEPLOY_NOW.md`](./DEPLOY_NOW.md), [`PHONE_TEST_NOW.md`](./PHONE_TEST_NOW.md), [`AUTHORITATIVE_RACE_SERVER.md`](./AUTHORITATIVE_RACE_SERVER.md).

---

## 12. Scene flow (implemented)

```
BootScene → WeekHubScene
  ├─ Monday → MenuScene → LobbyScene → GameScene → EndScene
  └─ Tue–Sun → LobbyScene → GameScene → EndScene
       (ReadyPanelScene, BlockedStateScene, SundayFinaleScene, ChampionDashboardScene exist but are not default routes)
```

---

## 13. Contradictions to resolve (audit findings)

| Item | Source A | Source B | Recommendation |
|------|----------|----------|----------------|
| Min room size | Questionnaire: **6** | System spec: **N = ready players, ≥1** | Product owner pick; default adaptive `min_players_to_start` in config |
| Role on pass days | “Random role” in marketing copy | **Ratio-scaled assignment** in spec | Use **ratio** in implementation; update casual copy |
| UI brief status | Says “UI missing” | Client has Mono tournament shell | Treat **this file** as current; update or retire stale stubs |
| `GAME_OVERVIEW.md` | Solo + NPCs | Tournament spec | **Stale** — describes pre-tournament prototype |
| Hub CTA Tue+ | Spec: ready → notification → lobby | Hub skips straight to lobby | Wire **ReadyPanelScene** and blocked checks |

---

## 14. Readiness snapshot (August 2026)

| Area | Verdict |
|------|---------|
| Product vision & invariants | **Ready** for handoff |
| Open decisions (§5) | **Not ready** for final backend/chain without owner input |
| Client tournament UI shell | **Demo-ready** with mocks |
| Client tournament game mode | **Partial** — NPCs off, lobby solo fallback remains |
| Authoritative race server | **Live on Fly** — playtest path (`/dev/ticket`); full Supabase ticket/results wiring still to harden |
| Mini App host | **Live on Cloudflare Pages** — phone via BotFather URL |
| Backend tournament | **Partial** — schema/RPCs exist; not all production gates |
| TON / NFT | **Mock only** (acceptable per scope) |
| Production launch | **No** — §5 + tournament backend + billboards; playtest hosting **yes** |

---

## 15. Document map (Tier 1 & 2 detail)

Full tree: see **Documentation hierarchy** at top. Quick reference:

| File | Tier | Role |
|------|------|------|
| **`APP_MASTER_SPEC.md`** | **0** | **Canonical** — fixed / open / adaptive / built |
| `TOURNAMENT_SYSTEM_SPEC.md` | 1 | Backend handoff — RPC, DB, day flows |
| `TON_WEEKLY_TOURNAMENT_MODEL.md` | 1 | Product narrative + week chain |
| `TON_CRYPTO_IMPLEMENTATION_PLAN.md` | 1 | TON Connect, mint/burn engineering |
| `TOURNAMENT_UI_BRIEF.md` | 1 | Screen list + client state machine |
| `GAME_OVERVIEW.md` | 1 | Race gameplay & Phaser architecture (**sync needed**) |
| `VISION_READINESS.md` | 2 | Point-in-time readiness audit |
| `TON_CRYPTO_DECISION_QUESTIONNAIRE.md` | 2 | Historical Q&A — use §3–6 here instead |
| `MODEL_AUDIT_GUIDE.md` | Audit | Symptom→file, dual paths, server map |
| `DEPLOY_NOW.md` | Ops | Fly + Pages deploy steps |
| `PHONE_TEST_NOW.md` | Ops | Current BotFather / phone URL |
| `AUTHORITATIVE_RACE_SERVER.md` | Ops | Race-server env / Docker |

---

## 16. One-paragraph pitch

BugEaters is a weekly Telegram lane-runner tournament. **Monday is free and Web2** — register, pick your character, race real humans. Winners advance through a **pass chain** (NFT on TON, burn to enter, **assigned roles** keeping Bug/Human/Klaus proportions). The week **gets stricter** toward **Saturday**, when at most **six global rooms** each crown one winner who earns a **Sunday pass**. **Sunday is one worldwide finale** (one to six players, one champion). The champion sells **Monday in-race billboard** space. **No bots. No pay-to-win stats.** Config drives thresholds; invariants drive caps.

---

*Update §5 when you resolve open items. Update §10–11 when implementation catches up. Update §1 / §11b live URLs when hosts change.*
