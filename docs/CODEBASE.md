# Codebase reference

**Purpose:** Map every significant source file to its responsibility.  
**Ground truth:** The TypeScript in `src/` and `server/` — updated August 2026.  
**Audit routing:** Prefer [`MODEL_AUDIT_GUIDE.md`](./MODEL_AUDIT_GUIDE.md) for “where do I look for X?”

---

## Entry & bootstrap

| File | Role |
|------|------|
| `index.html` | DOM container `#game-container`, Telegram WebApp script, viewport meta |
| `src/main.ts` | Calls `initTelegramViewport()`, creates `Phaser.Game(gameConfig)`, handles resize |
| `src/config/gameConfig.ts` | Phaser config: 390×844 logical canvas (× DPR), scene list, Scale FIT, arcade physics (gravity unused for scroll) |
| `src/vite-env.d.ts` | Vite env types |

---

## Configuration (`src/config/`)

| File | Role |
|------|------|
| **`tuning.ts`** | **Single gameplay balance file** — race duration, scroll speed, jump, obstacles, lamps, dividers, eating reach, audio. All values in logical px unless seconds/ms |
| `abilities.ts` | 12 ability definitions (`id`, `kind`, name, texture, `spawnsOnRoad`). Exports `getAbility`, preload helper |
| `lighting.ts` | Lamp pool diameter, darkness veil alpha, shadow lengths, flashlight pool scale |
| `characterAssets.ts` | Walk frame counts, display heights, asset paths per species |
| `propAssets.ts` | Texture keys → paths for trash, puddle, manholes, lamps, passport, syringe, straw |
| `briefcaseAssets.ts` | Briefcase pickup / booster texture keys |
| `audioAssets.ts` | Audio keys and file paths (footsteps, lamp buzz, phrases) |
| `raceRoster.ts` | 3 Bug + 2 Human + 1 Klaus composition; `getNpcSpawnSlotsForRace()` |
| `prisonersDilemma.ts` | Dilemma timing, boost multipliers, UI copy |
| `multiplayer.ts` | Lobby seconds, broadcast-related constants |

**Rule:** Change balance in `tuning.ts` only. `utils/constants.ts` re-exports derived values (`RACE_DISTANCE`, `ux`, colors).

---

## Scenes (`src/scenes/`)

Phaser scenes registered in `gameConfig.ts`. See [`SCENES_AND_FLOW.md`](SCENES_AND_FLOW.md) for navigation.

| File | Key | Role |
|------|-----|------|
| `BootScene.ts` | `BootScene` | Preload assets, bake atlases, grain texture. Routes to `WeekHubScene` or `GameScene` if `?abilityLab=1`. Defines **`REGISTRY_KEYS`** |
| `WeekHubScene.ts` | `WeekHubScene` | Tournament home — week strip, passes, wallet mock, primary CTA → Menu or Lobby |
| `MenuScene.ts` | `MenuScene` | Monday registration — character pick + time slot |
| `MondayWaitScene.ts` | `MondayWaitScene` | Waiting state before Monday slot |
| `ReadyPanelScene.ts` | `ReadyPanelScene` | Tap-ready UI (built, not default hub route) |
| `LobbyScene.ts` | `LobbyScene` | Matchmaking countdown, roster, pass burn modal, → GameScene |
| **`GameScene.ts`** | `GameScene` | **Core race loop** — scroll, obstacles, abilities, eating, lighting, multiplayer sync |
| `EndScene.ts` | `EndScene` | FINISH / ELIMINATED / TIME UP, standings, Practice again (fresh `/dev/ticket`) |
| `DevSessionScene.ts` | `DevSessionScene` | Playtest menu: Testing (auth race) |
| `BlockedStateScene.ts` | `BlockedStateScene` | No pass / wallet / wrong day (not default route) |
| `SundayFinaleScene.ts` | `SundayFinaleScene` | Sunday framing (not default route) |
| `ChampionDashboardScene.ts` | `ChampionDashboardScene` | Billboard upload mock (not default route) |

---

## Entities (`src/entities/`)

