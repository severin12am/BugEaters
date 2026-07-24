# BugEaters — Tournament System Specification (Handoff)

**Status:** Product spec for backend + blockchain implementation  
**Audience:** Engineers implementing Supabase, Edge Functions, TON contracts, and gaming server rules  
**Client:** Phaser Telegram Mini App (existing codebase — **no NPCs**, multiplayer only)  
**Stability:** Decisions below are **current intent**; sections marked **MAY CHANGE** are explicitly not locked.

**Related docs:**
- [`VISION_READINESS.md`](./VISION_READINESS.md) — readiness verdict, invariant vs adaptive split  
- [`TOURNAMENT_UI_BRIEF.md`](./TOURNAMENT_UI_BRIEF.md) — UI gap (stub; needs design)  
- [`TON_WEEKLY_TOURNAMENT_MODEL.md`](./TON_WEEKLY_TOURNAMENT_MODEL.md) — NFT / week chain summary  
- [`TON_CRYPTO_IMPLEMENTATION_PLAN.md`](./TON_CRYPTO_IMPLEMENTATION_PLAN.md) — TON Connect, TEP-62, infra  
- [`GAME_OVERVIEW.md`](../GAME_OVERVIEW.md) — current game client architecture  

---

## 1. Executive summary

BugEaters runs a **weekly global tournament** (`week_id`, rolling **Monday 00:00 UTC** — **MAY CHANGE**).

| Day | Entry | Role | Room size |
|-----|-------|------|-----------|
| **Monday** | Web2 — no wallet, no NFT | **Player picks** Bug / Human / Klaus | Whoever registered for that time slot (≥1) |
| **Tuesday–Friday** | Burn **week-scoped pass NFT** | **Assigned** to maintain **3 Bug : 2 Human : 1 Klaus** ratio | **Whoever is ready with valid pass** (1–6+, no NPCs) |
| **Saturday** | Same | Same ratio (scaled) | **≤6 rooms worldwide**; winner-only → Sunday pass |
| **Sunday** | Burn **Sunday pass** (max **6 minted globally** on Saturday) | Same ratio (scaled to N) | **1–6** finalists only |
| **Following Monday** | Web2 again | Player picks | Champion’s **shoulder billboards** shown |

**One worldwide Sunday winner** → **Monday billboard rights** (transferable to a buyer account).

**NPCs: never.** Any day. Empty slots stay empty.

---

## 2. Invariants vs adaptive configuration

**Do not hardcode values that ops will tune for cold start vs scale.** Use `game_config` (DB or JSON) with defaults; enforce **invariants** in RPC logic.

See **[`VISION_READINESS.md`](./VISION_READINESS.md) §1** for the full split. Summary:

| Type | Examples |
|------|----------|
| **Invariant** | One Sunday winner; no NPCs; burn in lobby; week-scoped passes; max Saturday rooms = max Sunday slots (same configured N) |
| **Adaptive** | N=6 default for Saturday/Sunday cap; 3:2:1 ratio; progressive curve; thresholds; deadlines; min players; refund policy |

Implementers: one source of truth for N — e.g. `game_config.max_saturday_rooms` — referenced by room creation, mint cap, and UI labels via API.

---

## 3. Core invariants (must enforce in backend)

These are **hard rules** — implement as DB constraints + RPC checks + (where useful) on-chain caps. **Numeric caps use config** (default `max_saturday_rooms = 6`).

| ID | Invariant |
|----|-----------|
| I1 | `week_id` boundaries from configured week start (default Monday 00:00 UTC) |
| I2 | Pass NFTs **valid only for mint `week_id`** |
| I3 | **One pass = one race** — consumed on successful burn |
| I4 | **No NPCs** — roster = real users only |
| I5 | **≤ N Saturday rooms** per `week_id` (`N = game_config.max_saturday_rooms`) — **(N+1)th room fails** |
| I5b | **≤ N Sunday passes** — one per Saturday room winner |
| I6 | Sunday field = Sunday pass holders, **1..N**, no fill |
| I7 | Sunday passes **only from Saturday room winners** |
| I8 | **One global Sunday room** per `week_id` |
| I9 | **One global Sunday winner** per `week_id` |
| I10 | **Burn in lobby** at ready-to-start — not at tap-ready |
| I11 | Roles follow **configured species ratio** (default 3:2:1), scaled to room N — not independent ⅓ rolls |
| I12 | **Monday:** no wallet, no pass |
| I13 | **Tue–Sun:** wallet + valid pass + burn |

