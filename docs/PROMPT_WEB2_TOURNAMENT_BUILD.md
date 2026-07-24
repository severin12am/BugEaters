# PROMPT: Build the Web2 Tournament Test Version (with mocked Web3)

You are implementing the weekly tournament system for **BugEaters** so it can be play-tested end-to-end. Copy everything below into your task context and follow it exactly. Do not improvise architecture decisions — every ambiguous point has already been decided in this document.

---

## 1. Context — what this project is

- **Repo root:** `d:\BE`
- **Client:** Phaser 3.87 + TypeScript + Vite Telegram Mini App. Entry: `index.html` → `src/main.ts` → scenes in `src/scenes/`.
- **Backend:** Supabase (Postgres + Realtime + Deno Edge Functions). Migrations in `supabase/migrations/`, functions in `supabase/functions/`.
- **Build/verify:** `npm run build` (runs `tsc` then `vite build`). There are no automated tests; your verification is `tsc` passing plus the manual test plan in §8.
- **Product spec (source of truth for rules):** `docs/TOURNAMENT_SYSTEM_SPEC.md`. Read it fully before writing code. Master audit: `docs/APP_MASTER_SPEC.md`.

### Current state you are starting from

| Area | State |
|------|-------|
| Multiplayer race (rooms, realtime, referee) | Working — `supabase/migrations/0001–0004`, `supabase/functions/join-room`, `supabase/functions/referee`, `src/net/RoomSession.ts` |
| Telegram/anonymous auth | Working — `supabase/functions/telegram-auth`, `src/net/auth.ts` |
| Tournament UI | Shell only — `src/scenes/WeekHubScene.ts`, `MenuScene.ts`, `LobbyScene.ts`, `EndScene.ts` run on client-side mocks |
| Tournament data | **Mocked in client.** `src/tournament/weekClock.ts` fabricates passes (`mockPasses()`); wallet link is a Phaser registry boolean; `src/tournament/tournamentService.ts` is dead code (never imported) |
| Unwired scenes | `ReadyPanelScene.ts`, `BlockedStateScene.ts`, `SundayFinaleScene.ts`, `ChampionDashboardScene.ts` are registered in `src/gameConfig.ts` but never navigated to |
| Tournament backend | **Does not exist.** No tables, no RPCs |

## 2. The goal

Make the full weekly tournament loop **playable and testable by real humans**, where:

1. **Everything web2 is REAL**: Supabase tables, server-authoritative RPCs, real pass accounting, real advancement, real caps. This backend ships in the final game unchanged.
2. **Everything web3 is MOCKED but looks real to the player**: wallet connect shows a realistic flow (modal, short delay, address displayed), passes look like NFTs in the UI, burning shows a "confirm transaction" step — but underneath it is all Postgres rows, no chain.
3. **All web3 mock logic is isolated behind one interface** so that swapping in real TON later touches exactly one implementation file and zero game logic.

## 3. Architecture rule — the ChainService boundary (most important rule)

Create `src/tournament/chain/ChainService.ts`:

```ts
export interface ChainService {
  /** Simulates TON Connect. Resolves with a wallet address. */
  connectWallet(): Promise<{ address: string }>;
  disconnectWallet(): Promise<void>;
  getLinkedWallet(): Promise<string | null>;
  /** Simulates signing/sending a burn transaction. Resolves when "confirmed". */
  requestBurnSignature(passId: string): Promise<{ txHash: string }>;
}
```

Create `src/tournament/chain/MockChainService.ts` implementing it:

- `connectWallet()`: shows nothing itself (UI lives in scenes); waits 800–1500 ms, generates a deterministic fake address from the user id (format `UQ` + base64-looking chars, e.g. `UQ` + first 6 chars of a hash + `…` display truncation handled by UI), persists it by calling the `link_wallet` RPC (§5), returns it.
- `requestBurnSignature()`: waits 1000–2000 ms, returns a fake tx hash (`0x` + random hex). The *actual* pass consumption happens server-side in `confirm_pass_burn` — this mock only simulates the user-facing signing delay.

**Hard rules:**
- No file outside `src/tournament/chain/` may contain the words "mock", "fake", or TON-specific logic for wallet/burn. Scenes call `ChainService` methods only.
- Server-side, passes are plain DB rows. Columns that will later hold chain data (`nft_address`, `tx_hash`) exist now but store mock values prefixed `mock:`. This keeps the schema final.
- Delete `src/tournament/tournamentService.ts` (dead code, superseded by this).

## 4. Database — new migration `supabase/migrations/0005_tournament.sql`

Implement exactly these tables (plus RLS):

