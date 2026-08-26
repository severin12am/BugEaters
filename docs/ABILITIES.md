# Briefcase abilities (12)

Abilities are **Unity `AbilityTrigger` pickups** spawned on the road, collected into a **3-slot inventory** (newest armed), activated from the bottom HUD.

**Config:** `src/config/abilities.ts`  
**Execution:** `src/managers/AbilityExecutor.ts`  
**Player guide (in-game):** Week hub → **Guide** → *Briefcase powers* section in [`content/encyclopedia.md`](../content/encyclopedia.md)  
**Dev test:** `?abilityLab=1` — see [`DEV_GUIDE.md`](DEV_GUIDE.md)

Default duration: **10 s** (`ABILITY_DEFAULT_DURATION_SEC`). CBDC Run speed: **10 s** at **1.5×** (`param` in abilities.ts).

**Authoritative multiplayer (Fly / Colyseus):** all 12 effects are resolved on the server (`server/src/domain/systems/abilitySystem.ts`). Pickup pool matches the client. Needle / Digital ID / Paper Straw arm first, then send aim/place on gesture. Client auth path uses `AbilityExecutor.activate(id, true)` for VFX/arm only.

---

## Inventory & HUD

| Component | File | Behavior |
|-----------|------|----------|
| Pickup | `GameScene.collectAbility()` | Adds to `AbilityInventory`, removes sprite |
| Storage | `AbilityInventory.ts` | Max 3; FIFO drop oldest; **newest = armed** |
| HUD | `AbilityHud.ts` | Shows slots; tap armed to activate |
| Activate | `GameScene.tryActivateArmedAbility()` | `consumeArmed()` → `AbilityExecutor.activate()` |
| VFX on use | `abilityVfx.ts` | Shareholder/Blackrock ring; CBDC vertical streaks behind runner |

---

## Ability reference

### 1. OPENED BORDERS (`disable-barriers`)

| | |
|--|--|
| **Kind** | `disableBarriers` |
| **Effect** | Lane dividers forced fully open — can cross species boundaries |
| **Code** | `AbilityExecutor` → `setBarriersForcedOpen(true)` → each `MainLaneDivider.setForcedOpen()` |
| **VFX** | None (no defensive ring) |
| **Expires** | `barriersDisabledUntilMs` |

---

### 2. BLACKROCK (`disable-obstacles`)

| | |
|--|--|
| **Kind** | `disableObstacles` |
| **Effect** | Immunity to **puddles** and **open manholes** (contact/death skipped in `applyPlayerObstacleEffects`) |
| **Code** | `isBlackrockActive()` — does **not** stop trash auto-jump or spawn rates |
| **VFX** | White defensive ring on runner |
| **Note** | Name says “obstacles” but implementation targets puddle + manhole hazards only |

---

### 3. DIGITAL ID (`enable-id`)

| | |
|--|--|
| **Kind** | `enableID` |
| **Effect** | After activate, **tap the road** to place a passport barrier |
| **Code** | `PassportPlacementManager.arm()` → `ObstacleManager.spawnPassportAtWorld()` |
| **Placement** | Tap-ahead distance from player Y, up to 320 px; snaps to scroll space via `groundY - tapAhead` |
| **NPC behavior** | `NpcManager` treats passport like trash — `autoJumpOverObstacle()` |
| **Player** | Auto-jump via `trashJumpContact` + `autoJumpOverTrash()` |

---

### 4. NEXUS SAPIENS (`flashlight`)

| | |
|--|--|
| **Kind** | `enableFlashLight` |
| **Effect** | Single forward **lamp pool** in real lighting system; reduced darkness veil |
| **Code** | `AbilityExecutor` sets `flashlightBoost`; `GameScene.updateLighting()` sets `flashlightPoint` ahead of player (`LIGHTING_TUNING.flashlightAheadPx`, pool scale 2.2×) |
| **Not** | Multiple pool sprites on runner (removed) |

---

### 5. DAVOS BROS (`flight-mode`)

| | |
|--|--|
| **Kind** | `flightMode` |
| **Spawns on road** | **No** — only from Ability Lab / direct grant |
| **Effect** | Clears existing obstacles in **player's main lane**; suppresses new spawns there; ghost visual on player |
| **Code** | `ObstacleManager.setFlightClearMainLane()` + `clearMainLane()`; collision skip in `applyPlayerObstacleEffects` |

---

### 6. SDG (`hell-mode`)