**Adaptive (not invariant):** burn refund on abort, wallet link deadline hours, advancement curve JSON, `min_players_to_start`, moderation flags.

---

## 4. Weekly calendar & `week_id`

```
week_id = "2026-W24"   // or "2026-06-08" (Monday UTC date) — pick one format and stick to it

Mon 00:00 UTC ────────────────────────────────────────────── Sun 23:59 UTC (MAY CHANGE exact end)
     │ Mon          Tue    Wed    Thu    Fri    Sat         Sun
     │ Web2         Pass   Pass   Pass   Pass   Pass        Global
     │ pick role    chain  chain  chain  chain  elim→     finale
     │              burn   burn   burn   burn   ≤6 Sunday   1 winner
     │                                              passes
     └─ next Mon: champion billboards (if Sunday had a winner)
```

**Champion billboards:** Shown on the **Monday immediately after** the Sunday the user won (same `week_id` cycle ends, new `week_id` billboards apply).

---

## 4. Day-by-day flow

### 4.1 Monday (Web2 funnel)

**Purpose:** Maximum acquisition. No crypto friction.

```
Register (Telegram auth)
  → optional: pick preferred race time (+ timezone stored)
  → at chosen time (or "play now" if open slot): enter matchmaking
  → pick Bug / Human / Klaus on menu
  → race with other registered players (no NPCs)
  → results recorded
  → advancement: DYNAMIC (see §5)
  → if awarded Tuesday pass: prompt link wallet before deadline or FORFEIT
```

**Matchmaking model (decided):** Not pure tap-ready quorum. Users **register for a game** and optionally **choose a time**; at that time they enter the race pool.

**MAY CHANGE:** Exact registration UI, max registrations per slot, what happens if only 1 person registered for a slot (run 1-player race? cancel slot?).

**Billboards:** If previous week had a Sunday champion, **shoulder billboards** render for all Monday races (see §10).

---

### 4.2 Tuesday–Friday (pass-gated chain)

**Purpose:** Narrow the field; pass economy; random-ish roles via proportional assignment.

**Entry requirements:**
- Linked TON wallet (`ton_proof` — **MAY CHANGE** but recommended)
- Hold pass NFT for **this `week_id`** granting entry to **today’s weekday**
- Tap ready (+ optional time preference — **MAY CHANGE** whether Tue–Fri use same scheduling as Monday)

**Matchmaking when 4 pass holders ready, no one else (decided):**
→ **4-player race** (no wait, no NPCs, no cancel).

**General rule:** Start race with **N players** where N = ready players with valid passes who completed burn in lobby, **N ≥ 1** (**MAY CHANGE** minimum N for Tue–Fri; currently implied 1+).

**Role assignment (decided — proportional, not pure random):**

Target composition for full 6-runner race:

| Species | Count |
|---------|-------|
| Bug | 3 |
| Human | 2 |
| Klaus | 1 |

For **N < 6**, scale proportionally (implementation needed):

| N | Suggested assignment (MAY CHANGE) |
|---|-----------------------------------|
| 6 | 3 / 2 / 1 |
| 5 | 2 / 2 / 1 or 3 / 1 / 1 — **TBD** |
| 4 | 2 / 1 / 1 |
| 3 | 1 / 1 / 1 |
| 2 | 1 / 1 / 0 or 2 / 0 / 0 — **TBD** |
| 1 | 1 / 0 / 0 (Sunday champion case) |

Assignment should feel **random to the player** but be **server-determined** from a shuffle of the proportional multiset (e.g. 4-player room draws from `{B,B,H,K}`).

**Advancement after race:** Dynamic / progressive (§5). Mint next-day pass NFT to linked wallet if awarded.

---

### 4.3 Saturday (elimination day)

**Purpose:** Last daily chain step; **only source of Sunday passes**.

