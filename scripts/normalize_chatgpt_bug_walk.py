#!/usr/bin/env python3
"""Normalize ChatGPT bug walk: visible outline butt anchored + constant body size."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(
    r"C:\Users\sever\.cursor\projects\d-BE\assets"
    r"\c__Users_sever_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"4f131a3e43f0448bdf2e5c9c916ed62b_images_ChatGPT_Image_Jul_19__2026__03_11_18_PM"
    r"-cc687e76-23e9-4318-95d6-255a7404fc97.png"
)
OUT_DIR = ROOT / "assets" / "experiments" / "bug_v2" / "chatgpt_walk"
PREV = ROOT / "assets" / "reference" / "previews"

TW, TH = 360, 420
FIXED_TIP = 340  # visible butt outline lands here
FIXED_CX = TW // 2


def load_cell(sheet: np.ndarray, idx: int) -> np.ndarray:
    h, w = sheet.shape[:2]
    cw, ch = w // 4, h // 2
    r, c = (0, idx) if idx < 4 else (1, idx - 4)
    cell = sheet[r * ch : (r + 1) * ch, c * cw : (c + 1) * cw].copy()
    cell[0:42, 0:48] = 48
    return cell


def to_rgba(cell: np.ndarray) -> np.ndarray:
    lum = 0.299 * cell[:, :, 0] + 0.587 * cell[:, :, 1] + 0.114 * cell[:, :, 2]
    out = np.zeros_like(cell)
    white = lum > 140
    black = lum < 30
    out[white, 0:3] = 255
    out[white, 3] = 255
    out[black & ~white, 0:3] = 0
    out[black & ~white, 3] = 255
    op = out[:, :, 3] > 40
    lab, n = ndimage.label(op)
    if n:
        sizes = ndimage.sum(op, lab, range(1, n + 1))
        keep = lab == (int(np.argmax(sizes)) + 1)
        out[~keep] = 0
    else:
        keep = op
    op = out[:, :, 3] > 40
    filled = ndimage.binary_fill_holes(op)
    out[filled & ~op, 0:3] = 0
    out[filled & ~op, 3] = 255
    out[white & keep, 0:3] = 255
    out[white & keep, 3] = 255
    return out


def outline_tip_y(a: np.ndarray) -> int:
    """Lowest Y where white outline is wide on both sides of center = visible butt."""
    h, w = a.shape[:2]
    x0, x1 = int(w * 0.42), int(w * 0.58)
    cx = (x0 + x1) // 2
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    white = (a[:, :, 3] > 40) & (lum > 140)
    for y in range(h - 1, int(h * 0.4), -1):
        if white[y, x0:cx].sum() >= 2 and white[y, cx:x1].sum() >= 2:
            return int(y)
    ys = np.where(white[:, x0:x1].any(axis=1))[0]
    return int(ys.max()) if len(ys) else h // 2


def outline_head_y(a: np.ndarray) -> int:
    """Top of head/eyes (ignore long antennae): first wide white band in upper body."""
    h, w = a.shape[:2]
    x0, x1 = int(w * 0.40), int(w * 0.60)
    cx = (x0 + x1) // 2
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    white = (a[:, :, 3] > 40) & (lum > 140)
    # scan from top; skip thin antennae (need left+right)
    for y in range(0, int(h * 0.55)):
        if white[y, x0:cx].sum() >= 2 and white[y, cx:x1].sum() >= 2:
            return int(y)
    ys = np.where(a[:, :, 3] > 40)[0]
    return int(ys.min()) if len(ys) else 0


def body_width(a: np.ndarray) -> int:
    tip = outline_tip_y(a)
    head = outline_head_y(a)
    mid = (tip + head) // 2
    h, w = a.shape[:2]
    x0, x1 = int(w * 0.25), int(w * 0.75)
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    white = (a[:, :, 3] > 40) & (lum > 140)
    row = white[mid, x0:x1]
    if not row.any():
        return 0
    xs = np.where(row)[0]
    return int(xs.max() - xs.min() + 1)


def clean(a: np.ndarray) -> np.ndarray:
    out = a.copy()
    tip = outline_tip_y(out)
    h, w = out.shape[:2]
    x0, x1 = int(w * 0.38), int(w * 0.62)
    # wipe junk below visible butt in center (stray lines under tip)
    if tip + 1 < h:
        out[tip + 1 : h, x0:x1] = 0
    # remove thorax cross-bars
    cx0, cx1 = int(w * 0.46), int(w * 0.54)
    mid = (cx0 + cx1) // 2
    for y in range(int(h * 0.25), int(h * 0.55)):
        row = out[y, cx0:cx1]
        lum = 0.299 * row[:, 0] + 0.587 * row[:, 1] + 0.114 * row[:, 2]
        wh = (row[:, 3] > 40) & (lum > 140)
        if wh.sum() >= 3:
            xs = np.where(wh)[0]
            if len(xs) and xs.max() - xs.min() >= 4:
                below = out[y + 1 : min(h, y + 8), mid, 3] > 40
                above = out[max(0, y - 8) : y, mid, 3] > 40
                if below.sum() <= 2 or above.sum() <= 2:
                    for xi in range(cx0, cx1):
                        if abs(xi - mid) > 1:
                            out[y, xi] = 0
    return out


def main() -> None:
    sheet = np.array(Image.open(SRC).convert("RGBA"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PREV.mkdir(parents=True, exist_ok=True)

    raws: list[np.ndarray] = []
    print("SOURCE visible outline metrics:")
    for i in range(8):
        a = clean(to_rgba(load_cell(sheet, i)))
        a = clean(a)
        tip = outline_tip_y(a)
        head = outline_head_y(a)
        bw = body_width(a)
        raws.append(a)
        print(f"  F{i+1}: outline_tip={tip} head={head} len={tip-head} width={bw}")

    target_len = outline_tip_y(raws[0]) - outline_head_y(raws[0])
    target_w = body_width(raws[0])
    print(f"TARGET len={target_len} width={target_w} (frame 1)")

    try:
        font = ImageFont.truetype("arial.ttf", 36)
        font_sm = ImageFont.truetype("arial.ttf", 22)
    except Exception:
        font = ImageFont.load_default()
        font_sm = font

    views: list[Image.Image] = []
    for i, a in enumerate(raws):
        tip = outline_tip_y(a)
        head = outline_head_y(a)
        bw = body_width(a)
        cur_len = max(1, tip - head)
        scale = ((target_len / cur_len) + (target_w / max(1, bw))) / 2.0

        ys, xs = np.where(a[:, :, 3] > 40)
        pad = 8
        crop = Image.fromarray(a, "RGBA").crop(
            (
                max(0, int(xs.min()) - pad),
                max(0, int(ys.min()) - pad),
                min(a.shape[1], int(xs.max()) + pad + 1),
                min(a.shape[0], int(ys.max()) + pad + 1),
            )
        )
        # tip relative to crop
        tip_local = tip - max(0, int(ys.min()) - pad)
        nw = max(1, int(round(crop.width * scale)))
        nh = max(1, int(round(crop.height * scale)))
        scaled = crop.resize((nw, nh), Image.Resampling.LANCZOS)
        sa = np.array(scaled)

        tip_s = outline_tip_y(sa)
        # horizontal center from body mid row
        mid = (outline_head_y(sa) + tip_s) // 2
        lum = 0.299 * sa[:, :, 0] + 0.587 * sa[:, :, 1] + 0.114 * sa[:, :, 2]
        white = (sa[:, :, 3] > 40) & (lum > 140)
        row = white[mid]
        if row.any():
            rxs = np.where(row)[0]
            cx = float((rxs.min() + rxs.max()) / 2)
        else:
            cx = nw / 2.0

        dx = int(round(FIXED_CX - cx))
        dy = FIXED_TIP - tip_s
        canvas = Image.new("RGBA", (TW, TH), (0, 0, 0, 0))
        canvas.alpha_composite(scaled, (dx, dy))

        # exact tip nudge
        ca = np.array(canvas)
        t2 = outline_tip_y(ca)
        if t2 != FIXED_TIP:
            nudged = Image.new("RGBA", (TW, TH), (0, 0, 0, 0))
            nudged.alpha_composite(canvas, (0, FIXED_TIP - t2))
            canvas = nudged
            ca = np.array(canvas)
            t2 = outline_tip_y(ca)

        h2 = outline_head_y(ca)
        print(
            f"  out F{i+1}: tip={t2} head={h2} len={t2-h2} width={body_width(ca)} scale={scale:.3f}"
        )
        canvas.save(OUT_DIR / f"{i+1:02d}.png")

        view = Image.new("RGBA", (TW, TH + 52), (12, 12, 12, 255))
        view.alpha_composite(canvas, (0, 44))
        d = ImageDraw.Draw(view)
        d.rectangle((8, 8, 155, 40), fill=(30, 30, 30, 255))
        d.text((14, 10), f"FRAME {i+1}", fill=(255, 220, 80, 255), font=font_sm)
        d.text((TW - 48, TH + 10), str(i + 1), fill=(255, 255, 255, 255), font=font)
        d.line([(0, 44 + FIXED_TIP), (TW, 44 + FIXED_TIP)], fill=(0, 220, 80, 255), width=2)
        # red butt mark
        d.ellipse((FIXED_CX - 4, 44 + FIXED_TIP - 4, FIXED_CX + 4, 44 + FIXED_TIP + 4), fill=(255, 60, 60, 255))
        views.append(view)
        view.save(OUT_DIR / f"{i+1:02d}_labeled.png")

    # Anchor check strip
    strip = Image.new("RGBA", (TW * 8, TH + 40), (12, 12, 12, 255))
    d = ImageDraw.Draw(strip)
    for i in range(8):
        a = np.array(Image.open(OUT_DIR / f"{i+1:02d}.png").convert("RGBA"))
        panel = Image.new("RGBA", (TW, TH), (8, 8, 8, 255))
        panel.alpha_composite(Image.fromarray(a, "RGBA"))
        pd = ImageDraw.Draw(panel)
        tip = outline_tip_y(a)
        pd.line([(0, tip), (TW, tip)], fill=(0, 220, 80, 255), width=2)
        pd.ellipse((FIXED_CX - 4, tip - 4, FIXED_CX + 4, tip + 4), fill=(255, 60, 60, 255))
        strip.alpha_composite(panel, (i * TW, 30))
        d.text((i * TW + 8, 6), f"F{i+1} tip={tip}", fill=(255, 220, 80, 255))
    strip.save(PREV / "bug_butt_anchor_check.png")

    imgs = [v.convert("P", palette=Image.Palette.ADAPTIVE, colors=64) for v in views]
    gif = PREV / "bug_chatgpt_walk_REVIEW.gif"
    imgs[0].save(gif, save_all=True, append_images=imgs[1:], duration=1200, loop=0, disposal=2)
    review_strip = Image.new("RGBA", (TW * 8, TH + 52), (12, 12, 12, 255))
    for i, v in enumerate(views):
        review_strip.alpha_composite(v, (i * TW, 0))
    review_strip.save(PREV / "bug_chatgpt_walk_REVIEW_strip.png")
    print("GIF:", gif)
    print("Check:", PREV / "bug_butt_anchor_check.png")


if __name__ == "__main__":
    main()
