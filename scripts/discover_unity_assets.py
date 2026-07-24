"""Discover Texture2D and Sprite assets in the Unity bundle. Focus on finding bug walk/run cycle frames."""
from __future__ import annotations

from pathlib import Path
import brotli
import struct
from collections import defaultdict
import UnityPy
from PIL import Image

DATA_PATH = Path(__file__).resolve().parents[1] / "old_unity_game" / "Build" / "TheBugEaters.data.br"

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

def get_sprite_rect(data) -> tuple[int,int,int,int] | None:
    try:
        rd = getattr(data, "m_RD", None)
        if not rd:
            return None
        rect = getattr(rd, "textureRect", None) or getattr(rd, "spriteRect", None)
        if rect:
            # Unity rect is x,y,width,height ? or x,y,w,h float
            x = int(getattr(rect, "x", 0) or 0)
            y = int(getattr(rect, "y", 0) or 0)
            w = int(getattr(rect, "width", 0) or getattr(rect, "w", 0) or 0)
            h = int(getattr(rect, "height", 0) or getattr(rect, "h", 0) or 0)
            return (x, y, w, h)
    except Exception:
        pass
    return None

def get_texture_for_sprite(data, textures_by_pid: dict):
    try:
        rd = getattr(data, "m_RD", None)
        if rd:
            tex = getattr(rd, "texture", None)
            if tex and hasattr(tex, "path_id"):
                return textures_by_pid.get(tex.path_id)
    except Exception:
        pass
    return None

def main() -> None:
    print(f"Loading bundle: {DATA_PATH}")
    bundle = load_bundle_files(DATA_PATH)
    print(f"Embedded files in bundle: {len(bundle)}")

    env = UnityPy.Environment()
    for path, blob in bundle.items():
        env.load_file(blob, name=path)

    textures = {}
    sprites = []
    for obj in env.objects:
        if obj.type.name == "Texture2D":
            data = obj.read()
            name = getattr(data, "m_Name", None) or f"tex_{obj.path_id}"
            textures[obj.path_id] = (name, data, obj)
        elif obj.type.name == "Sprite":
            data = obj.read()
            name = getattr(data, "m_Name", None) or f"sprite_{obj.path_id}"
            sprites.append((name, obj.path_id, data))

    print(f"\nTotal Texture2D: {len(textures)}")
    print(f"Total Sprite: {len(sprites)}")

    # Build pid map
    textures_by_pid = {pid: (name, data) for pid, (name, data, _) in textures.items()}

    # List ALL sprite names (they are the sliced frames)
    print("\n=== ALL SPRITE NAMES (sorted) ===")
    for name, pid, _ in sorted(sprites, key=lambda x: x[0].lower()):
        print(f"  {name}")

    # Group sprites by base name stem (strip trailing numbers)
    import re
    groups: dict[str, list[tuple[str,int]]] = defaultdict(list)
    for name, pid, data in sprites:
        # strip trailing _N or N or numbers
        stem = re.sub(r'[\s_]*\d+$', '', name).strip()
        groups[stem].append((name, pid))

    print("\n=== Sprite groups by stem (potential anim sequences) ===")
    for stem, items in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        if len(items) >= 3:  # only show potential anims
            print(f"  [{len(items)}] {stem}: {[n for n,_ in items[:8]]}{'...' if len(items)>8 else ''}")

    # Find promising for bug: containing жук, таракан, cockroach, bug etc or small sized
    bug_keywords = ["жук", "таракан", "bug", "cockroach", "beetle", "насеком", "мелк"]
    print("\n=== Bug-related sprites (by name) ===")
    bug_sprites = []
    for name, pid, data in sprites:
        l = name.lower()
        if any(k in l for k in bug_keywords):
            bug_sprites.append((name, pid, data))
            rect = get_sprite_rect(data)
            tex = get_texture_for_sprite(data, textures_by_pid)
            tex_name = tex[0] if tex else "?"
            print(f"  Sprite '{name}' pid={pid} rect={rect} tex~{tex_name}")

    print(f"\nFound {len(bug_sprites)} bug-named sprites.")

    # Also look at all sprites' texture sizes to find character sized ones ~620x787 aspect
    print("\n=== Textures that have associated sprites (potential character sheets) ===")
    used_tex = set()
    for name, pid, data in sprites:
        tex = get_texture_for_sprite(data, textures_by_pid)
        if tex:
            used_tex.add(id(tex[1]))  # rough

    # Try to sample some texture dims
    print("\n=== Sample texture dims for non-system textures ===")
    count = 0
    for pid, (name, data, obj) in textures.items():
        lname = name.lower()
        if any(x in lname for x in ["ldr", "search", "falloff", "unity", "logo", "default"]):
            continue
        try:
            # UnityPy Texture2D can .image
            img = data.image  # should be PIL.Image
            if img:
                print(f"  Texture '{name}' pid={pid}: {img.size} mode={img.mode}")
                count += 1
                if count > 25:
                    break
        except Exception as e:
            print(f"  Texture '{name}' pid={pid}: (no image: {e})")

    # Specifically try to extract any жук or таракан textures fully if not per-sprite
    print("\n=== Attempt to find main character textures by eating ones + таракан ===")
    for name, pid, data in sprites:
        if "таракан" in name.lower() or "жук" in name.lower():
            tex = get_texture_for_sprite(data, textures_by_pid)
            if tex:
                tname, tdata = tex
                try:
                    img = tdata.image
                    if img:
                        print(f"  For sprite '{name}': texture '{tname}' size={img.size}")
                except Exception as e:
                    print(f"  For sprite '{name}': texture load err {e}")

if __name__ == "__main__":
    main()
