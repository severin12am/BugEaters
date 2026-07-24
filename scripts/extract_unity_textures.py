"""Extract Texture2D and Sprite (walk cycle frames) from Unity WebGL bundle.

Focus: bug (таракан1..10), human (чел1..6), klaus (клаус1..5) walk cycles.
Exports:
- Full textures for the character sheets to reference/unity/...
- Cropped sprite frames as individual PNGs named 01.png etc to reference/unity/bug/ (and siblings)
- Also raw named exports for debugging.

Per BUG_ANIMATION_BRIEF.md Step 0.
"""
from __future__ import annotations

import re
import struct
from pathlib import Path
from collections import defaultdict

import brotli
import UnityPy
from PIL import Image

DATA_PATH = Path(__file__).resolve().parents[1] / "old_unity_game" / "Build" / "TheBugEaters.data.br"
REF_ROOT = Path(__file__).resolve().parents[1] / "assets" / "reference" / "unity"

# Map Russian sprite stem -> (output subdir, frame count, frame name map)
CHARACTER_MAP = {
    "таракан": ("bug", 10, lambda n: f"{int(re.search(r'(\d+)', n).group(1)):02d}.png"),
    "чел": ("human", 6, lambda n: f"{int(re.search(r'(\d+)', n).group(1)):02d}.png"),
    "клаус": ("klaus", 5, lambda n: f"{int(re.search(r'(\d+)', n).group(1)):02d}.png"),
}

def load_bundle_files(data_path: Path) -> dict[str, bytes]:
    raw = brotli.decompress(data_path.read_bytes())
    magic = b"UnityWebData1.0\x00"
    if not raw.startswith(magic):
        raise ValueError("Unexpected Unity WebGL header")
    off = len(magic)
    end = struct.unpack_from("<I", raw, off)[0]
    off += 4
    files: dict[str, bytes] = {}
    while off < end:
        offset = struct.unpack_from("<I", raw, off)[0]
        off += 4
        size = struct.unpack_from("<I", raw, off)[0]
        off += 4
        path_len = struct.unpack_from("<I", raw, off)[0]
        off += 4
        path = raw[off : off + path_len].decode("utf-8", errors="replace")
        off += path_len
        files[path] = raw[offset : offset + size]
    return files

def get_sprite_texture_rect(data) -> tuple[int, int, int, int] | None:
    """Return (x, y, w, h) in texture space for the sprite slice."""
    try:
        rd = getattr(data, "m_RD", None)
        if rd is None:
            return None
        # Common locations
        for attr in ("textureRect", "spriteRect", "rect"):
            r = getattr(rd, attr, None)
            if r:
                x = float(getattr(r, "x", 0) or 0)
                y = float(getattr(r, "y", 0) or 0)
                w = float(getattr(r, "width", 0) or getattr(r, "w", 0) or 0)
                h = float(getattr(r, "height", 0) or getattr(r, "h", 0) or 0)
                return (int(round(x)), int(round(y)), int(round(w)), int(round(h)))
        # Sometimes m_Rect on sprite data
        r = getattr(data, "m_Rect", None)
        if r:
            x = float(getattr(r, "x", 0) or 0)
            y = float(getattr(r, "y", 0) or 0)
            w = float(getattr(r, "width", 0) or getattr(r, "w", 0) or 0)
            h = float(getattr(r, "height", 0) or getattr(r, "h", 0) or 0)
            return (int(round(x)), int(round(y)), int(round(w)), int(round(h)))
    except Exception:
        pass
    return None

def extract_image_from_sprite(obj, data, textures_by_pid: dict[int, tuple[str, object]]) -> Image.Image | None:
    """Best effort to get the sliced RGBA image for a sprite."""
    # UnityPy Sprite often exposes .image directly (preferred)
    try:
        if hasattr(data, "image") and data.image is not None:
            img = data.image
            if isinstance(img, Image.Image):
                return img.convert("RGBA")
    except Exception:
        pass

    # Fallback: crop from full texture using rect
    rect = get_sprite_texture_rect(data)
    if not rect:
        return None
    x, y, w, h = rect
    if w <= 0 or h <= 0:
        return None

    tex_info = get_texture_for_sprite(data, textures_by_pid)
    if not tex_info:
        return None
    _, tex_data = tex_info
    try:
        full = tex_data.image
        if not isinstance(full, Image.Image):
            return None
        full = full.convert("RGBA")
        # Unity texture y is usually from bottom in rects? But in practice for sprites rect y is from top in many cases.
        # We crop and let visual check decide; common is y from top for these exports.
        # Clamp
        fx, fy = full.size
        x = max(0, min(x, fx-1))
        y = max(0, min(y, fy-1))
        x2 = max(x+1, min(x + w, fx))
        y2 = max(y+1, min(y + h, fy))
        cropped = full.crop((x, y, x2, y2))
        return cropped
    except Exception:
        return None

