# USER INSTRUCTIONS — Read Me First

_A plain-language guide for a non-technical person. No coding required to
understand this page._

> **Want to play right now?** Open **[PLAY_NOW.md](./PLAY_NOW.md)** — two
> terminals and you’re racing. That local path is fully wired.

---

## 1. What was built in this pass ✅

This pass built the **core, high-level architecture** for the BugEaters
multiplayer system — the skeleton and foundation, not every gameplay detail.

Concretely, you now have:

- **A fair, "server-owns-everything" race backend.** The server runs the whole
  race and decides all results. Players' phones only send taps ("move", "jump",
  "use ability") and draw what the server says. This is what makes results
  trustworthy enough to later drive NFTs and prizes.
- **Configurable room sizes from 3 to 12 players** (change one number).
- **Clean separation** between: the lobby/entry (handled by your existing
  Supabase), the live race (the game server), and what happens after a race
  (recording results + future rewards).
- **Built-in "extension points" for the future** — clearly marked places to plug
  in NFT minting and prize payouts later, **without** touching the game logic and
  **without** any blockchain code baked in yet.
- **A responsive client setup** for the Phaser game (so it feels instant on
  mobile even though the server is in charge).
- **Lots of documentation and comments** so future changes are easy.

It has been **verified to compile and boot** (the server starts and responds to a
health check, and both the server and client pass their type checks).

> Think of this as a well-organized house with all the rooms, wiring, and
> plumbing in place. The remaining work is "furnishing rooms" — smaller, cheaper
> tasks that don't require redesigning anything.

---

## 2. Where everything lives (a quick map)

You don't need to read the code, but here's the lay of the land:

| Folder | Plain meaning |
| --- | --- |
| `server/src/config/` | The dials you'll tweak (room size, race length, speed). |
| `server/src/domain/` | The "referee brain" that runs the race fairly. |
| `server/src/admission/` | The bouncer that checks a player's ticket at the door. |
| `server/src/results/` | Where final results get sent (your Supabase). |
| `server/src/hooks/` | The future "give the winner an NFT/prize" slots. |
| `src/net/authoritative/` | The phone-side code that sends taps and draws the race. |
| `docs/multiplayer/` | The full written explanation of how it all works. |
| `USER_INSTRUCTIONS.md` | This file. |

The best starting doc is **`docs/multiplayer/ARCHITECTURE.md`**.

---

## 3. Recommended next workflow (IMPORTANT) 💡

