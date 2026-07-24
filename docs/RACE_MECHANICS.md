# Race mechanics (as implemented)

Accurate description of the Phaser race layer **today**. Supersedes obsolete sections of `GAME_OVERVIEW.md` (trash carry, old scroll values, Menu-first flow).

---

## Race basics

| Property | Value | Code |
|----------|-------|------|
| Duration | 60 s | `TUNING.race.durationSec` |
| Scroll speed | 442 logical px/s (world) | `TUNING.physics.scrollSpeed` |
| Race distance | `scrollSpeed × duration` (via `ux`) | `utils/constants.ts` → `RACE_DISTANCE` |
| Ground line | `GAME_HEIGHT - ux(180)` | `TUNING.physics.groundOffset` |
| Composition | 3 Bug, 2 Human, 1 Klaus | `config/raceRoster.ts` |

**Tournament mode:** `GameScene` requires multiplayer session or Ability Lab — otherwise redirects to `WeekHubScene`. NPCs fill empty roster slots in non-tournament test paths; tournament spec says **no NPCs in production** (partially enforced).

---

## The road

### Lane layout (global sub-lane index 0–8)

```
[death] | Bug×3 | Humans×3 | Klaus×3 | [death]
  -1    | 0 1 2 |  3 4 5   |  6 7 8  |   9
```

- Player starts center of their species lane (1, 4, or 7).
- Stepping into death half-strips (-1 / 9) triggers off-road death.
- **Main lane dividers** at Bugs|Humans and Humans|Klaus boundaries — solid most of the time, periodically open (seeded timing).

### Controls

| Input | Action | Code |
|-------|--------|------|
| Swipe / tap L-R | Change sub-lane | `InputManager` → `SubLaneManager` |
| Swipe up / Space | Jump | `Player.jump()` |
| Solid divider | Repel tween, no cross | `MainLaneDivider`, `playLaneRepel` |

---

## Two distance counters

Implemented in `RoadScroll.ts`:

| Field | Meaning |
|-------|---------|
| `worldDistanceTraveled` | Full-speed world clock — props scroll, NPC progress base |
| `distanceTraveled` | Player race progress — % HUD, finish line |
| `playerProgressMultiplier` | Applied each frame to player progress only |

**Visual lag:** When player progress < world progress, solo mode shifts player (and capped NPC offset) **up** on screen so debuffs read as “falling behind”. Multiplayer anchors local player at `groundY`; rivals use progress gap (`raceVisual.ts`).

---

## Obstacles

Spawned by `ObstacleManager` using **room seed** (`utils/rng.ts`). Types: `trash | puddle | manhole | ability | passport | straw`.

### Trash bins

- **Do not kill.**
- **Auto-jump** when grounded and bin enters ahead window (`trashJumpContact`).
- While airborne from auto-jump, player progress multiplier = **0** (`trashJumpProgressMultiplier`) — world pulls ahead.
- NPCs: brief brush slowdown instead of jump; or auto-jump for passport-type barriers.
- Size: `trashDisplayHeight × trashSizeMultiplier` (tuning).

### Puddles

- Random scale 1×–3×; large span 2 sub-lanes.
- On **exit**: 2 s slide boost (`puddleSlideBoostMultiplier` ≈ 1.47× progress).
- Slide freezes walk anim + white spray trail (`RunnerCharacter`).
- **Blackrock** ability: puddle contact ignored while active.

### Manholes

- Closed (~65%) — safe.
- Open (~35%) — death if grounded and overlapping.
- Sized via `manholeDisplayHeight × manholeSizeMultiplier`; open art extra scale.
- **Blackrock** — open manhole death suppressed while active.

### Ability pickups (briefcases)

- Spawn on road on separate timer (`TUNING.abilities` 7–15 s intervals).
- Collected via `abilityContact()` → `AbilityInventory` (max 3, newest armed).
- Activated from HUD — see [`ABILITIES.md`](ABILITIES.md).

