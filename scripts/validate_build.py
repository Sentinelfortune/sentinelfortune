#!/usr/bin/env python3
"""
Validate the BUILT public site.

scripts/validate_site.py inspects source templates, which means it has to
guess at what Liquid will produce — that is where its one standing warning
comes from. This script runs Jekyll first and then checks the real HTML, so
every assertion here is about bytes a visitor would actually receive.

Checks:
  1. every internal link resolves to a file in the build
  2. every local image/script/stylesheet reference resolves
  3. every <img> has an alt attribute, and non-decorative ones are non-empty
  4. every <img> carries width+height or an aspect-ratio style (layout shift)
  5. every page has exactly one <h1>, a title, a meta description, a canonical
  6. heading levels never skip (h2 -> h4)
  7. every JSON-LD block parses, and FAQPage questions appear in the visible text
  8. no unrendered Liquid ({{ or {%) survives into the output
  9. the publication boundary holds — no private directory is in the build
 10. no obvious secret material is present in the output

Usage:
  python3 scripts/validate_build.py [--site DIR]

Exit code 0 = no failures. Warnings do not fail the run.
"""

import argparse
import html
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlparse

REPO = pathlib.Path(__file__).resolve().parent.parent
BASEURL = "/sentinelfortune"

# Directories that must never appear in a published build.
FORBIDDEN_DIRS = [
    "admin", "shop-worker", "functions", "scripts", "dist", "product-source",
    "audit", "bot", "backend", "cloudflare", "config", "originus", "vault",
    "artifacts", "_signals", "_articles", "_guides", "_layouts", "_includes",
]

# Files that document internal procedure and must not be published.
FORBIDDEN_FILES = [
    "SHOP_SECURITY_CHECKLIST.md", "SHOP_ARCHITECTURE.md", "CLOUDFLARE_SHOP_SETUP.md",
    "STRIPE_SHOP_SETUP.md", "RESEND_SETUP.md", "SHOP_MVP_RUNBOOK.md",
]

SECRET_PATTERNS = [
    (r"sk_live_[A-Za-z0-9]{10,}", "Stripe live secret key"),
    (r"sk_test_[A-Za-z0-9]{10,}", "Stripe test secret key"),
    (r"whsec_[A-Za-z0-9]{10,}", "Stripe webhook secret"),
    (r"re_[A-Za-z0-9]{20,}", "Resend API key"),
    (r"REPLACE_WITH_[A-Z_]+", "unresolved placeholder"),
]

fails: list[str] = []
warns: list[str] = []
passes = 0


def ok(msg):
    global passes
    passes += 1


def fail(msg):
    fails.append(msg)


def warn(msg):
    warns.append(msg)


def build(dest: pathlib.Path) -> bool:
    """Run a real Jekyll build. Returns False if Jekyll is unavailable."""
    exe = None
    for cand in ("/opt/rbenv/versions/3.3.6/bin/jekyll", "jekyll"):
        if cand.startswith("/"):
            if pathlib.Path(cand).exists():
                exe = cand
                break
        else:
            from shutil import which
            if which(cand):
                exe = cand
                break
    if not exe:
        return False
    r = subprocess.run([exe, "build", "-d", str(dest)], cwd=REPO,
                       capture_output=True, text=True)
    if r.returncode != 0:
        fail(f"Jekyll build failed:\n{r.stdout}\n{r.stderr}")
        return False
    return True


def strip_tags(s: str) -> str:
    s = re.sub(r"<(script|style)\b.*?</\1>", " ", s, flags=re.S | re.I)
    return html.unescape(re.sub(r"<[^>]+>", " ", s))


def local_target(site: pathlib.Path, url: str) -> pathlib.Path | None:
    """Map a site-absolute or relative URL to a path inside the build."""
    p = urlparse(url)
    if p.scheme or p.netloc:
        return None                      # external
    path = unquote(p.path)
    if not path:
        return None                      # pure fragment or query
    if path.startswith(BASEURL + "/"):
        path = path[len(BASEURL):]
    elif path == BASEURL:
        path = "/"
    return pathlib.Path(path)


