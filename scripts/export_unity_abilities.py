"""Copy Unity ability briefcase sprites into public/assets."""
from __future__ import annotations

import shutil
from pathlib import Path

UNITY = Path(r"D:\full unity bug eaters\Assets\Textures\Abilities")
OUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "props" / "abilities"

# Unity prefab -> source PNG (from extract_unity_abilities.py)
MAP = {
    "disable-barriers": "чемодан1.png",
    "disable-obstacles": "чемодан14.png",
    "enable-id": "чемодан4.png",
    "flashlight": "чемодан7.png",
    "flight-mode": "чемодан13.png",
    "hell-mode": "чемодан9.png",
    "immortality": "чемодан17.png",
    "needle-spawner": "чемодан3.png",
    "pos-alignment": "чемодан10.png",
    "slowdown-other": "чемодан12.png",
    "speed-up": "чемодан8.png",
    "straw-spawner": "чемодан15.png",
}

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, src_name in MAP.items():
        src = UNITY / src_name
        if not src.exists():
            raise FileNotFoundError(src)
        dest = OUT / f"{slug}.png"
        shutil.copy2(src, dest)
        print(dest.name, dest.stat().st_size)

if __name__ == "__main__":
    main()
