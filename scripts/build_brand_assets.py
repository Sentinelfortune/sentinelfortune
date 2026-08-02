#!/usr/bin/env python3
"""
Derive the public web image set from the real Sentinel Fortune brand mark.

The source of truth is the 1024x1024 gold-on-navy SF monogram already in the
repository. It is 2.2 MB, which is unusable on a web page: the homepage
displays it at 150 px, so shipping the original wastes roughly 2.1 MB of a
visitor's bandwidth for pixels they never see.

This script emits a small responsive set plus a favicon. Nothing here invents
imagery — every output is a resampling of the existing brand file. Re-running
is idempotent.

Source : artifacts/sentinel-app/public/assets/branding/sf-logo.png
Outputs: assets/img/sf-logo-{512,256,128}.png  (+ .webp)
         assets/img/sf-og.jpg                  (1200x630 social card)
         assets/img/favicon-{32,180}.png

Usage: python3 scripts/build_brand_assets.py
"""

import pathlib
import sys

from PIL import Image

REPO = pathlib.Path(__file__).resolve().parent.parent
SRC = REPO / "artifacts" / "sentinel-app" / "public" / "assets" / "branding" / "sf-logo.png"
OUT = REPO / "assets" / "img"

# Sampled from the source file's background so generated padding matches the
# mark instead of sitting on an obvious rectangle of a different navy.
NAVY = (18, 27, 44)

# PNG is the compatibility fallback only, so it is generated at the two sizes
# the pages actually request. WebP additionally carries 512 for retina heroes —
# at 37 KB it is affordable where the equivalent PNG (423 KB) is not.
PNG_SIZES = [256, 128]
WEBP_EXTRA = [512]
FAVICON_SIZES = [32, 180]
OG_W, OG_H = 1200, 630


def main() -> int:
    if not SRC.exists():
        print(f"ERROR: brand source missing: {SRC.relative_to(REPO)}", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGB")
    written = []

    for size in PNG_SIZES:
        img = src.resize((size, size), Image.LANCZOS)
        p = OUT / f"sf-logo-{size}.png"
        img.save(p, "PNG", optimize=True)
        written.append(p)
        w = OUT / f"sf-logo-{size}.webp"
        img.save(w, "WEBP", quality=88, method=6)
        written.append(w)

    for size in WEBP_EXTRA:
        w = OUT / f"sf-logo-{size}.webp"
        src.resize((size, size), Image.LANCZOS).save(w, "WEBP", quality=88, method=6)
        written.append(w)

    for size in FAVICON_SIZES:
        p = OUT / f"favicon-{size}.png"
        src.resize((size, size), Image.LANCZOS).save(p, "PNG", optimize=True)
        written.append(p)

    # Social card. The mark is square and the card is 1.91:1, so the mark is
    # centred on brand navy rather than stretched — a distorted logo is worse
    # than letterboxing.
    card = Image.new("RGB", (OG_W, OG_H), NAVY)
    mark = src.resize((int(OG_H * 0.74), int(OG_H * 0.74)), Image.LANCZOS)
    card.paste(mark, ((OG_W - mark.width) // 2, (OG_H - mark.height) // 2))
    og = OUT / "sf-og.jpg"
    card.save(og, "JPEG", quality=86, optimize=True, progressive=True)
    written.append(og)

    total = 0
    for p in written:
        n = p.stat().st_size
        total += n
        print(f"  {p.relative_to(REPO)}  {n:,} bytes")
    print(f"\nSource {SRC.stat().st_size:,} bytes -> {len(written)} public assets, {total:,} bytes total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