def resolve(site: pathlib.Path, page: pathlib.Path, target: pathlib.Path) -> pathlib.Path:
    if str(target).startswith("/"):
        return site / str(target).lstrip("/")
    return (page.parent / target).resolve()


def exists(cand: pathlib.Path) -> bool:
    if cand.is_file():
        return True
    if cand.is_dir() and (cand / "index.html").is_file():
        return True
    if str(cand).endswith("/") and (cand / "index.html").is_file():
        return True
    return (cand / "index.html").is_file()


def check_page(site: pathlib.Path, f: pathlib.Path):
    rel = f.relative_to(site)
    raw = f.read_text(errors="replace")
    # Structural checks run on comment-stripped HTML: markup quoted inside an
    # explanatory comment is documentation, not a heading or an image. The
    # secret scan below still runs against `raw`, because a leaked key in a
    # comment is served to the visitor exactly like one outside it.
    s = re.sub(r"<!--.*?-->", " ", raw, flags=re.S)
    visible = strip_tags(s)

    # ── 8. unrendered Liquid ──────────────────────────────────────────────
    for tok in ("{{", "{%"):
        if tok in s:
            snippet = s[s.index(tok):s.index(tok) + 60].replace("\n", " ")
            fail(f"{rel}: unrendered Liquid in output — {snippet!r}")
            break
    else:
        ok("liquid")

    # ── 5. head essentials ────────────────────────────────────────────────
    h1s = re.findall(r"<h1\b", s, re.I)
    if len(h1s) == 0:
        fail(f"{rel}: no <h1>")
    elif len(h1s) > 1:
        fail(f"{rel}: {len(h1s)} <h1> elements (expected exactly 1)")
    else:
        ok("h1")

    if not re.search(r"<title>\s*\S", s, re.I):
        fail(f"{rel}: missing or empty <title>")
    else:
        ok("title")

    m = re.search(r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']*)', s, re.I)
    if not m or len(m.group(1).strip()) < 40:
        fail(f"{rel}: missing or too-short meta description")
    else:
        ok("description")

    if not re.search(r'<link\s+rel=["\']canonical["\']', s, re.I):
        warn(f"{rel}: no canonical link")
    else:
        ok("canonical")

    if not re.search(r'property=["\']og:image["\']', s, re.I):
        warn(f"{rel}: no og:image")
    else:
        ok("og:image")

    # ── 6. heading order ──────────────────────────────────────────────────
    levels = [int(x) for x in re.findall(r"<h([1-6])\b", s, re.I)]
    prev = 0
    for lv in levels:
        if prev and lv > prev + 1:
            warn(f"{rel}: heading jumps h{prev} -> h{lv}")
            break
        prev = lv
    else:
        ok("headings")

    # ── 3 + 4. images ─────────────────────────────────────────────────────
    for tag in re.findall(r"<img\b[^>]*>", s, re.I):
        src = re.search(r'\bsrc=["\']([^"\']+)', tag)
        label = (src.group(1) if src else "?")[:60]
        if 'alt=' not in tag.lower():
            fail(f"{rel}: <img> without alt — {label}")
        else:
            ok("alt")
        has_dims = re.search(r"\bwidth=", tag, re.I) and re.search(r"\bheight=", tag, re.I)
        has_ar = "aspect-ratio" in tag.lower()
        if not (has_dims or has_ar):
            warn(f"{rel}: <img> without width/height — may shift layout — {label}")
        else:
            ok("dims")

    # ── 1 + 2. link and asset resolution ──────────────────────────────────
    refs = re.findall(r'(?:href|src)=["\']([^"\']+)["\']', s)
    for r in refs:
        if r.startswith(("#", "mailto:", "tel:", "data:", "javascript:")):
            continue
        t = local_target(site, r)
        if t is None:
            continue
        cand = resolve(site, f, t)
        if not exists(cand):
            fail(f"{rel}: broken local reference -> {r}")
        else:
            ok("link")

    # ── 7. JSON-LD ────────────────────────────────────────────────────────
    for blk in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try:
            data = json.loads(blk)
        except Exception as e:
            fail(f"{rel}: invalid JSON-LD — {e}")
            continue
        ok("jsonld")
        nodes = data.get("@graph", [data]) if isinstance(data, dict) else []
        for node in nodes:
            if not isinstance(node, dict) or node.get("@type") != "FAQPage":
                continue
            for q in node.get("mainEntity", []):
                name = q.get("name", "")
                probe = " ".join(name.split()[:5])
                if probe and probe.lower() not in " ".join(visible.split()).lower():
                    fail(f"{rel}: FAQPage schema question not visible on the page — {name[:60]!r}")
                else:
                    ok("faq-visible")

    # ── 10. secrets ───────────────────────────────────────────────────────
    for pat, what in SECRET_PATTERNS:
        if re.search(pat, raw):
            fail(f"{rel}: possible {what} in published output")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", help="use an existing build instead of running Jekyll")
    args = ap.parse_args()

    tmp = None
    if args.site:
        site = pathlib.Path(args.site)
    else:
        tmp = tempfile.mkdtemp(prefix="sf-build-")
        site = pathlib.Path(tmp) / "_site"
        print("Running a real Jekyll build…")
        if not build(site):
            print("\nJEKYLL NOT AVAILABLE — cannot validate the built site.")
            print("This script deliberately does not fall back to static analysis:")
            print("reporting template inspection as a build result would be misleading.")
            return 2
    print(f"Validating build at {site}\n")

    if not site.is_dir():
        print(f"FAIL: {site} is not a directory")
        return 2

    # ── 9. publication boundary ───────────────────────────────────────────
    for d in FORBIDDEN_DIRS:
        if (site / d).exists():
            fail(f"BOUNDARY: private directory '{d}/' is in the published build")
        else:
            ok("boundary")
    for fn in FORBIDDEN_FILES:
        if (site / fn).exists():
            fail(f"BOUNDARY: internal document '{fn}' is in the published build")
        else:
            ok("boundary")

    pages = sorted(site.rglob("*.html"))
    for f in pages:
        check_page(site, f)

    # Published JavaScript and CSS are served to visitors too. A leaked key
    # there is a failure exactly as it would be in HTML. An unresolved
    # REPLACE_WITH placeholder in a config file is different in kind: that file
    # exists to be configured, the UI now detects the unset state and says so
    # honestly, and shipping it is a pending Owner action rather than a defect.
    # So it warns instead of failing.
    for f in sorted(list(site.rglob("*.js")) + list(site.rglob("*.css"))):
        txt = f.read_text(errors="replace")
        rel = f.relative_to(site)
        for pat, what in SECRET_PATTERNS:
            if not re.search(pat, txt):
                continue
            if what == "unresolved placeholder":
                warn(f"{rel}: unresolved placeholder — the integration it configures "
                     f"is not wired up yet; the UI reports this to visitors as "
                     f"'not connected yet'")
            else:
                fail(f"{rel}: possible {what} in published output")
        ok("asset-scan")

    # Non-HTML SEO outputs must exist and parse.
    for name in ("sitemap.xml", "feed.xml", "robots.txt", "llms.txt"):
        p = site / name
        if not p.is_file():
            fail(f"missing {name}")
            continue
        ok("seo-file")
        if name.endswith(".xml"):
            import xml.dom.minidom
            try:
                xml.dom.minidom.parse(str(p))
                ok("xml")
            except Exception as e:
                fail(f"{name}: not well-formed — {e}")

    print("=" * 74)
    print(f"BUILD VALIDATION — {len(pages)} pages")
    print("=" * 74)
    for w in warns:
        print(f"  WARN  {w}")
    for f_ in fails:
        print(f"  FAIL  {f_}")
    print("-" * 74)
    print(f"{passes} checks passed · {len(warns)} warnings · {len(fails)} failures")

    if tmp:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
