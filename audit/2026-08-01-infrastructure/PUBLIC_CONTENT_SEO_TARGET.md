> **READ-ONLY AUDIT — 2026-08-01.** No infrastructure was modified. Nothing deployed, migrated or merged.
> Evidence sources: Cloudflare control-plane API (Workers/D1/R2/KV) and the local git repository.
> **All outbound HTTP from the audit environment is blocked** (every host returns `000`), so no live page,
> live endpoint or live redirect was fetched. Anything requiring HTTP or a Cloudflare API surface not
> exposed to this environment is marked **NOT VERIFIED**.

# Public Content & SEO — Target

## Current state: THERE IS NO CONTENT SYSTEM

Verified on `main`: zero `_posts/`, `_layouts/`, `_includes/`, `blog/`, `content/`. Every page is
hand-authored static HTML with inline styles. No collections, no front matter, no templating, no
sitemap generation beyond a static `sitemap.xml`, no metadata pipeline, no internal-linking structure.

**Marked explicitly, as required.**

Also unverified: whether `solarium-seo` (Worker) or `sentinel-content` (KV) serve any SEO or content
function. Names only — no evidence.

## Safest insertion point

The site is already Jekyll-processed (`_config.yml` with `exclude:` is being honoured — that is how the
publication boundary works). **Jekyll's collection support is therefore available at zero
infrastructure cost.** No CMS, no new Worker, no database, no build pipeline.

```
content-source/*.md  ──(Jekyll on push to main)──>  GitHub Pages
```

## Minimum viable architecture — four things, in order

1. **One layout** (`_layouts/article.html`) reusing existing `shop.css`.
2. **One collection** (`_posts/` or `_articles/`) with front matter: `title`, `description`, `date`,
   `slug`, `canonical`, `og_image`, `related_products`.
3. **One index page** listing the collection.
4. **Front-matter-driven `<meta>`** in the layout — title, description, canonical, Open Graph.

That is the whole thing. It supports blog posts, buyer guides, educational articles, resource pages,
FAQs and landing pages, because those differ by content, not by mechanism. Category pages come free
from Jekyll's tag/category support if ever needed.

## What NOT to build

A CMS · a headless content API · a content Worker · a KV-backed content store · a separate content
repository · anything requiring a build step beyond Jekyll's own.

The site has no content today. Building infrastructure for content volume that does not yet exist is
how a static site becomes a maintenance burden with nothing published on it.

## Where Claude fits

Claude drafts Markdown with front matter. The Owner reviews and commits. Publication is a `git push` —
the same boundary that already governs the public site.

## Sequencing

Do this **after** the commerce path works end to end. Content that links to a storefront which cannot
load its own catalogue is worse than no content.
