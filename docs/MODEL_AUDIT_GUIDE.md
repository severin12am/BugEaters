# BugEaters — Model audit guide

**Purpose:** Hand another model (or engineer) everything needed to audit the product and find the right code fast.  
**Date:** August 2026  
**Live playtest:** Mini App `https://bugeaters-cey.pages.dev` · Race `wss://bugeaters-race.fly.dev`

> **Start here for audits.** Product law stays in [`APP_MASTER_SPEC.md`](./APP_MASTER_SPEC.md). Behavior in running code wins over stale prose.

---

## 0. How to audit (recommended order)

1. Read **§1 Dual race paths** (solo vs authoritative) — most “bugs” are path confusion.
2. Skim **§2 Symptom → file** for the area under review.
3. Open the **owner file** + its tests/docs in **§3–5**.
4. Check **§6 Known divergence** before filing “missing feature.”
5. Run **§8 Verification** before claiming a fix.

---

## 1. Dual race paths (critical)

There are **two** ways to race. They share Phaser rendering; they do **not** share the same rules engine.

| Path | Entry | World authority | Hazards / abilities / eat / dilemma |
|------|--------|-----------------|-------------------------------------|
| **A. Solo (client sim)** | Not on the playtest menu. `REGISTRY_KEYS.soloPractice` + no `authLocalRace` | **Client** (`ObstacleManager`, `AbilityExecutor`, …) | Full solo client sim |
| **B. Testing / auth** | `DevSessionScene` → **Testing** | **Server** (`server/src/domain/*`) | Client **renders + sends intents** only |

```
Playtest menu (DevSessionScene)
└─ Testing ─► /dev/ticket ──► GameScene (authWorld=true)
                └─ AuthoritativeRaceClient ──► Colyseus RaceRoom
                                                └─ RaceSimulation
```

| Concern | Solo file(s) | Authoritative file(s) |
|---------|--------------|------------------------|
| Join / seat | Menu character pick | `server/src/dev/devTicketRoute.ts` + `admission/roster.ts` |
| Lane geometry | `SubLaneManager.ts` | Server `movementSystem.ts` + client `clientRaceConfig.ts` (**must match**) |
| Trash / puddle / manhole / pickup | `ObstacleManager.ts` + `GameScene.applyPlayerObstacleEffects` | `server/.../hazardSystem.ts` |
| Abilities | `AbilityExecutor.ts` | `server/.../abilitySystem.ts` + client VFX/arm only |
| Eating | `NpcManager` / `eatingRules.ts` | `server/.../eatingSystem.ts` + `GameScene.checkAuthEating` |
| Dilemma | `PrisonersDilemmaManager` (+ Realtime) | `server/.../dilemmaSystem.ts` + auth UI mode |
| Dividers | `MainLaneDivider` seeded local | `dividerSystem.ts` → snapshot → `setServerOpen` |
| Results | Client / Supabase room | `RaceRoom` final + `EndScene` auth standings |

**Registry flag:** `REGISTRY_KEYS.authLocalRace` non-null ⇒ `GameScene.authWorld === true`.

---

## 2. Symptom → where to look