- Same pass/burn/role rules as Tue–Fri.
- Advancement from Friday: **strict** — only players who earned **Saturday pass** can enter Saturday.
- **Global hard cap: ≤6 Saturday rooms per `week_id` worldwide.** It is **impossible** to run a 7th Saturday room.
- **Winner-only per Saturday room** → **at most 6 Saturday winners** → **at most 6 Sunday passes** (one per room). No ranking, no FCFS, no Saturday-night selection job beyond minting up to one pass per room winner.

```
Friday winners worldwide
  → only some hold Saturday pass (progressive funnel)
  → tap ready / register for Saturday slot
  → system opens ≤6 Saturday rooms globally (no 7th)
  → each room: N players (no NPCs), winner-only advancement
  → each room produces 0 or 1 Sunday pass mint (winner)
  → max 6 Sunday passes total
```

**If fewer than 6 Saturday rooms fill** (low population): fewer Sunday passes minted; Sunday runs with 1–6 finalists.

**If more players hold Saturday pass than can fit in 6 rooms:** **MAY CHANGE** how overflow is handled — options:
- Excess pass holders **cannot race Saturday** (pass unused / expires with week — harsh),
- **Queue for next Saturday room** within the 6-room cap if slots in existing rooms (**MAY CHANGE**),
- **Progressive funnel ensures** only ≤6×room_capacity can reach Saturday eligibility (structural prevention upstream).

**Implementer note:** Enforce `COUNT(rooms WHERE week_id = X AND weekday = sat AND phase != cancelled) <= 6` at room creation RPC.

---

### 4.4 Sunday (global finale)

**Purpose:** One race, one world champion.

- **1–6 players** — whoever holds Sunday pass for this `week_id`.
- **If 1 player:** still **champion** (decided) — likely auto-win or trivial race; **MAY CHANGE** presentation.
- **One global room** — single `room_id` per `week_id`.
- **Roles:** proportional 3:2:1 scaled to N.
- **Winner:** one `global_champion_user_id` → Monday billboard rights (+ optional Champion NFT later).

**Non-finalists:** Spectators / normal app — **MAY CHANGE** spectator mode.

---

## 5. Advancement & pass minting (dynamic progressive)

### 5.1 Stakeholder intent (decided)

- **Early week (Mon→Tue, Tue→Wed):** **Forgiving** — if low participation, **everyone (or nearly everyone) gets a pass**.
- **Mid week:** start eliminating.
- **Late week (Fri→Sat):** **strict** — winner-only per room toward Sunday.
- **Sunday passes:** **only from Saturday**, max **6**, minted **Saturday night**.

### 5.2 “Win” is not a single rule

**Cannot** use one sentence like “1st place only” for all population sizes.

**Implementation approach (recommended — MAY CHANGE):**

```
advancement_slots(room, weekday, week_id) =
  f(global_ready_count, weekday, room_finishers)

Rules:
  IF global_ready_count < LOW_THRESHOLD:
    award ALL finishers (or all who FINISH, not died — MAY CHANGE)
  ELIF weekday IN (Mon, Tue) AND count < MEDIUM_THRESHOLD:
    award top K (high K) or all
  ELIF weekday IN (Wed, Thu, Fri):
    award top K (decreasing K)
  ELIF weekday == Sat:
    award winner-only per room → candidate for Sunday pass pool
  ENDIF

Separate Saturday-night job:
  FROM all Saturday winners worldwide
  SELECT ≤6 for Sunday pass mint (see §4.3 open options)
```

**Finish vs survive vs placement:** **MAY CHANGE** — recommend **finished** (`finished=true`, lower `finish_time_ms` better) for advancement; **died** = no pass unless forgiving mode awards all finishers and death counts as non-finish.

### 5.3 Pass chain naming

| Won on (after race) | Minted pass grants entry to |
|---------------------|----------------------------|
| Monday | Tuesday |
| Tuesday | Wednesday |
| … | … |
| Friday | Saturday |
| Saturday (if selected for top 6) | **Sunday** |

Passes are tradable until burned. **Week-scoped** — invalid after `week_id` ends.

---

## 6. Pass burn flow (decided — lobby gate)

**Do NOT burn on:** tap ready, notification click, menu START.

**Flow:**

