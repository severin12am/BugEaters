#!/usr/bin/env python3
"""
Bug v2 — full 10-frame walk cycle.

Style (from approved frame + Unity asset):
  - White outlines, BLACK fills inside body/legs/eyes
  - Transparent background (alpha 0 outside the bug)
  - Medium line weight, 2–3 section legs
  - Insect tripod gait; frames 1 & 6 = contact / footstep

Does NOT overwrite public/assets/characters/bug/.

Outputs:
  assets/experiments/bug_v2/walk/01.png … 10.png
  assets/reference/previews/bug_v2_walk_strip.png
  assets/reference/previews/bug_v2_walk_72fps.gif
  assets/reference/previews/bug_v2_walk_12fps.gif
  assets/reference/previews/bug_v2_walk_game_scale.gif
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "experiments" / "bug_v2" / "walk"
PREV = ROOT / "assets" / "reference" / "previews"

W, H = 620, 787
CX = 310.0
BASELINE = 762.0

WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)
GRAY = (140, 140, 140, 255)
CLEAR = (0, 0, 0, 0)

STROKE = 9
STROKE_BODY = 10
STROKE_ANT = 6
STROKE_SEAM = 3


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def lerp_pt(a: tuple[float, float], b: tuple[float, float], t: float) -> tuple[float, float]:
    return (lerp(a[0], b[0], t), lerp(a[1], b[1], t))


def rot_around(
    p: tuple[float, float],
    origin: tuple[float, float],
    deg: float,
) -> tuple[float, float]:
    ang = math.radians(deg)
    ox, oy = origin
    x, y = p[0] - ox, p[1] - oy
    c, s = math.cos(ang), math.sin(ang)
    return (ox + x * c - y * s, oy + x * s + y * c)


def teardrop(cx: float, cy: float, rx: float, ry: float, taper: float = 0.70, n: int = 64) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in range(n):
        a = (i / n) * math.tau - math.pi / 2
        v = (math.sin(a) + 1) / 2
        sx = 1.05 - (1.05 - taper) * v
        pts.append((cx + math.cos(a) * rx * sx, cy + math.sin(a) * ry))
    return pts


def segment_poly(
    a: tuple[float, float],
    b: tuple[float, float],
    half_w: float,
    tip_scale: float = 0.75,
) -> list[tuple[float, float]]:
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1.0
    ux, uy = dx / L, dy / L
    px, py = -uy * half_w, ux * half_w
    pxt, pyt = -uy * half_w * tip_scale, ux * half_w * tip_scale
    return [
        (a[0] + px, a[1] + py),
        (b[0] + pxt, b[1] + pyt),
        (b[0] - pxt, b[1] - pyt),
        (a[0] - px, a[1] - py),
    ]


def draw_filled_poly(
    draw: ImageDraw.ImageDraw,
    pts: list[tuple[float, float]],
    stroke: int = STROKE,
) -> None:
    """Black fill + white outline (Unity look)."""
    draw.polygon(pts, fill=BLACK, outline=WHITE)
    closed = list(pts) + [pts[0]]
    draw.line(closed, fill=WHITE, width=stroke, joint="curve")


def draw_leg(
    draw: ImageDraw.ImageDraw,
    joints: list[tuple[float, float]],
    widths: list[float],
) -> None:
    for i in range(len(joints) - 1):
        hw = widths[min(i, len(widths) - 1)]
        tip = 0.7 if i == len(joints) - 2 else 0.9
        draw_filled_poly(draw, segment_poly(joints[i], joints[i + 1], hw, tip), STROKE)


# ---------------------------------------------------------------------------
# Rest-pose joint chains (approved Unity-like silhouette), hip → … → foot
# Side: L = left (smaller x), R = right
# ---------------------------------------------------------------------------

def hip_points(bc: float, bob_y: float = 0.0) -> dict[str, tuple[float, float]]:
    return {
        "LF": (bc - 34, 300 + bob_y),
        "RF": (bc + 34, 295 + bob_y),
        "LM": (bc - 64, 410 + bob_y),
        "RM": (bc + 66, 412 + bob_y),
        "LH": (bc - 48, 545 + bob_y),
        "RH": (bc + 52, 540 + bob_y),
    }


# Offsets from hip → knee → [ankle] → foot. Clear 2–3 section shapes.
# Pose A = frame 01 contact (LF, RM, LH planted). Pose B = frame 06 opposite.
POSE_A: dict[str, list[tuple[float, float]]] = {
    "LF": [(-48, 55), (-72, 200), (-80, 430)],  # planted down
    "RF": [(62, -35), (110, 10), (125, 50)],  # swung forward/up
    "LM": [(-70, 25), (-100, 90)],  # raised
    "RM": [(58, 80), (85, 220), (82, 340)],  # planted
    "LH": [(-40, 110), (-30, 180), (-20, 210)],  # planted near baseline via clamp
    "RH": [(70, 80), (100, 160)],  # raised
}

POSE_B: dict[str, list[tuple[float, float]]] = {
    "LF": [(-62, -35), (-110, 10), (-125, 50)],  # swung forward
    "RF": [(48, 55), (72, 200), (80, 430)],  # planted
    "LM": [(-58, 80), (-85, 220), (-82, 340)],  # planted
    "RM": [(70, 25), (100, 90)],  # raised
    "LH": [(-70, 80), (-100, 160)],  # raised
    "RH": [(40, 110), (30, 180), (20, 210)],  # planted
}

# Widths match segment count in the active pose (2 or 3).
LEG_WIDTHS: dict[str, list[float]] = {
    "LF": [11, 9, 6],
    "RF": [11, 9, 6],
    "LM": [12, 9, 6],  # 3 when planted; last unused when 2-seg
    "RM": [12, 9, 6],
    "LH": [13, 9, 6],
    "RH": [13, 9, 6],
}

TRIPOD_A = {"LF", "RM", "LH"}
TRIPOD_B = {"RF", "LM", "RH"}


def smoothstep(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def frame_blend(frame: int) -> float:
    return (frame - 1) / 10.0


def leg_pose(name: str, frame: int, bc: float, bob_y: float) -> list[tuple[float, float]]:
    """Hip-locked IK-ish blend between contact poses with swing lift."""
    phase = frame_blend(frame)
    hip = hip_points(bc, bob_y)[name]

    if phase <= 0.5:
        t = smoothstep(phase * 2.0)
        a_off, b_off = POSE_A[name], POSE_B[name]
        swinging = name in TRIPOD_A
    else:
        t = smoothstep((phase - 0.5) * 2.0)
        a_off, b_off = POSE_B[name], POSE_A[name]
        swinging = name in TRIPOD_B

    n = max(len(a_off), len(b_off))
    ap = list(a_off) + [a_off[-1]] * (n - len(a_off))
    bp = list(b_off) + [b_off[-1]] * (n - len(b_off))

    joints: list[tuple[float, float]] = [hip]
    for i in range(n):
        dx = lerp(ap[i][0], bp[i][0], t)
        dy = lerp(ap[i][1], bp[i][1], t)
        joints.append((hip[0] + dx, hip[1] + dy))

    if swinging:
        lift = math.sin(t * math.pi) * 36.0
        for i in range(1, len(joints)):
            w = i / (len(joints) - 1)
            jx, jy = joints[i]
            joints[i] = (jx, jy - lift * w)
    else:
        # pin foot near baseline for contact legs
        fx, fy = joints[-1]
        joints[-1] = (fx, min(max(fy, BASELINE - 8), BASELINE - 2))

    return joints


def antenna_tips(frame: int, bc: float, head_cy: float) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    phase = (frame - 1) / 10.0 * math.tau
    twitch_l = math.sin(phase) * 10
    twitch_r = math.sin(phase + 0.9) * 12
    left = [
        (bc - 5, head_cy - 16),
        (bc - 30 + twitch_l * 0.3, 130),
        (bc - 50 + twitch_l * 0.6, 85),
        (bc - 58 + twitch_l, 48 + math.cos(phase) * 4),
    ]
    right = [
        (bc + 9, head_cy - 14),
        (bc + 40 + twitch_r * 0.3, 135),
        (bc + 70 + twitch_r * 0.5, 95),
        (bc + 90 + twitch_r, 55 + math.sin(phase) * 4),
    ]
    return left, right


def draw_frame(frame: int) -> Image.Image:
    img = Image.new("RGBA", (W, H), CLEAR)
    d = ImageDraw.Draw(img)

    # subtle body bob (Unity scuttle)
    phase = (frame - 1) / 10.0 * math.tau
    bob_y = math.sin(phase * 2) * 3.0
    sway = math.sin(phase) * 2.0
    bc = CX + 8 + sway

    body_cy = 458.0 + bob_y
    eye_cy = 250.0 + bob_y * 0.6
    head_cy = 205.0 + bob_y * 0.5

    # Legs under body — raised first, planted on top
    raised: list[tuple[str, list[tuple[float, float]]]] = []
    planted: list[tuple[str, list[tuple[float, float]]]] = []
    for name in ("LF", "RF", "LM", "RM", "LH", "RH"):
        joints = leg_pose(name, frame, bc, bob_y)
        widths = LEG_WIDTHS[name][: max(1, len(joints) - 1)]
        if joints[-1][1] >= BASELINE - 28:
            planted.append((name, joints, widths))
        else:
            raised.append((name, joints, widths))

    for name, joints, widths in raised + planted:
        draw_leg(d, joints, widths)

    # --- Body (black fill) ---
    body = teardrop(bc, body_cy, 112, 205, taper=0.70)
    draw_filled_poly(d, body, STROKE_BODY)
    # seam on top of fill
    d.line([(bc, body_cy - 165), (bc, body_cy + 175)], fill=GRAY, width=STROKE_SEAM)

    # Pronotum
    pron = [
        (bc - 55, eye_cy + 20),
        (bc + 55, eye_cy + 20),
        (bc + 55, eye_cy + 72),
        (bc - 55, eye_cy + 72),
    ]
    # ellipse fill
    d.ellipse((bc - 55, eye_cy + 20, bc + 55, eye_cy + 72), fill=BLACK, outline=WHITE, width=STROKE)
    d.line([(bc, eye_cy + 22), (bc, eye_cy + 70)], fill=GRAY, width=2)

    # Eyes — black inside white rings
    for ex in (bc - 23, bc + 23):
        d.ellipse((ex - 20, eye_cy - 24, ex + 20, eye_cy + 26), fill=BLACK, outline=WHITE, width=STROKE)

    # Head lobes
    for ex in (bc - 12, bc + 12):
        d.ellipse((ex - 7, head_cy - 20, ex + 7, head_cy - 6), fill=BLACK, outline=WHITE, width=5)

    # Antennae (stroke only — thin feelers)
    left, right = antenna_tips(frame, bc, head_cy)
    for pts in (left, right):
        d.line(pts, fill=WHITE, width=STROKE_ANT, joint="curve")
        r = 3
        x, y = pts[-1]
        d.ellipse((x - r, y - r, x + r, y + r), fill=WHITE)

    return img


def make_previews(frames: list[Image.Image]) -> None:
    PREV.mkdir(parents=True, exist_ok=True)
    gap = 8
    strip_w = W * len(frames) + gap * (len(frames) + 1)
    strip = Image.new("RGBA", (strip_w, H + 40), (8, 8, 8, 255))
    sd = ImageDraw.Draw(strip)
    for i, fr in enumerate(frames):
        x = gap + i * (W + gap)
        panel = Image.new("RGBA", (W, H), (8, 8, 8, 255))
        panel.alpha_composite(fr)
        strip.alpha_composite(panel, (x, 30))
        sd.text((x + 8, 8), f"{i + 1:02d}", fill=(220, 220, 220, 255))
    strip.save(PREV / "bug_v2_walk_strip.png")

    def to_gif(path: Path, fps: int, scale: float = 1.0) -> None:
        imgs = []
        for fr in frames:
            bg = Image.new("RGBA", (W, H), (8, 8, 8, 255))
            bg.alpha_composite(fr)
            if scale != 1.0:
                nw, nh = max(1, int(W * scale)), max(1, int(H * scale))
                bg = bg.resize((nw, nh), Image.Resampling.LANCZOS)
            imgs.append(bg.convert("P", palette=Image.Palette.ADAPTIVE, colors=64))
        duration = int(1000 / fps)
        imgs[0].save(
            path,
            save_all=True,
            append_images=imgs[1:],
            duration=duration,
            loop=0,
            disposal=2,
        )

    to_gif(PREV / "bug_v2_walk_12fps.gif", 12)
    to_gif(PREV / "bug_v2_walk_72fps.gif", 72)
    # game-ish scale (~48px tall)
    to_gif(PREV / "bug_v2_walk_game_scale.gif", 12, scale=48 / H)

    # compare frame 01 to Unity fitted
    unity = Image.open(ROOT / "public" / "assets" / "characters" / "bug" / "01.png").convert("RGBA")
    bb = unity.getbbox()
    if bb:
        unity = unity.crop(bb)
    th = int(H * 0.90)
    sc = th / unity.height
    nw, nh = max(1, int(unity.width * sc)), max(1, int(unity.height * sc))
    unity_r = unity.resize((nw, nh), Image.Resampling.LANCZOS)
    # ensure black fills stay; convert near-black bg to transparent for fair compare
    ua = np.array(unity_r)
    # Unity has black fill AND black bg — for compare keep as-is on dark panel
    ufit = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ufit.alpha_composite(unity_r, ((W - nw) // 2, max(6, int(BASELINE) - nh + 4)))

    comp = Image.new("RGBA", (W * 2 + 48, H + 40), (8, 8, 8, 255))
    cd = ImageDraw.Draw(comp)
    for i, (im, lab) in enumerate([(frames[0], "v2 walk 01"), (ufit, "Unity live 01")]):
        x = 16 + i * (W + 16)
        panel = Image.new("RGBA", (W, H), (8, 8, 8, 255))
        panel.alpha_composite(im)
        comp.alpha_composite(panel, (x, 30))
        cd.text((x + 8, 8), lab, fill=(220, 220, 220, 255))
    comp.save(PREV / "bug_v2_walk_01_vs_unity.png")


def verify_colors(img: Image.Image) -> None:
    a = np.array(img)
    al = a[:, :, 3]
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    opaque = al > 40
    black = opaque & (lum < 40)
    white = opaque & (lum > 180)
    assert (al == 0).sum() > 100000, "expected lots of transparent bg"
    assert black.sum() > 5000, f"expected black fill, got {black.sum()}"
    assert white.sum() > 3000, f"expected white outline, got {white.sum()}"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    frames: list[Image.Image] = []
    for i in range(1, 11):
        fr = draw_frame(i)
        # light AA
        fr = fr.filter(ImageFilter.GaussianBlur(0.1))
        # re-crush: transparent stays, near-white→white, near-black opaque→black
        a = np.array(fr)
        al = a[:, :, 3].astype(np.float32)
        lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
        out = np.zeros_like(a)
        # white strokes
        white_m = (al > 30) & (lum > 100)
        # black fill (opaque dark)
        black_m = (al > 30) & (lum <= 100)
        out[white_m, 0:3] = 255
        out[black_m, 0:3] = 0
        out[white_m | black_m, 3] = 255
        # keep partial alpha on edges lightly
        edge = (al > 10) & (al <= 30)
        out[edge, 0:3] = np.where(lum[edge, None] > 100, 255, 0)
        out[edge, 3] = al[edge]
        fr = Image.fromarray(out, "RGBA")
        verify_colors(fr)
        path = OUT / f"{i:02d}.png"
        fr.save(path)
        frames.append(fr)
        print(f"Wrote {path} bbox={fr.getbbox()}")

    make_previews(frames)
    print(f"Strip/GIF -> {PREV}")
    print("Live public/assets/characters/bug/ untouched.")


if __name__ == "__main__":
    main()
