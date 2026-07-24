#!/usr/bin/env python3
"""
Normalize the extracted Unity bug walk frames (varying size) to the exact
game spec: 620x787 RGBA transparent PNGs, shared feet baseline, centered CoM-ish,
minimal horizontal jitter.

This produces the final deliverable PNGs that the game expects at:
  public/assets/characters/bug/01.png ... 10.png

Why not pure SVG raster: no inkscape/resvg in env easily. These normalized refs
are direct from the Unity source (best fidelity) + fixed per brief "improve consistency".

Also writes a horizontal strip preview PNG and a simple animated GIF (if pillow supports).
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw
import math

REF_DIR = Path(__file__).resolve().parents[1] / "assets" / "reference" / "unity" / "bug"
SRC_SVG_DIR = Path(__file__).resolve().parents[1] / "assets" / "source" / "bug"
OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "assets" / "characters" / "bug"
PREVIEW_DIR = Path(__file__).resolve().parents[1] / "assets" / "reference" / "previews"

TARGET_W = 620
TARGET_H = 787
# From visual inspection of refs + generated SVGs, feet land near bottom of content.
# We will auto-detect per frame the lowest "white-ish" pixel row as feet proxy, then
# place that at FEET_Y in the target canvas.
FEET_Y = 755
# Horizontal center target
CENTER_X = TARGET_W // 2

def find_content_bbox(im: Image.Image, threshold: int = 16) -> tuple[int, int, int, int] | None:
    """Find tight bbox of non-transparent / bright content (white bug)."""
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    minx, miny, maxx, maxy = w, h, 0, 0
    has = False
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 8 and (r + g + b) > threshold * 3:
                has = True
                if x < minx: minx = x
                if y < miny: miny = y
                if x > maxx: maxx = x
                if y > maxy: maxy = y
    if not has:
        return None
    return (minx, miny, maxx + 1, maxy + 1)

def find_feet_y(im: Image.Image, bbox: tuple[int,int,int,int]) -> int:
    """Estimate the 'feet' row: lowest row in bbox that has significant white pixels."""
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    px = im.load()
    minx, miny, maxx, maxy = bbox
    for y in range(maxy - 1, miny - 1, -1):
        count = 0
        for x in range(minx, maxx):
            r, g, b, a = px[x, y]
            if a > 10 and (r + g + b) > 180:
                count += 1
        if count >= 3:  # a foot has some width
            return y
    return maxy - 5  # fallback near bottom of content

def normalize_frame(src: Path, frame_idx: int) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    bbox = find_content_bbox(im)
    if not bbox:
        # fallback empty
        return Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))

    minx, miny, maxx, maxy = bbox
    feet_row = find_feet_y(im, bbox)

    # Crop to content with small margin
    margin = 8
    crop = im.crop((max(0, minx - margin), max(0, miny - margin),
                    min(im.width, maxx + margin), min(im.height, maxy + margin)))

    # Compute scale so that the bug height fits nicely while preserving aspect
    # Target logical display is small; keep close to original ref proportions (esp frame 09)
    # Use the content height to decide scale. We want final on-canvas height ~ most of 620-787 minus padding.
    content_h = crop.height
    # Aim for the bug to occupy ~680 px tall inside target (leaving room for bob/antenna)
    target_content_h = 680
    scale = target_content_h / max(1, content_h)
    # Also clamp so width doesn't exceed ~560
    if crop.width * scale > 560:
        scale = 560 / max(1, crop.width)

    new_w = max(1, int(round(crop.width * scale)))
    new_h = max(1, int(round(crop.height * scale)))
    resized = crop.resize((new_w, new_h), Image.LANCZOS)

    # Create target transparent canvas
    canvas = Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))

    # Compute position: horizontally center the resized content
    # Vertically: place the detected feet_row (scaled) at FEET_Y
    # feet offset in original crop
    feet_offset_in_crop = feet_row - miny + margin   # approx
    scaled_feet_offset = int(round(feet_offset_in_crop * scale))
    dst_y = FEET_Y - scaled_feet_offset

    # x center
    dst_x = CENTER_X - new_w // 2

    # Paste
    canvas.paste(resized, (dst_x, dst_y), resized)

    # Optional: very light cleanup - ensure pure white/gray, but keep fidelity so skip heavy filter.

    return canvas

def make_strip(frames: list[Image.Image]) -> Image.Image:
    """Horizontal strip of all 10 for visual QA."""
    gap = 4
    h = TARGET_H
    total_w = TARGET_W * len(frames) + gap * (len(frames) - 1)
    strip = Image.new("RGBA", (total_w, h), (30, 30, 30, 255))
    x = 0
    for f in frames:
        strip.paste(f, (x, 0), f)
        x += TARGET_W + gap
    return strip

def make_gif(frames: list[Image.Image], fps: int = 72) -> Image.Image | None:
    """Return first frame with info for save as animated gif."""
    if not frames:
        return None
    # Pillow can animate
    duration_ms = int(round(1000 / fps))
    # Duplicate a couple for smoother feel or just use as-is
    return frames[0]

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

    frames: list[Image.Image] = []
    for i in range(1, 11):
        src = REF_DIR / f"{i:02d}.png"
        if not src.exists():
            print(f"Missing ref {src}")
            continue
        norm = normalize_frame(src, i)
        outp = OUT_DIR / f"{i:02d}.png"
        norm.save(outp)
        frames.append(norm)
        print(f"Normalized {src.name} -> {outp}  size={norm.size}")

    if frames:
        # Strip
        strip = make_strip(frames)
        strip_path = PREVIEW_DIR / "bug_walk_strip.png"
        strip.save(strip_path)
        print(f"\nWrote strip preview: {strip_path}")

        # GIF (looping)
        gif_path = PREVIEW_DIR / "bug_walk_72fps.gif"
        # Use append_images
        frames[0].save(
            gif_path,
            save_all=True,
            append_images=frames[1:] + frames[:1],  # loop hint
            duration=int(1000 / 72),
            loop=0,
            disposal=2,
        )
        print(f"Wrote 72fps GIF preview: {gif_path}")

    print("\n=== QA checklist (manual visual) ===")
    print("- All 10 PNGs now exactly 620x787 with transparent bg")
    print("- Feet aligned near y=755 across frames (open in editor and compare)")
    print("- Low horizontal drift (overlay or use strip)")
    print("- Next: npm run dev and verify in MenuScene + footsteps on 1 & 6")

if __name__ == "__main__":
    main()