```sql
-- Adaptive config; single row per key. Seed the defaults shown.
create table game_config (
  key text primary key,
  value jsonb not null
);
-- Seed: max_saturday_rooms=6, min_players=1, species_ratio=[3,2,1],
--       advancement_low_threshold=8, advancement_medium_threshold=20,
--       dev_mode=true

create table tournament_weeks (
  week_id text primary key,          -- Monday UTC date 'YYYY-MM-DD' (matches getWeekId() in src/tournament/weekClock.ts)
  status text not null default 'active' check (status in ('active','finished')),
  champion_user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table profiles add column wallet_address text;
alter table profiles add column wallet_linked_at timestamptz;

create table passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  week_id text not null,
  grants_entry text not null check (grants_entry in ('tuesday','wednesday','thursday','friday','saturday','sunday')),
  won_on text not null,
  nft_address text,                  -- 'mock:<uuid>' for now
  status text not null default 'active' check (status in ('active','burned','expired')),
  created_at timestamptz not null default now()
);
create index on passes (user_id, week_id, status);

create table pass_burns (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references passes(id) unique,
  user_id uuid not null references profiles(id),
  week_id text not null,
  weekday text not null,
  room_id uuid not null references rooms(id),
  tx_hash text,                      -- 'mock:...' for now
  burned_at timestamptz not null default now()
);

-- Hard cap I5b: at most 6 Sunday passes per week, enforced by unique slot.
create table sunday_passes (
  week_id text not null,
  slot int not null check (slot between 1 and 6),
  pass_id uuid not null references passes(id),
  saturday_room_id uuid not null references rooms(id) unique,  -- one per Saturday room (I7)
  primary key (week_id, slot)
);

create table race_registrations (   -- Monday time-slot signups
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  week_id text not null,
  slot_id text not null,            -- matches MondayTimeSlot ids in src/tournament/tournamentConfig.ts
  character_type text not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_id)
);

create table ready_votes (          -- Tue–Sun queue
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  week_id text not null,
  weekday text not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_id, weekday)
);

create table billboard_entitlements (
  week_id text primary key,         -- the week the champion WON; rights apply next Monday
  owner_user_id uuid not null references profiles(id),
  transferred_to uuid references profiles(id),
  creative_url text,
  approved boolean not null default false
);

-- Room extensions
alter table rooms add column week_id text;
alter table rooms add column weekday text;
alter table room_members add column assigned_species text;
alter table room_members add column pass_id uuid references passes(id);
```

RLS: users read their own passes/registrations/votes; all writes go through `security definer` RPCs or service-role Edge Functions. No direct client inserts.

## 5. Server logic — RPCs (SQL functions) and Edge Function changes

Implement as `security definer` Postgres functions in migration `0006_tournament_rpcs.sql`, called from the client via `supabase.rpc(...)`. Extend the existing `join-room` Edge Function rather than rewriting it.

### Time and dev override (build this first — everything depends on it)

- `current_tournament_day(p_override text default null) returns (week_id text, weekday text)`: computes from `now()` UTC, Monday-start week, `week_id` = Monday date `YYYY-MM-DD`. If `p_override` is a valid weekday **and** `game_config.dev_mode = true`, use the override weekday with the current real `week_id`.
- Client passes the existing `?tournamentDay=` URL override (already parsed in `src/tournament/weekClock.ts` → `getDevWeekdayOverride()`) into every RPC call as `p_override`. This makes the whole stack time-travelable for testing. When `dev_mode=false`, the server ignores overrides — invariant safety for production.

### RPCs

| RPC | Behavior |
|-----|----------|
| `link_wallet(p_address text)` | Sets `profiles.wallet_address` + `wallet_linked_at` for `auth.uid()`. Rejects if already linked to a different address. |
| `register_monday_slot(p_slot_id text, p_character text, p_override text)` | Only when weekday = monday. Upserts `race_registrations`. Returns registration. |
| `tap_ready(p_override text)` | Tue–Sun only. Requires: wallet linked (I13) AND an `active` pass with `grants_entry = today` and `week_id = current` (I2). Inserts `ready_votes`. Returns ready count for today (for the queue UI). |
| `tournament_join_room(p_override text)` | Wraps existing `join_or_create_room` logic but: stamps `rooms.week_id` + `rooms.weekday`; verifies pass again (no burn yet — I10); **Saturday: refuses to create room #7 for the week** (count non-cancelled Saturday rooms, I5); **Sunday: single global room per week** (I8), entry only with Sunday pass (I6). Monday: requires registration row, no pass. |
| `confirm_pass_burn(p_room_id uuid, p_tx_hash text, p_override text)` | Lobby step. Atomically: lock pass row, check `status='active'`, set `burned`, insert `pass_burns`, link `room_members.pass_id`. One pass = one race (I3). Idempotent on retry (if this user already burned for this room, return success). |
| `assign_roles(p_room_id uuid)` | Server-side proportional assignment (I11). Called once per room when lobby locks (trigger it from the `join-room` Edge Function at race-start transition, or an RPC the room "host"/first member calls — pick the simplest reliable point in the existing room phase flow). Build multiset from ratio per §6 table below, shuffle with `setseed` derived from `week_id || room_id`, write `room_members.assigned_species`. Monday: skip — players picked their own character. |
| `record_results(p_room_id uuid, p_override text)` | After race finishes (extend the existing `mark_room_finished` flow): compute advancement per §7, insert `passes` rows for winners (`nft_address = 'mock:' || gen_random_uuid()`), Saturday: insert into `sunday_passes` (next free slot ≤6, one per room — I5b/I7), Sunday: set `tournament_weeks.champion_user_id` (I9) and insert `billboard_entitlements`. Must be idempotent (guard: skip if results already recorded for this room). |

