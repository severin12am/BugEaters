import re
from pathlib import Path

html = Path(__file__).resolve().parents[1] / "itch-bugeaters.html"
text = html.read_text(encoding="utf-8", errors="ignore")

for key in ("html_classic", "itch.zone", "TheBugEaters", "wasm", ".br", "loader.js", "game_id"):
    idx = text.find(key)
    if idx >= 0:
        print(f"\n--- {key} @ {idx} ---")
        print(text[max(0, idx - 80) : idx + 200])

urls = sorted(set(re.findall(r"https://[^\s\"'<>\\]+", text)))
print("\n--- relevant urls ---")
for u in urls:
    if any(k in u for k in ("itch.zone", "html-classic", "Build", "wasm", "unity")):
        print(u)