def get_texture_for_sprite(data, textures_by_pid: dict):
    try:
        rd = getattr(data, "m_RD", None)
        if rd:
            tex = getattr(rd, "texture", None)
            if tex and hasattr(tex, "path_id"):
                return textures_by_pid.get(tex.path_id)
            # sometimes direct
            if hasattr(rd, "texture") and hasattr(rd.texture, "read"):
                pass
    except Exception:
        pass
    # Fallback: match by name if sprite name == tex name
    return None

def main() -> None:
    REF_ROOT.mkdir(parents=True, exist_ok=True)
    print(f"Bundle: {DATA_PATH}")
    print(f"Reference out: {REF_ROOT}")

    bundle = load_bundle_files(DATA_PATH)
    env = UnityPy.Environment()
    for path, blob in bundle.items():
        env.load_file(blob, name=path)

    # Collect
    textures_by_pid: dict[int, tuple[str, object]] = {}
    sprites_by_name: dict[str, tuple[int, object]] = {}
    for obj in env.objects:
        if obj.type.name == "Texture2D":
            data = obj.read()
            name = getattr(data, "m_Name", None) or f"tex_{obj.path_id}"
            textures_by_pid[obj.path_id] = (name, data)
        elif obj.type.name == "Sprite":
            data = obj.read()
            name = getattr(data, "m_Name", None) or f"sprite_{obj.path_id}"
            sprites_by_name[name] = (obj.path_id, data)

    print(f"Loaded {len(textures_by_pid)} textures, {len(sprites_by_name)} sprites.")

    saved: list[str] = []

    # Export full textures for character ones (for reference)
    char_tex_names = set()
    for stem in CHARACTER_MAP:
        for sname in sprites_by_name:
            if sname.startswith(stem) or stem in sname:
                # find its tex
                pid, sdata = sprites_by_name[sname]
                tex = None
                try:
                    rd = getattr(sdata, "m_RD", None)
                    if rd:
                        tref = getattr(rd, "texture", None)
                        if tref and hasattr(tref, "path_id"):
                            tex = textures_by_pid.get(tref.path_id)
                except Exception:
                    pass
                if tex:
                    tname, tdata = tex
                    char_tex_names.add(tname)

    for tname in sorted(char_tex_names):
        for pid, (nm, tdata) in textures_by_pid.items():
            if nm == tname:
                try:
                    img = tdata.image
                    if img:
                        out_dir = REF_ROOT / "full_textures"
                        out_dir.mkdir(parents=True, exist_ok=True)
                        outp = out_dir / f"{sanitize(nm)}.png"
                        img.convert("RGBA").save(outp)
                        saved.append(str(outp))
                        print(f"  Saved full texture: {outp.name} {img.size}")
                except Exception as e:
                    print(f"  Could not save full tex {tname}: {e}")

    # Now per character walk frames
    for stem, (subdir, expected_count, namer) in CHARACTER_MAP.items():
        out_dir = REF_ROOT / subdir
        out_dir.mkdir(parents=True, exist_ok=True)

        # collect matching sprites in numeric order
        matches: list[tuple[int, str, Image.Image | None]] = []
        for sname, (pid, sdata) in sprites_by_name.items():
            m = re.search(rf"{re.escape(stem)}[\s_]*(\d+)", sname, re.I)
            if m:
                num = int(m.group(1))
                img = extract_image_from_sprite(None, sdata, textures_by_pid)
                matches.append((num, sname, img))

        matches.sort(key=lambda t: t[0])
        print(f"\n{stem}: found {len(matches)} frames (expect ~{expected_count})")
        for num, sname, img in matches:
            if img is None:
                print(f"  [{num}] {sname}: NO IMAGE EXTRACTED")
                continue
            fname = namer(sname) if callable(namer) else f"{num:02d}.png"
            # If namer uses the re inside, but we have num
            if stem == "таракан":
                fname = f"{num:02d}.png"
            elif stem == "чел":
                fname = f"{num:02d}.png"
            elif stem == "клаус":
                fname = f"{num:02d}.png"
            outp = out_dir / fname
            img.save(outp)
            saved.append(str(outp))
            print(f"  [{num}] {sname} -> {fname} {img.size}")

    # Also dump any other promising walk/run if missed (search names)
    print("\n--- Also exporting any other *walk* or *run* or numbered bug-like ---")
    # (left as future; for now the таракан* are the ones)

    print(f"\nDone. {len(saved)} files written under {REF_ROOT}")
    for s in sorted(saved)[:30]:
        print("  ", s)

def sanitize(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', "_", name).strip() or "unnamed"

if __name__ == "__main__":
    main()
