#!/usr/bin/env python3
"""
Generate an improved Bug walk-cycle FRAME 01 (contact / footstep pose).

Does NOT touch public/assets/characters/bug/ — live game assets stay intact.

Outputs:
  assets/source/bug_v2/01.svg
  assets/experiments/bug_v2/01.png
  assets/reference/previews/bug_v2_01_on_road.png
  assets/reference/previews/bug_v2_01_compare.png

Analysis (Unity таракан 01 vs game needs):
  - Top-down dorsal cockroach, facing up the canvas
  - Hollow white line art (not filled white blobs)
  - Tall teardrop/shield abdomen, large twin eyes, long V antennae
  - Six jointed legs with organic curves; frame 01 = contact / footstep
  - Live public frames ARE the Unity extracts (jittery per-frame sizes)
  - Goal: same character language, cleaner stroke, fixed 620×787, shared baseline
  - Thicker strokes than Unity so silhouette survives ~24px on-screen
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "assets" / "source" / "bug_v2"
OUT_DIR = ROOT / "assets" / "experiments" / "bug_v2"
PREVIEW_DIR = ROOT / "assets" / "reference" / "previews"

W, H = 620, 787
CX = 310.0
BASELINE_Y = 762.0
WHITE = (255, 255, 255, 255)
GRAY = (136, 136, 136, 255)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def quad_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    steps: int = 14,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t**2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t**2 * p2[1]
        pts.append((x, y))
    return pts


def cubic_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    steps: int = 18,
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
    draw.line(pts, fill=color, width=max(1, int(round(width))), joint="curve")
    # round caps
    r = max(1, int(round(width / 2)))
    for x, y in (pts[0], pts[-1]):
        draw.ellipse((x - r, y - r, x + r, y + r), fill=color)


def teardrop_outline(
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    taper: float = 0.78,
    steps: int = 64,
) -> list[tuple[float, float]]:
    """Shield / teardrop like Unity abdomen — wider upper, tapered rear."""
    pts: list[tuple[float, float]] = []
    for i in range(steps):
        a = (i / steps) * math.tau - math.pi / 2
        # taper bottom half
        s = math.sin(a)
        scale_x = lerp(1.0, taper, max(0.0, s))  # s>0 is lower half in this orient? 
        # a=-pi/2 top, +pi/2 bottom
        # normalize vertical from -1 (top) to +1 (bottom)
        v = math.sin(a)  # -1 top ... +1 bottom with a starting -pi/2? 
        # a=-pi/2: cos=0 sin=-1 (top); a=0: cos=1 sin=0; a=pi/2: cos=0 sin=1 (bottom)
        t = (v + 1) / 2  # 0 top → 1 bottom
        sx = lerp(1.05, taper, t)
        x = cx + math.cos(a) * rx * sx
        y = cy + math.sin(a) * ry
        pts.append((x, y))
    pts.append(pts[0])
    return pts


def build_geometry() -> dict:
    """Contact pose geometry tuned against Unity frame 01 landmarks."""
    # Body centers — leave headroom for antennae
    body_cx = CX + 6  # Unity has slight mass lean
    body_cy = 455.0
    eye_cy = 255.0
    head_cy = 210.0

    # Legs: hip → knee → ankle → claw tip
    # Tripod plant: L-front, R-mid, L-hind on baseline
    legs = [
        {
            "name": "L-front",
            "planted": True,
            "hip": (body_cx - 38, 290),
            "knee": (body_cx - 105, 330),
            "ankle": (body_cx - 140, 520),
            "foot": (body_cx - 148, BASELINE_Y - 3),
        },
        {
            "name": "R-front",
            "planted": False,
            "hip": (body_cx + 40, 285),
            "knee": (body_cx + 118, 250),
            "ankle": (body_cx + 155, 310),
            "foot": (body_cx + 168, 355),
        },
        {
            "name": "L-mid",
            "planted": False,
            "hip": (body_cx - 70, 400),
            "knee": (body_cx - 145, 430),
            "ankle": (body_cx - 165, 500),
            "foot": (body_cx - 172, 545),
        },
        {
            "name": "R-mid",
            "planted": True,
            "hip": (body_cx + 72, 405),
            "knee": (body_cx + 148, 455),
            "ankle": (body_cx + 170, 620),
            "foot": (body_cx + 168, BASELINE_Y - 3),
        },
        {
            "name": "L-hind",
            "planted": True,
            "hip": (body_cx - 55, 545),
            "knee": (body_cx - 95, 655),
            "ankle": (body_cx - 88, 720),
            "foot": (body_cx - 78, BASELINE_Y - 3),
        },
        {
            "name": "R-hind",
            "planted": False,
            "hip": (body_cx + 58, 540),
            "knee": (body_cx + 120, 610),
            "ankle": (body_cx + 145, 680),
            "foot": (body_cx + 158, 715),
        },
    ]

    antennae = [
        # left — slightly bent
        cubic_bezier(
            (body_cx - 8, head_cy - 28),
            (body_cx - 35, head_cy - 90),
            (body_cx - 55, head_cy - 150),
            (body_cx - 70, 48),
        ),
        # right — longer outward (Unity asymmetry)
        cubic_bezier(
            (body_cx + 10, head_cy - 26),
            (body_cx + 48, head_cy - 85),
            (body_cx + 78, head_cy - 140),
            (body_cx + 105, 62),
        ),
    ]

    return {
        "body_cx": body_cx,
        "body_cy": body_cy,
        "eye_cy": eye_cy,
        "head_cy": head_cy,
        "legs": legs,
        "antennae": antennae,
        "abdomen": teardrop_outline(body_cx, body_cy, 112, 205, taper=0.72),
    }


def draw_bug(img: Image.Image) -> None:
    d = ImageDraw.Draw(img)
    g = build_geometry()
    bc = g["body_cx"]
    eye_cy = g["eye_cy"]
    head_cy = g["head_cy"]

    # --- Legs first (under body) ---
    for leg in g["legs"]:
        path = cubic_bezier(leg["hip"], leg["knee"], leg["ankle"], leg["foot"], steps=20)
        w = 13 if leg["planted"] else 11
        stroke(d, path, WHITE, w)
        # small claw hook
        fx, fy = leg["foot"]
        hook_x = fx + (-12 if fx < bc else 12)
        stroke(d, [(fx, fy), (hook_x, fy + 8)], WHITE, 5)

    # --- Abdomen ---
    stroke(d, g["abdomen"], WHITE, 13)
    # faint elytra seam (gray only — keeps hollow Unity look)
    seam = [
        (bc, g["body_cy"] - 175),
        (bc + 2, g["body_cy"]),
        (bc, g["body_cy"] + 185),
    ]
    stroke(d, seam, GRAY, 4)

    # --- Pronotum ring (subtle, Unity has a neck-ish join) ---
    d.ellipse(
        (bc - 62, eye_cy + 18, bc + 62, eye_cy + 78),
        outline=WHITE,
        width=10,
    )

    # --- Eyes (Unity signature) ---
    for ex in (bc - 24, bc + 24):
        d.ellipse((ex - 22, eye_cy - 28, ex + 22, eye_cy + 30), outline=WHITE, width=8)
        stroke(d, [(ex, eye_cy - 22), (ex, eye_cy + 24)], GRAY, 3)

    # --- Head bumps / palps above eyes ---
    for ex, ey, rx, ry in (
        (bc, head_cy - 8, 11, 9),
        (bc - 18, head_cy - 22, 10, 8),
        (bc + 18, head_cy - 22, 10, 8),
    ):
        d.ellipse((ex - rx, ey - ry, ex + rx, ey + ry), outline=WHITE, width=5)

    # cheek spikes
    stroke(
        d,
        [(bc - 48, eye_cy - 8), (bc - 72, eye_cy - 30), (bc - 44, eye_cy - 18)],
        WHITE,
        6,
    )
    stroke(
        d,
        [(bc + 48, eye_cy - 8), (bc + 72, eye_cy - 30), (bc + 44, eye_cy - 18)],
        WHITE,
        6,
    )

    # --- Antennae ---
    for ant in g["antennae"]:
        stroke(d, ant, WHITE, 7)


def svg_from_geometry() -> str:
    g = build_geometry()
    bc = g["body_cx"]
    eye_cy = g["eye_cy"]
    head_cy = g["head_cy"]
    lines: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
        "  <!-- Bug v2 frame 01 contact pose — experimental, does not replace live assets -->",
        '  <g id="bug-v2-01" fill="none" stroke-linecap="round" stroke-linejoin="round">',
    ]

    def poly(pts: list[tuple[float, float]], color: str, width: float) -> None:
        s = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        lines.append(
            f'    <polyline points="{s}" stroke="{color}" stroke-width="{width:.1f}"/>'
        )

    for leg in g["legs"]:
        path = cubic_bezier(leg["hip"], leg["knee"], leg["ankle"], leg["foot"], steps=20)
        poly(path, "#ffffff", 13 if leg["planted"] else 11)
        fx, fy = leg["foot"]
        hook_x = fx + (-12 if fx < bc else 12)
        poly([(fx, fy), (hook_x, fy + 8)], "#ffffff", 5)

    poly(g["abdomen"], "#ffffff", 13)
    poly(
        [(bc, g["body_cy"] - 175), (bc + 2, g["body_cy"]), (bc, g["body_cy"] + 185)],
        "#888888",
        4,
    )
    lines.append(
        f'    <ellipse cx="{bc:.1f}" cy="{eye_cy + 48:.1f}" rx="62" ry="30" stroke="#ffffff" stroke-width="10"/>'
    )
    for ex in (bc - 24, bc + 24):
        lines.append(
            f'    <ellipse cx="{ex:.1f}" cy="{eye_cy:.1f}" rx="22" ry="29" stroke="#ffffff" stroke-width="8"/>'
        )
        poly([(ex, eye_cy - 22), (ex, eye_cy + 24)], "#888888", 3)
    for ex, ey, rx, ry in (
        (bc, head_cy - 8, 11, 9),
        (bc - 18, head_cy - 22, 10, 8),
        (bc + 18, head_cy - 22, 10, 8),
    ):
        lines.append(
            f'    <ellipse cx="{ex:.1f}" cy="{ey:.1f}" rx="{rx}" ry="{ry}" stroke="#ffffff" stroke-width="5"/>'
        )
    poly([(bc - 48, eye_cy - 8), (bc - 72, eye_cy - 30), (bc - 44, eye_cy - 18)], "#ffffff", 6)
    poly([(bc + 48, eye_cy - 8), (bc + 72, eye_cy - 30), (bc + 44, eye_cy - 18)], "#ffffff", 6)
    for ant in g["antennae"]:
        poly(ant, "#ffffff", 7)

    lines += ["  </g>", "</svg>", ""]
    return "\n".join(lines)


def fit_on_canvas(src: Image.Image, canvas_w: int, canvas_h: int, baseline_y: int) -> Image.Image:
    src = src.convert("RGBA")
    bbox = src.getbbox()
    if not bbox:
        return Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    cropped = src.crop(bbox)
    target_h = int(canvas_h * 0.90)
    scale = target_h / cropped.height
    nw = max(1, int(cropped.width * scale))
    nh = max(1, int(cropped.height * scale))
    if nw > canvas_w * 0.90:
        scale = (canvas_w * 0.90) / cropped.width
        nw = max(1, int(cropped.width * scale))
        nh = max(1, int(cropped.height * scale))
    resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    x = (canvas_w - nw) // 2
    y = baseline_y - nh + 6
    if y < 6:
        y = 6
    out.alpha_composite(resized, (x, y))
    return out


def make_compare(v2: Image.Image) -> Image.Image:
    unity = Image.open(ROOT / "assets" / "reference" / "unity" / "bug" / "01.png")
    live = Image.open(ROOT / "public" / "assets" / "characters" / "bug" / "01.png")
    panels = [
        fit_on_canvas(unity, W, H, int(BASELINE_Y)),
        v2,
        fit_on_canvas(live, W, H, int(BASELINE_Y)),
    ]
    gap = 16
    label_h = 36
    total_w = W * 3 + gap * 4
    total_h = H + label_h + gap * 2
    canvas = Image.new("RGBA", (total_w, total_h), (8, 8, 8, 255))
    draw = ImageDraw.Draw(canvas)
    labels = ["Unity ref 01", "NEW v2 01 (candidate)", "Live game 01"]
    for i, (panel, label) in enumerate(zip(panels, labels)):
        x = gap + i * (W + gap)
        y = label_h + gap
        draw.rectangle((x, y, x + W, y + H), fill=(8, 8, 8, 255))
        canvas.alpha_composite(panel, (x, y))
        draw.text((x + 8, 10), label, fill=(220, 220, 220, 255))
    return canvas


def main() -> None:
    SRC_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

    svg_path = SRC_DIR / "01.svg"
    svg_path.write_text(svg_from_geometry(), encoding="utf-8")

    png = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_bug(png)
    # tiny soften so strokes don't look harshly aliased at game scale
    rgb = png.filter(ImageFilter.GaussianBlur(radius=0.35))
    png = Image.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 0)), rgb)

    png_path = OUT_DIR / "01.png"
    png.save(png_path, "PNG")

    preview = Image.new("RGBA", (W, H), (8, 8, 8, 255))
    preview.alpha_composite(png)
    preview_path = PREVIEW_DIR / "bug_v2_01_on_road.png"
    preview.save(preview_path, "PNG")

    # game-scale preview (~display height)
    game_h = 48
    scale = game_h / H
    game_w = max(1, int(W * scale))
    tiny = png.resize((game_w, game_h), Image.Resampling.LANCZOS)
    tiny_canvas = Image.new("RGBA", (game_w * 6, game_h * 4), (8, 8, 8, 255))
    for row in range(4):
        for col in range(6):
            tiny_canvas.alpha_composite(tiny, (col * game_w, row * game_h))
    tiny_path = PREVIEW_DIR / "bug_v2_01_game_scale.png"
    tiny_canvas.save(tiny_path, "PNG")

    compare = make_compare(png)
    compare_path = PREVIEW_DIR / "bug_v2_01_compare.png"
    compare.save(compare_path, "PNG")

    print(f"Wrote {svg_path}")
    print(f"Wrote {png_path}  size={png.size} bbox={png.getbbox()}")
    print(f"Wrote {preview_path}")
    print(f"Wrote {tiny_path}")
    print(f"Wrote {compare_path}")
    print("Live public/assets/characters/bug/ untouched.")


if __name__ == "__main__":
    main()