### Edge Function changes

- `supabase/functions/join-room/index.ts`: accept `{ override?: string }`, call `tournament_join_room` instead of bare `join_or_create_room`. Return distinct error codes the client can map to `BlockedStateScene` reasons: `no_wallet`, `no_pass`, `not_registered`, `saturday_full`, `no_sunday_pass`, `wrong_day`.
- Do **not** touch `supabase/functions/referee/index.ts` or in-race logic.

## 6. Decided values (do NOT re-decide these — spec marks them MAY CHANGE; for this test build they are fixed)

| Open question (spec §14) | Decision for this build |
|---|---|
| Roles for N players (Bug/Human/Klaus) | 6→3/2/1 · 5→2/2/1 · 4→2/1/1 · 3→1/1/1 · 2→1/1/0 · 1→1/0/0 |
| Min players to start Tue–Fri | 1 |
| Advancement: died vs finished | `finished=true` required to advance; `died` never advances |
| Burn abort refund | If race never starts after burn (room cancelled), un-burn the pass (set back to `active`, delete burn row). Cheap insurance for playtests. |
| Wallet link deadline / forfeit | **Skip for this build.** Pass is minted regardless; wallet is required at `tap_ready` time anyway. |
| `week_id` format | Monday UTC date `YYYY-MM-DD` (already what `getWeekId()` returns — keep client and server identical) |
| Monday 1-player slot | Run the race solo (real room, 1 member). No cancellation logic. |
| Sunday with 1 finalist | Run the race normally; finishing it makes them champion. |

## 7. Advancement curve (implement exactly)

In `record_results`, with `ready_count` = today's `ready_votes` count for the week (Monday: registrations count):

```
weekday in (monday, tuesday):
    ready_count < advancement_low_threshold (8)  → ALL finishers advance
    else                                          → top 3 finishers per room (by finish_time_ms)
weekday in (wednesday, thursday):                 → top 2 finishers per room
weekday = friday:                                 → top 1 (winner only) → Saturday pass
weekday = saturday:                               → winner only → Sunday pass (slot per room, ≤6)
weekday = sunday:                                 → winner = champion, no pass minted
```

Pass minted always grants entry to the **next** weekday (`won_on = today`).

## 8. Client wiring

General: replace registry-mock reads with a new `src/tournament/tournamentApi.ts` (thin wrapper around `supabase.rpc` + the `join-room` function, always forwarding the dev override). `weekClock.ts` keeps computing weekday/copy locally but **delete `mockPasses()`** — passes now come from a `get_my_week_state` view/RPC (add it: returns weekday, week_id, my active passes, wallet, my registration, ready count, champion billboard flag).

Per scene:

