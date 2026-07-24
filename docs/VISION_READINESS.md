# BugEaters — Vision Readiness Assessment

**Date:** June 2026  
**Question:** Is the tournament + TON vision ready to hand off for backend/blockchain implementation?  
**Short answer:** **Yes for rules and flow.** **No for UI/UX.** Backend can start against [`TOURNAMENT_SYSTEM_SPEC.md`](./TOURNAMENT_SYSTEM_SPEC.md) if adaptive config is respected.

---

## 1. Invariants vs adaptive (do not hardcode the latter)

Implement **invariants** in code constraints. Implement **adaptive values** in `game_config` (or env) with sensible defaults — tunable without redeploying game client logic.

### Invariants (constitutional — encode in RPC/DB/chain)

These define **what BugEaters is**. Changing them changes the product.

| ID | Rule |
|----|------|
| I1 | Weekly tournament cycle with global **Sunday finale** and **one worldwide winner** |
| I2 | **Monday Web2** — no wallet/NFT; **Tue–Sun** pass-gated |
| I3 | Pass **week-scoped**; **one pass = one race**; burn at **lobby ready-to-start** (not tap-ready) |
| I4 | **No NPCs** ever |
| I5 | **Max Saturday rooms = max Sunday passes = max Sunday runners** (same number N — see config) |
| I6 | **One global Sunday room** per week |
| I7 | **Sunday passes only from Saturday room winners** (winner-only per Saturday room) |
| I8 | **No overflow selection** (no “pick 6 from 20”) |
| I9 | **Species assignment** follows configured **ratio** (not independent random rolls) |
| I10 | **Champion** → **Monday shoulder billboards**; rights **transferable** |
| I11 | If fewer qualify for Sunday than max → **fewer play** (no fill) |

### Adaptive (config-driven — defaults below, ops can tune)

| Config key (suggested) | Default | Purpose |
|------------------------|---------|---------|
| `max_saturday_rooms` | `6` | Caps Saturday rooms = Sunday passes = Sunday field max |
| `species_ratio` | `{ bug: 3, human: 2, klaus: 1 }` | Target composition; scale algorithm for N ≠ 6 |
| `species_ratio_scale_mode` | `largest_remainder` | How to round 3:2:1 to N players — **TBD algorithm** |
| `week_start_timezone` | `UTC` | Week rollover anchor |
| `week_start_dow` | `monday` | Tournament start day |
| `progressive_curve` | JSON by weekday | Advancement slots vs global population |
| `low_population_threshold` | TBD | “Forgiving” band — e.g. award all finishers |
| `advancement_requires_finish` | `true` | **MAY CHANGE** — died vs finished |
| `min_players_to_start` | `1` | Tue–Sun: race with whoever burned (4 ready → 4 race) |
| `wallet_link_deadline_hours` | TBD | After Monday win, link wallet within N hours |
| `pass_burn_refund_on_abort` | `false` | Lobby dies after burn |
| `saturday_winner_slots_per_room` | `1` | Sunday pass per room winner |
| `ready_ttl_minutes` | TBD | How long “ready” stays active |
| `monday_scheduling_mode` | `register_time_slot` | vs open queue |
| `billboard_requires_moderation` | `true` | |
| `ton_network` | `testnet` / `mainnet` | |

**Principle for implementers:** If ops might tune it for cold start vs scale, **it belongs in config**, not a magic number in `join-room`.

**On-chain exception:** If Sunday pass collection uses **on-chain max supply**, it must read from deployed params or match `max_saturday_rooms` at deploy time — still one configured number, not scattered literals.

---

## 2. Vision document map

| Doc | Role | Ready? |
|-----|------|--------|
| [`TOURNAMENT_SYSTEM_SPEC.md`](./TOURNAMENT_SYSTEM_SPEC.md) | **Primary handoff** — flows, invariants, RPC sketch | ✅ Rules-ready |
| [`TON_WEEKLY_TOURNAMENT_MODEL.md`](./TON_WEEKLY_TOURNAMENT_MODEL.md) | Product narrative + week chain | ✅ |
| [`TON_CRYPTO_IMPLEMENTATION_PLAN.md`](./TON_CRYPTO_IMPLEMENTATION_PLAN.md) | TON Connect, TEP-62, infra phases | ✅ (technical) |
| [`TON_CRYPTO_DECISION_QUESTIONNAIRE.md`](./TON_CRYPTO_DECISION_QUESTIONNAIRE.md) | Decision log | ✅ mostly answered |
| [`GAME_OVERVIEW.md`](../GAME_OVERVIEW.md) | Current **game client** (pre-tournament) | ⚠️ Stale on tournament/NPC removal |
| **UI / UX spec** | Tournament screens, states, copy | ❌ **Missing** |

---

## 3. Is the vision ready?

### Ready enough to start backend + blockchain

**Confidence: moderate-high**

You have:

