# BugEaters Multiplayer Architecture

This document explains the **authoritative multiplayer system** for BugEaters: a
fair, trustworthy backend where the **server owns the entire race simulation** and
clients only send inputs and render the results. This is the foundation that lets
race outcomes safely drive future on-chain actions (NFT minting, prizes).

> **New here?** Read this file top to bottom once. Each subsystem then has its own
> deep-dive doc, linked below.

---

## 1. The one big idea: the server is the only source of truth

```
        CLIENT (Phaser)                         SERVER (Node.js)
   ┌───────────────────────┐             ┌───────────────────────────┐
   │  reads inputs (taps)   │  inputs →   │  ONE shared WorldState     │
   │  predicts locally      │────────────▶│  fixed-tick simulation     │
   │  renders snapshots     │  ◀ snapshots│  decides ALL outcomes      │
   │  never decides outcome │             │  seals results at the end  │
   └───────────────────────┘             └───────────────────────────┘
```

- Clients **cannot** cheat by editing positions, deaths, or standings — they do
  not compute any of those. They send *intents* ("move left", "jump", "use
  ability") and draw whatever the server says is true.
- The server runs a **deterministic** simulation from a shared seed, so a race
  can be replayed and audited. This is what makes results *trustworthy*.

---

## 2. Three cleanly separated concerns

The requirement calls for clean separation between **lobby/matchmaking**, **live
race simulation**, and **post-race result handling**. Here is where each lives:

| Concern | Owner | Where |
| --- | --- | --- |
| Lobby / matchmaking / auth / payments | **Supabase** | `supabase/functions/*`, DB tables |
| Admission (verifying a player may join) | Game server | `server/src/admission/` |
| Live race simulation | Game server | `server/src/domain/` |
| Post-race result handling | Game server → Supabase | `server/src/results/`, `server/src/hooks/` |
| Rendering + input | Client | `src/net/authoritative/` + scenes |

Supabase stays the source of truth for *who is allowed to play* and *what a
tournament is*. The game server is the source of truth for *what happened during
the race*. They meet at exactly two well-defined seams:

1. **A signed race ticket** (Supabase → client → game server) admits a player.
2. **A signed results payload** (game server → Supabase) records the outcome.

---

## 3. Server module map

Everything is small, single-purpose, and depends on the layer beneath it.

```
server/src/
├── config/
│   └── raceConfig.ts        # ALL tunable numbers. Room size 3..12 lives here.
├── domain/                  # PURE simulation — no network, no Supabase, no Node I/O
│   ├── types.ts             # WorldState, PlayerState, Hazard, inputs, results
│   ├── rng.ts               # deterministic seeded randomness
│   ├── lifecycle.ts         # phase state machine (waiting→countdown→racing→finished)
│   ├── RaceSimulation.ts    # the heart: owns WorldState, runs the tick pipeline
│   └── systems/             # one small file per rule area (movement, hazards, …)
├── admission/               # THE TRUST BOUNDARY
│   ├── auth.ts              # verify the HMAC-signed race ticket
│   └── roster.ts            # turn ticket claims into a neutral PlayerSpawn
├── net/                     # transport adapter (swap this to leave Colyseus)
│   ├── protocol.ts          # the exact messages that cross the wire
│   ├── snapshot.ts          # project WorldState → wire snapshot
│   └── RaceRoom.ts          # thin Colyseus room; pumps the simulation
├── results/                 # WHERE sealed outcomes go (a "port")
│   ├── ResultsSink.ts       # interface
│   ├── supabaseResultsSink.ts
│   └── consoleResultsSink.ts# zero-setup local fallback
├── hooks/
│   └── postRaceHooks.ts     # EXTENSION POINTS: NFT minting, prizes, … (no chain code)
├── runtime/
│   └── serverContext.ts     # composition root: wires config + sink + hooks
└── index.ts                 # bootstrap: Colyseus server + health check
```

**Dependency direction** (nothing below depends on anything above it):

```
index → runtime → net → { admission, domain, results, hooks } → config → (nothing)
                          domain depends only on config
```

Because `domain/` is pure, you can unit-test the entire race outcome logic
without a network or a database.

---

## 4. Data flow of one race (end to end)

```
1. LOBBY (Supabase)     Player is matched into a room; room has seed, starts_at,
                        max_players (3..12), and a per-player lane/role.

2. TICKET (Supabase)    Client calls the `race-ticket` Edge Function, which
   Edge Function        returns a short-lived HMAC-signed ticket with those claims.

3. JOIN (game server)   Client presents the ticket to the Colyseus `race` room.
   admission/auth.ts    The server VERIFIES the signature + expiry → claims trusted.
   admission/roster.ts  Claims become a PlayerSpawn; capacity clamped to 3..12.

4. SIMULATE             RaceRoom pumps RaceSimulation at a fixed tick. Inputs are
   domain/*             validated + applied; hazards/abilities/deaths resolved;
                        snapshots broadcast ~20Hz.

5. SEAL                 When the clock runs out, the simulation computes ordered
   standingsSystem.ts   standings (placement 1..N).

6. PERSIST              results/SupabaseResultsSink signs + POSTs standings to the
   race-results EF      `race-results` Edge Function → record_authoritative_results
                        applies tournament advancement EXACTLY ONCE.

7. EXTEND               hooks/PostRaceHooks.runAll() fires every registered hook
                        (future: NFT mint, prize payout). Failures are isolated.
```

See [INPUTS_TO_OUTCOMES.md](./INPUTS_TO_OUTCOMES.md) for the input→outcome detail
and [ROOMS_AND_LIFECYCLE.md](./ROOMS_AND_LIFECYCLE.md) for the room/phase detail.

---

## 5. Why this is easy to change later

- **Change a rule?** Edit one system in `domain/systems/`. The tick pipeline in
  `RaceSimulation.step()` reads like a list of named steps.
- **Change room size?** One number in `config/raceConfig.ts` (bounded 3..12).
- **Add an ability or hazard?** Extend `abilitySystem.ts` / `hazardSystem.ts`.
  They are marked with `TODO(game-rules)` at every intended edit point.
- **Add NFT/prizes?** Register a hook in `runtime/serverContext.ts`. No core code
  changes. See [EXTENDING.md](./EXTENDING.md).
- **Swap transport (leave Colyseus)?** Only `net/RaceRoom.ts` + `net/protocol.ts`
  change; the simulation is transport-agnostic.
- **Swap where results go?** Implement `ResultsSink` and wire it in the
  composition root.

---

## 6. Related docs

- [ROOMS_AND_LIFECYCLE.md](./ROOMS_AND_LIFECYCLE.md) — how rooms are created, sized, and phased.
- [INPUTS_TO_OUTCOMES.md](./INPUTS_TO_OUTCOMES.md) — how a tap becomes an authoritative result.
- [CLIENT_PREDICTION.md](./CLIENT_PREDICTION.md) — how the Phaser client stays responsive.
- [EXTENDING.md](./EXTENDING.md) — how to add rules, abilities, and post-race hooks.
- [../AUTHORITATIVE_RACE_SERVER.md](../AUTHORITATIVE_RACE_SERVER.md) — deployment/ops.
