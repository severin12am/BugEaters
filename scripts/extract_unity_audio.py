"""Extract AudioClip assets from the Unity WebGL data bundle."""
from __future__ import annotations

import re
import struct
from pathlib import Path

import brotli
import UnityPy

DATA_PATH = Path(__file__).resolve().parents[1] / "old_unity_game" / "Build" / "TheBugEaters.data.br"
OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "assets" / "audio"

# Unity clip name -> web-safe filename (without extension).
EXPORT_NAMES: dict[str, str] = {
    "шаг_жук": "step_bug",
    "шаг_чел": "step_human",
    "walk_grass": "step_klaus",
    "ест_жука": "eat_bug",
    "ест_чела": "eat_human",
    "ест_клауса": "eat_klaus",
    "lamp buzz": "lamp_buzz",
    "did (1)": "did_1",
    "did (2)": "did_2",
    "force_behaviours (1)": "force_behaviours_1",
    "force_behaviours (2)": "force_behaviours_2",
    "force_behaviours (3)": "force_behaviours_3",
    "force_behaviours (4)": "force_behaviours_4",
    "force_behaviours (5)": "force_behaviours_5",
    "infinite_cash (1)": "infinite_cash_1",
    "infinite_cash (2)": "infinite_cash_2",
    "king (1)": "king_1",
    "king (2)": "king_2",
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


def export_name(unity_name: str, path_id: int) -> str:
    if unity_name in EXPORT_NAMES:
        return EXPORT_NAMES[unity_name]
    cleaned = re.sub(r'[<>:"/\\|?*]', "_", unity_name).strip()
    cleaned = re.sub(r"\s+", "_", cleaned)
    cleaned = re.sub(r"[()]", "", cleaned)
    return cleaned or f"clip_{path_id}"


def pick_blob(samples: dict) -> tuple[bytes, str]:
    for key, value in samples.items():
        if not isinstance(value, (bytes, bytearray)) or len(value) == 0:
            continue
        blob = bytes(value)
        key_lower = str(key).lower()
        if key_lower.endswith(".ogg") or "ogg" in key_lower:
            return blob, ".ogg"
        if key_lower.endswith(".mp3") or "mp3" in key_lower:
            return blob, ".mp3"
        if key_lower.endswith(".wav") or "wav" in key_lower:
            return blob, ".wav"
        return blob, ".wav"
    raise ValueError("No audio bytes in samples")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    bundle = load_bundle_files(DATA_PATH)
    env = UnityPy.Environment()
    for path, blob in bundle.items():
        env.load_file(blob, name=path)

    saved: list[tuple[str, str, int]] = []
    for obj in env.objects:
        if obj.type.name != "AudioClip":
            continue

        data = obj.read()
        name = getattr(data, "m_Name", None) or f"clip_{obj.path_id}"
        samples = getattr(data, "samples", None)
        if not samples:
            continue

        blob, ext = pick_blob(samples)
        out_path = OUT_DIR / f"{export_name(name, obj.path_id)}{ext}"
        out_path.write_bytes(blob)
        saved.append((name, out_path.name, len(blob)))

    print(f"Saved {len(saved)} clips to {OUT_DIR}")
    for name, filename, size in sorted(saved, key=lambda item: item[0].lower()):
        print(f"  {name} -> {filename} ({size} bytes)")


if __name__ == "__main__":
    main()
