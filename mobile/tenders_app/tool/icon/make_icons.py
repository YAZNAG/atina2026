"""Décline les originaux de `tool/icon/` (1024 × 1024) en icônes Android, iOS et web.

    flutter test --update-goldens tool/icon/icons_test.dart
    python3 tool/icon/make_icons.py

Nécessite Pillow (`pip install pillow`).
"""
import json
from pathlib import Path

from PIL import Image

ICON = Path(__file__).resolve().parent
APP = ICON.parent.parent


def master(name):
    return Image.open(ICON / f"{name}.png").convert("RGBA")


def save(img, size, path, opaque=False):
    out = img.resize((size, size), Image.LANCZOS)
    if opaque:
        # L'App Store refuse les icônes avec un canal alpha.
        out = out.convert("RGB")
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, optimize=True)


pleine, arrondie = master("pleine"), master("arrondie")
fond, avant, mono = master("fond"), master("avant"), master("monochrome")
masquable = master("masquable")

# Android : icône classique (48 dp) et calques de l'icône adaptative (108 dp).
res = APP / "android/app/src/main/res"
for density, factor in {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}.items():
    folder = res / f"mipmap-{density}"
    save(arrondie, round(48 * factor), folder / "ic_launcher.png")
    save(fond, round(108 * factor), folder / "ic_launcher_background.png")
    save(avant, round(108 * factor), folder / "ic_launcher_foreground.png")
    save(mono, round(108 * factor), folder / "ic_launcher_monochrome.png")

# iOS : toutes les tailles listées par Contents.json, sans transparence.
appicon = APP / "ios/Runner/Assets.xcassets/AppIcon.appiconset"
for image in json.loads((appicon / "Contents.json").read_text())["images"]:
    points = float(image["size"].split("x")[0])
    scale = int(image["scale"].rstrip("x"))
    save(pleine, round(points * scale), appicon / image["filename"], opaque=True)

# Web.
web = APP / "web"
save(arrondie, 32, web / "favicon.png")
save(arrondie, 192, web / "icons/Icon-192.png")
save(arrondie, 512, web / "icons/Icon-512.png")
save(masquable, 192, web / "icons/Icon-maskable-192.png")
save(masquable, 512, web / "icons/Icon-maskable-512.png")

# Fiche Play Store : 512 × 512, carré plein (Google arrondit lui-même).
save(pleine, 512, APP / "store/play-store-icon-512.png", opaque=True)
save(pleine, 1024, APP / "store/app-store-icon-1024.png", opaque=True)
print("Icônes générées.")