| | |
|--|--|
| **Kind** | `hellMode` |
| **Effect** | **2×** obstacle + ability spawn rate on the **two main lanes that are not yours** |
| **Code** | `ObstacleManager.setHellModeLanes(playerMainLane, true)` → `hellBoostLanes`, `spawnRateMultiplier = 2` |
| **Player lane** | Normal spawn rate |

---

### 7. SHAREHOLDER (`immortality`)

| | |
|--|--|
| **Kind** | `immortality` |
| **Effect** | **Eat immunity** — rivals cannot kill you via food chain |
| **Code** | `isEatProtected()` in `checkEating()` / lab god mode |
| **VFX** | White defensive ring |
| **Not** | Hazard immunity (manholes still kill unless Blackrock) |

---

### 8. WUHAN LAB JUICE (`needle-spawner`)

| | |
|--|--|
| **Kind** | `spawnNeedle` |
| **Effect** | Arm syringe → **tap ahead to throw** → kills first NPC hit |
| **Code** | `SyringeThrowManager` → `NpcManager.trySyringeHit()` → `eliminateNpc()` |
| **Hit box** | ~44×52 logical px at projectile position |
| **Instant** | No timed buff — one-shot weapon |

---

### 9. GREAT RESET (`pos-alignment`)

| | |
|--|--|
| **Kind** | `posAligment` (Unity spelling) |
| **Effect** | Snap all visible NPCs to **your race progress** and ease their **Y onto your anchor row** (`groundY`) |
| **Code** | `NpcManager.alignRivalsToPlayer()` + `tickAlignTweens()` locks `raceDistance` to live player distance each frame during 1 s Y ease |
| **Instant** | Race progress snap is immediate; Y animates ~1 s |

---

### 10. TAXATION WITHOUT LEGISLATION (`slowdown-other`)

| | |
|--|--|
| **Kind** | `slowDownOther` |
| **Effect** | NPCs move at **0.34×** race progress (`npcSlowProgressMultiplier`) |
| **Visual** | Purple tint + slower walk anim (`setSlowdownVisual`) — preserved through lamp lighting |
| **Code** | `NpcManager.stepWorldProgress(..., npcSlowActive)` + `setSlowVisualActive()` |

---

### 11. CBDC RUN (`speed-up`)

| | |
|--|--|
| **Kind** | `speedUp` |
| **Effect** | **1.3×** player race progress for 10 s |
| **Code** | `onSpeedBoost` in GameScene → `speedBoostMultiplier` on scroll step |
| **VFX** | Vertical white streaks **behind** runner (below feet, trailing down) |

---

### 12. PAPER STRAW (`straw-spawner`)

| | |
|--|--|
| **Kind** | `spawnStraw` |
| **Effect** | Spawns decorative straw prop ahead in player main lane |
| **Code** | `ObstacleManager.spawnStrawAhead()` |
| **Gameplay** | No special collision — prop scrolls like scenery |

---

## Effect state object

`AbilityExecutor.effects` tracks expiry timestamps:

```typescript
eatProtectedUntilMs      // Shareholder
barriersDisabledUntilMs  // Opened Borders
blackrockUntilMs         // Blackrock
hellModeUntilMs          // SDG
flightModeUntilMs        // Davos Bros
flashlightUntilMs        // Nexus Sapiens
npcSlowUntilMs           // Taxation
```

`tickTimedEffects(nowMs)` clears expired effects and reverses world changes (dividers, hell lanes, flight lane, etc.).

---

## Adding or changing an ability

1. Add entry to `ABILITIES` in `config/abilities.ts` (+ PNG in `public/assets/props/abilities/`).  
2. Handle `kind` in `AbilityExecutor.activate()` and expiry in `tickTimedEffects()`.  
3. Wire collision/spawn side effects in `ObstacleManager` / `GameScene` / `NpcManager` as needed.  
4. Optional VFX in `abilityVfx.ts` → `playAbilityActivateVfx()`.  
5. Regenerate `briefcase-guide.html` icons if needed: `node scripts/embed-briefcase-guide.mjs`.  
6. Document here and in player guide.

---

## Unity asset mapping (Russian filenames)

Export script `scripts/export_unity_props.py`:

| Unity | Export |
|-------|--------|
| `паспорт.png` | `passport.png` |
| `шприц.png` | `syringe.png` |
| `трубка.png` | `paper-straw.png` |

Manhole/trash/puddle PNGs are **not** overwritten by export (tuned sizes in `tuning.ts`).