| File | Role |
|------|------|
| **`RunnerCharacter.ts`** | Base runner: walk anim, death + blood, puddle slide trail, ability VFX host, status tints (taxation purple, trash grey), `autoJumpOverObstacle()` arc for NPCs, lamp lighting tint preservation |
| **`Player.ts`** | Extends runner — jump physics, `autoJumpOverTrash()`, grounded checks, footstep hook |
| `LaneNpc.ts` | AI filler bot — respawn/hide after death |
| `RemotePlayer.ts` | Interpolated multiplayer rival sprite |

---

## Managers (`src/managers/`)

Gameplay systems used by `GameScene`. Constructed in `create()` / `initGameplaySystems()`.

### Movement & world

| File | Role |
|------|------|
| **`RoadScroll.ts`** | World vs player progress. `worldDistanceTraveled` always full speed; `distanceTraveled` × progress multiplier. Notifies scroll listeners each frame |
| **`SubLaneManager.ts`** | Global sub-lane 0–8, lane moves, death strips, camera scroll X, repel tweens, zoom |
| **`MainLaneDivider.ts`** | Bugs\|Humans\|Klaus divider state machine (solid / exiting / gap / entering). `setForcedOpen()` for Opened Borders ability |
| `RoadSurface.ts` | Scrolling road fill + grain tiles; `syncToCamera()` prevents edge gaps |
| `RoadsideLampManager.ts` | Spawns lamp posts on shoulders; scrolls with road |
| `TrackLayer.ts` | Legacy scrolling band (unused in current GameScene build path) |

### Obstacles & props

| File | Role |
|------|------|
| **`ObstacleManager.ts`** | Spawns trash / puddle / manhole / ability pickups / passport / straw. Seeded RNG. Hell mode (SDG) 2× spawn on non-player lanes. Flight mode clears one lane. Scroll + cull |
| `FootprintManager.ts` | Puddle wet footprints (disabled via tuning) |

### Characters & interaction

| File | Role |
|------|------|
| **`NpcManager.ts`** | Spawns roster bots, `stepWorldProgress()` (trash/passport/puddle), eating, Great Reset align tweens, syringe hits, taxation slow visual |
| `RemoteRunnerManager.ts` | Multiplayer rival sprites from snapshots + referee eliminations |
| `PrisonersDilemmaManager.ts` | Same-species encounter UI + network sync |
| `InputManager.ts` | Swipe / tap / keyboard → move / jump |

### Abilities

| File | Role |
|------|------|
| **`AbilityExecutor.ts`** | Central switch on `AbilityKind` — activates effects, timed expiry in `tickTimedEffects()` |
| `AbilityInventory.ts` | Max 3 stored pickups; newest armed |
| `AbilityHud.ts` | Bottom HUD slots + toast messages |
| `AbilityLabPanel.ts` | Dev panel — fire any ability, god mode, guide overlay |
| `PassportPlacementManager.ts` | Digital ID — tap road to spawn passport barrier |
| `SyringeThrowManager.ts` | Wuhan — arm syringe, throw projectile, NPC kill on hit |

### Presentation & meta

| File | Role |
|------|------|
| **`LampLightingManager.ts`** | Darkness multiply veil, ADD lamp pools, cast shadows, flashlight point, camera-synced veil |
| `AudioManager.ts` | Ambient phrases, footsteps, lamp hum loop |
| `RaceRoomManager.ts` | Wraps room seed + multiplayer flag for GameScene |

---

## Networking (`src/net/`)

### Authoritative Colyseus (playtest / production race)

| File | Role |
|------|------|
| **`authoritative/AuthoritativeRaceClient.ts`** | Join, send intents, `getRenderState()` |
| `authoritative/RaceConnection.ts` | Ticket + Colyseus room |
| `authoritative/protocol.ts` | Wire DTOs (mirror `server/src/net/protocol.ts`) |
| `authoritative/InputPredictor.ts` | Local prediction + reconcile |
| `authoritative/SnapshotInterpolator.ts` | Remote lane/x smoothing |
| `authoritative/distanceExtrapolator.ts` | 60fps road between 20Hz snapshots + smoothed clock |
| `authoritative/clientRaceConfig.ts` | Lane geometry mirror of server |
| `authoritative/env.ts` | `VITE_RACE_SERVER_URL`, `VITE_RACE_DEV_MODE` |

