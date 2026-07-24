# BugEaters — iOS Build Brief (React Native / Rork)

**Audience:** AI agent building the app from scratch in this folder.  
**Platform:** Rork standard — **React Native + Expo**. **Not** Rork Max (Swift).  
**Goal:** **Full parity** with the Telegram Mini App described in `GAME_OVERVIEW.md`.

---

## Decisions (locked — do not re-ask the user)

| Topic | Choice | Rationale |
|-------|--------|-----------|
| Auth v1 | **Supabase `signInAnonymously()`** | Works immediately; matches web dev fallback; no Apple Sign In setup |
| Multiplayer | **Same Supabase backend** as Telegram | Reuse `join-room`, `referee`, Realtime — no new server |
| Rendering | **`@shopify/react-native-skia`** | Canvas-like 2D; not WebView wrapper |
| Navigation | **Expo Router** | Maps to scene flow |
| Project root | **This `ios-handoff/` folder** | Scaffold Expo app here |
| Testing | **Rork preview + EAS TestFlight** | Owner has no easy USB iPhone testing — see `TESTING.md` |
| Apple Sign In | **Defer to post-v1** | Add only before App Store if required |

---

## One-line brief for Rork

> Build **BugEaters** as an Expo React Native iOS game in this folder: 60-second black-and-white lane runner, 3 species, trash/puddle/manhole obstacles, eat-or-be-eaten combat, Prisoner's Dilemma, street-lamp lighting, Supabase multiplayer. Full parity with `GAME_OVERVIEW.md`. Use react-native-skia, Expo Router, @supabase/supabase-js. Copy tuning from `reference/config/`. Auth: signInAnonymously. Read `BUILD_BRIEF.md`, `TESTING.md`, `ASSETS.md`.

---

## Scope: full parity checklist

| Area | Must match Telegram client |
|------|---------------------------|
| Flow | Boot → Menu → Lobby → Game (60s) → End |
| Characters | Bug / Human / Klaus + walk previews |
| Roster | 6 runners (3 bug, 2 human, 1 Klaus); NPC fill |
| Lanes | 9 sub-lanes + death shoulders; divider open/close |
| Controls | Swipe L/R, swipe up, tap L/R half (40px threshold) |
| Obstacles | Trash carry, puddle debuff, open manhole death |
| Eating | Bug→Klaus→Human→Bug; remote eats via referee |
| Dilemma | Same-species overlay; cooperate/eat; network sync |
| Lighting | Darkness veil, lamp pools, shadows, lamp hum |
| Audio | Footsteps, phrases every 15s, lamp buzz |
| Multiplayer | Matchmake, lobby presence, ~12Hz snapshots, standings |
| Solo fallback | Missing env / auth fail → offline race |
| Look | `#080808` road, grain, `#cc0000` blood |

**Non-goals v1:** NFT pass, global `day_key` races, puddle footprints.

---

## Architecture

Telegram app = **Phaser 3 + Vite**. React Native has no DOM — **do not embed Phaser** except optional temporary WebView (rejected for final build).

### Stack

| Layer | Package |
|-------|---------|
| Expo | SDK 52+ |
| Screens | expo-router |
| Game canvas | @shopify/react-native-skia |
| Gestures | react-native-gesture-handler |
| Tweens | react-native-reanimated |
| Backend | @supabase/supabase-js |
| Audio | expo-av |
| Session | expo-secure-store |
| Safe area | react-native-safe-area-context |
| Keep awake (race) | expo-keep-awake |

### Copy from `reference/` (pure TypeScript)

```
reference/config/tuning.ts          → src/config/tuning.ts
reference/config/characterAssets.ts   → src/config/
reference/config/propAssets.ts
reference/config/audioAssets.ts
reference/config/lighting.ts
reference/config/prisonersDilemma.ts
reference/config/multiplayer.ts
reference/config/raceRoster.ts
reference/utils/rng.ts              → src/utils/
reference/utils/eatingRules.ts
reference/utils/constants.ts        → src/utils/constants.ts (use this, not web layout.ts)
reference/net/types.ts              → src/net/
```

Fix import paths after copy (`../config/` etc.).

### Rewrite (Phaser → Skia)

Parent repo files to **read** for behavior (not copy verbatim):

| Web file | Why |
|----------|-----|
| `../src/scenes/GameScene.ts` | Update loop order |
| `../src/managers/RoadScroll.ts` | Movement model |
| `../src/managers/ObstacleManager.ts` | Spawn pipeline |
| `../src/managers/LampLightingManager.ts` | Visual hardest part |
| `../src/managers/PrisonersDilemmaManager.ts` | Dilemma UI + sync |
| `../src/net/RoomSession.ts` | Multiplayer hub — port, replace Telegram username with `user.email` or anon id |
| `../src/managers/InputManager.ts` | Gesture thresholds |

---

## Project layout (create in Phase 1)

