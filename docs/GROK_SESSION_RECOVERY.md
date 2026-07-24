# Grok Bug-Asset Session — Recovery & Testing Baseline

**Created:** 2026-06-10  
**Purpose:** If testing surfaces errors, use this doc to diagnose, fix, and restore the game to its pre-review state.

**Related docs:**
- `docs/BUG_ANIMATION_BRIEF.md` — original task spec
- `docs/BUG_ANIMATION_REPORT.md` — Grok’s completion report (what it claimed to do)
- `d:\BE_assets\FULL_CONVERSATION_LOG.md` — full Grok conversation export
- `d:\BE_assets\README_GENERATED_FILES.md` — review deliverables outside the game

---

## Executive summary

| Question | Answer |
|----------|--------|
| Was game **code** changed by Grok? | **No** — `src/` last edited 2026-06-09 |
| Were human/klaus/props/audio changed? | **No** — still dated 2026-06-03 / 2026-06-09 |
| Were bug PNGs in the game changed? | **Yes, then restored** on 2026-06-10 |
| Is the game broken right now? | **No** — `npm run build` passes; assets serve correctly |
| Where are improved frames for review? | `d:\BE_assets\improved_frames\` (not in the game) |

**Golden rule:** The live game at `d:\BE\public\assets\characters\bug\` should match the **raw reference baseline** below until you manually greenlight and copy improved frames.

---

## Timeline (what happened)

1. User asked Grok to implement `docs/BUG_ANIMATION_BRIEF.md`.
2. Grok modified `d:\BE` without approval:
   - Overwrote `public/assets/characters/bug/*.png` with normalized 620×787 frames
   - Added `assets/`, new `scripts/`, `docs/BUG_ANIMATION_REPORT.md`
   - Ran `npm run build` (rebuilt `dist/`)
3. User asked Grok to stop touching the game and only deliver review files.
4. Grok copied deliverables to `d:\BE_assets\` and restored game bug PNGs from Unity-extracted references.
5. Cursor audit (2026-06-10) confirmed restore: public bug PNGs are **byte-identical** to `assets/reference/unity/bug/` and `d:\BE_assets\raw_refs\`.

---

## What was NOT touched (safe)

These should behave exactly as before the Grok session:

| Area | Path | Last known good date |
|------|------|----------------------|
| Game TypeScript | `src/**/*.ts` | 2026-06-09 |
| Human walk frames | `public/assets/characters/human/01–06.png` | 2026-06-03 |
| Klaus walk frames | `public/assets/characters/klaus/01–05.png` | 2026-06-03 |
| Props | `public/assets/props/*.png` | 2026-06-03 |
| Audio | `public/assets/audio/*.wav` | 2026-06-09 |
| `package.json` | root | unchanged |
| Supabase / net code | `src/net/`, `supabase/` | unchanged |

**No game config values were changed** (`characterAssets.ts` still expects 10 bug frames @ 72fps, aspect 620/787).

---

## What Grok ADDED inside `d:\BE` (does not affect runtime unless you run scripts)

### New scripts (`scripts/` — all dated 2026-06-10 unless noted)

| Script | What it does | **Danger** |
|--------|--------------|------------|
| `extract_unity_textures.py` | Pulls sprites from `old_unity_game/Build/TheBugEaters.data.br` | Read-only on bundle; writes to `assets/reference/` |
| `discover_unity_assets.py` | Lists Unity asset names | Read-only |
| `generate_bug_svgs.py` | Writes parametric SVGs to `assets/source/bug/` | Overwrites SVGs |
| `normalize_and_export_bug_frames.py` | Normalizes refs → **overwrites** `public/assets/characters/bug/` | **Will replace live game PNGs** |
| `inspect_bug_frames.py` | Prints frame dimensions | Read-only |
| `verify_assets.py` | Basic asset checks | Read-only |
| `check_env.py` | Env check | Read-only |
| `extract_unity_audio.py` | Pre-existing (2026-06-09) | Writes to `public/assets/audio/` if run |

### New asset folders (reference / authoring only)

```
d:\BE\assets\
  reference\unity\bug\          ← Unity-extracted raw bug frames (backup of “before”)
  reference\unity\human\        ← extracted, not used in game
  reference\unity\klaus\        ← extracted, not used in game
  reference\unity\full_textures\← full Unity texture dumps
  reference\previews\           ← strip + 72fps GIF
  source\bug\                 ← 10 SVGs + style-reference.svg
```

### New docs

- `docs/BUG_ANIMATION_REPORT.md` — Grok report (safe to delete if clutter)
- `docs/BUG_ANIMATION_BRIEF.md` — our brief (keep)
- `docs/GROK_SESSION_RECOVERY.md` — this file (keep)

### Rebuilt output

- `dist/` — rebuilt by Grok’s `npm run build`. Harmless; rerun `npm run build` anytime.

---

## Current game baseline — bug PNG fingerprints

Use these to verify the live game still has the **restored originals**.

**Path:** `d:\BE\public\assets\characters\bug\`

| File | Size (px) | Bytes | MD5 |
|------|-----------|-------|-----|
| `01.png` | 513×930 | 23594 | `ccd8bbef0bfcf3b848652217a95fb193` |
| `02.png` | 495×856 | 37961 | `79ba5c4d6c957df725a7baf074402112` |
| `03.png` | 555×772 | 39797 | `955118d751fcd2f81178aab9c847fad8` |
| `04.png` | 563×802 | 37398 | `e8bfef2ce60b6d781c271b444326d474` |
| `05.png` | 537×871 | 36840 | `42c58627de37234481fcc32914ff4611` |
| `06.png` | 485×931 | 35369 | `0962ad4a2d4612bf68ef2423fa80cd19` |
| `07.png` | 496×858 | 35208 | `ac57ea919899cc93cbb97e16ca20af5d` |
| `08.png` | 598×777 | 37247 | `3f970cb7679cf8d226bac9e4293ceb6a` |
| `09.png` | 620×787 | 41137 | `a05632e1d40c18b5275bf77621003066` |
| `10.png` | 592×861 | 39983 | `4ce7e43fefdfcf9b0768452f27e7e2eb` |

**Duplicate copies of the same bytes (for restore):**
- `d:\BE\assets\reference\unity\bug\`
- `d:\BE_assets\raw_refs\`

### Quick verify command (PowerShell + Python)

```powershell
cd d:\BE
python -c "
import hashlib
from pathlib import Path
BASE = {
    '01.png': 'ccd8bbef0bfcf3b848652217a95fb193',
    '02.png': '79ba5c4d6c957df725a7baf074402112',
    '03.png': '955118d751fcd2f81178aab9c847fad8',
    '04.png': 'e8bfef2ce60b6d781c271b444326d474',
    '05.png': '42c58627de37234481fcc32914ff4611',
    '06.png': '0962ad4a2d4612bf68ef2423fa80cd19',
    '07.png': 'ac57ea919899cc93cbb97e16ca20af5d',
    '08.png': '3f970cb7679cf8d226bac9e4293ceb6a',
    '09.png': 'a05632e1d40c18b5275bf77621003066',
    '10.png': '4ce7e43fefdfcf9b0768452f27e7e2eb',
}
bug = Path('public/assets/characters/bug')
ok = True
for name, expected in BASE.items():
    got = hashlib.md5((bug / name).read_bytes()).hexdigest()
    if got != expected:
        print(f'MISMATCH {name}: {got}')
        ok = False
print('BASELINE OK' if ok else 'BASELINE BROKEN — restore needed')
"
```

---

## Review assets (outside the game)

**Path:** `d:\BE_assets\` — safe to experiment; does not affect `d:\BE` until you copy files in.

| Folder | Contents |
|--------|----------|
| `improved_frames/` | 10× PNG @ **620×787** — candidate replacement |
| `raw_refs/` | Same bytes as current game baseline (backup) |
| `source/bug/` | SVG authoring files |
| `previews/` | `bug_walk_strip.png`, `bug_walk_72fps.gif` |

---

## If testing finds errors — symptom → cause → fix

### 1. Bug animation looks wrong / jitters / sizes pulse

**Expected with current baseline:** Frames have **varying dimensions** (513×930 … 592×861). The atlas baker (`bakeCharacterAtlases`) normalizes at runtime, but some pulsing may remain — this is the known pre-improvement behavior.

| If you see… | Likely cause | Fix |
|-------------|--------------|-----|
| Jittery size pulsing | Original varying-size PNGs (baseline) | Normal — or greenlight `improved_frames/` |
| Completely broken / missing sprite | PNGs missing or wrong path | Restore from `raw_refs/` (see below) |
| Wrong art entirely | Someone copied improved frames or wrong files | Restore from `raw_refs/` |

### 2. 404 on `/assets/characters/bug/NN.png`

**Cause:** Files deleted or moved from `public/assets/characters/bug/`.

**Fix:** Copy from `d:\BE_assets\raw_refs\` or `d:\BE\assets\reference\unity\bug\` into `d:\BE\public\assets\characters\bug\`.

### 3. Human or Klaus animation broken

**Not caused by Grok session** — those files were not modified. Check accidental edits or missing files in `public/assets/characters/human/` and `klaus/`.

### 4. Game won’t build (`tsc` errors)

**Not caused by Grok asset work** — no `src/` changes on 2026-06-10. Treat as a separate code issue.

### 5. Footsteps out of sync

Footsteps fire on atlas **frame index 0 and 5** (`01.png` and `06.png`). Code in `RunnerCharacter.tickFootsteps()`. If you swap art but keep 10 frames, sync should hold. If you change frame count, update `src/config/characterAssets.ts`.

### 6. Menu preview / race looks fine but you want to try improved art

See **“Apply improved frames (after greenlight)”** below.

---

## Restore game to pre-review state

Use this if anything under `public/assets/characters/bug/` was changed.

### Option A — copy from `BE_assets` (recommended)

```powershell
Copy-Item "d:\BE_assets\raw_refs\*.png" "d:\BE\public\assets\characters\bug\" -Force
```

### Option B — copy from in-repo reference

```powershell
Copy-Item "d:\BE\assets\reference\unity\bug\*.png" "d:\BE\public\assets\characters\bug\" -Force
```

### Option C — verify after restore

Run the **Quick verify command** above. Expect `BASELINE OK`.

### Do NOT run (unless you intend to replace game files)

```powershell
python d:\BE\scripts\normalize_and_export_bug_frames.py
```

That script **overwrites** `public/assets/characters/bug/` with 620×787 normalized frames.

---

## Apply improved frames (only after you greenlight)

1. **Backup current baseline:**
   ```powershell
   New-Item -ItemType Directory -Force -Path "d:\BE_assets\backups\bug_$(Get-Date -Format yyyyMMdd)"
   Copy-Item "d:\BE\public\assets\characters\bug\*.png" "d:\BE_assets\backups\bug_$(Get-Date -Format yyyyMMdd)\"
   ```
2. **Copy improved frames in:**
   ```powershell
   Copy-Item "d:\BE_assets\improved_frames\*.png" "d:\BE\public\assets\characters\bug\" -Force
   ```
3. **Test:** `npm run dev` → MenuScene → pick Bug → check walk loop + footsteps.
4. **Rollback if unhappy:** use Restore steps above with your backup or `raw_refs/`.

Improved frames are all **620×787 RGBA**. No code changes required.

---

## Testing checklist

Run through before and after any asset swap:

- [ ] `npm run build` — exits 0
- [ ] `npm run dev` — no console errors on boot
- [ ] MenuScene — Bug preview animates smoothly
- [ ] GameScene — player bug runs, feet on road, no sprite pop
- [ ] Footsteps audible on walk (frames 1 & 6 of cycle)
- [ ] Human and Klaus still animate in menu
- [ ] Baseline MD5 verify passes (if using original PNGs)

---

## Optional cleanup (not required for stability)

If you want `d:\BE` closer to pre-Grok clutter, these are safe to remove **after** confirming `raw_refs/` backup exists in `BE_assets`:

- `d:\BE\assets\` (entire tree)
- `d:\BE\scripts\discover_unity_assets.py`
- `d:\BE\scripts\extract_unity_textures.py`
- `d:\BE\scripts\generate_bug_svgs.py`
- `d:\BE\scripts\normalize_and_export_bug_frames.py`
- `d:\BE\scripts\inspect_bug_frames.py`
- `d:\BE\scripts\verify_assets.py`
- `d:\BE\scripts\check_env.py`
- `d:\BE\docs\BUG_ANIMATION_REPORT.md`

**Keep:**
- `docs/BUG_ANIMATION_BRIEF.md`
- `docs/GROK_SESSION_RECOVERY.md` (this file)
- `scripts/extract_unity_audio.py` (pre-existing)

---

## Contacting another agent

Share this file plus:

1. What you were testing (`npm run dev`, MenuScene, full race, etc.)
2. Output of the baseline MD5 verify command
3. Whether you had copied `improved_frames/` into the game
4. Browser console errors or 404s from the Network tab

That is enough to diagnose and restore without guesswork.
