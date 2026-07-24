#!/usr/bin/env python3
"""
Bug v2 frame 01 — closer to live Unity style.

Key fix vs prior attempts:
  - Not fat single-stroke legs
  - Legs are OUTLINED segments (2 or 3), like Unity
  - Medium stroke weight (~Unity), not blob-thick
  - Keep detailed AI as ref; do not touch public/

Also exports a fitted Unity-01 on the same canvas for side-by-side honesty.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
EXP = ROOT / "assets" / "experiments" / "bug_v2"
SRC = ROOT / "assets" / "source" / "bug_v2"
PREV = ROOT / "assets" / "reference" / "previews"

W, H = 620, 787
CX = 310.0
BASELINE = 762.0
WHITE = (255, 255, 255, 255)
GRAY = (160, 160, 160, 255)

# Outline stroke — Unity body/leg feel on this canvas
STROKE = 7
STROKE_BODY = 8
STROKE_ANT = 5


def rot(p: tuple[float, float], origin: tuple[float, float], ang: float) -> tuple[float, float]:
    ox, oy = origin
    x, y = p[0] - ox, p[1] - oy
    c, s = math.cos(ang), math.sin(ang)
    return (ox + x * c - y * s, oy + x * s + y * c)


def segment_outline(
    a: tuple[float, float],
    b: tuple[float, float],
    half_w: float,
) -> list[tuple[float, float]]:
    """Rounded-ish quad around a→b (Unity hollow leg segment)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1.0
    ux, uy = dx / L, dy / L
    px, py = -uy * half_w, ux * half_w
    # taper slightly toward tip
    tip = half_w * 0.72
    pxt, pyt = -uy * tip, ux * tip
    return [
        (a[0] + px, a[1] + py),
        (b[0] + pxt, b[1] + pyt),
        (b[0] - pxt, b[1] - pyt),
        (a[0] - px, a[1] - py),
    ]


def draw_outlined_poly(
    draw: ImageDraw.ImageDraw,
    pts: list[tuple[float, float]],
    width: int = STROKE,
) -> None:
    draw.polygon(pts, outline=WHITE)
    # thicken outline by redrawing edges
    closed = pts + [pts[0]]
    draw.line(closed, fill=WHITE, width=width, joint="curve")


def draw_leg_chain(
    draw: ImageDraw.ImageDraw,
    joints: list[tuple[float, float]],
    widths: list[float],
) -> None:
    """2–3 outlined segments. widths[i] = half-width of segment i."""
    for i in range(len(joints) - 1):
        hw = widths[min(i, len(widths) - 1)]
        poly = segment_outline(joints[i], joints[i + 1], hw)
        draw_outlined_poly(draw, poly, STROKE)


def teardrop(cx: float, cy: float, rx: float, ry: float, taper: float = 0.72, n: int = 64) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in range(n):
        a = (i / n) * math.tau - math.pi / 2
        v = (math.sin(a) + 1) / 2
        sx = 1.05 - (1.05 - taper) * v
        pts.append((cx + math.cos(a) * rx * sx, cy + math.sin(a) * ry))
    pts.append(pts[0])
    return pts