### Legacy Supabase Realtime

| File | Role |
|------|------|
| **`RoomSession.ts`** | Presence, movement snapshots, dilemma, eliminations |
| `auth.ts` | Telegram initData → Edge Function, or anonymous dev auth |
| `supabaseClient.ts` | Client singleton from env |
| `env.ts` | `VITE_SUPABASE_*`, `VITE_FORCED_SEED`, URL seed param |
| `types.ts` | RoomInfo, snapshots, standings, elimination payloads |

See [`BACKEND.md`](BACKEND.md) · [`MODEL_AUDIT_GUIDE.md`](./MODEL_AUDIT_GUIDE.md).

---

## Authoritative race server (`server/`)

| Path | Role |
|------|------|
| `server/src/index.ts` | Express + Colyseus + `/healthz` |
| `server/src/dev/devTicketRoute.ts` | Playtest seats Bug/Human/Klaus |
| `server/src/domain/RaceSimulation.ts` | Tick pipeline |
| `server/src/domain/systems/*.ts` | movement, hazards, abilities, eat, dilemma, progress, dividers |
| `server/src/net/RaceRoom.ts` | Colyseus adapter |
| `server/src/net/protocol.ts` | CHANNEL + snapshot DTOs |
| `server/test/simulation.test.ts` | Determinism + rules tests |

Commands: `npm run race-server` · `npm run race-server:test` · `npm run smoke:auth-race`.

---

## Tournament client (`src/tournament/`)

| File | Role |
|------|------|
| `tournamentConfig.ts` | Default N, species ratio, Monday time slots |
| `weekClock.ts` | Current week id, weekday, dev override `?tournamentDay=` |
| `tournamentApi.ts` | `fetchWeekState()`, ready / join / results RPCs, `burnPass()` (prepare → wallet sign → verify), `syncWalletPasses()`, `invokeFunction()` |
| `mondaySchedule.ts` | Time slot helpers |
| `roleAssign.ts` | Client-side weighted role (mock; server owns roles via `assign_roles`) |
| `types.ts` | Week / pass (incl. NFT mint state) / chain config types |
| `chain/ChainService.ts` | Interface: connect / disconnect / linked wallet / sign burn |
| `chain/TonChainService.ts` | Real TON: TON Connect + `ton_proof` → `link-wallet`; burn via `sendTransaction` |
| `chain/MockChainService.ts` | Playtest mock (server accepts it only in `dev_mode`) |
| `chain/index.ts` | `getChainService()` — real when `VITE_TONCONNECT_MANIFEST_URL` is set |

## TON wallet (`src/ton/`)

| File | Role |
|------|------|
| `env.ts` | Manifest URL switch, network, explorer / short-address helpers |
| `TonConnectService.ts` | Singleton `TonConnectUI`; `connectWithProof()`, `sendTransaction()`, `disconnect()` |

Server minter: `server/src/ton/` (`nftCollection.ts` cell builders, `tonClient.ts`, `treasury.ts`, `NftMinter.ts`, `supabaseMintStore.ts`). Contracts: `contracts/`. Edge functions: `supabase/functions/{ton-proof-payload,link-wallet,pass-burn,sync-passes,nft-meta}`.

---

## UI (`src/ui/`)

| File | Role |
|------|------|
| `theme.ts` | Mono palette tokens |
| `UiChrome.ts` | Buttons, panels, week strip, status pills — tournament shell |
| `grainBackground.ts` | Full-screen void + grain for menu scenes |
| `encyclopediaDiagrams.ts` | Guide mono schemes (`:::diagram`) |
| `encyclopediaShots.ts` | Guide photo cards (`:::shot`) |

---

## Utilities (`src/utils/`)

