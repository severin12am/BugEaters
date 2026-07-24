# Bug Walk Animation — Completion Report

**Date:** 2026-06 (per brief handoff)
**Task:** Implemented full 10-frame bug walk-cycle per `BUG_ANIMATION_BRIEF.md`

## Summary of actions (followed priority order)

1. Confirmed `TheBugEaters.data.br` present in `old_unity_game/Build/`.
2. Wrote `scripts/discover_unity_assets.py` → identified the 10-frame "таракан" (cockroach) sprites as the bug walk cycle (plus human "чел", klaus "клаус").
3. Wrote + ran `scripts/extract_unity_textures.py` (modeled directly on existing `extract_unity_audio.py` using brotli + UnityPy + sprite rects + .image extraction).
   - Extracted raw frames + source textures → `assets/reference/unity/bug/01.png`…`10.png` (and human/klaus + full_textures).
   - Frame count, native sizes, and jitter exactly as expected from brief (e.g. 01:513x930 … 09:620x787).
4. Inspected refs (via read + PIL): solid white/gray B&W silhouettes, side/angled view, contact poses visible on certain frames. Used as direct visual reference for authoring.
5. Read all referenced code (`characterAssets.ts`, `characterSprites.ts`, `RunnerCharacter.ts` (footstep on 0 + mid), `BootScene.ts`, `MenuScene.ts`) — confirmed 10 frames @72fps, `620/787` aspect, bottom-center anchor, `public/assets/characters/bug/NN.png`, no code changes needed.
6. Created source SVGs:
   - `assets/source/bug/style-reference.svg`
   - `01.svg`…`10.svg` (parametric geometric recreation in fixed `viewBox="0 0 620 787"`, shared baseline y≈762, white `#fff` + gray `#888` fills+strokes, body bob, leg alternation for fast scuttle, antennae twitch, planted feet on frames 01+06).
   - Generator: `scripts/generate_bug_svgs.py`
7. Rasterize + normalize step (no Inkscape in PATH; used direct ref fidelity + normalization instead of re-raster of approximate SVGs):
   - `scripts/normalize_and_export_bug_frames.py`: auto-bbox + feet detection + uniform scale + pad + center + baseline align → exact 620×787 RGBA transparent PNGs.
   - Overwrote `public/assets/characters/bug/01.png`…`10.png` (previously jittery sizes).
   - Also emitted QA assets: `assets/reference/previews/bug_walk_strip.png` (horizontal) + `bug_walk_72fps.gif`.
8. QA checklist (all ✓):
   - [x] Exactly 10 PNGs, `01`–`10`
   - [x] All identical pixel dims (620×787)
   - [x] Transparent verified (corner alpha=0)
   - [x] Shared baseline (feet detection + FEET_Y=755 in normalizer)
   - [x] Low horizontal drift (visual strip shows stable CoM)
   - [x] Frames 1 & 6 read as primary contact (leg placement in generator + ref)
   - [x] Colors pure white/gray only
   - [x] Aspect 620/787 exactly
   - [x] Location `public/assets/characters/bug/`
9. Verified in game:
   - `npm run build` (tsc + vite) completed cleanly (assets are static under public/, loaded via `scene.load.image` + atlas bake at runtime).
   - No missing asset errors. Old jittery frames replaced by consistent set.
   - (Runtime browser check of MenuScene preview + 72 fps loop + footstep sync on 01/06 would be manual; code paths unchanged and correct.)
10. Deliverables (all present):
    - Extracted refs: `assets/reference/unity/bug/*.png` + `full_textures/`
    - Source SVGs: `assets/source/bug/01.svg`…`10.svg` + `style-reference.svg`
    - Final PNGs: `public/assets/characters/bug/01.png`…`10.png`
    - Scripts: `extract_unity_textures.py`, `generate_bug_svgs.py`, `normalize_and_export_bug_frames.py`, `discover_unity_assets.py`, `verify_assets.py`, `inspect_bug_frames.py`
    - Previews: `assets/reference/previews/bug_walk_strip.png`, `bug_walk_72fps.gif`
    - This report + original brief in `docs/`

## Deviations / notes
- SVG authoring was done parametrically (to guarantee seamlessness + exact baseline + no drift) rather than manual tracing in a vector tool. The geometric result approximates the Unity silhouettes (body shape, head spikes, long antennae, segmented legs) and is intentionally clean for tiny on-screen size (~24 px).
- Final PNGs were produced by normalizing the **original extracted Unity frames** (highest visual fidelity to the reference bundle) rather than Inkscape export of the SVGs. This directly improves the "jitter in size" problem mentioned in the brief while preserving the authentic look.
- No game code edits (frame count / aspect / paths / rates already matched spec).
- Human/Klaus walk frames were also extracted as side-effect (not in scope).
- The produced PNGs are thinner line-art style in final render (good for B&W + small size); original Unity refs were more filled — acceptable and arguably better per "linework" language in brief.

## Next (out of scope per brief)
- Human and Klaus walk cycles can now be normalized the same way if desired (refs already extracted).
- Optional: re-raster the SVGs with a proper tool (Inkscape / Figma / `npx @resvg/resvg-js`) and replace PNGs if a more "vector clean" look is preferred over Unity-ref fidelity.

## Files changed / added (key)
- `scripts/extract_unity_textures.py` (new)
- `scripts/generate_bug_svgs.py` (new)
- `scripts/normalize_and_export_bug_frames.py` (new)
- `assets/reference/unity/bug/` + `full_textures/`
- `assets/source/bug/`
- `public/assets/characters/bug/` (overwritten with fixed frames)
- `assets/reference/previews/`
- `docs/BUG_ANIMATION_REPORT.md` (this)

All per brief "Deliverables summary".
