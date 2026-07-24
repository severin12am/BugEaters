#!/usr/bin/env python3
"""Remove left-butt double/ghost outline on ChatGPT walk frames 3, 4, 8."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "experiments" / "bug_v2" / "chatgpt_walk"
PREV = ROOT / "assets" / "reference" / "previews"
FIXED_TIP = 340
TARGETS = (3, 4, 8)


def masks(a: np.ndarray):
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    opaque = a[:, :, 3] > 40
    white = opaque & (lum > 140)
    black = opaque & (lum < 60)
    return white, black, opaque


def left_outline(white, black, opaque, y, cx):
    x = None
    for dx in range(0, 50):
        if black[y, cx - 8 - dx]:
            x = cx - 8 - dx
            break
    if x is None:
        return None
    while x > 10:
        if white[y, x]:
            while x > 10 and white[y, x - 1]:
                x -= 1
            return x
        if not opaque[y, x]:
            return None
        x -= 1
    return None


def clean(a: np.ndarray, y0=230, y1=325, keep=2, outer_band=7):
    """
    1) Convert thick/inner left outline to black fill (keep outer 2px white).
    2) Clear white just OUTSIDE the outline (ghost parallel line), but only
       short runs that don't look like a full leg segment.
    """
    out = a.copy()
    white, black, opaque = masks(out)
    h, w = out.shape[:2]
    cx = w // 2
    to_black = np.zeros_like(white)
    ghost = np.zeros_like(white)

    for y in range(y0, y1):
        ox = left_outline(white, black, opaque, y, cx)
        if ox is None:
            continue

        # Thin outline from the inside -> black fill
        run = 0
        while ox + run < w and white[y, ox + run]:
            run += 1
        if run > keep:
            to_black[y, ox + keep : ox + run] = True
        for x in range(ox + keep, min(ox + 14, cx - 18)):
            if white[y, x]:
                to_black[y, x] = True

        # Outer ghost: white in (ox-outer_band, ox), only short horizontal runs
        for x in range(max(0, ox - outer_band), ox):
            if not white[y, x]:
                continue
            L = x
            while L > 0 and white[y, L - 1]:
                L -= 1
            R = x
            while R + 1 < w and white[y, R + 1]:
                R += 1
            # short tick / parallel stroke (not a long horizontal leg bar)
            if R - L + 1 <= 8:
                ghost[y, L : R + 1] = True

    out[to_black, 0:3] = 0
    out[to_black, 3] = 255
    out[ghost] = 0
    return out, to_black, ghost


def main() -> None:
    PREV.mkdir(parents=True, exist_ok=True)
    try:
        font = ImageFont.truetype("arial.ttf", 16)
        font_sm = ImageFont.truetype("arial.ttf", 22)
        font_b = ImageFont.truetype("arial.ttf", 36)
    except Exception:
        font = font_sm = font_b = ImageFont.load_default()

    strip = Image.new("RGBA", (290 * 6 + 20, 400), (16, 16, 16, 255))
    d = ImageDraw.Draw(strip)
    col = 0

    for i in TARGETS:
        before = np.array(Image.open(OUT / f"{i:02d}.png").convert("RGBA"))
        after, tb, ghost = clean(before)
        print(f"F{i}: to_black={int(tb.sum())} ghost={int(ghost.sum())}")
        Image.fromarray(after).save(OUT / f"{i:02d}.png")

        for label, img, mark, color in (
            ("before", before, None, None),
            ("ghost", before, ghost, [0, 255, 255, 255]),
            ("after", after, None, None),
        ):
            vis = img.copy()
            vis[img[:, :, 3] == 0] = [28, 28, 28, 255]
            if mark is not None:
                vis[tb] = [255, 40, 40, 255]
                vis[mark] = color
            crop = (
                Image.fromarray(vis)
                .crop((100, 200, 200, 345))
                .resize((280, 340), Image.Resampling.NEAREST)
            )
            strip.alpha_composite(crop, (col * 290 + 5, 40))
            d.text((col * 290 + 10, 8), f"F{i} {label}", fill=(255, 220, 80, 255), font=font)
            col += 1

        view = Image.new("RGBA", (360, 472), (12, 12, 12, 255))
        view.alpha_composite(Image.fromarray(after), (0, 44))
        dd = ImageDraw.Draw(view)
        dd.rectangle((8, 8, 155, 40), fill=(30, 30, 30, 255))
        dd.text((14, 10), f"FRAME {i}", fill=(255, 220, 80, 255), font=font_sm)
        dd.text((312, 430), str(i), fill=(255, 255, 255, 255), font=font_b)
        dd.line([(0, 44 + FIXED_TIP), (360, 44 + FIXED_TIP)], fill=(0, 220, 80, 255), width=2)
        view.save(OUT / f"{i:02d}_labeled.png")

    strip.save(PREV / "bug_left_line_fix.png")

    cmp = Image.new("RGBA", (300 * 4 + 20, 380), (16, 16, 16, 255))
    cd = ImageDraw.Draw(cmp)
    for idx, i in enumerate([1, 3, 4, 8]):
        a = np.array(Image.open(OUT / f"{i:02d}.png").convert("RGBA"))
        vis = a.copy()
        vis[a[:, :, 3] == 0] = [28, 28, 28, 255]
        crop = (
            Image.fromarray(vis)
            .crop((100, 200, 200, 345))
            .resize((290, 340), Image.Resampling.NEAREST)
        )
        cmp.alpha_composite(crop, (idx * 300 + 8, 30))
        cd.text((idx * 300 + 12, 5), f"F{i}", fill=(255, 220, 80, 255), font=font)
    cmp.save(PREV / "bug_left_butt_final.png")

    views = [Image.open(OUT / f"{i:02d}_labeled.png").convert("RGBA") for i in range(1, 9)]
    imgs = [v.convert("P", palette=Image.Palette.ADAPTIVE, colors=64) for v in views]
    imgs[0].save(
        PREV / "bug_chatgpt_walk_REVIEW.gif",
        save_all=True,
        append_images=imgs[1:],
        duration=1200,
        loop=0,
        disposal=2,
    )
    print("saved", PREV / "bug_left_butt_final.png")


if __name__ == "__main__":
    main()
