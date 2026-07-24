# Extending the System

This system is built to be changed. Below are recipes for the most common
extensions, ordered from "cheapest / most common" to "structural". Each is a
small, self-contained task — ideal to hand to a follow-up prompt (see
`../../USER_INSTRUCTIONS.md`).

Everywhere a designer is expected to edit, the code is marked with
`TODO(game-rules)` or `TODO(extension)`. Search for those markers.

---

## 1. Change room size (3..12)

Edit `server/src/config/raceConfig.ts`:

```ts
minPlayers: 3,
maxPlayers: 12,
defaultPlayers: 6,
```

…or set env vars `RACE_MIN_PLAYERS`, `RACE_MAX_PLAYERS`, `RACE_DEFAULT_PLAYERS`.
The band is enforced in exactly one place (`clampRoomCapacity`), so nothing else
needs to change.

---

## 2. Change race timing / world feel

Also `raceConfig.ts`:

```ts
tickMs, snapshotIntervalMs, raceDurationMs, countdownMs,
world: { speedPxPerSec, laneCount, subLaneWidth, jumpDurationMs }
```

> If you change lane geometry, also update the client mirror in
> `src/net/authoritative/clientRaceConfig.ts` so prediction stays accurate.

---

## 3. Add or change a hazard

Edit `server/src/domain/systems/hazardSystem.ts`:

- Add a new kind to `Hazard['kind']` in `domain/types.ts`.
- Add its spawn weighting in `spawnHazards`.
- Add its collision effect in `resolveHazards`.

Everything is deterministic from the shared seed, so clients could even predict
the layout if desired.

---

## 4. Add or change an ability

Edit `server/src/domain/systems/abilitySystem.ts`. The reference uses a `switch`
on `abilityId`; the intended next step (already noted in a TODO) is a small
registry:

```ts
const ABILITIES: Record<string, (actor, input, world, ctx) => void> = {
  'needle-spawner': applyTargetedElimination,
  'speed-up': applySelfBoost,
};
```

The server is authoritative over inventory: a player can only fire an ability it
actually holds. The client sends `activate(abilityId, aimX, aimY)`; the server
decides what happens.

---

## 5. Change scoring / standings

Edit `server/src/domain/systems/standingsSystem.ts#computeStandings`. This is the
single function that turns the final world into ordered placements. Because it's
pure, it's trivial to unit-test.

---

## 6. Add a post-race hook (NFT minting, prizes, analytics, …)

**This is the extension point for future on-chain actions.** No blockchain code
lives in the core; you add it as an isolated hook.

Edit `server/src/runtime/serverContext.ts#registerPostRaceHooks`:

```ts
hooks.register('nft-mint', async (result) => {
  const winner = result.results.find((r) => r.placement === 1);
  if (!winner) return;
  await myMintService.mint(winner.userId, {
    roomId: result.roomId,
    seed: result.seed,           // provable, deterministic race identity
  });
});

hooks.register('prize-payout', async (result) => {
  await myPrizeService.distribute(result.roomId, result.results);
});
```

Guarantees:

- Hooks receive the **sealed** result (`SealedRaceResult`) after it's persisted.
- Each hook runs in isolation — a failing hook is logged and never breaks result
  finalization or other hooks.
- The core game never imports your blockchain/NFT/prize libraries.

See `server/src/hooks/postRaceHooks.ts` for the contract.

---

## 7. Send results somewhere other than Supabase

Implement the `ResultsSink` interface (`server/src/results/ResultsSink.ts`):

```ts
export class MyWarehouseSink implements ResultsSink {
  async submit(result: SealedRaceResult): Promise<void> { /* ... */ }
}
```

…and select it in `serverContext.ts#chooseResultsSink`. The game depends on the
interface, not the implementation.

> Tip: you can compose sinks (e.g. a `FanoutResultsSink` that calls several) if
> you want to write to Supabase *and* a warehouse.

---

## 8. Swap the transport (leave Colyseus)

Only `server/src/net/RaceRoom.ts` and `server/src/net/protocol.ts` know about
Colyseus. The simulation (`domain/`), admission, results, and hooks are all
transport-agnostic. To move to raw WebSockets or another framework, rewrite the
adapter to:

1. verify tickets via `admission/`,
2. feed inputs to `RaceSimulation.enqueueInput`,
3. call `RaceSimulation.step()` on a fixed interval,
4. broadcast `buildSnapshot(...)`,
5. call `finalise()` logic on `justFinished`.

---

## Testing an extension without a network

Because `domain/` is pure, you can drive a whole race in a test:

```ts
const sim = new RaceSimulation(config, { seed, startsAtMs, capacity });
sim.addPlayer({ id: 'a', role: 'bug', lane: 0 });
sim.enqueueInput('a', { type: 'move', direction: 'right', seq: 1 });
for (let now = start; now <= end; now += config.tickMs) sim.step(now);
expect(sim.sealResults()[0].userId).toBe('a');
```

No Colyseus, no Supabase, fully deterministic.
