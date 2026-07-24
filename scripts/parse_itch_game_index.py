import re
from pathlib import Path

text = Path(__file__).resolve().parents[1] / "itch-game-index.html"
if not text.exists():
    raise SystemExit("missing itch-game-index.html")
content = text.read_text(encoding="utf-8", errors="ignore")

print("--- quoted build paths ---")
for m in re.findall(r'["\']([^"\']+)["\']', content):
    low = m.lower()
    if any(k in low for k in ("build/", ".br", "wasm", "loader", "framework", "template")):
        print(m)

print("\n--- dataUrl / config ---")
for pat in (r"dataUrl\s*:\s*['\"]([^'\"]+)", r"frameworkUrl\s*:\s*['\"]([^'\"]+)", r"codeUrl\s*:\s*['\"]([^'\"]+)"):
    for m in re.findall(pat, content):
        print(m)
