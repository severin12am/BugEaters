"""Verify the bug walk assets per brief QA."""
from pathlib import Path
from PIL import Image

OUT_DIR = Path(r"D:\BE\public\assets\characters\bug")
PREVIEW_DIR = Path(r"D:\BE\assets\reference\previews")

def main():
    pngs = sorted(OUT_DIR.glob("*.png"))
    print(f"PNG count: {len(pngs)}")
    sizes = []
    has_alpha = []
    for p in pngs:
        im = Image.open(p)
        sizes.append(im.size)
        has_alpha.append("A" in im.mode or im.mode == "RGBA")
        # quick transparent check: sample a corner
        corner = im.getpixel((0, 0))
        is_trans = corner[3] == 0 if len(corner) > 3 else False
        print(f"  {p.name}: {im.size} mode={im.mode} corner_trans={is_trans}")
    print(f"All same size: {len(set(sizes)) == 1 and sizes and sizes[0] == (620, 787)}")
    print(f"All have alpha: {all(has_alpha)}")
    print(f"Previews: {list(PREVIEW_DIR.glob('*'))}")

if __name__ == "__main__":
    main()