1. **`WeekHubScene.ts`**: load state via `tournamentApi`. "Connect wallet" → `ChainService.connectWallet()` with a small modal ("Connecting to wallet… Confirm in your wallet app") during the mock delay. Show real pass chips from DB. Route: Monday → `MenuScene`; Tue–Sat with pass+wallet → `ReadyPanelScene`; missing requirement → `BlockedStateScene` with the specific reason; Sunday with Sunday pass → `SundayFinaleScene`; champion (per `tournament_weeks`) → button to `ChampionDashboardScene`.
2. **`MenuScene.ts`**: on confirm, call `register_monday_slot`. Character pick stays Monday-only (it already is).
3. **`ReadyPanelScene.ts`** (currently unwired): call `tap_ready`, show live ready count (poll every 5 s is fine), button to proceed to `LobbyScene`.
4. **`LobbyScene.ts`**: keep the existing burn overlay UX, but `confirmBurn()` becomes: `ChainService.requestBurnSignature(passId)` (shows the signing delay) → `confirm_pass_burn` RPC → role comes from server (`room_members.assigned_species`), not from local `roleAssign.ts`. Keep `src/tournament/roleAssign.ts` only if some UI preview needs it; the authoritative value is the server's.
5. **`EndScene.ts`**: replace static `advancementCopy()` mocks with real outcome from `record_results` / a `get_my_week_state` refetch: "You won a Wednesday pass", "Eliminated — see you next Monday", "You earned Sunday pass · slot 3/6", "WORLD CHAMPION".
6. **`BlockedStateScene.ts`**: wire the error codes from §5 to its existing reason layouts.
7. **`SundayFinaleScene.ts`**: list real finalists (Sunday pass holders) from DB.
8. **`ChampionDashboardScene.ts`**: minimal real version — show champion status from DB; creative upload may store a URL string into `billboard_entitlements.creative_url`; transfer button calls a `transfer_billboard_rights(p_to_user uuid)` RPC. Billboard *rendering in-race* is OUT OF SCOPE — do not build it.

## 9. Out of scope — do not touch

- In-race gameplay: `GameScene`, `RoomSession` realtime protocol, referee, lanes, obstacles, NPC code.
- Real TON anything (TON Connect SDK, contracts, testnet). No new npm dependencies for chain.
- Billboard rendering in races, moderation flows, Telegram notifications, timezone-aware scheduling (slots are plain UTC as already configured).
- iOS handoff folder, asset scripts, anything in `old_unity_game/`, `itch-*`, `dist/`.
- Do not refactor unrelated code, do not reformat files you didn't change, do not rename existing tables/columns from migrations 0001–0004.

## 10. Work order with checkpoints (do them in sequence; verify each before moving on)

1. **Migrations 0005 + 0006** (schema, config seed, RPCs). Checkpoint: `supabase db push` applies cleanly; calling `current_tournament_day('tuesday')` in SQL editor returns the override.
2. **ChainService + MockChainService**, delete `tournamentService.ts`. Checkpoint: `npm run build` passes.
3. **`tournamentApi.ts` + `get_my_week_state`**, remove `mockPasses()`. Checkpoint: WeekHub shows empty pass row for a fresh user instead of a fabricated pass.
4. **Monday flow**: WeekHub → Menu → register → join room → race → `record_results` mints Tuesday pass. Checkpoint: after a Monday race, the DB has a `passes` row and WeekHub (with `?tournamentDay=tuesday`) shows it.
5. **Tue–Fri flow**: wallet connect mock, ReadyPanel, burn in lobby via ChainService + `confirm_pass_burn`, server roles, EndScene real copy. Checkpoint: full Tuesday run consumes the pass (`status='burned'`, burn row exists) and mints Wednesday pass.
6. **Saturday + Sunday**: room cap, sunday_passes slots, finale, champion. Checkpoint: manual SQL check that a 7th Saturday room is refused and only winners get Sunday passes.
7. **Blocked states + ChampionDashboard minimal.** Checkpoint: removing your pass row in SQL editor and reloading shows the correct blocked reason.
8. Final: `npm run build` clean, then run the manual test plan in §11 yourself as far as possible with two browser profiles.

After each checkpoint, state plainly what you verified and how. If a checkpoint fails, fix it before continuing — do not stack unverified work.

## 11. Manual test plan (what the human tester will do — make sure all of it works)

- Two browser profiles (= two anonymous Supabase users) on `npm run dev`.
- `?tournamentDay=monday`: both register, race, both should get Tuesday passes (forgiving threshold).
- `?tournamentDay=tuesday`: connect wallet (mock flow must *feel* like a real wallet: modal, delay, address shown), tap ready, lobby, burn (signing delay), assigned roles differ per ratio, race, winner gets Wednesday pass, loser per curve.
- Skip to `?tournamentDay=saturday` (mint passes by hand in SQL editor when shortcutting days — document the exact INSERT in a new `docs/TESTING_TOURNAMENT.md` you write at the end).
- `?tournamentDay=sunday`: finale with pass holders only, champion recorded, ChampionDashboard reachable.
- Negative paths: no pass → blocked screen; no wallet → blocked screen; pass already burned → cannot reuse.

## 12. Conventions

- Match existing code style (look at `src/scenes/WeekHubScene.ts` and `src/net/auth.ts` before writing client code; look at migrations 0002–0003 before writing SQL).
- TypeScript strict; no `any` unless the surrounding file already uses it.
- Comments only for non-obvious invariants (e.g. "I5: Saturday room cap").
- Every invariant from spec §3 (I1–I13) must be enforced **server-side**; client checks are UX sugar only.
