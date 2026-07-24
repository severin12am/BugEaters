# BugEaters — Complete Game & Technical Reference

A fast, black-and-white lane runner built as a **Telegram Mini App**. You race for **60 seconds** on a dark asphalt road with three rival species, dodge hazards, and fight for position using a simple **eat-or-be-eaten** ruleset.

This document is the **single source of truth** for what the game is, how it plays, how it is built, and what is planned.

---

# Part 1 — Game Design

## The idea

BugEaters is a side-scrolling runner with a **global tournament** feel: everyone runs the same kind of race, at the same kind of pace, with fixed roles (bugs, humans, Klaus). The long-term vision is **daily races that start together for the whole world**, with many parallel rooms so it still feels like one big event.

**Look & feel:** near-black road (`#080808`), light scrolling grain overlay, white/gray characters, **red blood** (`#cc0000`) when someone dies, Unity-style **street-lamp lighting** (dark world, bright pools, cast shadows).

---

## Player flow

```
Boot (load assets) → Main menu → Pick character → Lobby (matchmake) → Race (60 sec) → End screen → Race again or menu
```

### Solo vs multiplayer

| Mode | When | Flow |
|------|------|------|
| **Solo** | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` not set, or auth/join fails | Menu → Lobby skips straight to Game |
| **Multiplayer** | Supabase configured + successful auth + join | Menu → Lobby (countdown + roster) → synchronized Game |

### Main menu (`MenuScene`)
- Title: **BUG EATERS**
- Choose one of three runners: **Bug**, **Human**, or **Klaus**
- Each option shows a label, description, and animated walk preview
- Tap **START RACE** → goes to lobby

### Lobby (`LobbyScene`)
- Matchmakes into a room via `join-room` Edge Function
- Shows room id, live roster (presence), and countdown to synchronized start
- **CANCEL** returns to menu
- On auth/network failure: brief “Offline — starting solo race” then solo Game
- Default lobby window: **12 seconds** before race start (`LOBBY_SECONDS`)

### The race (`GameScene`)
- Fixed **60-second** countdown at the top (wall-clock synchronized in multiplayer)
- **Progress %** toward the finish (based on player race distance, not world scroll)
- You run forward automatically; you control **lanes** and **jump**
- Up to **six runners** on the road: you + NPC fillers + real remote players in multiplayer
- Hazards spawn per main lane; eating rules apply on close contact
- **Prisoner's Dilemma** triggers when same-species runners get close

### End screen (`EndScene`)
| Outcome | Title | Condition |
|---------|-------|-----------|
| Completed | **FINISH!** | Reached race distance before timer ends (shows race time) |
| Death | **ELIMINATED** | Eaten, open manhole, or off-road |
| Incomplete | **TIME UP** | Timer hit zero without enough progress |

Options:
- **RACE AGAIN** — solo: restarts `GameScene`; multiplayer: new lobby matchmake
- **MAIN MENU** — tears down `RoomSession`, returns to menu

Multiplayer also shows **room standings** (finishers by time, then survivors, then eliminated).

---

## The road & lanes

### Layout (left → right)

| Region | Global sub-lane indices | Who can run here |
|--------|-------------------------|------------------|
| Left death half-strip | `-1` (logical) | Bugs only — stepping here kills |
| Bugs main lane | `0, 1, 2` | Bugs |
| Humans main lane | `3, 4, 5` | Humans |
| Klaus main lane | `6, 7, 8` | Klaus |
| Right death half-strip | `9` (logical) | Klaus only — stepping here kills |

Each main lane has **3 sub-lanes**. The player starts in the **center sub-lane** of their type (indices 1, 4, or 7). In multiplayer, the server assigns a specific sub-lane within that range.

**World width:** 10 sub-lane widths (9 playable + 2 half-shoulder strips).

**Shoulders:** far left and far right strips outside the nine lanes. **Street lamps** spawn there as decoration only (no collision).

### Lane dividers
Vertical lines between Bugs | Humans | Klaus. Most of the time they are **solid walls** — you cannot cross into another species' main lane. Periodically a divider **opens**: the line scrolls down off-screen at road speed, stays open for a few seconds, then scrolls back in from above. Divider timing is **seeded per room** so all clients see the same gaps.

### Controls

| Input | Action |
|-------|--------|
| Swipe left / right | Change sub-lane |
| Tap left / right half of screen (short tap) | Move left / right |
| Swipe up | Jump |
| Arrow keys / Space (desktop) | Same actions for testing |
| Hit solid divider | Short **repel** tween — cannot cross until gap opens |

---

## Characters & roster

Every race has **six runners** in fixed composition:

| Type | Count | Home sub-lanes | Notes |
|------|-------|----------------|-------|
| **Bug** | 3 | 0, 1, 2 | Smallest sprite, fastest walk anim (72 fps) |
| **Human** | 2 | 3, 5 | Center lane uses index 4 for default player |
| **Klaus** | 1 | 7 | Center lane uses index 7 for default player |

You pick one type; real players occupy assigned sub-lanes first. Remaining empty slots are filled by **NPC bots** (`LaneNpc`) — computer-controlled placeholders that shrink as more humans join.

Walk-cycle art is imported from the original Unity WebGL export (`old_unity_game/`). Individual PNG frames per pose, baked at runtime into uniform atlases.

---

## Running & position

Two separate distance counters drive the feel of falling behind:

| Concept | Behavior |
|---------|----------|
| **World scroll** | Road, props, obstacle sprites, and divider animation always move at full speed |
| **Player race progress** | The % bar and finish-line check; can slow or stop independently |
| **NPC / rival visual offset** | When player progress lags world scroll, rivals shift **up-screen** so you see them pulling ahead |

**Jump:** Clears grounded obstacle hits when `playerY` is above `groundY - jumpClearance`. Trash pickup and manholes only apply when grounded.

---

## Obstacles

Spawned per **main lane** (Bugs / Humans / Klaus) with independent timers and weighted random type selection. Spawn positions and divider interrupts are **deterministic from the room seed**.

### Trash bins
- **40% larger** than base (`trashSizeMultiplier: 1.4`)
- Random rotation (−38° to +38°); often spans **2 sub-lanes**
- **Does not kill**
- **Pickup mechanic:** running over a bin while grounded **collects** it permanently for the rest of the race
- Each carried bin stacks slowdown: `0.72^N` race speed multiplier (28% slower per bin)
- Carry badges drawn on the runner sprite (up to 4 visible)
- Walk animation slows with carry count
- Trash **scrolls with the world** — overlap ends naturally as the bin passes
- Jumping over trash avoids pickup (grounded-only check)
- NPCs get a brief brush slowdown instead of pickup

### Puddles
- Random scale 1×–3×; large puddles (≥ 1.85×) span 2 sub-lanes
- **No effect while standing on them**
- On **exit**: **5-second debuff** reducing player progress multiplier (per-lane strength: 0.50–0.60)
- Footprint trail system exists but is **disabled** (`footprints.enabled: false`)

### Manholes
- **40% larger** than base (`manholeSizeMultiplier: 1.4`)
- Open art scaled extra (`manholeOpenVisualMultiplier: 1.48`) for visual parity
- Fixed 1 sub-lane, random rotation 0°–359°
- **Closed** (~65%): safe to run over
- **Open** (~35%): death if grounded when overlapping

### Finish line
- Checkerboard stripes appear within 800 logical px of race end
- Race completes when `distanceTraveled >= RACE_DISTANCE` or timer expires

---

## Eating (food chain)

Cross-species only, grounded, within reach box:

```
Bug  → eats → Klaus
Klaus → eats → Human
Human → eats → Bug
```

| Event | Result |
|-------|--------|
| Player eats NPC | NPC dies (blood), hides, respawns after 3.5 s |
| NPC eats player | Player dies → ELIMINATED screen |
| Player eats remote rival | **Server-authoritative** via `referee` Edge Function |
| Remote rival eats player | Referee writes elimination → all clients obey |

Eating reach: ±26 horizontal, ±32 vertical logical px.

---

## Prisoner's Dilemma

When two **same-type** runners get close (NPC or real remote player):

| You | Them | Result |
|-----|------|--------|
| Cooperate | Cooperate | Both get small speed boost (1.15× for 4 s) |
| Cooperate | Eat | You die, they get big boost (1.35× for 5 s) |
| Eat | Cooperate | They die, you get big boost |
| Eat | Eat | Both die |
| Timeout | — | Treated as cooperate |

**Status:** **Active** — full UI overlay, NPC opponents (always cooperate in solo), network sync for real players via `dilemma:start` / `dilemma:choice` broadcasts. Dilemma betrayals against real players go through the `referee` with `kind: 'dilemma'`.

---

## Death & win conditions

| Cause | Result |
|-------|--------|
| Eaten by winning species | Eliminated |
| Open manhole (grounded) | Eliminated |
| Off-road death strip | Eliminated |
| Prisoner's Dilemma betrayal / mutual eat | Eliminated |
| Trash / puddle | Never direct death |
| Finish distance in time | FINISH! |
| Timer expires | TIME UP (or FINISH! if distance already met) |

---

## Multiplayer & live events

### What works now
- Supabase-backed **matchmaking** into parallel rooms (up to 9 players)
- **Synchronized start** via server `starts_at` timestamp
- **Shared world seed** — obstacles and dividers identical on every client
- **Realtime presence** — lobby roster
- **Movement broadcast** — ~12 Hz snapshots, 90 ms interpolation delay
- **Authoritative eliminations** — referee Edge Function + `race_events` table
- **Results** — per-player finish/died/time stored in `room_members`
- **End-screen standings**

### Planned
- Global daily start at a fixed world time (`day_key` column exists, not wired)
- Day 1 free; later days may require tradable **NFT daily pass**
- Sub-lane count scaling with player count (min 3 per main lane)
- Dedicated eating animations from Unity art set

---

## Feature status

| Feature | Now | Planned |
|---------|-----|---------|
| 60 s fixed race | ✓ | ✓ |
| 3 species, 6 runners | ✓ (mix of player + NPCs + remotes) | Full rooms |
| 9 sub-lanes + dividers | ✓ | ✓ |
| Trash carry / puddle / manhole | ✓ | Briefcases, more props |
| Eat chain | ✓ (NPC local, remote server) | ✓ |
| Prisoner's Dilemma | ✓ | ✓ |
| Street-lamp lighting + audio | ✓ | Polish |
| Multiplayer rooms | ✓ (Supabase) | Global daily event |
| NFT daily pass | — | ✓ |
| Puddle footprints | — | Optional polish |

---

# Part 2 — Technical Architecture

## Stack

| Layer | Choice |
|-------|--------|
| Engine | **Phaser 3.87** (TypeScript) |
| Bundler | **Vite 6** |
| Backend | **Supabase** (Postgres + Realtime + Edge Functions) |
| Client SDK | **@supabase/supabase-js** |
| Target | Telegram Mini App (touch-first), desktop keyboard for dev |
| Physics | Custom vertical jump on `Player`; Arcade physics registered but gravity unused for scroll |
| Rendering | Phaser Scale FIT + dual cameras (world + HUD) + layered lighting |

### Entry point

`src/main.ts` → `initTelegramViewport()` → `new Phaser.Game(gameConfig)`.

`gameConfig` (`src/config/gameConfig.ts`): 390×844 logical reference, scaled by `DISPLAY_DPR` (capped at 2), black background, scene list `[BootScene, MenuScene, LobbyScene, GameScene, EndScene]`.

---

## Project structure

```
d:\BE\
├── index.html                  # Telegram WebApp script, full-screen container
├── game_design.md              # Original AI build prompt / vision notes
├── GAME_OVERVIEW.md            # This file
├── .env.example                # Client env vars (copy to .env.local)
├── public/
│   └── assets/
│       ├── characters/         # bug/, human/, klaus/ — numbered walk PNGs
│       ├── props/              # trash-bin, puddle, lamps, manholes
│       └── audio/              # footsteps, lamp hum, ambient phrases
├── old_unity_game/             # Original Unity WebGL export (reference art)
├── scripts/
│   └── extract_unity_audio.py  # Audio extraction helper
├── supabase/
│   ├── config.toml
│   ├── migrations/             # Schema + matchmaking RPCs
│   └── functions/
│       ├── join-room/          # Matchmaking entry point
│       ├── referee/            # Authoritative eat resolver
│       ├── telegram-auth/      # Telegram initData → Supabase session
│       └── _shared/            # CORS, eating rules, Telegram HMAC verify
└── src/
    ├── main.ts
    ├── config/
    │   ├── gameConfig.ts       # Phaser bootstrap
    │   ├── tuning.ts           # ★ All gameplay numbers
    │   ├── characterAssets.ts  # Frame counts, display heights, paths
    │   ├── propAssets.ts       # Prop texture keys → paths
    │   ├── audioAssets.ts      # SFX keys and phrase list
    │   ├── lighting.ts         # Lamp pool / shadow tuning
    │   ├── raceRoster.ts       # 3/2/1 composition + NPC spawn logic
    │   ├── prisonersDilemma.ts # Dilemma tuning
    │   └── multiplayer.ts      # Room settings
    ├── scenes/
    │   ├── BootScene.ts        # Load → bake atlases → MenuScene
    │   ├── MenuScene.ts        # Character pick
    │   ├── LobbyScene.ts       # Matchmaking + countdown
    │   ├── GameScene.ts        # ★ Core gameplay loop
    │   └── EndScene.ts         # Results + standings
    ├── entities/
    │   ├── RunnerCharacter.ts  # Base sprite + death + trash carry badges
    │   ├── Player.ts           # Jump physics + footsteps
    │   ├── LaneNpc.ts          # AI runner + respawn
    │   └── RemotePlayer.ts     # Interpolated remote rival
    ├── managers/
    │   ├── RoadScroll.ts       # ★ World vs player progress
    │   ├── SubLaneManager.ts   # Lane index, camera, repel tweens
    │   ├── MainLaneDivider.ts  # Solid / open divider state machine
    │   ├── ObstacleManager.ts  # Spawn + scroll obstacles
    │   ├── RoadsideLampManager.ts
    │   ├── LampLightingManager.ts  # Darkness veil + light pools + shadows
    │   ├── RoadSurface.ts      # Road fill + grain tiles
    │   ├── NpcManager.ts       # Roster, eating, ahead visual
    │   ├── RemoteRunnerManager.ts  # Real rival sync
    │   ├── InputManager.ts     # Swipe / tap / keyboard
    │   ├── RaceRoomManager.ts  # Seed + room lifecycle wrapper
    │   ├── PrisonersDilemmaManager.ts  # Dilemma UI + network
    │   ├── AudioManager.ts     # Phrases, footsteps, lamp hum
    │   └── FootprintManager.ts # Disabled puddle trails
    ├── net/
    │   ├── RoomSession.ts      # ★ All realtime networking
    │   ├── auth.ts             # Telegram / anonymous auth
    │   ├── supabaseClient.ts   # Client singleton
    │   ├── env.ts              # Vite env + forced seed
    │   └── types.ts            # RoomInfo, snapshots, standings
    └── utils/
        ├── constants.ts        # Re-exports tuning, colors, RACE_DISTANCE
        ├── layout.ts           # DPR scaling (ux), safe area, HUD Y
        ├── telegram.ts         # WebApp viewport sync
        ├── characterSprites.ts # Atlas bake + anim registration
        ├── propSprites.ts      # Prop preload
        ├── audioAssets.ts      # Audio preload + unlock
        ├── grainTexture.ts     # Procedural asphalt grain
        ├── obstacleCollision.ts
        ├── eatingRules.ts
        ├── raceVisual.ts       # Lag → visual offset math
        ├── lampLight.ts        # Lamp brightness sampling
        ├── roadBounds.ts
        ├── rng.ts              # Seeded PRNG for obstacles
        └── display.ts          # gameText helper
