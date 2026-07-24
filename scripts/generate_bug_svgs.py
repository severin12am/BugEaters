#!/usr/bin/env python3
"""
Generate 10 consistent SVG walk-cycle frames for the Bug character.
Matches BUG_ANIMATION_BRIEF.md:
- Fixed 620x787 viewBox
- Shared feet baseline
- White + gray only
- Frames 1 and 6 are primary ground contact (for footstep sync at index 0 and 5)
- Minimal CoM drift, seamless loop
- Simple geometric insect (cockroach/beetle side/angled view) matching extracted Unity таракан refs silhouette/proportions

Run: python scripts/generate_bug_svgs.py
Outputs: assets/source/bug/01.svg .. 10.svg
"""
from __future__ import annotations
from pathlib import Path
import math

OUT_DIR = Path(__file__).resolve().parents[1] / "assets" / "source" / "bug"
W, H = 620, 787
BASELINE_Y = 762  # feet touch here in all frames (bottom padding ~25px)
CENTER_X = 310.0

def svg_header() -> str:
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <!-- Bug walk frame - authored from Unity таракан ref. White/gray line+fill. Transparent bg. -->
'''

def svg_footer() -> str:
    return "</svg>\n"

def body_and_head(bob: float = 0.0, head_tilt: float = 0.0) -> str:
    """Main body + head + eyes + mandibles. Bob shifts body vertically a little."""
    cy = 395 + bob
    parts = []
    # Abdomen (main oval body) - tall like ref
    parts.append(
        f'  <ellipse cx="{CENTER_X}" cy="{cy}" rx="98" ry="185" fill="#ffffff" stroke="#888888" stroke-width="9"/>'
    )
    # Wing case / back plate indication (gray detail line)
    parts.append(
        f'  <ellipse cx="{CENTER_X}" cy="{cy - 20}" rx="72" ry="120" fill="none" stroke="#888888" stroke-width="7"/>'
    )
    # Head (slightly higher)
    hx = CENTER_X + head_tilt * 4
    hy = cy - 175 + bob * 0.3
    parts.append(
        f'  <ellipse cx="{hx}" cy="{hy}" rx="72" ry="58" fill="#ffffff" stroke="#888888" stroke-width="9" transform="rotate({head_tilt * 3} {hx} {hy})"/>'
    )
    # Head internal segments / eyes (gray)
    parts.append(
        f'  <ellipse cx="{hx - 22}" cy="{hy - 8}" rx="16" ry="22" fill="#888888" stroke="none"/>'
    )
    parts.append(
        f'  <ellipse cx="{hx + 22}" cy="{hy - 8}" rx="16" ry="22" fill="#888888" stroke="none"/>'
    )
    # Brow / mandible lines (white on top for highlight)
    parts.append(
        f'  <path d="M {hx-38} {hy-18} Q {hx} {hy-42} {hx+38} {hy-18}" fill="none" stroke="#ffffff" stroke-width="5"/>'
    )
    # Small spikes / horns on head sides (match ref angular look)
    parts.append(
        f'  <polyline points="{hx-52},{hy-30} {hx-68},{hy-55} {hx-48},{hy-38}" fill="#ffffff" stroke="#888888" stroke-width="5"/>'
    )
    parts.append(
        f'  <polyline points="{hx+52},{hy-30} {hx+68},{hy-55} {hx+48},{hy-38}" fill="#ffffff" stroke="#888888" stroke-width="5"/>'
    )
    return "\n".join(parts)

def antennae(bob: float = 0.0, phase: float = 0.0) -> str:
    """Two long antennae, one more upright, one angled. Slight twitch with phase."""
    cy = 395 + bob
    hy = cy - 175 + bob * 0.3
    parts = []
    # Main long horn/antenna (very prominent in ref)
    ax = CENTER_X - 8
    ay = hy - 48
    # tip swings a little
    tip_x = ax + math.sin(phase) * 12
    tip_y = ay - 135 + math.cos(phase * 0.7) * 6
    parts.append(
        f'  <polyline points="{ax},{ay} {ax-6},{ay-70} {tip_x},{tip_y}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>'
    )
    parts.append(
        f'  <polyline points="{ax-6},{ay-70} {tip_x},{tip_y}" fill="none" stroke="#888888" stroke-width="3" stroke-linecap="round"/>'
    )
    # Secondary antenna / feeler angled
    bx = CENTER_X + 18
    by = hy - 35
    btip_x = bx + 55 + math.cos(phase * 1.3) * 18
    btip_y = by - 95 + math.sin(phase) * 14
    parts.append(
        f'  <polyline points="{bx},{by} {bx+28},{by-55} {btip_x},{btip_y}" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>'
    )
    return "\n".join(parts)

def legs(frame: int, bob: float = 0.0, contact: bool = False) -> str:
    """6 legs (insect) as polylines. Phase the swing for fast scuttle.
    On contact frames, force 1-2 feet to exact baseline_y.
    """
    cy = 395 + bob
    # base attachment points on body (slightly different heights)
    attach = [
        (CENTER_X - 55, cy - 60),   # front leftish
        (CENTER_X - 40, cy + 10),
        (CENTER_X - 25, cy + 85),   # mid
        (CENTER_X + 25, cy - 55),
        (CENTER_X + 42, cy + 15),
        (CENTER_X + 58, cy + 80),   # rear
    ]
    # leg phases: fast alternating tripod-ish for 10f cycle
    # frame 0/5 (1 & 6) planted
    p = (frame - 1) % 10
    phase = (p / 10.0) * math.pi * 2

    parts = []
    for i, (ax, ay) in enumerate(attach):
        # alternate which tripod is down
        is_plant = ((i % 3) == (p % 3)) or contact
        # forward/back swing
        swing = math.sin(phase + i * 1.8) * (28 if not is_plant else 8)
        length = 92 + (i % 2) * 18

        kx = ax + swing * (0.6 if i < 3 else -0.6)
        ky = ay + 55 + (math.cos(phase + i) * 12 if not is_plant else 0)

        # knee
        kx2 = ax + swing * 0.35
        ky2 = ay + 38

        # foot target: baseline for planted, otherwise raised
        if is_plant or contact:
            foot_y = BASELINE_Y - 4
            foot_x = kx + (swing * 0.15)
        else:
            foot_y = ky + length * 0.55 - 18
            foot_x = kx + swing * 0.9

        # two segment leg (upper + lower)
        # upper thick white
        parts.append(
            f'  <polyline points="{ax:.1f},{ay:.1f} {kx2:.1f},{ky2:.1f} {foot_x:.1f},{foot_y:.1f}" '
            f'fill="none" stroke="#ffffff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>'
        )
        # lower dark gray for definition
        parts.append(
            f'  <polyline points="{kx2:.1f},{ky2:.1f} {foot_x:.1f},{foot_y:.1f}" '
            f'fill="none" stroke="#888888" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
        )
        # tiny foot claw
        parts.append(
            f'  <polyline points="{foot_x:.1f},{foot_y:.1f} {foot_x-7:.1f},{foot_y+11:.1f}" '
            f'fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>'
        )
    return "\n".join(parts)

def make_frame(frame: int) -> str:
    """Build one complete SVG."""
    # Subtle body bob and head movement, stronger on non-contact
    bob = math.sin((frame-1) * math.pi / 5) * 3.5   # ~7px total bob range
    head_t = math.sin((frame-1) * math.pi / 5.5) * 1.8
    phase = (frame-1) * math.pi / 5.0

    is_contact = frame in (1, 6)

    s = svg_header()
    s += f'  <!-- frame {frame:02d} / contact={is_contact} bob={bob:.1f} -->\n'
    s += '  <g>\n'
    s += legs(frame, bob, contact=is_contact) + "\n"
    s += body_and_head(bob, head_t) + "\n"
    s += antennae(bob, phase) + "\n"
    s += '  </g>\n'
    s += svg_footer()
    return s

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for i in range(1, 11):
        svg = make_frame(i)
        out = OUT_DIR / f"{i:02d}.svg"
        out.write_text(svg, encoding="utf-8")
        print(f"Wrote {out}")
    print(f"\nAll 10 SVGs in {OUT_DIR}")
    print("Next: rasterize to public/assets/characters/bug/ (use node or manual export at exact 620x787)")

if __name__ == "__main__":
    main()