- Week structure (Mon Web2 → pass chain → Sat elimination → Sun finale → Mon ads)
- Economic loop (win/buy pass, burn to race, sell champion ad slot)
- Hard structural caps (Saturday rooms = Sunday slots)
- Burn timing (lobby gate)
- Role model (configurable ratio, not menu pick on pass days)
- No NPCs, variable N races, 1–6 Sunday
- Compliance direction (TON Connect, week-scoped NFTs)

A backend/blockchain engineer can design schema, RPCs, mint/burn, and `game_config` **without** waiting on UI mockups.

### Not ready as a complete product spec

**Confidence: high**

Gaps that will block **player-facing launch** (not internal backend):

| Gap | Severity | Notes |
|-----|----------|-------|
| **UI / UX** | **Critical** | Current game is menu → lobby → race. Tournament needs registration, week status, pass inventory, wallet link, burn modal, role reveal, time slots, notifications, champion creative upload, billboard preview, error states. **Almost none specified visually or as flows.** |
| **Saturday overflow** | Medium | More Saturday pass holders than seats in 6 rooms — turn away vs queue (**adaptive policy**) |
| **Proportional roles for N < 6** | Medium | Algorithm in config, not chosen |
| **Advancement when `died`** | Medium | Forgiving mode semantics |
| **Billboard creative spec** | Medium | Size, tap URL, moderation SLA |
| **Champion NFT vs DB entitlement** | Low (deferred) | Transfer works either way |
| **`GAME_OVERVIEW.md` sync** | Low | Should reference tournament docs |

---

## 4. UI — acknowledged gap (“much better UI needed”)

The **game loop UX and tournament UX are different products** layered on the same Phaser race.

Current client (`MenuScene`, `LobbyScene`, `EndScene`) is minimal: pick character, short lobby, results. **Insufficient** for:

### Tournament UI (new — needs dedicated brief)

| Surface | Purpose |
|---------|---------|
| **Week hub / home** | Current `week_id`, today’s day, “what do I need to play?” |
| **Monday registration** | Time slot picker, timezone, headcount / “your slot in 2h” |
| **Pass strip** | Holds passes? which day? expires when? tradable hint |
| **Wallet** | Connect, link, address, errors |
| **Ready + notification** | Tap ready, time preference, “race forming” state |
| **Lobby v2** | Roster without NPCs, **assigned role reveal**, **burn pass CTA**, countdown |
| **Burn modal** | TON Connect confirm, failure, success |
| **Blocked states** | No pass, wrong day, wallet not linked, forfeit, week ended |
| **Sunday finale** | Special framing — global, 1–6 players, spectator? |
| **Champion dashboard** | Submit billboard, transfer rights, moderation status |
| **Monday as player** | Shoulder ads visible in race (asset pipeline) |

### Game UI polish (existing — needs upgrade)

| Area | Current | Needed |
|------|---------|--------|
| Menu | Text buttons, basic layout | Tournament-aware; Mon vs Tue–Sun modes |
| Lobby | Countdown + roster text | Role cards, burn flow, pass context |
| HUD | Timer + progress | Week/day badge optional |
| End screen | Finish / died / time up | Advancement result (“You earned Wednesday pass”), wallet prompt Mon |
| Visual system | B&W functional | Cohesive Telegram Mini App polish, safe areas, loading states |

**Recommendation:** Add [`docs/TOURNAMENT_UI_BRIEF.md`](./TOURNAMENT_UI_BRIEF.md) before client sprint — wireframes optional but **state machine required**.

**UI must not hardcode** `6`, ratios, or curves — read from API / config same as backend.

---

## 5. Suggested implementation order

```
Phase A — game_config + schema + invariants (backend)
Phase B — pass mint/burn + wallet link (chain + edge)
Phase C — advancement engine (adaptive curves in config)
Phase D — UI brief + tournament screens (client)     ← parallel once API shapes known
Phase E — Monday billboards + champion dashboard
Phase F — polish, moderation, launch config tuning
```

Backend **Phase A–C** can proceed now. **Phase D** should not be guessed by implementers — needs UI brief.

---

## 6. One-paragraph vision (for pitches / new contributors)

BugEaters is a weekly Telegram lane-runner tournament. **Monday is free and Web2** — register, pick your character, race real humans. Winners advance through a **pass chain** (NFT on TON, burn to enter, **random assigned roles** keeping Bug/Human/Klaus proportions). The week **gets stricter** toward **Saturday**, when at most **six global rooms** each crown one winner who earns a **Sunday pass**. **Sunday is one worldwide finale** (one to six players, one champion). The champion sells **Monday in-race billboard** space to advertisers. **No bots. No pay-to-win stats.** Config drives thresholds; rules drive caps.

---

## 7. Verdict

| Audience | Ready? |
|----------|--------|
| Backend / blockchain implementer | **Yes** — use `TOURNAMENT_SYSTEM_SPEC.md` + config table §1 |
| Client implementer | **Partial** — rules yes, **UI spec no** |
| Investor / player pitch | **Yes** — §6 + weekly model doc |
| Production launch | **No** — UI + overflow policy + moderation + config tuning |

---

*Update this file when UI brief exists or when invariant/adaptive split changes.*
