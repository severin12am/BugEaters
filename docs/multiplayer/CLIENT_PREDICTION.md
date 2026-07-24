# Client Integration: Prediction & Reconciliation

The Phaser client is a **renderer + input sender**. It never decides outcomes.
But to feel responsive on mobile, it uses two standard netcode techniques so the
game doesn't feel laggy while still respecting the server as the only authority.

All of this lives in `src/net/authoritative/`.

---

## The client modules

```
src/net/authoritative/
├── protocol.ts               # mirror of the server's wire messages
├── clientRaceConfig.ts       # lane geometry (must match the server)
├── RaceConnection.ts         # transport: ticket fetch + Colyseus join + send
├── InputPredictor.ts         # local prediction + reconciliation (self only)
├── SnapshotInterpolator.ts   # smooth interpolation (remote players)
└── AuthoritativeRaceClient.ts# the FACADE your scene uses
```

`src/net/AuthoritativeRaceClient.ts` re-exports the facade, so you can import from
either path.

---

## The three responsibilities

### 1. Transport (`RaceConnection`)

- Asks Supabase's `race-ticket` Edge Function for a signed ticket.
- Joins the Colyseus `race` room with `{ token, roomKey }`.
- Forwards `snapshot` / `ability` / `final` messages to callbacks and sends
  inputs. No game logic here.

### 2. Prediction + reconciliation for the local player (`InputPredictor`)

The problem: waiting a full network round-trip before the local runner moves
feels sluggish.

The fix:

1. **Predict** — when the player taps, apply the input locally *immediately*
   using the *same* movement rules as the server, and remember the input with its
   `seq`.
2. **Reconcile** — when an authoritative snapshot arrives, snap the local runner
   to the server's confirmed state (`lastInputSeq` tells us what it has applied),
   drop acknowledged inputs, and **replay** the still-unacknowledged ones on top.

The result: the local runner reacts instantly but can never drift from the
server's truth — any misprediction is corrected on the very next snapshot.

> Keep `InputPredictor.applyInput` in sync with the server's
> `movementSystem.ts`. They implement the same lane math on purpose.

### 3. Interpolation for remote players (`SnapshotInterpolator`)

Snapshots arrive ~20Hz but we render at 60fps. Drawing remote runners at the
latest snapshot each frame would stutter. Instead we render remote players a
small, constant time in the past (`~100ms`) and linearly interpolate between the
two snapshots that straddle that render time. Smooth motion for a tiny, fixed
latency — the right trade-off on Telegram WebView.

Only *remote* players are interpolated; the *local* player is predicted.

---

## Using it from a Phaser scene

```ts
import { AuthoritativeRaceClient } from '../net/AuthoritativeRaceClient';

const race = new AuthoritativeRaceClient();

// Only use the authoritative path when the server URL is configured.
if (race.isConfigured()) {
  await race.join(roomId, {
    onAbility: (e) => playAbilityFx(e.abilityId, e.actorId),
    onFinal: (e) => showResults(e.results),
  });
}

// On input (e.g. a swipe / tap handler):
race.move('left');
race.jump();
race.activate('needle-spawner', aimX, aimY);

// Every frame, in the scene's update():
const view = race.getRenderState();
//   view.phase        → 'waiting' | 'countdown' | 'racing' | 'finished'
//   view.raceMs       → race clock (drive the countdown + timer from this)
//   view.self         → local runner: predicted lane/x/jump, authoritative status
//   view.remotePlayers→ smoothed rivals to draw
//   view.hazards      → world hazards to draw
renderRace(view);

// On leaving the scene:
race.leave();
```

The scene should render **only** what `getRenderState()` returns and send inputs
through `move/jump/activate`. It must not compute deaths, finishes, standings, or
hazard collisions locally — those are the server's job.

---

## Fallback

`isConfigured()` returns false when `VITE_RACE_SERVER_URL` is not set. Keep the
existing Supabase-realtime path (`RoomSession`) as the fallback until the
authoritative renderer fully replaces it (see the release gate in
`../AUTHORITATIVE_RACE_SERVER.md`).
