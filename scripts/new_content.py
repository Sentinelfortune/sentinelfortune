#!/usr/bin/env python3
"""
Scaffold a new public content item as a DRAFT.

The "content engine" is a scaffolder plus a quality gate, not a text generator.
Prose is written by a person (or drafted by an assistant and edited by a
person); this tool guarantees every item starts with the complete front-matter
contract the SEO and GEO layers depend on, and starts at status: draft so it
cannot be published by accident.

Nothing here contains a prompt, a credential, or any business intelligence.
It is safe in a public repository, which is the point — the private publishing
system, if one is ever built, consumes this same contract.

Usage:
  python3 scripts/new_content.py update  "Title of the piece"
  python3 scripts/new_content.py article "Title of the piece"
  python3 scripts/new_content.py guide   "Title of the piece"
"""

import datetime
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent

# The folder is still `_signals` — only the public vocabulary changed. `update`
# is the command to use; `signal` is kept as an undocumented alias so anything
# already scripted against the old name keeps working.
KINDS = {
    "update":  ("_signals",  "Update", 3, "informational"),
    "signal":  ("_signals",  "Update", 3, "informational"),
    "article": ("_articles", "Article", 8, "informational"),
    "guide":   ("_guides",   "Guide", 7, "commercial"),
}


def slugify(title):
    s = title.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return re.sub(r"^-|-$", "", s)[:70]


TEMPLATE = """---
title: "{title}"
date: {date}
status: draft          # draft -> review -> ready. Only "ready" is ever published.
category: ""
audience: ""
search_intent: {intent}
reading_time: {rt}
summary: ""            # One sentence. Used on index cards, in the feed, and as a meta fallback.
answer: ""             # GEO: the direct answer, before any narrative. 2-4 sentences.
meta_title: ""         # Optional. Defaults to title.
meta_description: ""   # 140-160 characters reads best.
image_alt: "Sentinel Fortune LLC"

# Optional. Rendered visibly AND emitted as FAQPage schema — never one without
# the other, so the markup always matches what a visitor can see.
# faqs:
#   - q: ""
#     a: ""

# Optional. Renders the product card. Educational value comes first; not every
# piece needs one.
# related_product:
#   title: ""
#   blurb: ""
#   url: "/shop/"

# related_reading:
#   - title: ""
#     url: ""

# sources:
#   - ""
---

Opening paragraph. Say the useful thing first.

## A meaningful heading

Body.
"""


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in KINDS:
        print(__doc__.strip())
        return 2

    kind_key, title = sys.argv[1], " ".join(sys.argv[2:])
    folder, kind, rt, intent = KINDS[kind_key]
    slug = slugify(title)
    path = REPO / folder / f"{slug}.md"

    if path.exists():
        print(f"ERROR: {path.relative_to(REPO)} already exists.", file=sys.stderr)
        return 1

    path.write_text(
        TEMPLATE.format(
            title=title.replace('"', "'"),
            date=datetime.date.today().isoformat(),
            intent=intent,
            rt=rt,
        ),
        encoding="utf-8",
    )
    print(f"Created {path.relative_to(REPO)} as a DRAFT.")
    print("\nNext:")
    print("  1. Write it.")
    print("  2. Fill summary, answer, meta_description.")
    print("  3. python3 scripts/validate_content.py")
    print("  4. Set status: ready only once the gate passes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