```
1. User holds valid pass NFT (week + weekday)
2. User taps READY (+ optional time)
3. System groups ready users → when enough for a race (N ≥ 1, or N ≥ 4 example — see §4.2):
     send Telegram notification "Race forming"
4. Users enter LOBBY (RoomSession)
5. Countdown / "Ready to start" phase
6. PROMPT: "Burn pass to confirm participation"
     → TON Connect / wallet tx OR server-verified burn intent
7. On successful burn:
     → assign proportional roles
     → lock roster (no NPC fill)
8. Synchronized race start
9. Results → advancement mint (if applicable)
```

**If user in lobby but never burns:** not in race; pass remains.

**If lobby aborts before step 6:** pass remains.

**If burn succeeds then race aborts:** **MAY CHANGE** — default recommend no refund; UI must warn.

**Backend:** Record `pass_burns(pass_nft_address, user_id, week_id, weekday, room_id, burned_at)`.

---

## 7. NFT & wallet (blockchain handoff)

### 7.1 Scope for chain implementer

| Asset | TEP-62? | Week-scoped? | Max supply |
|-------|---------|--------------|------------|
| Weekday pass (Mon→Tue … Fri→Sat) | Yes | Yes | Unlimited (demand-driven) |
| Sunday pass | Yes | Yes | **6 per week_id globally** |
| Champion / billboard rights | **MAY CHANGE** | Yes | 1 per week |

**Metadata (minimum — MAY CHANGE):**

```json
{
  "attributes": [
    { "trait_type": "week_id", "value": "2026-W24" },
    { "trait_type": "grants_entry", "value": "tuesday" },
    { "trait_type": "won_on", "value": "monday" },
    { "trait_type": "game", "value": "bugeaters" }
  ]
}
```

Sunday pass: `"grants_entry": "sunday"`, `"slot": "1-6"` optional.

### 7.2 Wallet

- **TON Connect** only (Telegram Mini App compliance).
- **One linked wallet** per Telegram user (`profiles.wallet_address`).
- **Monday:** no wallet.
- **Forfeit:** Monday winner who never links wallet before Tuesday deadline loses Tuesday pass mint.

### 7.3 Mint authority

**MAY CHANGE:** Recommend **server (treasury) mints** to winner wallet after authoritative results — client does not mint.

### 7.4 Burn authority

**MAY CHANGE:** Server-orchestrated burn at lobby step 6; verify on-chain burn or mark consumed in DB + optional chain burn tx.

---

## 8. Sunday pass: six slots via six Saturday rooms

**Decided:** There are **never more than 6 Saturday rooms** globally per week. **Winner-only per room** → **≤6 Saturday winners** → **≤6 Sunday passes**. No separate “pick 6 from 20 winners” step.

```
Saturday (≤6 rooms worldwide, each winner-only)
  → room 1 winner → optional Sunday pass mint (slot 1)
  → room 2 winner → optional Sunday pass mint (slot 2)
  → … up to 6
  → if only 3 rooms ran → 3 Sunday passes max

Sunday:
  → Sunday pass holders join one global room (1–6 players)
  → 1 worldwide champion
```

**Hard caps (both required):**

| Cap | Value |
|-----|-------|
| Max Saturday **rooms** per `week_id` | **6** |
| Max Sunday **passes** minted | **6** (≤ number of Saturday rooms that produced a winner) |

**Saturday night:** Mint Sunday passes for each Saturday room winner (batch timing **MAY CHANGE** — can also mint immediately after each Saturday race).

---

## 9. Role assignment algorithm (proportional)

**Not** independent random species.

**For N players:**

1. Build multiset from 3:2:1 ratio (scale + round — document rounding).
2. Shuffle server-side (seed: `week_id + room_id + nonce`).
3. Assign one species per player; map to sub-lanes per existing `SubLaneManager` ranges:
   - Bug → lanes 0–2  
   - Human → 3–5  
   - Klaus → 6–8  

**Client change:** `MenuScene` character pick **disabled Mon-only for pass days**; show assignment in `LobbyScene`.

**MAY CHANGE:** Rounding rules for N ∉ {6}.

---

## 10. Champion & Monday billboards

### 10.1 Rights (decided)

- **Global Sunday winner** receives **Monday billboard rights** for the **next Monday**.
- **Transferable** to another account (buyer) — implement entitlement transfer in DB + optional NFT.
- Winner/buyer submits creative → **moderation** → approved assets served to all Monday races.