```

---

## Scene flow & registry

Phaser **registry** keys (`BootScene.REGISTRY_KEYS`):

| Key | Set by | Read by |
|-----|--------|---------|
| `selectedCharacter` | MenuScene | LobbyScene, GameScene |
| `roomSession` | LobbyScene | GameScene, EndScene |
| `roomMembers` | LobbyScene / GameScene | GameScene (NPC slot exclusion) |
| `raceFinished` | GameScene | EndScene |
| `raceTimeMs` | GameScene | EndScene |
| `playerDied` | GameScene | EndScene |

### BootScene
1. `preload`: character PNGs + prop PNGs + audio
2. `create`: bake character atlases, register walk anims, create grain texture
3. `scene.start('MenuScene')`

### GameScene lifecycle
`create()` builds managers in order: lane → room session → scroll → world layers → camera → road/lamps/dividers/obstacles/lighting → HUD → player → input → NPC spawn → multiplayer wiring → audio → dilemma.

`shutdown()` detaches network handlers, destroys managers. **RoomSession outlives GameScene** (EndScene reads standings from it).

---

## Coordinate system & scaling

Defined in `src/utils/layout.ts`:

| Constant | Value |
|----------|-------|
| Logical reference | 390 × 844 px (iPhone-like) |
| `DISPLAY_DPR` | `min(devicePixelRatio, 2)` |
| `GAME_WIDTH / HEIGHT` | logical × DPR |
| `ux(n)` | `round(n × DPR)` — converts design px to canvas px |

**Ground Y:** `GAME_HEIGHT - ux(groundOffset)` where `groundOffset = 180`.

**Race distance:** `RACE_DISTANCE = scrollSpeed × durationSec` = `340 × 60` logical px/sec equivalent (scaled via `ux` in scroll speed).

Telegram safe-area insets drive HUD Y via `getHudTopY()` / `getContentTopY()`.

---

## Dual-camera rendering (GameScene)

| Camera | Shows | Zoom |
|--------|-------|------|
| **Main (world)** | `worldContainer` (props + actors + lighting) | ~9 sub-lanes visible (`onScreenLanesAcross: 9`) |
| **UI** | HUD timer + progress % + dilemma overlay | 1× fixed |

Main camera follows player X with adaptive lerp (`0.14` normal, `0.4` when far from target). Bounds padded so player never walks off-screen at road edges.

### World container layers (back → front)

```
propsLayer      Road fill, grain, dividers, puddles, manholes, trash, finish line
actorsLayer     Player, NPCs, remote rivals
darknessLayer   Full-screen multiply veil (Unity unlit look)
lightLayer      ADD lamp pools
lampLayer       Lamp post sprites (runners pass underneath)
```

### Render depths (within props)

```
-3  Road background fill
-2  Road tile base
-1  Grain overlay (TileSprite, slow parallax)
 1  Lane dividers
 2  Puddles, manholes
 3  Trash bins
 5–6 Finish line + stripes