```
ios-handoff/                       ← Expo root (this folder)
├── app/
│   ├── _layout.tsx
│   ├── index.tsx                  # Boot → preload → /menu
│   ├── menu.tsx
│   ├── lobby.tsx
│   ├── game.tsx                   # Full-screen Skia
│   └── end.tsx
├── src/
│   ├── game/                      # GameEngine + managers
│   ├── render/                    # Skia components
│   ├── config/                    # from reference/
│   ├── net/                       # auth.ts, RoomSession.ts, supabaseClient.ts
│   └── utils/
├── assets/                        # See ASSETS.md
├── app.json
├── eas.json
├── package.json
└── .env                           # From .env.example
```

---

## Coordinates

| Constant | Value |
|----------|-------|
| Logical | 390 × 844 |
| DPR | `min(PixelRatio.get(), 2)` |
| `ux(n, dpr)` | `round(n × dpr)` |
| Ground Y | `gameHeight - ux(180, dpr)` |
| Race distance | `ux(340, dpr) × 60` |

HUD top: `ux(safeAreaInsets.top + 52, dpr)` (replaces Telegram safe area).

---

## Game loop order (exact)

1. Timer + progress %
2. Player obstacle effects (trash, puddle, manhole)
3. `roadScroll.step`
4. NPC world progress + ahead visual
5. Obstacle spawn tick
6. Lamp spawn tick
7. Player jump physics
8. Player race visual lag
9. Camera follow X
10. Divider collisions
11. Off-road death
12. NPC eating
13. Dilemma tick
14. Lighting + lamp audio
15. Footsteps + phrases
16. Multiplayer broadcast + remote interpolation
17. Finish line
18. End race → `/end`

---

## Input

| Gesture | Rule |
|---------|------|
| Tap | movement < 40px → left/right half |
| Swipe horizontal | \|dx\| > 40, \|dx\| > \|dy\| |
| Swipe up | dy < −40 → jump |

---

## Auth (iOS)

```typescript
// src/net/auth.ts — v1 implementation
const { data, error } = await supabase.auth.signInAnonymously();
```

No `telegram-auth` Edge Function on iOS. Multiplayer uses same `join-room` once session exists.

Env vars: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`). Empty → solo mode.

### RoomSession contract

- Invoke `join-room` with `{ characterType }`
- `startsAtMs = serverStartsAt + (Date.now() - serverNow)`
- Broadcast `state` ~12 Hz; interpolate remotes with **90ms** delay
- Listen: `dilemma:start`, `dilemma:choice`, `race_events` INSERT, `rooms` UPDATE

Full backend: `GAME_OVERVIEW.md` Part 3.

---

## Build phases

One Rork chat per phase. See `TESTING.md` for how to mark done without a phone.

### Phase 1 — Shell + menu
Expo Router, black theme, safe area, asset preload, character picker with Skia walk previews, `GameSessionProvider` context.

**Done:** Menu matches web; START RACE → lobby route.

### Phase 2 — Solo game (Skia)
Full 60s race: lanes, jump, obstacles, dividers, NPCs, eating, HUD, seeded RNG.

**Done:** Playable solo race in Rork preview or simulator.

### Phase 3 — Polish
Lighting, grain, finish line, death blood, audio, dilemma UI (NPC cooperates).

**Done:** Screenshot comparable to web client.

### Phase 4 — Multiplayer
Anonymous auth, lobby countdown 12s, presence, RoomSession, remotes, referee, end standings, solo fallback.

**Done:** Two clients same room (sim + web or two sims).

### Phase 5 — Ship
`eas build --platform ios --profile preview` → TestFlight link for owner.

---

## Rork prompts

### Phase 1

```
Read BUILD_BRIEF.md, TESTING.md, ASSETS.md in this folder.
Create Expo SDK 52 app here with Expo Router + TypeScript.
Copy reference/config and reference/utils into src/.
Copy assets per ASSETS.md.
Phase 1 only: boot preload, menu (bug/human/klaus), #080808 theme, safe area.
react-native-skia for walk previews. No game loop yet.
```

### Phase 2

```
Phase 2 from BUILD_BRIEF.md: solo Skia game. Game loop order must match brief.
Port logic from parent ../src/scenes/GameScene.ts. Use reference/config/tuning.ts.
```

### Phase 4

```
Phase 4: Supabase anonymous auth, port RoomSession from parent ../src/net/RoomSession.ts.
Types from reference/net/types.ts. EXPO_PUBLIC_* env vars.
```

---

## Parity regression checklist

Owner runs on TestFlight iPhone when available; agent validates earlier via `TESTING.md`.

- [ ] Full flow menu → lobby → race → end → again
- [ ] Controls: swipe + tap (40px)
- [ ] Trash carry slowdown; jump skips pickup
- [ ] Puddle debuff on exit, 5s
- [ ] Open manhole death
- [ ] Divider blocks when solid
- [ ] Off-road death (bug left, Klaus right)
- [ ] Eat chain + NPC respawn 3.5s
- [ ] Dilemma four outcomes
- [ ] MP: same seed, sync timer
- [ ] Referee remote eat
- [ ] End standings order
- [ ] Audio on first tap
- [ ] HUD below notch

---

*Handoff package — June 2026*
