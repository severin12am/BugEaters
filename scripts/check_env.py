"""Quick env check for UnityPy, brotli, Pillow."""
import sys
print("Python:", sys.executable)
print("Version:", sys.version)

mods = ["UnityPy", "brotli", "PIL", "PIL.Image"]
for m in mods:
    try:
        mod = __import__(m.split(".")[0])
        ver = getattr(mod, "__version__", "no __version__")
        print(f"  {m}: OK ({ver})")
    except Exception as e:
        print(f"  {m}: MISSING ({e})")

# Also check if we can import from the audio script style
try:
    import brotli
    import UnityPy
    print("Core deps importable: SUCCESS")
except Exception as e:
    print("Core deps importable: FAIL", e)