def draw_bug(img: Image.Image) -> None:
    d = ImageDraw.Draw(img)
    bc = CX + 10
    body_cy = 458.0
    eye_cy = 250.0
    head_cy = 205.0

    # Legs: hip → knee → ankle [→ tip]. Outlined 2–3 sections.
    # Contact: L-front, R-mid, L-hind plant on baseline.
    legs = [
        {
            "joints": [(bc - 32, 300), (bc - 88, 355), (bc - 118, 540), (bc - 125, BASELINE - 3)],
            "widths": [11, 9, 6],
        },
        {
            "joints": [(bc + 34, 295), (bc + 95, 260), (bc + 138, 305), (bc + 152, 350)],
            "widths": [11, 9, 6],
        },
        {
            "joints": [(bc - 64, 410), (bc - 128, 450), (bc - 152, 540)],
            "widths": [12, 8],
        },
        {
            "joints": [(bc + 66, 412), (bc + 125, 470), (bc + 150, 615), (bc + 148, BASELINE - 3)],
            "widths": [12, 9, 6],
        },
        {
            "joints": [(bc - 48, 545), (bc - 85, 645), (bc - 78, 715), (bc - 68, BASELINE - 3)],
            "widths": [13, 9, 6],
        },
        {
            "joints": [(bc + 52, 540), (bc + 112, 625), (bc + 145, 710)],
            "widths": [13, 8],
        },
    ]
    for leg in legs:
        draw_leg_chain(d, leg["joints"], leg["widths"])

    # Body shield (hollow outline)
    body = teardrop(bc, body_cy, 112, 205, taper=0.70)
    d.line(body, fill=WHITE, width=STROKE_BODY, joint="curve")
    # seam
    d.line([(bc, body_cy - 165), (bc, body_cy + 175)], fill=GRAY, width=3)

    # Pronotum
    d.ellipse((bc - 55, eye_cy + 20, bc + 55, eye_cy + 72), outline=WHITE, width=STROKE)

    # Eyes — Unity large ovals
    for ex in (bc - 23, bc + 23):
        d.ellipse((ex - 20, eye_cy - 24, ex + 20, eye_cy + 26), outline=WHITE, width=STROKE)

    # tiny head lobes (minimal)
    for ex in (bc - 12, bc + 12):
        d.ellipse((ex - 7, head_cy - 20, ex + 7, head_cy - 6), outline=WHITE, width=5)

    # Antennae — thinner than body, slight curve
    for pts in (
        [(bc - 5, head_cy - 16), (bc - 30, 130), (bc - 50, 85), (bc - 58, 48)],
        [(bc + 9, head_cy - 14), (bc + 40, 135), (bc + 70, 95), (bc + 90, 55)],
    ):
        d.line(pts, fill=WHITE, width=STROKE_ANT, joint="curve")
        r = 3
        d.ellipse((pts[-1][0] - r, pts[-1][1] - r, pts[-1][0] + r, pts[-1][1] + r), fill=WHITE)


def fit_unity(src: Image.Image) -> Image.Image:
    src = src.convert("RGBA")
    bb = src.getbbox()
    cropped = src.crop(bb) if bb else src
    th = int(H * 0.90)
    sc = th / cropped.height
    nw, nh = max(1, int(cropped.width * sc)), max(1, int(cropped.height * sc))
    if nw > int(W * 0.90):
        sc = (W * 0.90) / cropped.width
        nw, nh = max(1, int(cropped.width * sc)), max(1, int(cropped.height * sc))
    r = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.alpha_composite(r, ((W - nw) // 2, max(6, int(BASELINE) - nh + 4)))
    return out


def fit(src: Image.Image) -> Image.Image:
    return fit_unity(src)


def main() -> None:
    EXP.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)
    PREV.mkdir(parents=True, exist_ok=True)

    # Preserve failed thick attempt
    simple = EXP / "01_simple.png"
    if simple.exists() and not (EXP / "01_too_thick.png").exists():
        (EXP / "01_too_thick.png").write_bytes(simple.read_bytes())

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_bug(img)
    img = img.filter(ImageFilter.GaussianBlur(0.12))

    mid_path = EXP / "01_mid.png"
    img.save(mid_path)
    img.save(EXP / "01.png")

    # Honest baseline: your Unity asset fitted to same canvas
    unity_fit = fit_unity(Image.open(ROOT / "public" / "assets" / "characters" / "bug" / "01.png"))
    unity_fit.save(EXP / "01_unity_fit.png")

    road = Image.new("RGBA", (W, H), (8, 8, 8, 255))
    road.alpha_composite(img)
    road.save(PREV / "bug_v2_01_mid_on_road.png")

    # Compare: redraw mid | Unity fitted (target) | old too-thick
    thick = EXP / "01_too_thick.png"
    if not thick.exists():
        thick = EXP / "01_simple.png"
    panels = [
        img,
        unity_fit,
        fit(Image.open(thick)) if thick.exists() else img,
    ]
    labels = ["NEW mid (outlined legs)", "Your Unity 01 (fitted)", "Old too-thick (reject)"]
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
    comp.save(PREV / "bug_v2_01_mid_compare.png")

    gh = 48
    gw = max(1, int(W * gh / H))
    tiny = img.resize((gw, gh), Image.Resampling.LANCZOS)
    sheet = Image.new("RGBA", (gw * 6, gh * 4), (8, 8, 8, 255))
    for r in range(4):
        for c in range(6):
            sheet.alpha_composite(tiny, (c * gw, r * gh))
    sheet.save(PREV / "bug_v2_01_mid_game_scale.png")

    a = np.array(img)
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    mask = (a[:, :, 3] > 40) & (lum > 80)
    print(f"Wrote {mid_path} bbox={img.getbbox()}")
    print(f"Wrote {EXP / '01_unity_fit.png'}")
    print(f"Compare: {PREV / 'bug_v2_01_mid_compare.png'}")
    print("Live public untouched.")


if __name__ == "__main__":
    main()
