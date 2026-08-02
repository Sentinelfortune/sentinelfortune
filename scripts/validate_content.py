#!/usr/bin/env python3
"""
Editorial quality gate for public content.

Runs against the repository's content collections and reports one status per
item: CONTENT READY, CONTENT NEEDS REVIEW, or CONTENT REJECTED.

An item marked `status: ready` that fails any hard check is REJECTED, and the
script exits non-zero — a failing gate should break a build, not produce a
warning somebody scrolls past.

Checks are deliberately mechanical. Judgement stays with the editor; this
catches the things that are checkable and therefore should never be left to
attention.

Usage:  python3 scripts/validate_content.py [--strict]
"""

import argparse
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
COLLECTIONS = ["_signals", "_articles", "_guides"]

REQUIRED = ["title", "date", "status", "summary", "answer", "meta_description", "audience", "category"]

# Claims that cannot be substantiated and must never be published.
FABRICATION = [
    (r"\bsave[sd]?\s+\d+\s*(%|percent|hours?|minutes?)", "unsupported savings claim"),
    (r"\b\d+\s*x\s+(more|faster|better|revenue|results)", "unsupported multiplier claim"),
    (r"\bguarantee(d|s)?\s+(results?|savings?|success|roi)", "outcome guarantee"),
    (r"\bour (customers|clients|users) (report|saw|achieved|experienced)", "fabricated customer result"),
    (r"\bproven to (increase|reduce|save|boost)", "unsupported efficacy claim"),
    (r"\b(testimonial|case study)\b", "testimonial or case study"),
    (r"\b\d+%\s+of\s+(businesses|contractors|companies|owners)", "uncited statistic"),
    (r"\b(industry[- ]leading|best[- ]in[- ]class|world[- ]class|#1|number one)\b", "unsubstantiated superlative"),
]

# Advice categories the site must never appear to give.
PROHIBITED_ADVICE = [
    (r"\byou should (sue|litigate)\b", "legal advice"),
    (r"\bthis (is|constitutes) legal advice\b", "legal advice"),
    (r"\byour code requires\b", "code determination"),
    (r"\bno permit is (required|needed)\b", "permit determination"),
    (r"\bthis is safe to\b", "safety determination"),
]

PLACEHOLDER = ["REPLACE_WITH", "TODO", "FIXME", "TBD", "Lorem ipsum", "XXX"]

# Anything internal that must never reach a public page.
LEAK = ["workers.dev", "cloudflareaccess", "pages.dev", "sk_test", "sk_live", "whsec_",
        "House of Assets", "SHOP_DB", "CF_ACCESS", "wrangler", "D1 database"]


def parse(path):
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---"):
        return None, raw
    end = raw.find("\n---", 3)
    if end == -1:
        return None, raw
    fm_text, body = raw[3:end], raw[end + 4:]

    fm, key, buf = {}, None, []
    for line in fm_text.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        m = re.match(r"^([a-z_]+):\s*(.*)$", line)
        if m:
            if key and buf:
                fm[key] = "\n".join(buf)
            key, val = m.group(1), m.group(2).strip()
            fm[key] = val.strip('"').strip("'")
            buf = []
        elif key:
            buf.append(line.strip())
    return fm, body