| Symptom | First files |
|---------|-------------|
| Wrong species / both on left | `devTicketRoute.ts`, `roster.ts`, `RemoteRunnerManager.placeRival`, `SubLaneManager.subLaneCenterX` vs server `laneCenterX` (DPR!) |
| Can’t move / sticky lanes | `GameScene.canCrossDivider`, `authBarriersOpen`, `InputPredictor`, `movementSystem.ts` |
| Open Borders visual but blocked | `GameScene.canCrossDivider` + `MainLaneDivider.setForcedOpen` |
| Trash pass-through / miss pickup | `hazardSystem.ts` (`hazardTouchesRunner`, hit tolerance) |
| Stuck too far from bin | `hazardSystem.ts` `TRASH_STUCK_GAP_PX` |
| Manhole death after “I moved” | Same-tick lane + hazard; `resolveHazards` after `applyMove` |
| No flashlight / plane rams loop | `AbilityExecutor.syncAuthServerFlags`, `GameScene.applyAuthSelfVisual`, `tickTimedEffects` |
| Ability does nothing in multiplayer | Server `abilitySystem.ts` pool/effects; client must not run full `AbilityExecutor` gameplay |
| Needle miss | Aim must be **logical** px (`/ DISPLAY_DPR`); deferred activate then aim |
| No eat (Human vs Bug) | `eatingSystem.ts` (proximity, not same-lane-only); remote `x` placement |
| Laggy / hitchy auth race | `distanceExtrapolator.ts` + `AuthoritativeRaceClient` (20Hz snapshots must be extrapolated; do not draw raw `distance`) |
| Low fps / stutter on a weak phone (any path) | `src/utils/perf.ts` (tier → DPR cap, MSAA, shadows; `?perf=low` to force, `?perf=auto` to reset; two races in a row with ≥20% slow frames store the low tier for the next launch). Open `?abilityLab=1&fps=1` (or add `&fps=1` to any race) for the fps / hitch / DPR / tier readout. Hot paths: `LampLightingManager` (veil + ADD pools = fill rate), `RoadSurface` / `RoadEdgeMarkers` (single TileSprites — do not re-add per-tile objects), `ObstacleManager` / `AuthWorldRenderer` (`ImagePool`, off-screen props hidden), `textureBudget.ts` (prop PNG shrink at boot) |
| Sounds in menu | `AudioManager.destroy` / `stopRace` |
| Practice again / Testing dumps into leftover timer | `devTicketRoute.ts` join window is **15s before start only**; each wave has its own Colyseus `raceRoomId`. Client must join `claims.roomId`, POST lobby `local-practice` |
| Practice again needs reload | `EndScene.practiceAgain` must mint **new** `/dev/ticket` against the lobby id |
| Join fails one of two phones | Fly machine count >1; `fly scale count 1`; in-memory tickets |
| End copy / blood message | `EndScene.ts` |
| Balance numbers | `src/config/tuning.ts` (solo) · `server/src/config/raceConfig.ts` (auth world speed/lanes) |
| Wallet won't link / `proof_required` | `link-wallet` edge fn (ton_proof), `game_config.dev_mode` (mock only), `TON_PROOF_DOMAINS` |
| Pass stuck on "Minting NFT…" | Race server log `[ton]` — minter needs `TON_TREASURY_MNEMONIC`, `NFT_COLLECTION_ADDRESS`, `SUPABASE_SERVICE_ROLE_KEY`; `passes.mint_error` |
| Burn refused `onchain_burn_required` / `burn_not_visible` | `pass-burn` edge fn; `pass_required_onchain`; item owner on tonviewer must be `EQAAAA…AM9c` |
| Bought pass not showing | Hub **Import** → `sync-passes` (TonAPI list + `get_nft_data` + `claim_pass_by_nft`) |

---

## 3. Client map (`src/`)

### Entry

| File | Role |
|------|------|
| `src/main.ts` | Phaser boot |
| `src/config/gameConfig.ts` | Scene list, scale |
| `src/scenes/BootScene.ts` | Preload + **`REGISTRY_KEYS`** |
| `src/scenes/DevSessionScene.ts` | Playtest: **Testing** (auth race) + week sandbox |
| `src/scenes/OnboardingScene.ts` | First-run gameplay (lanes, road items, who-eats-whom icons). Storage `bugeaters.onboarding.v2` |
| `src/scenes/EncyclopediaScene.ts` | In-game Guide (`:::shot` photos + `:::diagram` schemes) |
| `src/config/guideShots.ts` | First-steps screenshot ids / callout chips |
| `src/ui/guideIcons.ts` | Food-chain sprite rows + trash/hole/puddle/power legend |

### Race core

