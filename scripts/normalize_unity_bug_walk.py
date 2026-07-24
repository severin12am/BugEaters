#!/usr/bin/env python3
"""
Normalize live Unity bug walk frames onto a fixed canvas.

Anchors on the *central column* of the sprite (ignores swinging legs),
so head→butt height and body X stay stable across the walk cycle.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "assets" / "characters" / "bug_pre_normalize_backup"
OUT = ROOT / "public" / "assets" / "characters" / "bug"
PREV = ROOT / "BUG_CURRENT_FRAMES"

TARGET_W = 620
TARGET_H = 787
CENTER_X = TARGET_W // 2
# Leave room for antennae above + hind legs below the abdomen tip.
TARGET_BODY_H = 440
FIXED_BUTT_Y = 630
# Fraction of canvas width used for body measurement (drops outstretched legs).
CENTRAL_LO = 0.32
CENTRAL_HI = 0.68


def load(i: int) -> np.ndarray:
    return np.array(Image.open(SRC / f"{i:02d}.png").convert("RGBA"))


def anchors(a: np.ndarray) -> tuple[float, float, float, float]:
    """(top, butt, cx, body_h) from central opaque column."""
    op = a[:, :, 3] > 100
    op = ndimage.binary_opening(op, iterations=1)
    h, w = a.shape[:2]
    x0, x1 = int(w * CENTRAL_LO), int(w * CENTRAL_HI)
    central = op[:, x0:x1]
    widths = central.sum(axis=1).astype(float)
    widths = np.convolve(widths, np.ones(5) / 5, mode="same")
    thr = max(8.0, 0.25 * float(widths.max()) if widths.max() > 0 else 8.0)
    ys = np.where(widths >= thr)[0]
    if len(ys) == 0:
        ys = np.where(central.any(axis=1))[0]
    if len(ys) == 0:
        return 0.0, float(h - 1), w / 2.0, float(h)

    top, butt = float(ys.min()), float(ys.max())
    # CX from the abdomen mid-band only (narrower — ignores asymmetric legs).
    mid0 = int(top + 0.35 * (butt - top))
    mid1 = int(top + 0.70 * (butt - top))
    x_lo, x_hi = int(w * 0.40), int(w * 0.60)
    mid_band = op[mid0 : mid1 + 1, x_lo:x_hi]
    _, xs = np.where(mid_band)
    if len(xs) == 0:
        band = central[int(top) : int(butt) + 1]
        _, xs = np.where(band)
        cx = float(xs.mean() + x0) if len(xs) else w / 2.0
    else:
        cx = float(xs.mean() + x_lo)
    return top, butt, cx, butt - top


def normalize(a: np.ndarray) -> tuple[Image.Image, dict]:
    top, butt, cx, body_h = anchors(a)
    scale = TARGET_BODY_H / max(1.0, body_h)

    im = Image.fromarray(a, "RGBA")
    new_w = max(1, int(round(im.width * scale)))
    new_h = max(1, int(round(im.height * scale)))
    scaled = im.resize((new_w, new_h), Image.Resampling.LANCZOS)
    s = np.array(scaled)

    _top_s, butt_s, cx_s, body_h_s = anchors(s)

    canvas = Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))
    dst_x = int(round(CENTER_X - cx_s))
    dst_y = int(round(FIXED_BUTT_Y - butt_s))
    canvas.paste(scaled, (dst_x, dst_y), scaled)

    ft, fb, fcx, fbh = anchors(np.array(canvas))
    return canvas, {
        "src_body_h": body_h,
        "scale": scale,
        "final_top": ft,
        "final_butt": fb,
        "final_cx": fcx,
        "final_body_h": fbh,
    }


def checkerboard(size: tuple[int, int], tile: int = 12) -> Image.Image:
    w, h = size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = out.load()
    for y in range(h):
        for x in range(w):
            c = (
                (210, 210, 210, 255)
                if ((x // tile) + (y // tile)) % 2 == 0
                else (150, 150, 150, 255)
            )
            px[x, y] = c
    return out


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing backup source: {SRC}")

    OUT.mkdir(parents=True, exist_ok=True)
    PREV.mkdir(parents=True, exist_ok=True)

    frames: list[Image.Image] = []
    metas: list[dict] = []
    print("frame | srcBodyH scale | final top/butt/cx/bodyH")
    for i in range(1, 11):
        norm, meta = normalize(load(i))
        norm.save(OUT / f"{i:02d}.png", optimize=True)
        frames.append(norm)
        metas.append(meta)
        print(
            f"{i:02d} | {meta['src_body_h']:.0f} {meta['scale']:.3f} | "
            f"top={meta['final_top']:.0f} butt={meta['final_butt']:.0f} "
            f"cx={meta['final_cx']:.1f} bodyH={meta['final_body_h']:.0f}"
        )

    cxs = [m["final_cx"] for m in metas]
    butts = [m["final_butt"] for m in metas]
    bodies = [m["final_body_h"] for m in metas]
    print(
        f"\nStabilized: cx range={max(cxs) - min(cxs):.1f}px  "
        f"butt range={max(butts) - min(butts):.1f}px  "
        f"bodyH range={max(bodies) - min(bodies):.1f}px"
    )

    gap = 6
    strip = Image.new("RGBA", (TARGET_W * 10 + gap * 9, TARGET_H), (35, 35, 35, 255))
    for i, f in enumerate(frames):
        cell = Image.alpha_composite(checkerboard((TARGET_W, TARGET_H)), f)
        d = ImageDraw.Draw(cell)
        d.line([(CENTER_X, 0), (CENTER_X, TARGET_H)], fill=(255, 80, 80, 160), width=1)
        d.line([(0, FIXED_BUTT_Y), (TARGET_W, FIXED_BUTT_Y)], fill=(80, 180, 255, 160), width=1)
        x0 = int(TARGET_W * CENTRAL_LO)
        x1 = int(TARGET_W * CENTRAL_HI)
        d.rectangle([x0, 0, x1, TARGET_H], outline=(80, 255, 120, 100))
        strip.paste(cell, (i * (TARGET_W + gap), 0))
    strip_path = PREV / "normalized_STRIP.png"
    strip.save(strip_path)

    gif_frames = []
    for f in frames:
        bg = Image.new("RGBA", (TARGET_W, TARGET_H), (28, 28, 28, 255))
        gif_frames.append(Image.alpha_composite(bg, f).convert("P", palette=Image.ADAPTIVE))
    gif_path = PREV / "normalized_walk.gif"
    gif_frames[0].save(
        gif_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=70,
        loop=0,
        disposal=2,
    )

    before = []
    for i in range(1, 11):
        raw = Image.open(SRC / f"{i:02d}.png").convert("RGBA")
        canvas = Image.new("RGBA", (TARGET_W, TARGET_H), (28, 28, 28, 255))
        scale = min(TARGET_W / raw.width, TARGET_H / raw.height) * 0.92
        rw, rh = max(1, int(raw.width * scale)), max(1, int(raw.height * scale))
        r = raw.resize((rw, rh), Image.Resampling.LANCZOS)
        canvas.paste(r, ((TARGET_W - rw) // 2, (TARGET_H - rh) // 2), r)
        before.append(canvas)
    pair_frames = []
    for b, f in zip(before, frames):
        after = Image.alpha_composite(
            Image.new("RGBA", (TARGET_W, TARGET_H), (28, 28, 28, 255)), f
        )
        pair = Image.new("RGBA", (TARGET_W * 2 + 8, TARGET_H), (20, 20, 20, 255))
        pair.paste(b, (0, 0))
        pair.paste(after, (TARGET_W + 8, 0))
        d = ImageDraw.Draw(pair)
        d.text((8, 8), "before", fill=(255, 255, 255, 255))
        d.text((TARGET_W + 16, 8), "after", fill=(255, 255, 255, 255))
        pair_frames.append(pair.convert("P", palette=Image.ADAPTIVE))
    cmp_path = PREV / "normalized_COMPARE.gif"
    pair_frames[0].save(
        cmp_path,
        save_all=True,
        append_images=pair_frames[1:],
        duration=90,
        loop=0,
        disposal=2,
    )

    print(f"Wrote {OUT}")
    print(f"Preview strip: {strip_path}")
    print(f"Preview gif:   {gif_path}")
    print(f"Compare gif:   {cmp_path}")
    print(f"Backup:        {SRC}")


if __name__ == "__main__":
    main()