| File | Role |
|------|------|
| `constants.ts` | Re-exports tuning, `CharacterType`, `COLORS`, `RACE_DISTANCE`, `ux()` |
| **`layout.ts`** | DPR scaling (`ux`), safe area, HUD Y positions |
| `display.ts` | `gameText()` helper |
| `characterSprites.ts` | Atlas bake, anim registration, display sizes |
| `propSprites.ts` | Prop preload |
| `briefcaseSprites.ts` | Briefcase asset preload |
| `audioAssets.ts` | Audio preload + unlock on first interaction |
| `grainTexture.ts` | Procedural asphalt grain |
| **`obstacleCollision.ts`** | Trash jump, puddle, manhole overlap, ability pickup contacts |
| `eatingRules.ts` | Bug→Klaus→Human→Bug chain |
| **`raceVisual.ts`** | Progress gap → screen Y offset (solo + multiplayer bands) |
| `lampLight.ts` | Circular lamp falloff sampling |
| `roadBounds.ts` | Road width, shoulder X for lamps |
| `rng.ts` | Seeded PRNG for obstacles/dividers |
| `telegram.ts` | Telegram viewport / expand |
| **`abilityVfx.ts`** | Defensive ring, speed streaks on activate |

---

## Dev (`src/dev/`)

| File | Role |
|------|------|
| `abilityLab.ts` | `?abilityLab=1` URL detection + registry check |

---

## Supabase (`supabase/`)

| Path | Role |
|------|------|
| `migrations/0001_init.sql` | Profiles, rooms, members, base schema |
| `migrations/0002_matchmaking.sql` | `join_or_create_room` RPC |
| `migrations/0003_results.sql` | Race results on members |
| `migrations/0004_race_duration_60.sql` | 60s race |
| `migrations/0005–0008_*.sql` | Tournament tables + RPCs (partial production) |
| `functions/telegram-auth/` | Verify Telegram, issue Supabase session |
| `functions/join-room/` | Matchmaking wrapper |
| `functions/referee/` | Authoritative eat + dilemma elimination |
| `functions/_shared/` | CORS, eating rules, Telegram HMAC |

---

## Scripts (`scripts/`)

| Script | Role |
|--------|------|
| `export_unity_props.py` | Copy passport, syringe, straw PNGs from Unity (does not overwrite manhole/trash) |
| `export_unity_abilities.py` / `extract_unity_abilities.py` | Ability icon export from Unity |
| `extract_unity_audio.py` | Footsteps, lamp buzz, phrases → `public/assets/audio/` |
| `embed-briefcase-guide.mjs` | Embed base64 icons into `public/briefcase-guide.html` |
| `verify_assets.py` | Asset presence checks |
| Bug frame scripts | `normalize_and_export_bug_frames.py`, etc. — character art pipeline |

---

## Public assets (`public/`)

```
public/assets/
├── characters/{bug,human,klaus}/   Walk-cycle PNG frames
├── props/                          Road obstacles, lamps, ability props
├── props/abilities/                12 briefcase pickup icons
└── audio/                          SFX from Unity extract
briefcase-guide.html                Offline player ability guide
```

---

## Key runtime data flow (GameScene)

```
InputManager → SubLaneManager (X) + Player.jump (Y)
applyPlayerObstacleEffects() → progressMult (trash jump=0, puddle boost, manhole death)
RoadScroll.step(delta, progressMult) → worldDelta
  ├─ RoadSurface, MainLaneDivider, ObstacleManager, RoadsideLampManager (scroll Y)
  └─ distanceTraveled / worldDistanceTraveled
NpcManager.stepWorldProgress(worldDelta) + applyAheadVisual()
AbilityExecutor.tickTimedEffects()
updateLighting() → LampLightingManager + flashlight point from GameScene
updateCameraFollow() → sync backdrop + darkness veil to camera X
checkEating() / dilemma / multiplayer broadcast
```

---

## Related docs

- Gameplay detail: [`RACE_MECHANICS.md`](RACE_MECHANICS.md)
- Abilities: [`ABILITIES.md`](ABILITIES.md)
- Scenes: [`SCENES_AND_FLOW.md`](SCENES_AND_FLOW.md)
- Dev workflow: [`DEV_GUIDE.md`](DEV_GUIDE.md)
