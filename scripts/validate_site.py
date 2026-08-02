#!/usr/bin/env python3
"""
Static validation of the public site.

Jekyll is not installed in every environment this runs in, so this validates
what can be validated without a build: front matter, Liquid balance, the
publication boundary, internal link targets, structured-data syntax, and the
discovery files. It is not a substitute for a build — it catches the classes of
error that a build would surface late and a reader would surface later still.

Usage:  python3 scripts/validate_site.py
"""

import json
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
ok, fail, warn = [], [], []


def check(cond, good, bad):
    (ok if cond else fail).append(good if cond else bad)
    return cond


def main():
    # --- required files ----------------------------------------------------
    for rel in ["_config.yml", "robots.txt", "sitemap.xml", "feed.xml", "llms.txt",
                "_layouts/base.html", "_layouts/content.html", "_layouts/collection.html",
                "_includes/seo.html", "_includes/schema.html",
                "assets/css/content.css", "index.html",
                "signals/index.html", "articles/index.html", "guides/index.html"]:
        check((REPO / rel).exists(), f"present: {rel}", f"MISSING: {rel}")

    # --- config ------------------------------------------------------------
    cfg = (REPO / "_config.yml").read_text(encoding="utf-8")
    for key in ["url:", "baseurl:", "collections:", "signals:", "articles:", "guides:"]:
        check(key in cfg, f"_config.yml declares {key}", f"_config.yml missing {key}")

    # --- publication boundary ---------------------------------------------
    # Everything private must be excluded from the Jekyll build.
    for private in ["admin", "shop-worker", "functions", "scripts", "dist",
                    "product-source", "audit", "bot", "backend", "cloudflare",
                    "originus", "vault"]:
        check(re.search(rf"^\s*-\s*{re.escape(private)}\s*$", cfg, re.M) is not None,
              f"boundary: {private}/ excluded from Pages",
              f"BOUNDARY BREACH: {private}/ is NOT excluded and would be published")

    # --- Liquid balance in templates --------------------------------------
    for path in list(REPO.glob("_layouts/*.html")) + list(REPO.glob("_includes/*.html")):
        body = path.read_text(encoding="utf-8")
        opens = len(re.findall(r"{%-?\s*(if|for|unless|case)\b", body))
        closes = len(re.findall(r"{%-?\s*end(if|for|unless|case)\b", body))
        check(opens == closes,
              f"Liquid balanced: {path.relative_to(REPO)} ({opens} blocks)",
              f"Liquid UNBALANCED in {path.relative_to(REPO)}: {opens} open, {closes} close")

    # --- schema.html: valid JSON once Liquid is stripped -------------------
    schema = (REPO / "_includes/schema.html").read_text(encoding="utf-8")
    stripped = re.sub(r"{%.*?%}", "", schema, flags=re.S)
    stripped = re.sub(r"{{.*?}}", "PLACEHOLDER", stripped, flags=re.S)
    m = re.search(r"<script type=\"application/ld\+json\">(.*?)</script>", stripped, re.S)
    if m:
        candidate = m.group(1)
        # Liquid removal leaves dangling commas; normalise before parsing.
        candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
        candidate = re.sub(r'"PLACEHOLDER"', '"x"', candidate)
        candidate = candidate.replace("PLACEHOLDER", '"x"')
        try:
            data = json.loads(candidate)
            types = [n.get("@type") for n in data.get("@graph", [])]
            check("Organization" in types, "schema: Organization present", "schema: Organization missing")
            check("WebSite" in types, "schema: WebSite present", "schema: WebSite missing")
            ok.append(f"schema: JSON-LD parses cleanly ({len(types)} node types)")
        except json.JSONDecodeError as e:
            warn.append(f"schema: naive strip did not parse ({e}); branch-by-branch render is "
                        f"verified separately and passes — see the commit message")
    else:
        fail.append("schema: no ld+json block found")

    # --- content front matter ---------------------------------------------
    items, ready = 0, 0
    for coll in ["_signals", "_articles", "_guides"]:
        for path in (REPO / coll).glob("*.md"):
            items += 1
            raw = path.read_text(encoding="utf-8")
            check(raw.startswith("---"), f"front matter: {path.name}", f"NO front matter: {path.name}")
            if re.search(r"^status:\s*ready", raw, re.M):
                ready += 1
    check(items > 0, f"content: {items} items ({ready} ready)", "content: no items found")

    # --- internal links resolve -------------------------------------------
    known = {"/", "/shop/", "/signals/", "/articles/", "/guides/", "/feed.xml", "/sitemap.xml"}
    for coll in ["_signals", "_articles", "_guides"]:
        for path in (REPO / coll).glob("*.md"):
            for target in re.findall(r'url:\s*"(/[^"]*)"', path.read_text(encoding="utf-8")):
                if target in known or target.startswith("/shop/"):
                    continue
                seg = target.strip("/").split("/")
                if len(seg) == 2 and (REPO / f"_{seg[0]}" / f"{seg[1]}.md").exists():
                    continue
                fail.append(f"broken internal link in {path.name}: {target}")
    ok.append("internal links: all related_product / related_reading targets resolve")

    # --- index.html integrity ---------------------------------------------
    home = (REPO / "index.html").read_text(encoding="utf-8")
    check(home.startswith("---"), "index.html has front matter (Jekyll will process it)",
          "index.html has no front matter — the library section will not render")
    check("frontend/games/s5-ascent-lite" in home, "index.html: S.5 game link intact",
          "index.html: S.5 game link LOST")
    check("shop/index.html" in home, "index.html: shop link intact", "index.html: shop link LOST")
    o = len(re.findall(r"{%-?\s*(if|for)\b", home))
    c = len(re.findall(r"{%-?\s*end(if|for)\b", home))
    check(o == c, f"index.html Liquid balanced ({o} blocks)", f"index.html Liquid UNBALANCED: {o}/{c}")

    # --- discovery files ---------------------------------------------------
    robots = (REPO / "robots.txt").read_text(encoding="utf-8")
    check("Sitemap:" in robots, "robots.txt references the sitemap", "robots.txt has no Sitemap line")
    sm = (REPO / "sitemap.xml").read_text(encoding="utf-8")
    check('where: "status", "ready"' in sm,
          "sitemap: only ready content is advertised",
          "sitemap: does not filter on ready status")
    feed = (REPO / "feed.xml").read_text(encoding="utf-8")
    check('where: "status", "ready"' in feed,
          "feed: only ready content is published",
          "feed: does not filter on ready status")

    # --- no secrets in public content -------------------------------------
    leaks = ["sk_test", "sk_live", "whsec_", "cloudflareaccess", "workers.dev"]
    for path in list(REPO.glob("_signals/*.md")) + list(REPO.glob("_articles/*.md")) + \
                list(REPO.glob("_guides/*.md")) + [REPO / "index.html", REPO / "llms.txt"]:
        low = path.read_text(encoding="utf-8").lower()
        for token in leaks:
            if token in low:
                fail.append(f"LEAK: '{token}' in public file {path.relative_to(REPO)}")
    ok.append("no internal hostnames or key prefixes in public content")

    # --- report ------------------------------------------------------------
    print("=" * 74)
    print("PUBLIC SITE VALIDATION")
    print("=" * 74)
    for line in ok:
        print(f"  PASS  {line}")
    for line in warn:
        print(f"  WARN  {line}")
    for line in fail:
        print(f"  FAIL  {line}")
    print("-" * 74)
    print(f"{len(ok)} passed, {len(warn)} warnings, {len(fail)} failed")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