| File | Role |
|------|------|
| **`src/scenes/GameScene.ts`** | Solo loop **and** `updateAuthoritative` — largest file; search `authWorld` / `updateAuthoritative` |
| `src/scenes/EndScene.ts` | Results + Practice again ticket mint |
| `src/managers/SubLaneManager.ts` | Lanes 0–8, Bug left / Human mid / Klaus right |
| `src/managers/ObstacleManager.ts` | Solo hazards |
| `src/managers/AuthWorldRenderer.ts` | Auth hazard sprites (manhole scale = source disc, not full PNG) |
| `src/managers/RemoteRunnerManager.ts` | Rival place/eat targets |
| `src/managers/AbilityExecutor.ts` | Solo effects; auth = visual/arm + `syncAuthServerFlags` |
| `src/managers/PrisonersDilemmaManager.ts` | Solo/legacy + `beginAuthEncounter` |
| `src/managers/AudioManager.ts` | Race SFX; must `stopAll` on destroy |
| `src/managers/LampLightingManager.ts` | Darkness + flashlight cone |
| `src/config/tuning.ts` | Solo balance |
| `src/config/abilities.ts` | 12 ability ids/names |
| `src/utils/raceVisual.ts` | `authRivalGapToScreenOffset` |
| `src/utils/eatingRules.ts` | Food chain |
| `src/utils/layout.ts` | `ux()` / `DISPLAY_DPR` (cap comes from `perf.ts`) |
| `src/utils/perf.ts` | Perf tier + `FrameMonitor`; `?perf=` / `?fps=1` switches |
| `src/utils/imagePool.ts` · `textureBudget.ts` | Prop image recycling · boot-time texture shrink |

### Authoritative client net

| File | Role |
|------|------|
| `src/net/authoritative/AuthoritativeRaceClient.ts` | Facade: join, inputs, `getRenderState` |
| `src/net/authoritative/RaceConnection.ts` | Colyseus + `/dev/ticket` |
| `src/net/authoritative/protocol.ts` | **Wire mirror** of `server/src/net/protocol.ts` |
| `src/net/authoritative/InputPredictor.ts` | Local lane/jump prediction |
| `src/net/authoritative/SnapshotInterpolator.ts` | Remote lane/x smoothing |
| `src/net/authoritative/distanceExtrapolator.ts` | 60fps road between snapshots + smoothed clock |
| `src/net/authoritative/clientRaceConfig.ts` | Must match server `world` geometry |
| `src/net/authoritative/env.ts` | `VITE_RACE_SERVER_URL`, dev flags |

### Tournament + TON wallet

| Path | Role |
|------|------|
| `src/net/RoomSession.ts` | Supabase Realtime (legacy peer path) |
| `src/tournament/tournamentApi.ts` | Week state, ready/join/results RPCs, `burnPass` (prepare → wallet sign → verify), `syncWalletPasses` |
| `src/tournament/chain/*` | `ChainService` contract; `TonChainService` (real) vs `MockChainService` (dev_mode); factory in `index.ts` |
| `src/ton/TonConnectService.ts` | Single `TonConnectUI`; connect with `ton_proof`; `sendTransaction` for burns |
| `src/ton/env.ts` | `VITE_TONCONNECT_MANIFEST_URL` switch, network, explorer URLs |
| `src/ui/domPrompt.ts` | In-app text prompt / external link (Telegram WebView blocks `window.prompt`) |
| `src/ui/*` | Mono chrome |

Detail file list: [`CODEBASE.md`](./CODEBASE.md) (update when you add files; this guide wins for auth routing).

---

## 4. Server map (`server/`)

