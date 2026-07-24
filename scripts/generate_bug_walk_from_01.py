#!/usr/bin/env python3
"""
Build bug walk frames 01-10 from locked frame 01 (legacy art),
using mesh warp for leg scuttle + body bob. Writes comparison assets.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT / "assets" / "reference" / "bug_compare" / "legacy"
OUT = ROOT / "assets" / "reference" / "bug_compare" / "generated"
COMPARE = ROOT / "assets" / "reference" / "bug_compare"
OUT.mkdir(parents=True, exist_ok=True)

TARGET_W, TARGET_H = 620, 787
FEET_Y = 755
CENTER_X = TARGET_W // 2


def find_content_bbox(im: Image.Image, threshold: int = 16):
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    arr = np.asarray(im)
    a = arr[:, :, 3]
    rgb = arr[:, :, :3].astype(np.int32).sum(axis=2)
    mask = (a > 8) & (rgb > threshold * 3)
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def find_feet_y(im: Image.Image, bbox):
    arr = np.asarray(im.convert("RGBA"))
    minx, miny, maxx, maxy = bbox
    for y in range(maxy - 1, miny - 1, -1):
        row = arr[y, minx:maxx]
        bright = (row[:, 3] > 10) & (row[:, :3].sum(axis=1) > 180)
        if bright.sum() >= 3:
            return y
    return maxy - 5


def to_canvas(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    bbox = find_content_bbox(im)
    if not bbox:
        return Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))
    minx, miny, maxx, maxy = bbox
    feet_row = find_feet_y(im, bbox)
    margin = 8
    crop = im.crop(
        (
            max(0, minx - margin),
            max(0, miny - margin),
            min(im.width, maxx + margin),
            min(im.height, maxy + margin),
        )
    )
    target_content_h = 680
    scale = target_content_h / max(1, crop.height)
    if crop.width * scale > 560:
        scale = 560 / max(1, crop.width)
    new_w = max(1, int(round(crop.width * scale)))
    new_h = max(1, int(round(crop.height * scale)))
    resized = crop.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))
    feet_offset_in_crop = feet_row - miny + margin
    scaled_feet = int(round(feet_offset_in_crop * scale))
    dst_y = FEET_Y - scaled_feet
    dst_x = CENTER_X - new_w // 2
    canvas.paste(resized, (dst_x, dst_y), resized)
    return canvas


def mesh_warp(im: Image.Image, frame_i: int, n_frames: int = 10) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    cols, rows = 24, 32
    phase = 2 * math.pi * frame_i / n_frames
    contact = 0.5 * (1 + math.cos(2 * phase))
    amp = 1.0 - 0.55 * contact

    src_xs = np.linspace(0, w - 1, cols)
    src_ys = np.linspace(0, h - 1, rows)
    dst = np.zeros((rows, cols, 2), dtype=np.float64)
    cx = (w - 1) / 2.0

    for r in range(rows):
        ty = r / (rows - 1)
        for c in range(cols):
            tx = c / (cols - 1)
            x = src_xs[c]
            y = src_ys[r]

            bob = math.sin(phase) * 10 * amp + math.sin(2 * phase) * 3 * amp
            sway = math.sin(phase) * 8 * amp * (0.3 + 0.7 * (1 - ty))

            leg = max(0.0, (ty - 0.55) / 0.45)
            side = (tx - 0.5) * 2
            leg_swing = math.sin(phase + side * 0.9) * 22 * leg * amp
            leg_lift = max(0.0, math.sin(phase + side * 0.9 + math.pi / 2)) * 16 * leg * amp

            squash_y = math.sin(2 * phase) * 6 * amp * (1 - abs(tx - 0.5) * 0.5)
            head = max(0.0, 1.0 - ty / 0.22) if ty < 0.22 else 0.0
            ant = math.sin(phase * 1.7) * 10 * head * amp

            nx = x + sway + leg_swing + ant
            ny = y + bob - leg_lift + squash_y
            lean = math.sin(phase) * 0.04 * amp
            nx = cx + (nx - cx) * (1 + lean * (1 - ty) * 0.5) + lean * (h - y) * 0.15

            dst[r, c, 0] = nx
            dst[r, c, 1] = ny

    src_arr = np.asarray(im).astype(np.float64)

    try:
        from scipy.interpolate import griddata

        points = dst.reshape(-1, 2)
        values_x = np.repeat(src_xs[None, :], rows, axis=0).reshape(-1)
        values_y = np.repeat(src_ys[:, None], cols, axis=1).reshape(-1)
        grid_x, grid_y = np.meshgrid(np.arange(w), np.arange(h))
        src_x = griddata(points, values_x, (grid_x, grid_y), method="linear", fill_value=-1)
        src_y = griddata(points, values_y, (grid_x, grid_y), method="linear", fill_value=-1)
        mask = src_x < 0
        if mask.any():
            sx_n = griddata(points, values_x, (grid_x, grid_y), method="nearest")
            sy_n = griddata(points, values_y, (grid_x, grid_y), method="nearest")
            src_x = np.where(mask, sx_n, src_x)
            src_y = np.where(mask, sy_n, src_y)

        x0 = np.floor(src_x).astype(int)
        y0 = np.floor(src_y).astype(int)
        x1 = np.clip(x0 + 1, 0, w - 1)
        y1 = np.clip(y0 + 1, 0, h - 1)
        x0 = np.clip(x0, 0, w - 1)
        y0 = np.clip(y0, 0, h - 1)
        fx = (src_x - np.floor(src_x))[..., None]
        fy = (src_y - np.floor(src_y))[..., None]
        Ia = src_arr[y0, x0]
        Ib = src_arr[y0, x1]
        Ic = src_arr[y1, x0]
        Id = src_arr[y1, x1]
        out_arr = (
            Ia * (1 - fx) * (1 - fy)
            + Ib * fx * (1 - fy)
            + Ic * (1 - fx) * fy
            + Id * fx * fy
        )
        out_arr = np.clip(out_arr, 0, 255).astype(np.uint8)
        return Image.fromarray(out_arr, "RGBA")
    except ImportError:
        bob = int(round(math.sin(phase) * 12 * amp))
        shear = math.sin(phase) * 0.08 * amp
        cy = h / 2
        a, b, c = 1, shear, -shear * cy
        d, e, f = 0, 1, bob
        warped = im.transform(im.size, Image.AFFINE, (a, b, c, d, e, f), resample=Image.BICUBIC)
        arr = np.asarray(warped).copy()
        for y in range(int(h * 0.5), h):
            t = (y - h * 0.5) / (h * 0.5)
            shift = int(round(math.sin(phase + y * 0.05) * 14 * t * amp))
            if shift == 0:
                continue
            arr[y] = np.roll(arr[y], shift, axis=0)
            if shift > 0:
                arr[y, :shift] = 0
            else:
                arr[y, shift:] = 0
        return Image.fromarray(arr, "RGBA")


def make_gif(frames: list[Image.Image], path: Path, fps: int = 12) -> None:
    gif_frames = []
    for fr in frames:
        bg = Image.new("RGBA", fr.size, (8, 8, 8, 255))
        bg.alpha_composite(fr)
        gif_frames.append(bg.convert("P", palette=Image.ADAPTIVE, colors=64))
    gif_frames[0].save(
        path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=int(1000 / fps),
        loop=0,
        disposal=2,
    )


def make_strip(frames: list[Image.Image], path: Path) -> None:
    gap = 4
    cell_w = 120
    cell_h = int(cell_w * TARGET_H / TARGET_W)
    canvas = Image.new("RGBA", (cell_w * 10 + gap * 9 + 20, cell_h + 40), (8, 8, 8, 255))
    draw = ImageDraw.Draw(canvas)
    for i, fr in enumerate(frames):
        thumb = fr.resize((cell_w, cell_h), Image.LANCZOS)
        x = 10 + i * (cell_w + gap)
        canvas.paste(thumb, (x, 28), thumb)
        draw.text((x + 4, 8), f"{i + 1:02d}", fill=(180, 180, 180, 255))
    canvas.save(path)


def main() -> None:
    base = to_canvas(Image.open(LEGACY / "01.png"))

    frames: list[Image.Image] = []
    for i in range(10):
        if i == 0:
            fr = base.copy()
        else:
            fr = to_canvas(mesh_warp(base, i, 10))
        path = OUT / f"{i + 1:02d}.png"
        fr.save(path)
        frames.append(fr)
        print("wrote", path)

    make_gif(frames, COMPARE / "generated_walk.gif")
    print("gif", COMPARE / "generated_walk.gif")

    leg_list = [to_canvas(Image.open(LEGACY / f"{i:02d}.png")) for i in range(1, 11)]
    make_gif(leg_list, COMPARE / "legacy_walk.gif")
    print("gif", COMPARE / "legacy_walk.gif")

    make_strip(frames, COMPARE / "generated_strip.png")
    make_strip(leg_list, COMPARE / "legacy_strip.png")

    a = Image.open(COMPARE / "legacy_strip.png").convert("RGBA")
    b = Image.open(COMPARE / "generated_strip.png").convert("RGBA")
    w = max(a.width, b.width)
    h = a.height + b.height + 50
    big = Image.new("RGBA", (w, h), (8, 8, 8, 255))
    draw = ImageDraw.Draw(big)
    draw.text((10, 8), "LEGACY (current)", fill=(220, 220, 220, 255))
    big.paste(a, (0, 24), a)
    draw.text((10, a.height + 28), "GENERATED from 01 (mesh walk)", fill=(220, 220, 220, 255))
    big.paste(b, (0, a.height + 44), b)
    big_path = COMPARE / "legacy_vs_generated_strips.png"
    big.save(big_path)
    print("compare", big_path)
    print("DONE")


if __name__ == "__main__":
    main()
