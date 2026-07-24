# Backend and networking

Supabase-backed multiplayer for synchronized 60 s races. Tournament pass/burn/advancement tables exist in migrations but **production tournament logic is not fully wired** — see `APP_MASTER_SPEC.md` §11.

---

## Architecture

```
Telegram Mini App
    │
    ├─ telegram-auth (Edge) ──► Supabase Auth (linked Telegram user)
    │
    ├─ join-room (Edge) ──► join_or_create_room RPC
    │                         returns seed, starts_at, sub-lane
    │
    └─ RoomSession (client)
            Realtime channel per room
            ├─ Presence → lobby roster
            ├─ Broadcast state (~12 Hz movement)
            ├─ Broadcast dilemma:start / dilemma:choice
            ├─ Broadcast npc:eat
            └─ Postgres INSERT race_events → eliminations
                    ▲
                    │ referee (Edge) validates eats
```

---

## Client networking

### `src/net/RoomSession.ts`

Central hub for one race room:

| Channel | Event | Purpose |
|---------|-------|---------|
| Presence | sync | Lobby member list |
| Broadcast | `state` | `{ userId, x, globalSubLane, distanceTraveled, ... }` |
| Broadcast | `dilemma:start` / `dilemma:choice` | Prisoner's Dilemma |
| Broadcast | `npc:eat` | Hide bot slot on all clients |
| Postgres | `race_events` INSERT | Authoritative elimination |
| Postgres | `rooms` UPDATE | Phase: waiting → countdown → racing → finished |

**Solo mode:** `RoomSession.tryCreate()` returns `null` when Supabase env missing — client skips networking.

### `src/net/auth.ts`

1. Reuse persisted session if valid  
2. Else Telegram `initData` → `telegram-auth` Edge Function  
3. Else `signInAnonymously()` for local dev  

### `src/managers/RemoteRunnerManager.ts`

- Spawns `RemotePlayer` per peer snapshot  
- Interpolates with 90 ms delay  
- Positions Y from progress gap vs local player (`raceVisual.rivalProgressGapToScreenOffset`)  
- Submits eat claims to referee with cooldown  

### Deterministic world

All clients in a room share:

- `rooms.seed` → `ObstacleManager` + `MainLaneDivider` RNG (`utils/rng.ts`)  
- `starts_at` → wall-clock race timer  
- Assigned `globalSubLane` per member  

Movement is **client-simulated**; contested kills go through **referee**.

---

## Edge Functions

### `supabase/functions/telegram-auth/index.ts`

- Validates Telegram WebApp `initData` HMAC with `TELEGRAM_BOT_TOKEN`  
- Creates/links auth user  
- Returns Supabase session tokens  

### `supabase/functions/join-room/index.ts`

- Calls `join_or_create_room(character, lobby_seconds)`  
- Returns `{ roomId, seed, startsAt, phase, globalSubLane, serverNow }`  
- Client computes clock offset for synchronized countdown  

### `supabase/functions/referee/index.ts`

- **Food-chain eat:** validates `canEat(attacker, victim)` server-side  
- **Dilemma betrayal:** same-species elimination  
- Writes to `race_events`; idempotent per victim  
- Uses service role key  

Shared rules: `functions/_shared/eatingRules.ts` (mirror of client).

---

## Database (migrations)

| Migration | Contents |
|-----------|----------|
| `0001_init.sql` | profiles, rooms, room_members, race_events |
| `0002_matchmaking.sql` | `join_or_create_room`, phase transitions |
| `0003_results.sql` | finish_time_ms, finished/died on members |
| `0004_race_duration_60.sql` | 60 second races |
| `0005_tournament.sql` | Tournament tables (passes, weeks, config sketch) |
| `0006–0008_*.sql` | Tournament RPC fixes, Monday flow |

### Core tables (race)

| Table | Role |
|-------|------|
| `profiles` | Auth user ↔ Telegram id |
| `rooms` | seed, phase, starts_at, day_key, max_players |
| `room_members` | sub-lane assignment, race result |
| `race_events` | Elimination log (client read-only) |

### Room phases

```
waiting → countdown → racing → finished
```

---

## Environment

### Client (`.env.local`)

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_FORCED_SEED=          # optional
```

### Server secrets (Supabase Dashboard)

| Secret | Used by |
|--------|---------|
| `TELEGRAM_BOT_TOKEN` | telegram-auth |
| `LOBBY_SECONDS` | join-room (default 12) |
| `SUPABASE_SERVICE_ROLE_KEY` | referee (auto) |

---

## Deploy

```bash
supabase db push
supabase functions deploy telegram-auth
supabase functions deploy join-room
supabase functions deploy referee
```

Local Supabase: `supabase start` + `supabase functions serve`.

---

## Eating authority flow

```
Client detects overlap + canEat locally
    │
    ├─ NPC bot → NpcManager.killNpc → optional npc:eat broadcast
    │
    └─ Remote human → RoomSession.sendEatClaim → referee Edge
                           │
                           └─ race_events INSERT → all clients eliminate(userId)
```

Dilemma betrayals against remotes also use referee with `kind: 'dilemma'`.

---

## Tournament backend (planned / partial)

Not production-complete. Required pieces listed in `APP_MASTER_SPEC.md` §11:

- `game_config` API  
- Pass mint/burn records  
- Weekday gating on join-room  
- Saturday room cap allocator  
- Sunday global room  
- Progressive advancement job  
- Wallet link + forfeit cron  
- Champion billboard storage  

Client mocks: `src/tournament/chain/MockChainService.ts`, `tournamentApi.ts`.

---

## Related docs

- Product rules: [`APP_MASTER_SPEC.md`](APP_MASTER_SPEC.md)  
- Tournament detail: [`TOURNAMENT_SYSTEM_SPEC.md`](TOURNAMENT_SYSTEM_SPEC.md)  
- Client net types: `src/net/types.ts`  
- Multiplayer tuning: `TUNING.multiplayer.rivalVisual` in `tuning.ts`
