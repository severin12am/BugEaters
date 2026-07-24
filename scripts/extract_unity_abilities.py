"""Parse Unity project for ability pickups and spawner config."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(r"D:\full unity bug eaters")
ABILITIES = ROOT / "Assets" / "Prefab" / "Special" / "Abilities"


def read_prefab_fields(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    fields: dict[str, str] = {}
    for key in (
        "coroutineName",
        "abilityName",
        "abilityDescription",
        "param",
        "m_Sprite",
    ):
        m = re.search(rf"{key}: (.+)", text)
        if m:
            fields[key] = m.group(1).strip()
    return fields


def guid_to_texture(guid: str) -> str | None:
    for meta in (ROOT / "Assets").rglob("*.meta"):
        try:
            t = meta.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if re.search(rf"^guid: {re.escape(guid)}", t, re.M):
            asset = meta.with_suffix("")
            if asset.suffix.lower() in {".png", ".jpg"}:
                return str(asset.relative_to(ROOT))
            return str(asset.relative_to(ROOT))
    return None


def main() -> None:
    print("=== Ability pickups (Assets/Prefab/Special/Abilities) ===\n")
    rows = []
    for prefab in sorted(ABILITIES.glob("*.prefab")):
        f = read_prefab_fields(prefab)
        sprite_guid = None
        m = re.search(r"guid: ([a-f0-9]+)", f.get("m_Sprite", ""))
        if m:
            sprite_guid = m.group(1)
        tex = guid_to_texture(sprite_guid) if sprite_guid else None
        rows.append(
            (
                prefab.name,
                f.get("coroutineName", ""),
                f.get("param", ""),
                f.get("abilityName", ""),
                f.get("abilityDescription", ""),
                tex or "",
            )
        )

    for row in rows:
        print(f"• {row[0]}")
        print(f"  coroutine: {row[1]} | param: {row[2]}")
        print(f"  name: {row[3]}")
        print(f"  desc: {row[4]}")
        print(f"  sprite: {row[5]}")
        print()

    print(f"Total ability prefabs: {len(rows)}")

    scene = ROOT / "Assets" / "Scenes" / "Game.unity"
    text = scene.read_text(encoding="utf-8", errors="ignore")
    print("\n=== Ability spawner lists (forObstacles: 0) ===\n")
    blocks = re.split(r"forObstacles: (\d)", text)
    for i in range(1, len(blocks), 2):
        flag = blocks[i]
        chunk = blocks[i + 1][:1200]
        if flag != "0":
            continue
        guids = re.findall(
            r"guid: ([a-f0-9]{32})", chunk.split("spawnPosition:")[0]
        )
        if not guids:
            continue
        min_m = re.search(r"minT: ([\d.]+)", chunk)
        max_m = re.search(r"maxT: ([\d.]+)", chunk)
        print(
            f"spawn interval {min_m.group(1) if min_m else '?'}–"
            f"{max_m.group(1) if max_m else '?'}s, {len(guids)} types:"
        )
        for g in guids:
            name = None
            for meta in (ROOT / "Assets").rglob("*.meta"):
                try:
                    mt = meta.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
                if re.search(rf"^guid: {g}", mt, re.M):
                    name = meta.parent.name + "/" + meta.stem
                    break
            print(f"  - {name or g}")
        print()


if __name__ == "__main__":
    main()