100 HUD text, blood particles
200 Dilemma overlay
```

---

## RoadScroll — core movement model

`RoadScroll` is the single source of truth for forward motion.

```
each frame:
  worldDelta = scrollSpeed × dt
  worldDistanceTraveled += worldDelta          // always full speed
  distanceTraveled += worldDelta × multiplier  // player race progress
  notify listeners(worldDelta)                 // scroll all subscribed visuals
```

| Field | Purpose |
|-------|---------|
| `worldDistanceTraveled` | Full-speed distance — rival ahead visual, world pace |
| `distanceTraveled` | Player progress — % HUD, finish check, spawn cutoff |
| `playerProgressMultiplier` | `1` normal, `0.72^N` trash carry, `0.5–0.6` puddle debuff, dilemma boost |
| `getAheadGapPx()` | `worldDistanceTraveled - distanceTraveled` |

**Subscribers** (via `onScroll`): `RoadSurface`, `MainLaneDivider`, `ObstacleManager`, `RoadsideLampManager`.

NPCs and remote players do **not** scroll on Y — they stay at `groundY` (minus ahead offset). Only props and road tiles move downward.

---

## GameScene update loop

Order matters each frame (`GameScene.update`):

```
1.  Update timer HUD + progress % (wall-clock in multiplayer)
2.  applyPlayerObstacleEffects()   ← trash pickup, puddle debuff, manhole death
3.  roadScroll.step(delta, mult)   ← scroll world + increment distances
4.  npcManager.stepWorldProgress()
5.  npcManager.applyAheadVisual()
6.  obstacleManager.tickSpawning()
7.  lampManager.tickSpawning()
8.  player.updatePhysics(delta)
9.  applyPlayerRaceVisual()        ← shift player up when lagging
10. updateCameraFollow()
11. enforceDividerCollisions()
12. checkOffRoadDeath()
13. checkEating()                  ← NPC eats only
14. dilemmaManager.tick()
15. updateLighting() + lamp audio
16. player.tickFootsteps() + audioManager.tick()
17. updateMultiplayer()           ← broadcast + interpolate remotes + remote eats
18. updateFinishLine()
19. Check race complete / time up
```

### Player obstacle effects (`applyPlayerObstacleEffects`)

| Type | Detection | Effect |
|------|-----------|--------|
| **Trash** | `trashPickupContact()` — tight feet overlap, grounded | Pick up bin, permanent stacked slowdown |
| **Puddle** | `obstacleOverlapsPlayer()` | Track `onPuddle`; on exit start 5 s debuff |
| **Manhole open** | overlap + grounded | `triggerDeath()` |

Debuff resolution: trash carry > active puddle debuff > reset to 1. Dilemma speed boost multiplies on top.

---

## Lane system (`SubLaneManager`)

- **Global sub-lane index** 0–8 tracks position across all three main lanes
- `moveLeft` / `moveRight` return `'moved' | 'blocked' | 'death'`
- Main-lane boundary crossings (indices 2↔3 and 5↔6) require divider `isSolid() === false`
- Edge sub-lanes (0 and 8) stepping outward triggers off-road death tween
- `playLaneRepel`: short yoyo tween when blocked
- `tweenToCurrentLane`: 150 ms ease to sub-lane center X
- Multiplayer: `setAssignedSubLane()` locks player to server-assigned slot

Divider collision (`MainLaneDivider.clampPlayerX`) runs after movement to prevent slipping through solid lines.

### Divider state machine

```
Solid → Exiting (line scrolls down) → OpenGap → Entering (line scrolls in) → Solid
```

Timing from `TUNING.laneDividers`, driven by seeded RNG:
- Interrupt every 8–15 s
- Open duration 3–8 s before restore begins
- Line motion tied to `RoadScroll` delta (same speed as road)

---

## Obstacle system (`ObstacleManager`)

### Spawn pipeline

1. Initial batch at race start (`initialCount`, spaced along road)
2. Per-lane timer (`spawnIntervalMs`: 1000–1300 ms per lane)
3. Weighted random: `trashWeight`, `puddleWeight`, `manholeWeight`
4. Spawn at `y = -aheadDistance` (above screen), scroll down via listener
5. Cull when off-screen or picked up (trash)
6. Stop spawning within `stopBeforeFinish` of race end

All randomness uses the **room seed** via `src/utils/rng.ts`.

### ObstacleHandle shape

```typescript
{
  sprite: Phaser.GameObjects.Image,
  type: 'trash' | 'puddle' | 'manhole',
  mainLane: 0 | 1 | 2,
  globalSubLanes: number[],
  sizeScale: number,
  passed: boolean,        // manhole one-shot death / trash pickup guard
  manholeState?: 'open' | 'closed',
}
```

All prop sprites use `origin(0.5, 1)` — bottom-center anchored to road.

---

## NPC & remote runner systems

### NpcManager
Spawned from `getNpcSpawnSlotsForRace(occupiedSlots)` — only fills slots **not** taken by real players.

| Method | Role |
|--------|------|
| `excludeSlot(lane)` | Hide NPC when a real player occupies that sub-lane |
| `applyAheadVisual(groundY, gap)` | Shift NPCs up when player lags |
| `checkEating(player)` | Proximity + `canEat()` → death or NPC respawn |
| `scheduleRespawn` | 3500 ms delay, `LaneNpc.respawn()` |

### RemoteRunnerManager (multiplayer)
- Creates `RemotePlayer` sprites from incoming snapshots
- Interpolates position with 90 ms render delay
- Places rivals using their `distance` vs local `distanceTraveled`
- `getEatTargets()` feeds server-authoritative eat claims
- `eliminate(userId)` on referee events

---

## Lighting (`LampLightingManager`)

Unity-style night racing aesthetic:

- Full-screen **darkness multiply veil** over road + characters (`darknessVeilAlpha: 0.44`)
- Per-lamp **ADD light pools** with circular falloff
- **Cast shadows** from runners toward nearest lamp
- Lamp post sprites render above runners in `lampLayer`
- `AudioManager.updateLampHum()` — spatial lamp buzz volume follows brightness

Tuning in `src/config/lighting.ts`.

---

## Audio (`AudioManager`)

Extracted from Unity (`scripts/extract_unity_audio.py`):

| Source | Behavior |
|--------|----------|
| Ambient phrases | Random line every 15 s (after 2 s delay), volume 0.5 |
| Footsteps | One-shot per walk frame, volume 0.1, per-character sound |
| Lamp hum | Looping buzz, volume follows nearest lamp brightness, 0.3 max |

Audio unlocks on first menu interaction (`unlockGameAudio`).

---

## Input (`InputManager`)

| Gesture | Threshold | Action |
|---------|-----------|--------|
| Short tap | movement < 40 px | Left/right half of screen |
| Horizontal swipe | \|dx\| > 40, \|dx\| > \|dy\| | Lane change |
| Up swipe | dy < −40 | Jump |

Keyboard: arrows + space (desktop testing).

---

## Characters & animation pipeline

### Source assets
Individual PNG walk frames from Unity export:
- Bug: 10 frames
- Human: 6 frames
- Klaus: 5 frames

Paths: `public/assets/characters/{type}/{01..N}.png`

### Runtime atlas bake (`bakeCharacterAtlases`)

1. Load all frames as separate textures
2. Compute uniform cell width from max frame aspect ratio
3. Draw all frames into one canvas atlas (feet-aligned bottom)
4. Register frame rectangles; delete source textures
5. Store cell size in `CHARACTER_ATLAS_CELL_PX`

### Death animation (`RunnerCharacter.die`)
- Stop anim, red tint
- 12 blood circle particles with fade tweens
- Container rotates 90°, drops slightly

---

# Part 3 — Multiplayer & Backend

## Architecture overview

```
┌─────────────┐     telegram-auth      ┌──────────────────┐
│  Telegram   │ ──────────────────────►│  Supabase Auth   │
│  Mini App   │                        │  (linked user)   │
└──────┬──────┘                        └────────┬─────────┘
       │                                        │
       │ join-room (Edge Fn)                    │
       ▼                                        ▼
