# Public Website — How to Run It

Everything a person needs to publish on the public site, and where each moving part lives.
Internal document; excluded from the published site by `_config.yml`.

---

## 1. Publish an article, guide or update

```bash
python3 scripts/new_content.py update  "Title of the thing"   # -> _signals/
python3 scripts/new_content.py article "Title of the thing"   # -> _articles/
python3 scripts/new_content.py guide   "Title of the thing"   # -> _guides/
```

The file is created at `status: draft`. **Draft content never renders** — not on the homepage,
not in the index, not in the sitemap, not in the feed. Write it, then:

```bash
python3 scripts/validate_content.py     # the editorial gate
```

Set `status: ready` only once the gate passes. Commit and push; GitHub Pages rebuilds.

Nothing else needs editing. The homepage library strip, the collection index, `sitemap.xml`,
`feed.xml` and `llms.txt` all read the same filtered list.

### Front matter that matters

| Field | Effect |
|---|---|
| `status` | `draft` / `review` / `ready`. Only `ready` is ever published. |
| `title` | The `<h1>` and the `<title>`. |
| `summary` | The standfirst, the card blurb, the feed summary. |
| `answer` | Rendered first, before the narrative. This is the block an answer engine quotes. |
| `meta_title` / `meta_description` | Override the SEO title and description. |
| `date` / `updated` | `updated` drives the visible "Updated" line and `<lastmod>`. |
| `image` / `image_alt` | Social card for that page. Falls back to the site default. |
| `category` | Shown in the kicker. |
| `faqs` | Renders a visible FAQ **and** the FAQPage schema. The two cannot diverge. |
| `related_product` | Renders a product card linking into the shop. |
| `related_reading` | Internal links at the foot of the piece. |

> The word "Signals" is retired publicly. The folder is still `_signals` because renaming it
> would rewrite every path for no visitor-facing gain, but the route is `/updates/`, the label
> is "Updates" and the item noun is "Update". `collection_url` in `_config.yml` is what maps
> the folder to the route — anything deriving a URL from the folder name will point at a
> route that does not exist.

---

## 2. Product universes

`_data/universes.yml` is the single source of truth for the five categories. The homepage
grid, the `/products/` page, both footers and the shop's category chips all read it.

A product joins a universe by having its `category` field set to that universe's `category`
string exactly. The match is case-insensitive but otherwise literal.

`shop/shop.js` carries a copy of the five slug/category pairs, because it is plain JavaScript
and cannot read a Jekyll data file. **If you add a sixth universe, add it in both places.**

---

## 3. Images

```bash
python3 scripts/build_brand_assets.py
```

Regenerates `assets/img/` from the real brand mark at
`artifacts/sentinel-app/public/assets/branding/sf-logo.png`. Reproducible; safe to re-run.

Product covers are **not** managed here — they are uploaded through the Owner Admin, stored
in the private R2 assets bucket, and served through the Worker's `/shop/asset/:id`. The public
site never holds a product image.

The five universe illustrations are hand-authored SVGs in `assets/img/universes/`. They are
brand geometry, not photographs of products, and are deliberately abstract: there is no real
product photography, and inventing some would be fabricating evidence.

---

## 4. Audio

`data/broadcast.json` drives the Broadcast player on the homepage. It is currently empty
because **no audio file exists anywhere in this repository**.

To publish an episode:

1. Put the file in `assets/audio/` (mp3 or m4a).
2. Add one entry to `episodes` in `data/broadcast.json`.

That is the whole process. Duration is read from the file by the browser and is deliberately
not a field — a hand-written duration is a number that can be wrong.

While the list is empty the player says so. It does not show placeholder episodes.

---

## 5. Newsletter

There is no email backend. `newsletter_endpoint` in `_config.yml` is empty, and while it is
empty the signup renders an honest "not open yet" state pointing at the Atom feed.

Setting it to a real form endpoint turns on a working form. The success message is reachable
only through an actual HTTP 2xx from that endpoint — a network failure or an error status
says so and offers the email address instead. It will never confirm a subscription that did
not happen.

---

## 6. Validate before pushing

```bash
python3 scripts/validate_build.py      # runs a real Jekyll build, then checks the output
python3 scripts/validate_content.py    # editorial gate
python3 scripts/validate_site.py       # source-level structure checks
cd shop-worker && npm test             # Worker suite
```

`validate_build.py` is the strongest of the four: it builds the site and asserts against the
real HTML — link resolution, alt text, layout-shift protection, one `<h1>` per page, heading
order, JSON-LD validity, FAQ schema matching visible text, the publication boundary, and a
secret scan. It deliberately refuses to fall back to static analysis if Jekyll is missing,
because reporting template inspection as a build result would be misleading.

### Preview locally

```bash
jekyll build --baseurl "" -d /tmp/site && (cd /tmp/site && python3 -m http.server 8899)
```

Use `--baseurl ""` locally. In production the site is served from `/sentinelfortune/`, which
is why runtime paths in `index.html` are built from the `BASEURL` constant rather than
hardcoded — hardcoding the production prefix is what previously made the S.5 game link work
in production and 404 everywhere else.

---

## 7. Deliberately not built

Documented as future extensions, not omissions:

affiliate automation · public API platform · customer dashboard · favourites · multi-currency ·
multilingual · SaaS subscriptions · advanced coupons · upsell engine · marketplace syndication ·
private publishing admin.

---

## 8. Needs a decision from the Owner

- **Legal review.** `/shop/terms-of-sale.html`, `/shop/refund-policy.html`,
  `/shop/privacy.html` and `/shop/licenses.html` were written to be accurate about how the
  system behaves. They have not been reviewed by a lawyer.
- **Newsletter.** Nothing is collected until `newsletter_endpoint` is set.
- **The Broadcast.** Either record an episode or decide the card should go.
- **`sentinelfortune.com/api/public/signals`.** The homepage "Live dispatches" section fetches
  this. It could not be reached from the build environment, so whether it responds is unverified.
- **S.5 ASCENT unlock.** The unlock button pointed at a Stripe URL whose path was never filled
  in — a guaranteed checkout 404. It now says the levels are not on sale yet. Restoring a buy
  button needs a real Stripe link.
