"""Inspect current bug PNG frames in public."""
from pathlib import Path
from PIL import Image

PUBLIC_BUG = Path(r"D:\BE\public\assets\characters\bug")

def main():
    frames = sorted(PUBLIC_BUG.glob("*.png"))
    print(f"Found {len(frames)} PNGs in {PUBLIC_BUG}")
    sizes = set()
    modes = set()
    for f in frames:
        im = Image.open(f)
        sizes.add(im.size)
        modes.add(im.mode)
        print(f"  {f.name}: {im.size} {im.mode} alpha={'A' in im.mode}")
    print(f"Unique sizes: {sizes}")
    print(f"Unique modes: {modes}")

if __name__ == "__main__":
    main()
