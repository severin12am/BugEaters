# BugEaters — Bug Walk Animation: AI Handoff Brief

Use this document as the complete task brief for producing the bug walk-cycle assets.

**Scope:** Bug walk cycle only. Human and Klaus come later.

---

## Mission

Produce a **complete 10-frame bug walk-cycle** for the Phaser game **BugEaters**, using the **original Unity WebGL assets as reference**, optionally **authoring/refining in SVG**, and delivering **final PNGs** in the exact paths/format the game engine expects.

The game does **not** load SVGs at runtime. SVG is for **authoring only**. Final deliverables must be **PNG**.

---

## Project context

- **Game:** Side-scrolling B&W runner (Telegram Mini App)
- **Engine:** Phaser 3 + Vite + TypeScript
- **Repo root:** `d:\BE`
- **Visual style:** Near-black road (`#080808`), white/gray characters, red blood on death (`#cc0000`), Unity-style street-lamp lighting
- **Bug role:** Smallest runner, fastest walk animation, 3 bugs per race

---

## Step 0 — Locate and study old Unity assets

### Reference folder

```
d:\BE\old_unity_game\
```

Expected Unity WebGL bundle (may be missing — check first):

```
d:\BE\old_unity_game\Build\TheBugEaters.data.br
```

There is already a working extraction pattern for **audio** at:

```
d:\BE\scripts\extract_unity_audio.py
```

It uses `UnityPy` + `brotli` to decompress `TheBugEaters.data.br` and export `AudioClip` assets.

### First job

1. Check whether `TheBugEaters.data.br` exists.
2. If missing, **stop and report** — the user must restore the Unity build bundle. Do not guess art from scratch without reference.
3. If present, **extract original bug walk frames** from the bundle before creating anything new.

### Suggested Unity texture extraction approach

Write and run a script similar to `extract_unity_audio.py`, but export:

- `Texture2D` images
- `Sprite` slices (if walk cycle is a spritesheet)
- Any animation clips named like bug / жук / walk / run

Search object names for: `bug`, `жук`, `Bug`, `walk`, `run`, `mover`

Export raw frames to a **reference folder** (do not overwrite final output yet):

```
d:\BE\assets\reference\unity\bug\
```

Document what you find:

- Frame count (expected: **10**)
- Native pixel dimensions per frame
- Whether frames are individual PNGs or a spritesheet
- Whether background is transparent or solid
- Approximate aspect ratio (code expects ~**620×787**)

---

## Step 1 — Define the art spec (from code + reference)

### Hard requirements from game code

| Property | Value |
|----------|-------|
| Frame count | **10** |
| Output path | `d:\BE\public\assets\characters\bug\` |
| File names | `01.png`, `02.png`, … `10.png` (zero-padded, 2 digits) |
| Animation FPS in game | **72** (fast skittery walk) |
| Source aspect ratio | **620 / 787** (width / height) |
| On-screen height | ~**24.3 logical px** (smallest character) |
| Sprite anchor | **Bottom-center** — feet sit on the road |
| Background | **Transparent** |
| Colors | White (`#FFFFFF`) and gray (`#888888`) only — no color fills |

### Code files that define this (read-only unless dimensions change)

- `src/config/characterAssets.ts` — frame count, paths, aspect, display height, FPS
- `src/utils/characterSprites.ts` — loads PNGs, bakes atlas, registers animation
- `src/entities/RunnerCharacter.ts` — footstep sync on frames 0 and halfway
- `src/scenes/BootScene.ts` — loads assets at startup

### Footstep sync (important)

Footstep SFX fires on:

- **Frame index 0** (`01.png`)
- **Frame index 5** (`06.png`) — halfway through 10 frames

Design the walk so **contact poses** land on those two frames (legs/feet hitting ground).

---

## Step 2 — Author in SVG (using Unity frames as reference)

### Workflow

1. Import/reference extracted Unity bug frames.
2. Trace or redraw as clean vector art matching the **same silhouette, proportions, and side-view angle**.
3. Improve consistency if old frames jitter in size — that is the main reason to redo in SVG.
4. Keep art **simple** — it displays very small on screen.

### SVG authoring rules (strict)

- **Same viewBox for all 10 frames**, e.g. `viewBox="0 0 620 787"`
- **Fixed canvas:** width=620, height=787 (or 2× for retina: 1240×1574 — pick one scale and stick to it)
- **Feet baseline:** all frames share the same ground Y (recommend bottom ~10–20px padding from canvas bottom)
- **Facing:** side view, running left-to-right (match Unity reference)
- **Palette:** only white + gray strokes/fills; no anti-aliased color gradients unless subtle gray
- **No background** in SVG (transparent)
- **Consistent stroke width** across frames
- **Center of mass** should not jump horizontally frame-to-frame (reduces visual pulsing)

### Suggested walk breakdown (10 frames @ 72fps)

Fast insect scuttle, not human stride:

