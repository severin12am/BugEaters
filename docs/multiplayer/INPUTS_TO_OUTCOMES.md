# From Inputs to Outcomes

This is the core promise of the system: **clients send intents, the server turns
them into authoritative outcomes.** Here is exactly how, step by step.

---

## 1. What a client is allowed to send

Only three intent shapes exist (`server/src/domain/types.ts` → `PlayerInput`):

```ts
{ type: 'move', direction: 'left' | 'right', seq }
{ type: 'jump', seq }
{ type: 'activate', abilityId, aimX?, aimY?, seq }
```

Every input carries a monotonically increasing `seq` (per player). That's it —
no positions, no "I died", no "I finished". The client literally cannot express
an outcome.

---

## 2. Intake + validation

`RaceRoom.handleInput` → `RaceSimulation.enqueueInput`:

- Rejects inputs for unknown / dead / finished players.
- Rejects stale or duplicate packets (`seq <= lastInputSeq`).
- Otherwise queues the input for the next tick.

This is the anti-cheat / anti-desync gate. Nothing past here is trusted blindly;
the simulation itself enforces the rules.

---

## 3. The fixed-tick pipeline

Every `tickMs` the room calls `RaceSimulation.step(now)`, which runs a clear,
ordered pipeline (see `RaceSimulation.step`):

```
step(now):
  1. advance clock + derive phase (waiting/countdown/racing/finished)
  if racing:
    2. applyInputs()        → movementSystem / abilitySystem decide effects
    3. spawnHazards()       → deterministic from the shared seed
    4. resolveHazards()     → collisions, pickups, deaths (per player)
    5. advanceProgress()    → move runners forward with the world
    6. pruneHazards()       → drop off-screen / consumed hazards
  if just crossed the finish time:
    7. markFinishers()      → everyone still alive finishes
```

Each numbered step is a small, replaceable function in `domain/systems/`. To
change a rule you edit one system — the pipeline stays readable.

### Why it is deterministic (and therefore auditable)

- Randomness comes only from the seeded RNG / seeded hash (`domain/rng.ts`),
  never `Math.random()`.
- Time comes from the tick clock, never ad-hoc `Date.now()` inside systems.
- Given the same `(seed, startsAt, inputs)`, the race produces the same result
  every time — so a disputed outcome can be replayed and verified.

---

## 4. Producing the outcome

When the race clock ends, `standingsSystem.computeStandings(world)` orders every
player into final placements. The reference ordering is:

1. survivors before those who died,
2. then earlier finish time,
3. then greater distance,
4. then a stable id tiebreak.

The result is an array of `PlayerResult { userId, finished, died, finishTimeMs,
placement }`. **This array is the authoritative outcome.**

---

## 5. Sealing + delivering the outcome

`RaceRoom.finalise()`:

1. Broadcasts a `final` message to clients (for the results screen).
2. Wraps standings in a `SealedRaceResult` (adds roomId, seed, timestamps).
3. Pushes it to the `ResultsSink`:
   - **Supabase**: HMAC-signs the payload and POSTs to the `race-results` Edge
     Function, which calls `record_authoritative_results` — the *only* writer of
     final standings, applied exactly once (idempotent by `results_recorded_at`).
   - **Console** (local dev): just logs it.
4. Runs post-race hooks (see [EXTENDING.md](./EXTENDING.md)).

---

## 6. The two trust seams (recap)

```
   Supabase ──(signed ticket)──▶ game server      : "this user may join, as role R,
                                                     in lane L, seed S, start T"

   game server ──(signed results)──▶ Supabase     : "these are the final standings"
```

Both directions are HMAC-signed with the shared `RACE_TOKEN_SECRET`, so neither a
malicious client nor a spoofed request can forge admission or results. The game
server trusts a ticket only after `admission/auth.ts` verifies it; Supabase
trusts results only after `race-results` verifies the signature.

---

## Where to change game-specific rules

Search the server for `TODO(game-rules)`. Every place a designer is expected to
tweak behavior is marked. The main ones:

| Rule | File |
| --- | --- |
| Lane movement / jump feel | `domain/systems/movementSystem.ts` |
| Hazard kinds, spawn cadence, effects | `domain/systems/hazardSystem.ts` |
| Ability effects | `domain/systems/abilitySystem.ts` |
| Forward progress / boosts / slows | `domain/systems/progressSystem.ts` |
| Standings / scoring order | `domain/systems/standingsSystem.ts` |
| World geometry + timing | `config/raceConfig.ts` |