┌─────────────┐     join_or_create_room   ┌──────────────────┐
│  LobbyScene │ ◄──────────────────────►│  Postgres        │
└──────┬──────┘                         │  rooms           │
       │                                 │  room_members    │
       │ RoomSession                     └────────┬─────────┘
       ▼                                          │
┌─────────────┐     Realtime channel              │
│  GameScene  │ ◄─────────────────────────────────┘
│             │   • Presence (lobby roster)
│             │   • Broadcast state (~12 Hz)
│             │   • Broadcast dilemma events
│             │   • Postgres changes (eliminations, phase)
└──────┬──────┘
       │ referee (Edge Fn) — contested eats
       ▼
┌──────────────────┐
│  race_events     │  authoritative elimination log
└──────────────────┘
```

## Environment variables

### Client (`.env.local`, exposed via Vite)

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon key for client SDK |
| `VITE_FORCED_SEED` | Optional fixed obstacle seed for testing |
| `?seed=12345` URL param | Alternative forced seed |

When URL/key are absent → **solo mode** (no networking).

### Server (Supabase Dashboard → Edge Function secrets)

| Secret | Used by |
|--------|---------|
| `TELEGRAM_BOT_TOKEN` | `telegram-auth` — HMAC verify initData |
| `LOBBY_SECONDS` | `join-room` — countdown duration (default 12) |
| `SUPABASE_SERVICE_ROLE_KEY` | `referee` — write eliminations (auto-provided) |

---

## Database schema (`supabase/migrations/`)

| Table | Purpose |
|-------|---------|
| `profiles` | One row per auth user, linked Telegram id + username |
| `rooms` | A single race: `seed`, `phase`, `starts_at`, `day_key`, `max_players` |
| `room_members` | Who is in a room, assigned sub-lane, result (`finished`, `died`, `finish_time_ms`) |
| `race_events` | Authoritative event log (eliminations) — clients read only |

### Key RPCs

| Function | Purpose |
|----------|---------|
| `join_or_create_room(character, lobby_seconds)` | Atomic matchmaking — find open room or create new |
| `mark_room_racing(room_id)` | Advance phase when countdown ends |
| `mark_room_finished(room_id)` | Close room after 60 s race window (idempotent) |

### Room phases

```
waiting → countdown → racing → finished
```

---

## Edge Functions

### `telegram-auth`
- Verifies Telegram `initData` HMAC against bot token
- Creates/links Supabase auth user (`tg{id}@bugeaters.telegram`)
- Returns `access_token` + `refresh_token` for client `setSession`

### `join-room`
- Thin wrapper over `join_or_create_room` RPC
- Returns `{ roomId, seed, startsAt, phase, globalSubLane, serverNow }`
- Client applies clock offset: `startsAtMs = serverStartsAt + (Date.now() - serverNow)`

### `referee`
- **Food-chain eats:** validates both members, `canEat()` rules, writes single elimination
- **Dilemma betrayals:** same-species check, writes elimination
- Either actor or victim may submit the claim
- Idempotent — won't double-eliminate same target

---

## RoomSession (`src/net/RoomSession.ts`)

Single networking hub for a race:

| Channel | Event | Direction |
|---------|-------|-----------|
| Presence | `sync` | Lobby roster |
| Broadcast | `state` | Movement snapshots (~12 Hz) |
| Broadcast | `dilemma:start` | Encounter begins |
| Broadcast | `dilemma:choice` | Player choice |
| Postgres INSERT | `race_events` | Authoritative eliminations |
| Postgres UPDATE | `rooms` | Phase changes |

### Auth flow (`src/net/auth.ts`)

1. If persisted Supabase session exists → reuse
2. If `window.Telegram.WebApp.initData` present → `telegram-auth` Edge Function
3. Otherwise (local dev) → `signInAnonymously()` for testing

---

## Deterministic world sync

All clients in a room share:
- **`seed`** from `rooms.seed` — drives `ObstacleManager` and `MainLaneDivider` RNG
- **`starts_at`** — wall-clock race start (timer HUD uses `Date.now() - startsAtMs`)
- **Assigned sub-lanes** — no two players in the same lane

Movement is **not** server-simulated. Each client runs full physics locally; snapshots keep visuals aligned. Contested outcomes (eats, dilemma kills) go through the referee.

---

## Key tuning reference (`src/config/tuning.ts`)

All values are **logical pixels** unless noted as seconds/ms.

| Group | Notable values |
|-------|----------------|
| `race.durationSec` | 60 |
| `physics.scrollSpeed` | 340 px/s |
| `physics.jumpVelocity` | −420 |
| `physics.gravity` | 900 |
| `physics.groundOffset` | 180 |
| `physics.npcAheadVisualScale` | 0.35 |
| `physics.maxRaceVisualLagPx` | 64 |
| `obstacles.trashSizeMultiplier` | 1.4 |
| `obstacles.trashCarrySlowMultiplierPerBin` | 0.72 |
| `obstacles.manholeSizeMultiplier` | 1.4 |
| `obstacles.manholeOpenChance` | 0.35 |
| `obstacles.puddleDebuffDurationSec` | 5 |
| `obstacles.byMainLane[]` | Per-lane spawn interval, weights, puddle slow |
| `laneDividers` | width 1.5, interrupt 8–15 s, open 3–8 s |
| `eating.npcRespawnMs` | 3500 |
| `audio.phrases` | first 2 s, then every 15 s |
| `death.screenDelayMs` | 1500 |

**To rebalance gameplay**, edit `tuning.ts` only — constants in `constants.ts` derive from it.

---

## Build & development

```bash
npm install
npm run dev      # Vite dev server → http://localhost:5173
npm run build    # tsc + production bundle → dist/
npm run preview  # Serve production build
```

### Supabase setup

```bash
# Apply migrations
supabase db push

