#!/usr/bin/env python3
"""
Bug v2 frame 01 — SIMPLIFIED thick-line contact pose.

Keeps the detailed candidate as reference. Does not touch live public assets.

Why simple:
  - Bug is ~24px on screen — tiny details vanish
  - Full 6-leg + antenna realism is hard to animate consistently across 10 frames
  - Unity live asset uses thick strokes (~16px on source); detailed AI pass was ~5px

Outputs:
  assets/experiments/bug_v2/01_simple.png          (primary candidate now)
  assets/source/bug_v2/01_simple.svg
  assets/reference/previews/bug_v2_01_simple_*.png
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
EXP = ROOT / "assets" / "experiments" / "bug_v2"
SRC = ROOT / "assets" / "source" / "bug_v2"
PREV = ROOT / "assets" / "reference" / "previews"

W, H = 620, 787
CX = 310.0
BASELINE = 762.0
WHITE = (255, 255, 255, 255)
GRAY = (136, 136, 136, 255)

# Match Unity thickness feel (Unity ~16px on ~510px-wide sprite)
BODY_W = 18
LEG_W = 16
ANT_W = 12
EYE_W = 14
SEAM_W = 6


def cubic(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    steps: int = 16,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def stroke(
    draw: ImageDraw.ImageDraw,
    pts: list[tuple[float, float]],
    color: tuple[int, int, int, int],
    width: float,
) -> None:
    if len(pts) < 2:
        return
    w = max(1, int(round(width)))
    draw.line(pts, fill=color, width=w, joint="curve")
    r = max(1, w // 2)
    for x, y in (pts[0], pts[-1]):
        draw.ellipse((x - r, y - r, x + r, y + r), fill=color)


def teardrop(cx: float, cy: float, rx: float, ry: float, taper: float = 0.70, n: int = 56) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in range(n):
        a = (i / n) * math.tau - math.pi / 2
        v = (math.sin(a) + 1) / 2  # 0 top → 1 bottom
        sx = 1.05 - (1.05 - taper) * v
        pts.append((cx + math.cos(a) * rx * sx, cy + math.sin(a) * ry))
    pts.append(pts[0])
    return pts


def draw_simple(img: Image.Image) -> None:
    d = ImageDraw.Draw(img)
    bc = CX + 4
    body_cy = 450.0
    eye_cy = 248.0

    # --- 6 legs: ONE bend each (hip → knee → foot). No claws, spines, tarsi. ---
    # Contact tripod: L-front, R-mid, L-hind planted on baseline.
    legs = [
        # L-front planted
        ((bc - 36, 300), (bc - 110, 380), (bc - 130, BASELINE - 2), True),
        # R-front raised
        ((bc + 38, 295), (bc + 120, 270), (bc + 150, 340), False),
        # L-mid raised
        ((bc - 68, 410), (bc - 145, 450), (bc - 160, 530), False),
        # R-mid planted
        ((bc + 70, 415), (bc + 145, 500), (bc + 155, BASELINE - 2), True),
        # L-hind planted (long)
        ((bc - 52, 540), (bc - 100, 660), (bc - 85, BASELINE - 2), True),
        # R-hind raised
        ((bc + 55, 535), (bc + 120, 630), (bc + 145, 700), False),
    ]
    for hip, knee, foot, planted in legs:
        path = cubic(hip, ((hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2), knee, foot, 14)
        stroke(d, path, WHITE, LEG_W if planted else LEG_W - 1)

    # --- Abdomen: thick hollow teardrop ---
    stroke(d, teardrop(bc, body_cy, 118, 210, taper=0.68), WHITE, BODY_W)
    # single center seam (gray, thin — optional read at scale)
    stroke(d, [(bc, body_cy - 170), (bc, body_cy + 180)], GRAY, SEAM_W)

    # --- Pronotum: one simple shield ---
    d.ellipse((bc - 70, eye_cy + 10, bc + 70, eye_cy + 85), outline=WHITE, width=BODY_W - 2)

    # --- Eyes only (no ocelli / spikes / mouth bumps) ---
    for ex in (bc - 26, bc + 26):
        d.ellipse((ex - 24, eye_cy - 28, ex + 24, eye_cy + 30), outline=WHITE, width=EYE_W)

    # --- Antennae: 2 thick simple curves ---
    stroke(
        d,
        cubic((bc - 8, eye_cy - 30), (bc - 40, eye_cy - 90), (bc - 55, 110), (bc - 62, 55), 12),
        WHITE,
        ANT_W,
    )
    stroke(
        d,
        cubic((bc + 10, eye_cy - 28), (bc + 50, eye_cy - 85), (bc + 78, 120), (bc + 95, 70), 12),
        WHITE,
        ANT_W,
    )


def svg_simple() -> str:
    bc = CX + 4
    body_cy = 450.0
    eye_cy = 248.0
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
        "  <!-- Bug v2 SIMPLE frame 01 — thick lines, low detail, contact pose -->",
        '  <g fill="none" stroke-linecap="round" stroke-linejoin="round">',
    ]

    def poly(pts: list[tuple[float, float]], color: str, width: float) -> None:
        s = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        lines.append(f'    <polyline points="{s}" stroke="{color}" stroke-width="{width}"/>')

    legs = [
        ((bc - 36, 300), (bc - 110, 380), (bc - 130, BASELINE - 2), True),
        ((bc + 38, 295), (bc + 120, 270), (bc + 150, 340), False),
        ((bc - 68, 410), (bc - 145, 450), (bc - 160, 530), False),
        ((bc + 70, 415), (bc + 145, 500), (bc + 155, BASELINE - 2), True),
        ((bc - 52, 540), (bc - 100, 660), (bc - 85, BASELINE - 2), True),
        ((bc + 55, 535), (bc + 120, 630), (bc + 145, 700), False),
    ]
    for hip, knee, foot, planted in legs:
        path = cubic(hip, ((hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2), knee, foot, 14)
        poly(path, "#ffffff", LEG_W if planted else LEG_W - 1)

    poly(teardrop(bc, body_cy, 118, 210, taper=0.68), "#ffffff", BODY_W)
    poly([(bc, body_cy - 170), (bc, body_cy + 180)], "#888888", SEAM_W)
    lines.append(
        f'    <ellipse cx="{bc}" cy="{eye_cy + 47.5}" rx="70" ry="37.5" stroke="#ffffff" stroke-width="{BODY_W - 2}"/>'
    )
    for ex in (bc - 26, bc + 26):
        lines.append(
            f'    <ellipse cx="{ex}" cy="{eye_cy}" rx="24" ry="29" stroke="#ffffff" stroke-width="{EYE_W}"/>'
        )
    for ant in (
        cubic((bc - 8, eye_cy - 30), (bc - 40, eye_cy - 90), (bc - 55, 110), (bc - 62, 55), 12),
        cubic((bc + 10, eye_cy - 28), (bc + 50, eye_cy - 85), (bc + 78, 120), (bc + 95, 70), 12),
    ):
        poly(ant, "#ffffff", ANT_W)

    lines += ["  </g>", "</svg>", ""]
    return "\n".join(lines)


def fit(src: Image.Image) -> Image.Image:
    src = src.convert("RGBA")
    bb = src.getbbox()
    if not bb:
        return Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c = src.crop(bb)
    th = int(H * 0.90)
    sc = th / c.height
    nw, nh = max(1, int(c.width * sc)), max(1, int(c.height * sc))
    if nw > int(W * 0.90):
        sc = (W * 0.90) / c.width
        nw, nh = max(1, int(c.width * sc)), max(1, int(c.height * sc))
    r = c.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.alpha_composite(r, ((W - nw) // 2, max(6, int(BASELINE) - nh + 4)))
    return out


def main() -> None:
    EXP.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)
    PREV.mkdir(parents=True, exist_ok=True)

    # Preserve detailed AI candidate as named reference
    detailed = EXP / "01.png"
    detailed_ref = EXP / "01_detailed.png"
    if detailed.exists() and not detailed_ref.exists():
        detailed_ref.write_bytes(detailed.read_bytes())

    (SRC / "01_simple.svg").write_text(svg_simple(), encoding="utf-8")

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_simple(img)
    img = img.filter(ImageFilter.GaussianBlur(0.2))
    simple_path = EXP / "01_simple.png"
    img.save(simple_path)

    # Also promote as the active experiment 01.png (detailed kept as 01_detailed.png)
    img.save(EXP / "01.png")

    road = Image.new("RGBA", (W, H), (8, 8, 8, 255))
    road.alpha_composite(img)
    road.save(PREV / "bug_v2_01_simple_on_road.png")

    # game scale
    gh = 48
    gw = max(1, int(W * gh / H))
    tiny = img.resize((gw, gh), Image.Resampling.LANCZOS)
    sheet = Image.new("RGBA", (gw * 6, gh * 4), (8, 8, 8, 255))
    for r in range(4):
        for c in range(6):
            sheet.alpha_composite(tiny, (c * gw, r * gh))
    sheet.save(PREV / "bug_v2_01_simple_game_scale.png")

    # compare: detailed | simple | live
    detailed_im = (
        Image.open(detailed_ref)
        if detailed_ref.exists()
        else Image.open(EXP / "01_ai.png")
    )
    live = Image.open(ROOT / "public" / "assets" / "characters" / "bug" / "01.png")
    panels = [fit(detailed_im), img, fit(live)]
    labels = ["Detailed (kept as ref)", "NEW simple thick 01", "Live Unity 01"]
    gap, label_h = 16, 36
    tw, th = W * 3 + gap * 4, H + label_h + gap * 2
    comp = Image.new("RGBA", (tw, th), (8, 8, 8, 255))
    draw = ImageDraw.Draw(comp)
    for i, (p, lab) in enumerate(zip(panels, labels)):
        x = gap + i * (W + gap)
        y = label_h + gap
        draw.rectangle((x, y, x + W, y + H), fill=(8, 8, 8, 255))
        comp.alpha_composite(p, (x, y))
        draw.text((x + 8, 10), lab, fill=(220, 220, 220, 255))
    comp.save(PREV / "bug_v2_01_simple_compare.png")

    print(f"Wrote {simple_path} bbox={img.getbbox()}")
    print(f"Wrote {detailed_ref} (reference kept)")
    print(f"Wrote {PREV / 'bug_v2_01_simple_compare.png'}")
    print("Live public/assets/characters/bug/ untouched.")


if __name__ == "__main__":
    main()