- Frames 1, 6: **ground contact** (footstep frames)
- Frames 2–5, 7–10: leg alternation, subtle body bob, optional antenna twitch
- Loop must be seamless: frame 10 → frame 1 with no pop

### Source SVG folder (create this)

```
d:\BE\assets\source\bug\
  01.svg
  02.svg
  ...
  10.svg
```

Optional style anchor:

```
d:\BE\assets\source\bug\style-reference.svg
```

---

## Step 3 — Rasterize SVG → PNG

### Export settings

- **Format:** PNG-24 with alpha
- **Size:** match viewBox exactly (620×787 recommended; 1240×1574 acceptable if game code aspect is preserved)
- **No background color**
- **No drop shadow baked in** (lighting is done in-engine)
- **sRGB**, no embedded color profile surprises

### Batch conversion options (pick one)

**Inkscape CLI:**

```bash
inkscape 01.svg --export-filename=01.png -w 620 -h 787
```

**Node + resvg/sharp script** — batch all 10 files.

**Manual** — Figma/Illustrator export is fine if dimensions are exact.

### Final output (this is what the game loads)

```
d:\BE\public\assets\characters\bug\
  01.png
  02.png
  03.png
  04.png
  05.png
  06.png
  07.png
  08.png
  09.png
  10.png
```

---

## Step 4 — Quality checklist before delivery

Run through every item:

- [ ] Exactly **10** PNGs, named `01`–`10`
- [ ] All frames **same pixel dimensions**
- [ ] **Transparent** background verified (checkerboard test)
- [ ] Feet align on a **shared baseline** across all frames
- [ ] **No horizontal drift** — overlay frames in an image editor; silhouette should not slide left/right more than ~2px
- [ ] **Frame 1 and 6** read as foot-down poses
- [ ] Loop test: play 1→10→1 in a GIF preview at 72fps — no visible hitch
- [ ] Colors are B&W/gray only
- [ ] Aspect ratio ≈ **0.788** (620/787)
- [ ] Files live at `public/assets/characters/bug/` (not `src/`, not `assets/` without `public/`)

### Optional QA script idea

Generate a horizontal strip PNG (all 10 frames side by side) and a 72fps preview GIF for human review.

---

## Step 5 — Verify in the game

From repo root:

```bash
cd d:\BE
npm install
npm run dev
```

Expected behavior:

1. `BootScene` loads `assets/characters/bug/01.png` … `10.png`
2. Atlases bake without console errors
3. **MenuScene** shows animated bug preview when Bug is selected
4. Walk anim plays at **72fps**, smooth loop
5. Footsteps audible on frames 1 and 6 (audio file: `public/assets/audio/step_bug.wav` — may need separate extraction)

If frames are missing, the game will fail silently or show broken textures — check browser devtools network tab for 404s on `/assets/characters/bug/`.

---

## What NOT to change (unless art dimensions fundamentally change)

Do **not** edit game code unless frame count or aspect ratio changes:

```ts
// src/config/characterAssets.ts
CHARACTER_WALK_FRAMES[CharacterType.Bug] = 10
CHARACTER_FRAME_RATE[CharacterType.Bug] = 72
CHARACTER_MAX_ASPECT[CharacterType.Bug] = 620 / 787
characterFramePath → `assets/characters/bug/${NN}.png`
```

If you change frame count or aspect ratio, update `characterAssets.ts` accordingly and report the change.

---

## Deliverables summary

Hand back:

1. **Extracted Unity reference frames** → `assets/reference/unity/bug/`
2. **Source SVGs** → `assets/source/bug/01.svg` … `10.svg`
3. **Final PNGs** → `public/assets/characters/bug/01.png` … `10.png`
4. **Extraction script** (if written) → `scripts/extract_unity_textures.py`
5. **Rasterize script** (if written) → `scripts/svg_to_png.py`
6. **Preview GIF** at 72fps for approval
7. **Short report:**
   - What was found in Unity bundle
   - What was traced vs recreated
   - Final dimensions
   - Any deviations from reference and why

---

## Style reference summary (for prompts)

> Side-view cartoon insect runner for a dark B&W mobile runner game. Small cockroach/beetle silhouette, white and light gray linework, no color. Scuttling run cycle, 10 frames, feet on shared baseline, transparent background. Must read clearly at ~24px tall on screen. Match original Unity BugEaters bug proportions if reference frames are available. Frames 1 and 6 are foot-contact poses. Fast, jittery energy — not a human jog.

---

## Known repo state (as of handoff)

- `public/` may be **empty** — assets need to be created from scratch or extracted
- `old_unity_game/Build/` may only contain `TheBugEaters.loader.js` — the `.data.br` bundle might be missing
- Audio extraction script exists; **texture extraction script does not yet**

---

## Priority order

1. Restore/find `TheBugEaters.data.br`
2. Extract original bug walk frames
3. Redraw as consistent SVG set using reference
4. Export PNGs to exact game paths
5. Preview loop at 72fps
6. Confirm in `npm run dev`

Do not proceed to Human or Klaus until bug is approved.
