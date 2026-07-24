#!/usr/bin/env python3
"""Measure horizontal center drift across extracted bug walk frames."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

FRAMES_DIR = Path(__file__).resolve().parents[1] / "assets" / "reference" / "previews" / "chatgpt_bug_sheet_v2"


def frame_stats(path: Path) -> dict:
    arr = np.array(Image.open(path).convert("RGBA"))
    mask = arr[:, :, 3] > 10
    ys, xs = np.where(mask)
    h = arr.shape[0]
    body_mask = mask[int(h * 0.25) : int(h * 0.65), :]
    bys, bxs = np.where(body_mask)

    cx = float(xs.mean())
    bcx = float(bxs.mean()) if len(bxs) else cx
    return {
        "file": path.name,
        "img_w": arr.shape[1],
        "content_w": int(xs.max() - xs.min() + 1),
        "cx": cx,
        "body_cx": bcx,
        "cx_ratio": cx / arr.shape[1],
        "left": int(xs.min()),
        "right": int(xs.max()),
    }


def main() -> None:
    stats = [frame_stats(FRAMES_DIR / f"{i:02d}.png") for i in range(1, 9)]
    body_cxs = [s["body_cx"] for s in stats]
    delta = max(body_cxs) - min(body_cxs)

    print("Frame horizontal centers (body band, crop-local coords):")
    for s in stats:
        drift = s["body_cx"] - np.mean(body_cxs)
        print(
            f"  {s['file']}: body_cx={s['body_cx']:6.1f}  "
            f"full_cx={s['cx']:6.1f}  width={s['content_w']:3d}  "
            f"drift={drift:+6.1f}px"
        )

    worst = max(stats, key=lambda s: abs(s["body_cx"] - np.mean(body_cxs)))
    print(f"\nBody center spread: {delta:.1f}px")
    print(f"Worst offender: {worst['file']} (body_cx={worst['body_cx']:.1f})")


if __name__ == "__main__":
    main()
