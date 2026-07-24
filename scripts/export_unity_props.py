"""Copy Unity ability prop sprites (Russian filenames) into public/assets/props/."""
from __future__ import annotations

import shutil
from pathlib import Path

UNITY_TEXTURES = Path(r"D:\full unity bug eaters\Assets\Textures")
OUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "props"

# Ability-only exports — core road props keep their tuned PNG sizes.
MAP = {
    "паспорт.png": "passport.png",
    "шприц.png": "syringe.png",
    "трубка.png": "paper-straw.png",
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for src_name, dest_name in MAP.items():
        src = UNITY_TEXTURES / src_name
        if not src.exists():
            raise FileNotFoundError(src)
        dest = OUT / dest_name
        shutil.copy2(src, dest)
        print(dest.name, dest.stat().st_size)


if __name__ == "__main__":
    main()
