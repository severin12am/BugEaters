# Rooms & Lifecycle

How a race room comes into existence, how its size is decided, and the phases it
moves through.

---

## What is a "room"?

A room is **one race with one shared world state**. Each room maps 1:1 to a
Supabase `rooms` row and to one `RaceSimulation` instance on the game server.
Colyseus routes players to the right room using the `roomKey` (the Supabase room
id):

```ts
// server/src/index.ts
gameServer.define('race', RaceRoom).filterBy(['roomKey']);
```

`filterBy(['roomKey'])` means "when a client asks to join `race` with
`roomKey=X`, put them in the existing room for X, or create it". So every
Supabase room gets its own isolated authoritative simulation.

---

## Room size: 3 to 12 players (configurable)

Room size is configurable and always clamped into a supported band.

- The **band** (`minPlayers` / `maxPlayers` / `defaultPlayers`) is defined once in
  `server/src/config/raceConfig.ts` and defaults to **3..12**, default 6.
- The **actual capacity** of a given room comes from the signed ticket's
  `maxPlayers` (set by the lobby/matchmaking in Supabase), then clamped into the
  band by `clampRoomCapacity()`.

```
Supabase rooms.max_players ──▶ ticket.maxPlayers ──▶ clampRoomCapacity(3..12) ──▶ room.maxClients
```

This keeps the "3 to 12" rule in exactly one place while letting the lobby pick
any specific size within it. To change the band, edit `raceConfig.ts` (or set the
`RACE_MIN_PLAYERS` / `RACE_MAX_PLAYERS` / `RACE_DEFAULT_PLAYERS` env vars).

The first valid ticket to join a room fixes its immutable parameters (seed,
`startsAt`, capacity). Later joiners must present tickets that agree — see
`admission/roster.ts#assertConsistentParams`. This prevents anyone from
desyncing the simulation.

---

## The lifecycle phases

Every race moves through a strict sequence, decided in one place:
`server/src/domain/lifecycle.ts#derivePhase`.

```
   Waiting  ──▶  Countdown  ──▶  Racing  ──▶  Finished
   (idle)       (3..2..1)       (live)       (sealed)
```

| Phase | When | What the server does | What the client shows |
| --- | --- | --- | --- |
| `Waiting` | before `startsAt - countdownMs` | ticks the clock only | lobby / "get ready" |
| `Countdown` | last `countdownMs` before start | ticks the clock only | 3..2..1 overlay |
| `Racing` | `startsAt` … `startsAt + duration` | full simulation | the live race |
| `Finished` | after `startsAt + duration` | seals results, fires hooks | results screen |

Phase is derived purely from the clock relative to `startsAt`, which comes from
the ticket. That means **all clients agree on the phase without extra messages** —
they just need the (synchronized) start time, which is in every snapshot.

Key timing knobs (all in `raceConfig.ts`):

- `countdownMs` — how long the pre-race countdown lasts.
- `raceDurationMs` — race length (default 60s).
- `tickMs` — simulation step (default 50ms = 20Hz).
- `snapshotIntervalMs` — broadcast rate (default 50ms = 20Hz).

---

## Reconnection

Mobile / Telegram WebView connections drop. The design treats a disconnect as
*transient*, not death:

- `RaceRoom.onLeave` deliberately keeps the player's authoritative state.
- On rejoin (same ticket/user id), `RaceSimulation.addPlayer` is idempotent and
  the player resumes with their server-owned progress.

The race continues fairly for everyone else while a player is briefly away.

---

## Finalization

When `RaceSimulation.step()` reports `justFinished`:

1. A final snapshot is broadcast (so clients see the finished world).
2. `sealResults()` computes ordered standings.
3. The sealed result is pushed to the `ResultsSink` (Supabase or console).
4. Every post-race hook runs (`PostRaceHooks.runAll`).
5. After a short grace period the room disconnects.

This is the single, well-defined moment where "the simulation" becomes "the
outcome". Everything downstream (tournament advancement, NFTs, prizes) hangs off
step 3 and 4.