### Passport / straw (ability-spawned)

- **Passport:** placed by player tap (Digital ID); acts like trash — rivals auto-jump.
- **Straw:** spawned ahead in player lane (Paper Straw); decorative/decoy prop.

---

## Eating (food chain)

```
Bug → Klaus → Human → Bug
```

- Grounded only, reach box ±26×±32 logical px.
- Player vs NPC: `NpcManager.checkEating()` — solo respawns NPC after delay; MP broadcasts `npc:eat`.
- Player vs remote: **referee** Edge Function (authoritative).
- **Shareholder** ability: eat immunity for duration (`isEatProtected`).

Code: `utils/eatingRules.ts`, `TUNING.eating`, `supabase/functions/referee/`.

---

## Prisoner's Dilemma

Same-species proximity → overlay with Cooperate / Eat.

| Outcome | Effect |
|---------|--------|
| Both cooperate | Small speed boost |
| Betrayal | Victim dies, betrayer gets big boost |
| Both eat | Both die |
| Timeout | Treated as cooperate |

Code: `PrisonersDilemmaManager`, `config/prisonersDilemma.ts`. Network: `dilemma:start` / `dilemma:choice` on Realtime channel.

---

## Lighting

Unity-style night racing:

1. Near-black road `#080808`
2. Full-screen **multiply darkness veil** over road + characters
3. **ADD lamp pools** at street lamp positions (+ flashlight when active)
4. Cast shadows from runners toward nearest lamp
5. Lamp **post sprites** render above runners

Tuning: `config/lighting.ts`. Runtime: `LampLightingManager`, `RoadsideLampManager`.

**Camera sync:** Backdrop, road tiles, and darkness veil follow camera X to avoid edge artifacts (`GameScene.updateCameraFollow`).

---

## Death & finish

| Cause | Result |
|-------|--------|
| Eaten | Eliminated |
| Open manhole (grounded) | Eliminated |
| Off-road strip | Eliminated |
| Dilemma betrayal / mutual eat | Eliminated |
| Reach `RACE_DISTANCE` in time | FINISH |
| Timer expires | TIME UP |

Trash / puddles / abilities do not directly kill (except indirect progress loss).

---

## GameScene update order

Each frame while alive (`GameScene.update`):

1. Timer + % HUD  
2. `abilityExecutor.tickTimedEffects()`  
3. Syringe / passport managers  
4. `applyPlayerObstacleEffects()` → `progressMult`  
5. `roadScroll.step(delta, progressMult)`  
6. Obstacle + lamp spawning  
7. `player.updatePhysics()`  
8. `applyPlayerRaceVisual()`  
9. `npcManager` progress + align tweens + ahead visual  
10. Camera, dividers, off-road, eating  
11. Dilemma tick  
12. Lighting + audio + footsteps  
13. Multiplayer broadcast / remote interpolation  
14. Finish line + win/loss checks  

---

## Multiplayer sync summary

- Shared **seed** → identical obstacle + divider RNG  
- Shared **starts_at** → wall-clock timer  
- **Snapshots** ~12 Hz for movement; 90 ms interpolation delay  
- **Eliminations** via Postgres `race_events` + referee  
- Rivals positioned by `(their distanceTraveled − yours)` → screen Y band  

Detail: [`BACKEND.md`](BACKEND.md).

---

## Tuning guide

Edit **`src/config/tuning.ts`** only for balance. Key groups:

- `physics.*` — scroll, jump, visual lag caps  
- `obstacles.*` — spawn rates, sizes, trash jump, puddle slide  
- `abilities.npcSlowProgressMultiplier` — taxation slow  
- `multiplayer.rivalVisual.*` — MP rival spread on screen  
- `laneDividers.*` — open/close timing  
- `eating.*` — reach box  

Derived constants in `utils/constants.ts` update automatically.
