# Sentinel Fortune LLC — Digital Shop MVP

This is the entry point for the Digital Shop implementation. It was built on branch
`claude/digital-shop-mvp`, based on the findings in the earlier repository audit
(`SHOP_REPOSITORY_AUDIT.md`, `SHOP_REUSE_MAP.md`, `SHOP_MVP_IMPLEMENTATION_PLAN.md`).

**Nothing here has been deployed to production.** No first product is published. Stripe is not in live
mode. See `SHOP_RELEASE_CHECKLIST.md` for what's required before any of that changes, and note that none
of it happens without explicit Owner approval.

## What this is

A fully isolated system for selling one-time digital products (toolkits, playbooks, templates) with:

- A public catalog and product pages, added to the existing GitHub Pages institutional site
- Stripe-hosted Checkout (server-authoritative pricing — the browser never dictates price)
- A verified, idempotent Stripe webhook that issues an order, a license, and a time-limited,
  download-count-limited secure download link
- Transactional email via Resend (confirmation, download delivery, replacement link, refund confirmation)
- A Cloudflare Access-protected Owner Admin app for creating, pricing, uploading assets to, and
  publishing products

## What this is not

It does not touch, extend, or depend on:

- The existing React frontend (`/frontend`) or Express backend (`/backend`) — both left exactly as found
- The existing Telegram tier-access system, its Stripe webhook, or its R2 data
- `originus/_canon/` or anything on the `PRESERVE_LIST.json`
- The `/ops/*` frontend routes (see `SHOP_SECURITY_CHECKLIST.md` for why those remain out of scope here)

See `SHOP_REUSE_MAP.md` for the full reuse/do-not-touch breakdown this build followed.

## Where everything lives

| Path | What |
|---|---|
| `/shop-worker` | The Cloudflare Worker backend — the sole backend for the Shop. See `shop-worker/README.md`. |
| `/shop` | Public storefront — plain HTML/CSS/JS, added to the existing GitHub Pages site. |
| `/admin` | Owner Admin UI — plain HTML/CSS/JS, deployed **separately** from GitHub Pages (see `CLOUDFLARE_SHOP_SETUP.md`) because GitHub Pages cannot enforce Cloudflare Access. |

## Documentation index

| Document | Purpose |
|---|---|
| `SHOP_ARCHITECTURE.md` | How the pieces fit together and why, including the GitHub Pages / Cloudflare Access split |
| `CLOUDFLARE_SHOP_SETUP.md` | Every Cloudflare resource to create (D1, R2 ×2, Worker, Access, Pages) and the exact commands |
| `STRIPE_SHOP_SETUP.md` | Stripe account/webhook setup, test-mode-first checklist |
| `RESEND_SETUP.md` | Resend account, domain verification, API key |
| `OWNER_SHOP_GUIDE.md` | Day-to-day operation: creating products, handling orders, refunds, replacement links |
| `PRODUCT_UPLOAD_AND_PUBLISHING_GUIDE.md` | Step-by-step: get the seeded first product from DRAFT to PUBLISHED |
| `SHOP_SECURITY_CHECKLIST.md` | What's implemented, what's Owner-configured, and explicit pre-existing gaps (e.g. `/ops/*`) |
| `SHOP_RELEASE_CHECKLIST.md` | The exact sequence from "code merged" to "first live sale," gated on Owner approval |
| `SHOP_KNOWN_LIMITATIONS.md` | Honest list of MVP tradeoffs and what would need to change to remove them |

## Quickstart (local development only)

```bash
cd shop-worker
npm install
cp .dev.vars.example .dev.vars   # fill in Stripe TEST keys + Resend key
npm run typecheck
npm test
```

`npm test` runs the full unit test suite against a real, in-memory SQLite database seeded from the actual
`migrations/*.sql` files (see `shop-worker/tests/helpers/d1-sqlite-adapter.ts`) — no Cloudflare account or
network access is required to run it. See `SHOP_RELEASE_CHECKLIST.md` for what's still needed to actually
deploy and take a live payment.