def check(path):
    hard, soft = [], []
    fm, body = parse(path)
    if fm is None:
        return "REJECTED", ["No YAML front matter."], []

    for field in REQUIRED:
        if not fm.get(field):
            hard.append(f'missing or empty "{field}"')

    status = (fm.get("status") or "").lower()
    if status not in ("draft", "review", "ready"):
        hard.append(f'status must be draft|review|ready (found "{status}")')

    md = fm.get("meta_description", "")
    if md:
        if len(md) < 70:
            soft.append(f"meta_description is {len(md)} chars — under 70 reads thin in a SERP")
        if len(md) > 165:
            soft.append(f"meta_description is {len(md)} chars — over 165 will be truncated")

    answer = fm.get("answer", "")
    if answer and len(answer) < 80:
        soft.append("answer is very short — GEO value comes from a complete direct answer")

    words = len(re.findall(r"\b\w+\b", body))
    if words < 250:
        hard.append(f"thin content: {words} words")
    elif words < 450 and "_articles" in str(path):
        soft.append(f"{words} words is short for an article")

    text = f"{fm.get('title','')} {fm.get('summary','')} {answer} {body}"
    low = text.lower()

    for pat, label in FABRICATION:
        m = re.search(pat, low)
        if m:
            hard.append(f'{label}: "{m.group(0).strip()}"')
    for pat, label in PROHIBITED_ADVICE:
        m = re.search(pat, low)
        if m:
            hard.append(f'{label}: "{m.group(0).strip()}"')
    for token in PLACEHOLDER:
        if token.lower() in low:
            hard.append(f'placeholder text: "{token}"')
    for token in LEAK:
        if token.lower() in low:
            hard.append(f'internal detail leaked into public content: "{token}"')

    # Heading order — h1 comes from the layout, so bodies start at h2.
    levels = [len(m.group(1)) for m in re.finditer(r"^(#{1,6})\s", body, re.M)]
    if 1 in levels:
        hard.append("body contains an h1; the layout already emits one")
    prev = 1
    for lv in levels:
        if lv > prev + 1:
            soft.append(f"heading level jumps h{prev} -> h{lv}")
        prev = lv

    # Keyword stuffing: any single non-trivial word over 4% of the body.
    body_words = re.findall(r"\b[a-z]{5,}\b", low)
    if len(body_words) > 200:
        counts = {}
        for w in body_words:
            counts[w] = counts.get(w, 0) + 1
        top, n = max(counts.items(), key=lambda kv: kv[1])
        if n / len(body_words) > 0.04:
            soft.append(f'possible keyword stuffing: "{top}" is {n / len(body_words):.1%} of the body')

    # Internal links should be root-relative so baseurl handling stays correct.
    for m in re.finditer(r"\]\((/[^)]*)\)", body):
        if m.group(1).startswith("//"):
            hard.append(f"protocol-relative link: {m.group(1)}")

    # FAQ schema must match visible content.
    if "faqs:" in path.read_text(encoding="utf-8") and "  - q:" not in path.read_text(encoding="utf-8"):
        hard.append("faqs declared but no question entries")

    if hard:
        return ("REJECTED" if status == "ready" else "NEEDS REVIEW"), hard, soft
    if soft or status != "ready":
        return ("NEEDS REVIEW" if status != "ready" or soft else "READY"), hard, soft
    return "READY", hard, soft


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true", help="treat soft findings as failures")
    args = ap.parse_args()

    rows, failed = [], False
    for coll in COLLECTIONS:
        for path in sorted((REPO / coll).glob("*.md")):
            status, hard, soft = check(path)
            rows.append((path.relative_to(REPO), status, hard, soft))
            if status == "REJECTED":
                failed = True
            if args.strict and soft:
                failed = True

    print("=" * 74)
    print("EDITORIAL QUALITY GATE")
    print("=" * 74)
    for rel, status, hard, soft in rows:
        label = {"READY": "CONTENT READY", "NEEDS REVIEW": "CONTENT NEEDS REVIEW",
                 "REJECTED": "CONTENT REJECTED"}[status]
        print(f"\n{label:<22} {rel}")
        for h in hard:
            print(f"    FAIL  {h}")
        for s in soft:
            print(f"    warn  {s}")

    ready = sum(1 for _, s, _, _ in rows if s == "READY")
    review = sum(1 for _, s, _, _ in rows if s == "NEEDS REVIEW")
    rejected = sum(1 for _, s, _, _ in rows if s == "REJECTED")
    print("\n" + "-" * 74)
    print(f"{len(rows)} items — {ready} ready, {review} need review, {rejected} rejected")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