```
server/src/
├── index.ts                 Express + Colyseus + /healthz + /dev/ticket
├── config/raceConfig.ts     tick rate, duration, world speed, lanes
├── admission/               JWT ticket verify + spawn from claims
├── dev/devTicketRoute.ts    Playtest seats + 15s join window; unique `raceRoomId` per wave
├── domain/
│   ├── RaceSimulation.ts    Tick pipeline owner
│   ├── types.ts             PlayerState, inputs, hazards
│   └── systems/
│       ├── movementSystem.ts
│       ├── dividerSystem.ts
│       ├── hazardSystem.ts    spawn + stick/slide/death/pickup
│       ├── progressSystem.ts
│       ├── abilitySystem.ts   all 12 effects
│       ├── eatingSystem.ts
│       ├── dilemmaSystem.ts
│       └── standingsSystem.ts
├── net/
│   ├── RaceRoom.ts          Transport adapter
│   ├── protocol.ts          CHANNEL + DTOs
│   └── snapshot.ts
├── results/                 Console / Supabase sinks
└── ton/                     Pass / champion NFT minter (TEP-62 cell builders, treasury wallet, sweep)
```

**TON loop (Supabase side):** `supabase/migrations/0015_ton_nft.sql` (mint queue, `link_wallet_verified`, `confirm_pass_burn_verified`, `claim_pass_by_nft`, `expire_unlinked_passes`) · edge functions `ton-proof-payload`, `link-wallet`, `pass-burn`, `sync-passes`, `nft-meta` (+ `_shared/ton.ts`). Contracts: `contracts/`. Runbook: [`TON_TESTNET_RUNBOOK.md`](./TON_TESTNET_RUNBOOK.md).

**Tests:** `server/test/simulation.test.ts` · `npm run race-server:test`  
**Smoke:** `npm run smoke:auth-race` · optional `RACE_SMOKE_URL=https://bugeaters-race.fly.dev`

**Ops:** `fly.toml` (keep **1 machine** until Redis) · `Dockerfile.race-server` · [`DEPLOY_NOW.md`](./DEPLOY_NOW.md)

---

## 5. Product & player docs

| Doc | Use when |
|-----|----------|
| [`APP_MASTER_SPEC.md`](./APP_MASTER_SPEC.md) | Invariants, tournament law, hosting §11b |
| [`ABILITIES.md`](./ABILITIES.md) | Ability behavior + auth notes |
| [`RACE_MECHANICS.md`](./RACE_MECHANICS.md) | Solo-oriented mechanics (verify against auth) |
| [`multiplayer/ARCHITECTURE.md`](./multiplayer/ARCHITECTURE.md) | Auth module layout |
| [`multiplayer/INPUTS_TO_OUTCOMES.md`](./multiplayer/INPUTS_TO_OUTCOMES.md) | Intent → sim |
| [`multiplayer/CLIENT_PREDICTION.md`](./multiplayer/CLIENT_PREDICTION.md) | Predict/reconcile |
| [`content/encyclopedia.md`](../content/encyclopedia.md) | Player-facing copy. `:::shot` photos (`public/assets/guide/`, `src/config/guideShots.ts`) + `:::diagram` schemes |
| [`PHONE_TEST_NOW.md`](./PHONE_TEST_NOW.md) | Phone / BotFather |

---

## 6. Known divergence (do not “fix” blindly)

| Topic | Solo | Authoritative |
|-------|------|----------------|
| Trash | Auto-jump | **Stuck** until lane change |
| NPCs | Optional fillers | **None** (real rivals only) |
| Ability effects | Client | **Server**; client VFX/arm |
| Dilemma | Client / Realtime | **Server** encounter + choice input |
| Geometry units | `ux()` screen | Server **logical** px; convert with `DISPLAY_DPR` |
| Practice seats | Character select | Join order / preferred role on rematch |

---

## 7. Seat & lane layout (law)

```
Global sub-lanes:  0 1 2 | 3 4 5 | 6 7 8
Main lanes:        Bugs  | Humans| Klaus
Practice centers:    1   |   4   |   7
```

Dividers: boundary 0 between 2↔3, boundary 1 between 5↔6.

---

## 8. Verification checklist

