# Scenes and navigation

All Phaser scenes are registered in `src/config/gameConfig.ts`. Registry keys live in `BootScene.REGISTRY_KEYS`.

---

## Scene list

| Scene | Key | Purpose |
|-------|-----|---------|
| Boot | `BootScene` | Asset load, atlas bake |
| Onboarding | `OnboardingScene` | First-run explainer (skippable; once via localStorage) |
| Week Hub | `WeekHubScene` | Tournament home (default after boot) |
| Menu | `MenuScene` | Monday character + time slot pick |
| Monday Wait | `MondayWaitScene` | Pre-slot waiting |
| Ready Panel | `ReadyPanelScene` | Tap ready (built, optional route) |
| Lobby | `LobbyScene` | Matchmaking, countdown, burn modal |
| Game | `GameScene` | 60 s race |
| End | `EndScene` | Results |
| Blocked | `BlockedStateScene` | Missing pass/wallet |
| Sunday Finale | `SundayFinaleScene` | Sunday framing |
| Champion Dashboard | `ChampionDashboardScene` | Billboard rights mock |
| Encyclopedia | `EncyclopediaScene` | Player guide (`content/encyclopedia.md`) |

---

## Default navigation (production intent)

```
BootScene
  └─ OnboardingScene (first run only; Skip or finish → continue)
       └─ WeekHubScene  (or DevSessionScene when playtest UI enabled)
            ├─ Monday → MenuScene → (MondayWaitScene?) → LobbyScene → GameScene → EndScene
            └─ Tue–Sun → LobbyScene → GameScene → EndScene
                 (ReadyPanelScene, BlockedStateScene intended but not default from hub yet)
```

**Ability Lab bypass:**

```
BootScene (?abilityLab=1) → GameScene (lab mode, no Week Hub)
```

**Replay onboarding:** `?onboarding=1` (still marks complete when finished/skipped).

**GameScene gate:** Without `roomSession` (multiplayer) and without `abilityLab`, `create()` redirects to `WeekHubScene` — solo race from menu is disabled in tournament build.

---

## Registry keys (`REGISTRY_KEYS`)

| Key | Set by | Read by |
|-----|--------|---------|
| `selectedCharacter` | MenuScene, Ability Lab | GameScene, Lobby |
| `roomSession` | LobbyScene | GameScene, EndScene |
| `roomMembers` | Lobby / Game | GameScene (NPC slot exclusion) |
| `raceFinished` | GameScene | EndScene |
| `raceTimeMs` | GameScene | EndScene |
| `playerDied` | GameScene | EndScene |
| `tournamentTimeSlot` | MenuScene | Lobby |
| `passBurnConfirmed` | LobbyScene | Lobby / Game |
| `assignedRole` | Lobby (after burn) | Game |
| `blockedReason` | Hub / blocked scene | BlockedStateScene |
| `walletLinked` | Hub / mock chain | Hub, Lobby |
| `activePassId` | Hub / lobby | Lobby burn |
| `raceOutcome` | Server mock | EndScene |
| `isChampion` | Week state | Hub, Champion dashboard |
| `abilityLab` | BootScene | GameScene |

---

## Scene details

### BootScene

- Preloads characters, props, abilities, briefcases, audio.
- `bakeCharacterAtlases()`, `registerCharacterAnimations()`, `createGrainTextures()`.
- Routes to `OnboardingScene` (first run), `DevSessionScene` (playtest), `WeekHubScene`, or lab `GameScene`.

### OnboardingScene

- Four short steps: welcome, week, controls, food chain.
- **Skip** exits the whole flow; **Back** / **Next** move between steps; last step **Let's go**.
- Persists completion in `localStorage` key `bugeaters.onboarding.v1` (`src/tournament/onboarding.ts`).

### WeekHubScene

- Primary CTA routes by weekday (Monday register, pass days ready, Sunday finale).
- **Guide** → `EncyclopediaScene` (player copy from `content/encyclopedia.md`).

- Fetches week state via `tournamentApi.fetchWeekState()`.
- Renders mono UI: week strip, pass chips, wallet row, primary CTA.
- **Monday CTA** → `MenuScene`.
- **Tue–Sun CTA** → `LobbyScene` (ReadyPanel not wired as default).
- Dev: `?tournamentDay=monday|tuesday|...` overrides weekday (`weekClock.getDevWeekdayOverride()`).

### MenuScene

- Character preview + START → sets `selectedCharacter`, time slot → Lobby.

### LobbyScene

- Creates `RoomSession`, calls `join-room` Edge Function.
- Countdown to `starts_at`; presence roster.
- Pass burn modal (Tue–Sun mock); role reveal.
- On failure: may fall back to solo (known gap vs tournament spec).
- → `GameScene` with session + members in registry.

### GameScene

- Builds full world: scroll, obstacles, NPCs (if slots empty / lab), abilities, lighting, HUD, dilemma, audio.
- Dual camera: world + UI (HUD ignored by main cam).
- See [`RACE_MECHANICS.md`](RACE_MECHANICS.md) update loop.

### EndScene

- Reads registry outcome; shows FINISH / ELIMINATED / TIME UP.
- Multiplayer standings from `RoomSession`.
- RACE AGAIN → Lobby or Game; MAIN MENU → Week Hub (tears down session).

---

## UI camera split

`GameScene.setupUiCamera()`:

- **Main camera** — renders `worldContainer` (road, actors, lighting).
- **UI camera** — renders HUD timer, progress %, dilemma overlay, Ability Lab panel.
- `cameras.main.ignore(hudObjects)` / `uiCamera.ignore(worldContainer)`.

---

## Tournament scenes (partial wiring)

These exist and render but are **not** the default hub navigation path:

| Scene | Intended use |
|-------|----------------|
| `ReadyPanelScene` | Tap ready before matchmaking |
| `BlockedStateScene` | No pass / wallet / forfeit |
| `SundayFinaleScene` | Sunday qualifier framing |
| `ChampionDashboardScene` | Upload Monday billboard creative |

See `APP_MASTER_SPEC.md` §10 for product status.

---

## Related code

- Scene list: `config/gameConfig.ts`
- Hub routing: `scenes/WeekHubScene.ts`
- Registry: `scenes/BootScene.ts`
- Game lifecycle: `scenes/GameScene.ts` `create()`, `shutdown()`