### 10.2 Placement (decided)

- **In-race shoulder billboards** (lamp strip band), scrolling with road.
- No collision; no gameplay effect.
- **#ad / Sponsored** label — **MAY CHANGE** exact UX.

### 10.3 Deferred (explicitly not blocking v1 backend)

- Champion burn → pass bundle  
- TON prize in NFT  
- Royalty %  
- Champion NFT tradability beyond billboard rights  

---

## 11. Scheduling

| Day | Model |
|-----|--------|
| **Monday** | Register + optional time → enter at that time |
| **Tue–Sun** | Tap ready + optional time (**MAY CHANGE** align with Monday) |
| **Sunday finale** | One global coordinated start (**MAY CHANGE** algorithm) |

**Timezone:** Store user TZ; group compatible windows — **MAY CHANGE** details.

**Week rollover:** Monday **00:00 UTC** (tentative).

---

## 12. Database sketch (backend handoff)

**MAY CHANGE** table names; required concepts:

| Table / concept | Purpose |
|-----------------|--------|
| `tournament_weeks` | `week_id`, phase, config snapshot |
| `profiles.wallet_address` | Linked TON wallet |
| `pass_mints` | user, week_id, grants_entry, nft_address, won_on |
| `pass_burns` | consumption audit |
| `sunday_passes` | **≤6 rows per week_id** |
| `sunday_finalists` | users eligible for global room |
| `week_champions` | one row per week_id |
| `billboard_entitlements` | owner_user_id, week_id, transferred_to?, creative_url, approved |
| `race_registrations` | Monday time-slot signups |
| `ready_votes` | tap-ready + time preference |
| `game_config` | All adaptive params; **`max_saturday_rooms`** (default 6) drives Sat/Sun cap; progressive curves |

**RPCs needed (minimum):**

| RPC | Role |
|-----|------|
| `register_monday_slot` | Monday registration |
| `tap_ready` | Tue–Sun queue |
| `join_room` | Extended: weekday, week_id, pass verify, **no burn yet** |
| `confirm_pass_burn` | Lobby step 6 |
| `assign_roles` | After burn, before race |
| `record_results` | Finish/died → advancement |
| `mint_pass` | Server-triggered NFT mint |
| `mint_sunday_passes` | Saturday night batch, cap 6 |
| `join_sunday_final` | Global room |
| `transfer_billboard_rights` | Champion → buyer |

---

## 13. Client impact summary (for coordination)

| Component | Change |
|-----------|--------|
| `MenuScene` | Character pick **Monday only** |
| `LobbyScene` | Burn prompt at ready-to-start; show assigned role |
| `join-room` | Pass verify without burn first |
| `NpcManager` | **Disable entirely** in production tournament mode |
| `raceRoster.ts` | Dynamic N-player proportional roles |
| `RoadsideLampManager` / new `BillboardManager` | Monday sponsored props |
| Solo fallback | **Remove** in production |

---

## 14. Open items for product owner (MAY CHANGE)

Priority order for next decisions:

1. ~~**Saturday → 6 Sunday passes:** selection mechanism when >6 Saturday winners~~ **RESOLVED:** max **6 Saturday rooms** worldwide; winner-only → max 6 Sunday passes.
2. **Proportional roles for N = 1, 2, 5** — exact counts.
3. **Advancement when `died` vs `finished`** in forgiving modes.
4. **Minimum N** to start Tue–Fri race (1 vs 2 vs 4).
5. **Burn abort refund** policy.
6. **Tuesday wallet link deadline** (UTC time).
7. **Billboard moderation SLA** and creative limits.
8. **`week_id` string format** (ISO week vs date).
9. **ton_proof** required on link?  
10. **Testnet vs mainnet** launch path.

---

## 15. Document history

| Date | Change |
|------|--------|
| June 2026 | Initial handoff from stakeholder Q&A — tournament flow, burn lobby gate, Saturday-only Sunday passes, proportional roles, no NPCs |

---

*This document is the primary handoff for backend/blockchain. Client game loop remains in `GAME_OVERVIEW.md`. Update this file when product owner resolves §14 items.*
