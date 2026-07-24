# Testing without a physical iPhone

The product owner **cannot easily test on a real iPhone** during development. The build agent must **not block on device access**. Use this workflow instead.

## What works without a phone

| Method | Good for | Limitation |
|--------|----------|------------|
| **Rork in-browser preview** | Menu, lobby UI, navigation, layout | `react-native-skia` game may not match device; gestures are mouse, not touch |
| **iOS Simulator** (Mac + Xcode) | Full app including Skia, gestures via simulator | Requires Mac; agent environment may not have it |
| **EAS Build → TestFlight** | Real iPhone install **without Xcode on your machine** | 10–20 min per build; needs Apple Developer account ($99/yr) |
| **Parent web app** (`../` Phaser build) | Visual/gameplay reference in desktop browser | Not the iOS binary — use for parity comparison only |
| **Jest on `reference/` logic** | `rng.ts`, `eatingRules.ts`, seed determinism | Does not test rendering |

## Recommended workflow

### During build (agent — no phone needed)

1. **Phase 1–2:** Rork preview + `npx expo start` in simulator if available.
2. **Phase 2+:** Create an **EAS development build** once Skia is in use (Expo Go is **not** enough for native Skia modules).
3. **Log proof:** Agent saves screenshots from Rork preview or simulator for each phase “done” criteria.
4. **Parity checks:** Compare behavior against `GAME_OVERVIEW.md` checklist; compare screenshots to web client at `npm run dev` in parent repo.

### When the owner can test on iPhone (minimal friction)

**Use TestFlight, not USB debugging.**

```bash
# One-time (agent or owner with Expo account)
npm install -g eas-cli
eas login
eas build:configure

# Preview build installable on iPhone via link
eas build --platform ios --profile preview
```

After the build finishes, EAS gives a **QR code / install URL**. Open on iPhone → installs like any beta app. No cable, no Xcode on Windows.

### Profiles (`eas.json`)

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    }
  }
}
```

- **`preview`** — best for the owner: standalone `.ipa` via TestFlight/internal distribution.
- **`development`** — only if using Expo dev client for hot reload on device.

## Phase “done” without iPhone

| Phase | Accept without device if… |
|-------|---------------------------|
| 1 Menu | Rork preview shows 3 characters, walk anim, START RACE navigates |
| 2 Solo race | Simulator or recording shows full 60s race, obstacles, death, finish |
| 3 Polish | Screenshot side-by-side with web client (lighting, grain, blood) |
| 4 Multiplayer | Two simulators OR simulator + web client in same room; timer sync verified |
| 5 Ship | EAS preview build succeeds; TestFlight upload optional until owner has Apple account |

## What the owner does at the end

1. Receive TestFlight invite link from agent.
2. Install on iPhone (one tap).
3. Run through [parity checklist in BUILD_BRIEF.md](./BUILD_BRIEF.md#parity-regression-checklist) once.

## Common blockers

| Problem | Fix |
|---------|-----|
| Expo Go shows “Skia not found” | Use EAS dev build or preview build — expected |
| No Mac for simulator | Rork preview + EAS TestFlight only |
| No Apple Developer account | Agent completes Phases 1–3 in Rork preview; defer Phase 5 until account exists |
| Supabase multiplayer untestable | Solo mode works with empty `.env`; add keys later for MP test |

## Agent rule

**Never ask the user to plug in an iPhone to unblock daily progress.** Default to Rork preview + EAS preview builds for device validation.
