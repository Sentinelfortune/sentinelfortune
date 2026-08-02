#!/usr/bin/env python3
"""
Render the SFL-AIOPS-001 product cover.

Deterministic and reproducible: no stock imagery, no network, no fonts beyond
what ships with the system. Re-running produces a byte-identical file, so the
cover is source-controlled by its generator rather than by a binary blob
somebody has to remember how to recreate.

Design constraints come from the shop-readiness requirement, not from a
branding exercise:
  - readable as a catalogue thumbnail at ~320 px wide;
  - high contrast between text and background;
  - title and edition legible;
  - no clipping — every string is measured and wrapped, never truncated;
  - no badge, certification, award, rating or vendor logo of any kind;
  - no number that could read as a claim.

Output: product-source/SFL-AIOPS-001/assets/cover.png  (1600x1200, 4:3)

Usage:  python3 scripts/build_cover_aiops.py
"""

import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = REPO / "product-source" / "SFL-AIOPS-001" / "assets" / "cover.png"

W, H = 1600, 1200

NAVY = (14, 26, 51)
NAVY_DEEP = (9, 17, 34)
PAPER = (247, 245, 241)
PAPER_EDGE = (226, 222, 214)
GOLD = (196, 165, 90)
GOLD_DIM = (154, 127, 46)
INK = (14, 26, 51)
GREY = (74, 84, 104)
MUTED = (139, 151, 173)

SERIF_B = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SANS_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def text_w(draw, s, f, tracking=0):
    if not tracking:
        return draw.textlength(s, font=f)
    return sum(draw.textlength(c, font=f) + tracking for c in s) - tracking


def draw_tracked(draw, xy, s, f, fill, tracking):
    """Letter-spaced text. PIL has no tracking, so glyphs are placed manually."""
    x, y = xy
    for c in s:
        draw.text((x, y), c, font=f, fill=fill)
        x += draw.textlength(c, font=f) + tracking


def wrap(draw, s, f, max_w):
    """Greedy wrap. Never truncates — a too-long word gets its own line."""
    words, lines, cur = s.split(), [], ""
    for word in words:
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=f) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def main():
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)

    # Background: a soft vertical gradient, deep at the edges. Flat navy reads
    # as cheap at thumbnail size; the gradient gives depth without noise.
    for y in range(H):
        t = abs((y / H) - 0.42) * 2
        t = min(t, 1.0)
        d.line(
            [(0, y), (W, y)],
            fill=tuple(int(NAVY[i] + (NAVY_DEEP[i] - NAVY[i]) * (t ** 1.6)) for i in range(3)),
        )

    # Hairline gold frame, inset. Restraint: one line, not a border treatment.
    d.rectangle([54, 54, W - 55, H - 55], outline=(46, 62, 96), width=2)

    # --- Document panel -----------------------------------------------------
    px0, py0, px1, py1 = 150, 232, W - 150, H - 232
    d.rectangle([px0 + 10, py0 + 14, px1 + 10, py1 + 14], fill=(7, 14, 28))   # shadow
    d.rectangle([px0, py0, px1, py1], fill=PAPER, outline=PAPER_EDGE, width=2)
    d.rectangle([px0, py0, px0 + 14, py1], fill=GOLD)                         # spine

    inner_l = px0 + 84
    inner_r = px1 - 84
    inner_w = inner_r - inner_l

    # --- Eyebrow ------------------------------------------------------------
    f_eyebrow = font(SANS_B, 26)
    draw_tracked(d, (inner_l, py0 + 74), "SENTINEL FORTUNE LLC", f_eyebrow, GOLD_DIM, 5.5)

    rule_y = py0 + 128
    d.line([(inner_l, rule_y), (inner_l + 150, rule_y)], fill=GOLD, width=4)

    # --- Title (measured, wrapped, never clipped) ---------------------------
    title = "AI Operations Playbook & Toolkit"
    size = 92
    while size > 48:
        f_title = font(SERIF_B, size)
        lines = wrap(d, title, f_title, inner_w)
        if len(lines) <= 2 and all(d.textlength(l, font=f_title) <= inner_w for l in lines):
            break
        size -= 4
    f_title = font(SERIF_B, size)
    lines = wrap(d, title, f_title, inner_w)

    y = rule_y + 54
    for line in lines:
        d.text((inner_l, y), line, font=f_title, fill=INK)
        y += int(size * 1.22)

    # --- Edition ------------------------------------------------------------
    y += 16
    f_ed = font(SERIF, 40)
    for line in wrap(d, "Standard Self-Customization Edition", f_ed, inner_w):
        d.text((inner_l, y), line, font=f_ed, fill=GREY)
        y += 52

    # --- Divider ------------------------------------------------------------
    y += 34
    d.line([(inner_l, y), (inner_r, y)], fill=PAPER_EDGE, width=2)
    y += 40

    # --- Audience -----------------------------------------------------------
    f_aud = font(SANS, 31)
    for line in wrap(d, "For HVAC, Plumbing, Electrical & Home-Service Businesses", f_aud, inner_w):
        d.text((inner_l, y), line, font=f_aud, fill=GREY)
        y += 44

    # --- Footer row inside the panel ---------------------------------------
    f_meta = font(SANS_B, 23)
    meta_y = py1 - 78
    draw_tracked(d, (inner_l, meta_y), "VERSION 1.0", f_meta, MUTED, 3.5)

    right = "SINGLE BUSINESS LICENCE"
    rw = text_w(d, right, f_meta, 3.5)
    draw_tracked(d, (inner_r - rw, meta_y), right, f_meta, MUTED, 3.5)

    # Sanity: nothing may overlap the panel footer.
    if y > meta_y - 24:
        print(f"ERROR: content overruns the panel footer (y={y}, limit={meta_y - 24}).", file=sys.stderr)
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT.relative_to(REPO)}  ({OUT.stat().st_size:,} bytes, {W}x{H})")

    # Thumbnail legibility proof: the title must still be readable at catalogue size.
    thumb = img.resize((320, 240), Image.LANCZOS)
    tp = OUT.parent / "cover-thumbnail-check.png"
    thumb.save(tp, "PNG", optimize=True)
    print(f"Wrote {tp.relative_to(REPO)}  (320x240 legibility check, not shipped)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
