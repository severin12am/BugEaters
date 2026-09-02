# Tournament playtest guide (Web2 + mocked Web3)

> Real TON wallets / pass NFTs on testnet: [`TON_TESTNET_RUNBOOK.md`](./TON_TESTNET_RUNBOOK.md).
> Everything below still works with the mock wallet while `game_config.dev_mode = true`.

## Prerequisites

1. Supabase project linked with migrations applied (through **0015**):
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   supabase functions deploy join-room
   ```
2. Client env in `.env.local`:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   VITE_ALLOW_DEV_SESSION=true
   ```
3. Run client: `npm run dev` → http://localhost:5173  
   Or Telegram Mini App pointing at your tunnel / preview build.

## Playtest session UI (recommended)

On open (when `VITE_ALLOW_DEV_SESSION=true` or `npm run dev` or `?devSession=1`):

1. **Pick tournament week** (Week 1, 2, …) — isolated progress per week.
2. **Pick day** (Monday … Sunday) — exercises allow/deny gates for that day.
3. **Enter week hub**.

From the hub:

- **Change week / day** — re-open the picker (new session for a different day).
- **Reset my progress (this week)** — clears *your* registrations, passes, ready votes for the active sandbox week only.

### Why weeks?

Monday is **one race per user per week**. After you finish Monday on Week 1, pick **Week 2** to test Monday again without SQL. Passes and registration never cross sandbox weeks.

### What is gated (expected)

| Day | Allowed when… | Blocked when… |
|-----|----------------|---------------|
| Monday | Not yet raced this week | Already finished Monday |
| Tue–Sat | Active pass for that day + mock wallet | No pass / no wallet |
| Sunday | Sunday pass + wallet | No Sunday pass |

Sandbox weeks force **Monday slots open** (no waiting for real UTC slot times).

## Legacy URL override

Still works without the UI:

```
?tournamentDay=monday
```

Day-only override does **not** isolate weeks (uses the real calendar `week_id`). Prefer the session UI.

Packed override (automatic from UI): `tuesday|sandbox:3` — server honors only if `game_config.dev_mode = true`.

## Manual test flows

### Monday → Tuesday pass

1. Session: Week N · Monday · two browser profiles if multiplayer.
2. Register → Enter lobby (slot open in sandbox) → race → finish.
3. Session: same Week N · Tuesday — pass chip should appear; connect mock wallet → ready → burn → race.

### Fresh Monday

1. Session: **Week N+1** · Monday, or **Reset my progress** on current sandbox week.

### Saturday / Sunday shortcut (SQL)

```sql
insert into passes (user_id, week_id, grants_entry, won_on, nft_address, status)
values (
  '<user_id>',
  '<sandbox week_id e.g. 2090-01-04>',
  'saturday',
  'friday',
  'mock:manual-test',
  'active'
);
```

Sandbox week ids: Week 1 = `2090-01-04`, Week 2 = `2090-01-11`, … (`+7 days`).

## Production safety

| Control | Production value |
|---------|------------------|
| `VITE_ALLOW_DEV_SESSION` | `false` or unset |
| `game_config.dev_mode` | `false` |
| Playtest UI | Not shown; calendar clock only |
| Sandbox overrides | Ignored server-side when `dev_mode` is false |

## Negative paths

| Action | Expected |
|--------|----------|
| Tue+ without wallet | Blocked: wallet required |
| Tue+ without pass | Blocked: no pass |
| Lobby without tap ready | Blocked: not ready |
| Reuse burned pass | Burn fails / no active pass |
| Monday after race same week | Blocked: already raced |

## Verify in SQL

```sql
select * from current_tournament_day('tuesday|sandbox:2');
select * from passes where week_id = '2090-01-11';
```