```powershell
# Server brain
npm run race-server:test

# Client net (extrapolation / clock)
npm run test:client-net

# Client perf tier + frame monitor
npm run test:client-perf

# Two live clients on one local room
npm run smoke:auth-two-client

# Types
npm run race-server:check
npx tsc --noEmit

# Live ticket pair (same seed/start)
$env:RACE_SMOKE_URL="https://bugeaters-race.fly.dev"; npm run smoke:auth-race

# After Fly deploy
flyctl scale count 1 -a bugeaters-race
```

**Two-phone smoke:** Testing → 15s wait → Bug left + Human mid → trash sticks → pickup arms HUD → Open Borders crosses when active → flashlight cone → die or finish → Practice again both within 15s (new countdown, not leftover timer).

**Smoothness smoke (weak phone):** open `<pages-url>/?abilityLab=1&fps=1` — the green top-left readout shows `fps · % slow · DPR · tier (source)`. Fire DAVOS BROS + CBDC RUN + SHAREHOLDER together; `% slow` should stay low. Compare with `&perf=low` (DPR 1.5, no MSAA/shadows). After two laggy real races in a row the console logs `[perf] race ran poorly … next launch uses the low tier`; `?perf=auto` clears it.

---

## 9. Env & secrets (audit-safe)

| Variable | Where | Notes |
|----------|--------|-------|
| `VITE_RACE_SERVER_URL` | Pages build | `wss://bugeaters-race.fly.dev` |
| `VITE_RACE_DEV_MODE` | Pages | Enables `/dev/ticket` client path |
| `VITE_ALLOW_DEV_SESSION` | Pages | Playtest menu |
| `RACE_DEV_MODE` | Fly secret | Enables `/dev/ticket` on server |
| `RACE_TOKEN_SECRET` | Fly | JWT mint/verify |
| `WEB_ORIGIN` | Fly | CORS |
| `VITE_TONCONNECT_MANIFEST_URL` · `VITE_TON_NETWORK` · `VITE_TELEGRAM_BOT_USERNAME` | Pages | Real TON Connect wallet (else mock) |
| `TON_TREASURY_MNEMONIC` · `NFT_COLLECTION_ADDRESS` · `NFT_META_BASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` | Fly | NFT minter (the only chain writer) |
| `NFT_COLLECTION_ADDRESS` · `TON_NETWORK` · `TON_PROOF_DOMAINS` · `TON_API_KEY` · `TONAPI_KEY` | Supabase secrets | Edge functions (chain reads, ton_proof) |

Do **not** commit `.env.production.local`. Example: `.env.example`.

---

## 10. Code search cheatsheet

```text
authWorld / updateAuthoritative     → GameScene auth loop
syncAuthServerFlags                 → flashlight/flight not clearing
hazardTouchesRunner / stuck         → trash + pickups
PICKUP_ABILITY_POOL / applyAbility  → server abilities
tickDilemmas / beginAuthEncounter   → dilemma
canCrossDivider / barriersOpen      → dividers + Opened Borders
placeRival / subLaneCenterX         → rival X (never raw server x on DPR)
practiceAgain /dev/ticket           → rematch (lobby id, 15s window, new raceRoomId)
CHANNEL. / protocol.ts              → keep client↔server mirrors in sync
```

---

## 11. What “done” looks like for an audit pass

- [ ] Stated which path was tested (Testing / auth vs leftover solo code)
- [ ] Cited **owner file + function** for each finding
- [ ] Separated product-law issues (`APP_MASTER_SPEC`) from implementation bugs
- [ ] Called out solo/auth divergence instead of assuming parity
- [ ] Reproduced or refuted with `race-server:test` / two-client playtest where relevant

---

## 12. Related index updates

- Hierarchy pointer: [`docs/README.md`](./README.md)
- Product canon: [`APP_MASTER_SPEC.md`](./APP_MASTER_SPEC.md) § Documentation hierarchy
- File encyclopedia: [`CODEBASE.md`](./CODEBASE.md)
