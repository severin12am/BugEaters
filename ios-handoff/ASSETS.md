# Assets — where to get them

The iOS app needs the same art and audio as the Telegram client. **They are not duplicated in this handoff folder** (too large for the brief). Copy them once at project setup.

## Source (parent BugEaters repo)

| What | Source path | Destination in Expo app |
|------|-------------|-------------------------|
| Character walk frames | `../public/assets/characters/` | `assets/characters/` |
| Props (trash, puddle, lamps, manholes) | `../public/assets/props/` | `assets/props/` |
| Audio (footsteps, phrases, lamp buzz) | `../public/assets/audio/` | `assets/audio/` |

If `public/assets/` is empty in your checkout, extract from `../old_unity_game/` using the scripts in the parent repo (`scripts/extract_unity_audio.py`, Unity texture export).

## File manifest

### Characters (numbered PNGs, zero-padded)

```
assets/characters/bug/01.png … 10.png      (10 frames, 72 fps)
assets/characters/human/01.png … 06.png      (6 frames, 12 fps)
assets/characters/klaus/01.png … 05.png      (5 frames, 12 fps)
```

### Props

```
assets/props/trash-bin.png
assets/props/puddle.png
assets/props/lamp-left.png
assets/props/lamp-right.png
assets/props/manhole-closed.png
assets/props/manhole-open.png
```

### Audio (WAV)

```
assets/audio/step_bug.wav
assets/audio/step_human.wav
assets/audio/step_klaus.wav
assets/audio/lamp_buzz.wav
assets/audio/2030.wav
assets/audio/be_careful.wav
… (full list in reference/config/audioAssets.ts → AUDIO_PATHS)
```

## Agent task (Phase 1, first step)

1. Verify assets exist under `assets/` before building menus.
2. If missing, copy from `../public/assets/` or ask the user to provide the parent repo path.
3. Use `require()` / `expo-asset` preload — no remote URLs for game sprites in v1.
