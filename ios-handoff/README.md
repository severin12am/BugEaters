# BugEaters iOS — agent handoff package

**Drop this entire `ios-handoff/` folder into a new workspace.** Another agent builds the iOS app **from scratch here** using React Native + Expo (for **Rork**, not Rork Max / Swift).

## Start here (agent)

1. Read **`BUILD_BRIEF.md`** — full port spec, phases, prompts.
2. Read **`TESTING.md`** — owner cannot test on a real iPhone easily; do not block on device access.
3. Copy game assets per **`ASSETS.md`** from the parent repo (`../public/assets/`).
4. Copy `reference/` TypeScript into the Expo app `src/` (paths in brief).
5. Use locked defaults in **`BUILD_BRIEF.md` → Decisions** — do not ask the user to choose auth/stack.

## What is in this folder

| File / folder | Purpose |
|---------------|---------|
| `BUILD_BRIEF.md` | **Main spec** — architecture, parity, phases, Rork prompts |
| `GAME_OVERVIEW.md` | Full game rules + backend (reference Telegram app) |
| `TESTING.md` | Test without physical iPhone (Rork preview, EAS TestFlight) |
| `ASSETS.md` | Where to copy sprites and audio |
| `.env.example` | Supabase client env template |
| `reference/` | Portable tuning, RNG, eating rules, net types (copy into app) |

## Owner checklist (before handing off)

- [ ] Parent repo available so agent can copy `public/assets/`
- [ ] Optional: fill `.env` with Supabase URL + anon key for multiplayer testing
- [ ] Optional: Apple Developer account for final TestFlight (not required for Phases 1–3)

## Output

When finished, this folder root should be a working **Expo app** (or `app/` subfolder per brief) installable via **EAS preview / TestFlight** on iPhone.
