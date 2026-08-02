> **READ-ONLY AUDIT — 2026-08-01.** No infrastructure was modified. Nothing deployed, migrated or merged.
> Evidence sources: Cloudflare control-plane API (Workers/D1/R2/KV) and the local git repository.
> **All outbound HTTP from the audit environment is blocked** (every host returns `000`), so no live page,
> live endpoint or live redirect was fetched. Anything requiring HTTP or a Cloudflare API surface not
> exposed to this environment is marked **NOT VERIFIED**.

# Public Site and Digital Shop Architecture

`https://sentinelfortune.github.io/sentinelfortune/`

## Live state: NOT VERIFIED (HTTP blocked). Source state: VERIFIED.

| Property | Value |
|---|---|
| Repository / branch | `sentinelfortune/sentinelfortune`, `main` @ `550fd5d` |
| Deployment | GitHub Pages, deploy-from-branch, root |
| Publication boundary | Jekyll `exclude:` in `_config.yml` |
| Shop pages on `main` | `index.html`, `product.html`, `success.html`, `cancelled.html`, `licenses.html`, `contact.html`, `privacy.html`, `refund-policy.html`, `terms-of-sale.html` + `shop.js`, `product.js`, `success.js`, `shop.css`, `shop-config.js` |
| Rendering | Fully static HTML; catalogue and product detail fetched client-side |

## BROKEN — the storefront cannot reach the API

`shop/shop-config.js` on `main`, line 10:

```js
window.SHOP_API_BASE = "https://REPLACE_WITH_SHOP_WORKER_URL.workers.dev";
```

Consequences, all following from that single line:

| Flow | State |
|---|---|
| Catalogue (`GET /shop/products`) | **BROKEN** — unresolvable host |
| Product detail (`GET /shop/products/:slug`) | **BROKEN** |
| Checkout (`POST /shop/checkout`) | **BROKEN** |
| Success-page delivery | **BROKEN**, twice over — placeholder base *and* `/shop/order/status` is neither on `main` nor deployed |

Even with the placeholder fixed, `main` has zero PUBLISHED products, so the catalogue would render empty.

## Does the public shop show the same data as Shop Admin?

**By design yes — in reality neither displays anything.** Same Worker, same D1. The admin can read the
one DRAFT seed row; the public catalogue filters to PUBLISHED and would return `[]`.

## Content system

**None.** No `_posts/`, `_layouts/`, `_includes/`, `blog/` or `content/` directory exists on `main`
(verified: zero matches). Every page is hand-authored static HTML. There is no CMS, no collection, no
data-driven page generation, and no SEO metadata pipeline.