The heavy design work is done. **The smart, cost-effective way to continue is to
hand the remaining smaller tasks to cheaper / faster AI models** (for example
Cursor's faster models), one focused task at a time. The architecture was
deliberately built so each remaining piece is small and self-contained.

**Golden rules when prompting a cheaper model:**

1. **One task per prompt.** Don't ask for five things at once.
2. **Point it at the exact file(s).** The paths are in this doc and in
   `docs/multiplayer/EXTENDING.md`.
3. **Tell it to keep the same style** and to look for `TODO(game-rules)` /
   `TODO(extension)` markers, which flag every place meant to be edited.
4. **Ask it to type-check when done** (commands in Section 5).

### Example follow-up prompts you can copy/paste

Fill in the brackets. Each is a good "cheap model" task:

- **Tune room size / timing**
  > "In `server/src/config/raceConfig.ts`, change the default room size to [8]
  > players and the race length to [45] seconds. Keep the 3–12 min/max band.
  > Then run `npm run race-server:check` and fix any errors."

- **Add a new hazard**
  > "Following the pattern and `TODO(game-rules)` notes in
  > `server/src/domain/systems/hazardSystem.ts`, add a new hazard kind called
  > '[oil-slick]' that [briefly slows a runner]. Update the type in
  > `server/src/domain/types.ts` too. Type-check with `npm run race-server:check`."

- **Add a new ability**
  > "In `server/src/domain/systems/abilitySystem.ts`, add an ability
  > '[shield]' that [makes the user immune to the next hazard]. Follow the
  > existing switch/registry pattern noted in the TODOs."

- **Refactor abilities into a registry** (a clean, contained job)
  > "Refactor the `switch` in `server/src/domain/systems/abilitySystem.ts` into
  > the small `Record<string, handler>` registry described in its TODO comment,
  > without changing behavior. Type-check afterward."

- **Wire the client renderer into a scene**
  > "In `src/scenes/GameScene.ts`, use `AuthoritativeRaceClient` from
  > `src/net/AuthoritativeRaceClient.ts` as described in
  > `docs/multiplayer/CLIENT_PREDICTION.md`: call `getRenderState()` each frame
  > and route input through `move/jump/activate`. Keep the existing solo/legacy
  > path as a fallback when `isConfigured()` is false."

- **Add a future reward hook (placeholder)**
  > "In `server/src/runtime/serverContext.ts`, register a new post-race hook
  > named '[prize-payout]' that logs the top 3 finishers for now (leave a TODO
  > for the real payout). Follow `docs/multiplayer/EXTENDING.md` section 6."

- **Expand documentation / examples**
  > "Add a short worked example to `docs/multiplayer/EXTENDING.md` showing how to
  > add a same-species 'betrayal' rule, matching the existing writing style."

---

## 4. What YOU need to do manually after this pass 🧑‍💻

These are the hands-on steps. Take them in order.

### Step A — Install and run the server locally (no accounts needed)

You need [Node.js](https://nodejs.org) 20+ installed. Then, in a terminal at the
project root (`d:\BE`):

```powershell
npm install
npm run race-server
```

You should see a banner and a line like:

```
[race-server] listening on :2567 — rooms 3..12 players, 1 post-race hook(s) registered
```

In another terminal, check it's alive:

```powershell
# PowerShell
Invoke-WebRequest http://localhost:2567/healthz | Select-Object -ExpandProperty Content
```

You should get: `{"ok":true,"service":"bugeaters-race-server","rooms":{"min":3,"max":12}}`.

> With no Supabase configured, the server runs in "local mode": it logs results to
> the console instead of saving them. That's expected and fine for testing.

### Step B — Review the architecture (30 minutes, no coding)

Read, in this order:

1. `docs/multiplayer/ARCHITECTURE.md` (the big picture)
2. `docs/multiplayer/ROOMS_AND_LIFECYCLE.md` (how rooms/sizes work)
3. `docs/multiplayer/INPUTS_TO_OUTCOMES.md` (how taps become results)
4. `docs/multiplayer/EXTENDING.md` (how to add things later)

If anything is unclear, that's a great thing to ask a model to explain or expand.

### Step C — Connect to your existing Supabase (high level)

Your Supabase already has the pieces (auth, rooms, the `race-ticket` and
`race-results` Edge Functions, and the results-recording database function). To
link the game server to it:

1. **Pick one shared secret.** Generate a long random string (64 characters).
   This single secret is the "matching key" both sides use to trust each other.
2. **Put that same secret in two places:**
   - Supabase → your project's Edge Function secrets, as `RACE_TOKEN_SECRET`.
   - The game server → its environment, as `RACE_TOKEN_SECRET`
     (see `server/.env.example`).
3. **Tell the game server where Supabase is:** set `SUPABASE_URL` to your project
   URL (also in `server/.env.example`).
4. **Redeploy** the Supabase `race-ticket` and `race-results` functions so they
   pick up the secret.
5. **Point the phone/web client at the game server:** set `VITE_RACE_SERVER_URL`
   to the server's address (use `wss://…` in production).

That's the whole integration: **one shared secret + two URLs.** The detailed ops
steps are in `docs/AUTHORITATIVE_RACE_SERVER.md`.

### Step D — Prepare info for the next iteration

Before the next round of work, jot down answers to these (they'll make the
follow-up prompts precise):

- What room size(s) do you actually want per day/round? (any number 3–12)
- Final list of abilities and exactly what each should do.
- Final list of hazards and their effects.
- The exact rule for who "wins" / advances (the placement/scoring rule).
- When and what rewards happen after a race (for the future NFT/prize hooks).

---

## 5. Handy commands (copy/paste)

Run these from the project root (`d:\BE`):

| Goal | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Run the race server | `npm run race-server` |
| Check the server code compiles | `npm run race-server:check` |
| Check the whole client compiles | `npx tsc --noEmit -p tsconfig.json` |
| Run the game client (Vite dev) | `npm run dev` |

If a command reports errors after an AI edit, paste the error back to the model
and ask it to fix it — that loop is normal and safe.

---

## 6. Simple setup checklist

- [ ] Node.js 20+ installed.
- [ ] `npm install` run once.
- [ ] `npm run race-server` starts and prints the "listening" line.
- [ ] Health check returns `ok:true`.
- [ ] Read the 4 docs in `docs/multiplayer/`.
- [ ] Generated one `RACE_TOKEN_SECRET` and set it in **both** Supabase and the
      server (only needed when you go beyond local testing).
- [ ] Set `SUPABASE_URL` (server) and `VITE_RACE_SERVER_URL` (client) when
      connecting them.
- [ ] Written down your answers from Step D for the next iteration.

---

## 7. What was intentionally left as a "next task" (and why)

To keep this pass focused on solid architecture, these were left as clearly
marked, easy follow-ups (great for cheaper models):

- Final gameplay numbers for hazards/abilities (marked `TODO(game-rules)`).
- Real NFT/prize logic inside the post-race hooks (marked `TODO(extension)`).
- Wiring the new authoritative client renderer into the actual Phaser
  `GameScene` (the legacy path still works in the meantime).
- Automated tests for specific race scenarios (the pure design makes these easy).

None of these require changing the architecture — that's the whole point.