# Deploy edge functions
supabase functions deploy telegram-auth
supabase functions deploy join-room
supabase functions deploy referee

# Set secrets in dashboard: TELEGRAM_BOT_TOKEN, optionally LOBBY_SECONDS
```

Telegram integration requires HTTPS hosting + WebApp bot configuration for production. Local dev uses keyboard/touch in browser; anonymous Supabase auth works without Telegram.

---

## Extending the game

| Goal | Where to work |
|------|---------------|
| Balance feel | `src/config/tuning.ts` |
| New obstacle type | `ObstacleManager`, `propAssets.ts`, `obstacleCollision.ts`, `applyPlayerObstacleEffects` |
| Global daily races | `join_or_create_room` + `day_key`, scheduled `starts_at` |
| NFT daily pass | Gate in `join-room` or new RPC |
| New character | `CharacterType`, assets folder, `characterAssets.ts`, roster |
| Sub-lane scaling | `SubLaneManager`, `raceRoster.ts` |
| More referee events | `referee/index.ts`, `race_events` types, client handlers |

---

## One-sentence pitch

**BugEaters** is a 60-second, black-and-white lane runner where bugs, humans, and Klaus race together under street lamps, dodge trash and manholes, carry slowing bins, and eat each other in a circle — built as a synchronized multiplayer Telegram Mini App racing toward a global daily event.

---

*Last updated: June 2026 — Phaser 3 client with Supabase multiplayer, 60 s races, trash-carry mechanic, street-lamp lighting, active Prisoner's Dilemma, and server-authoritative eats.*
