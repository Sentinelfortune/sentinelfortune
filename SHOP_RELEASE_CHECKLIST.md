# Shop Release Checklist

The exact sequence from "this branch exists" to "the Shop can take a real payment." Every step in
**Phase 3 and beyond** requires explicit Owner approval — nothing in this branch does any of it
automatically, and no code in this repository switches Stripe to live mode, publishes a product, or
deploys production secrets on its own.

## Phase 1 — Code review

- [ ] Review this branch (`claude/digital-shop-mvp`) — diff against `main`
- [ ] Confirm no changes touch `backend/`, `frontend/`, `bot/`, `cloudflare/api-worker.js`,
      `config/cloudflare/ecosystem-worker.js`, or `originus/_canon/` (they shouldn't — verify with
      `git diff main --stat`)
- [ ] Run `cd shop-worker && npm install && npm run typecheck && npm test` and confirm all pass (see this
      branch's completion report for the exact output captured during development)

## Phase 2 — Cloudflare + Stripe + Resend setup (test mode)

Follow, in order: `CLOUDFLARE_SHOP_SETUP.md`, `STRIPE_SHOP_SETUP.md` (test mode only), `RESEND_SETUP.md`.

- [ ] D1 database created, migrations applied (`0001_init.sql` + `0002_seed_first_product.sql`)
- [ ] Both R2 buckets created; downloads bucket confirmed **not** publicly accessible
- [ ] Shop Worker deployed to the `development` environment; `/shop/health` and `/shop/products` respond
- [ ] Cloudflare Access application created; `/admin` deployed to Cloudflare Pages behind it
- [ ] `admin/admin.js`'s `SHOP_API_BASE` and `shop/shop-config.js`'s `SHOP_API_BASE` both point at the
      deployed Worker
- [ ] Stripe test-mode secret key and webhook secret set via `wrangler secret put`
- [ ] Resend API key set; sending domain verified

## Phase 3 — End-to-end verification (Owner approval to proceed past this point)

- [ ] Complete `PRODUCT_UPLOAD_AND_PUBLISHING_GUIDE.md` for the seeded first product, or a throwaway test
      product, with a real (Owner-confirmed) test-mode price
- [ ] **Publish** it (Owner action, from `/admin`)
- [ ] Buy it on `/shop` using a Stripe test card, start to finish
- [ ] Confirm: redirected to `success.html`; confirmation email arrives; download-delivery email arrives;
      the download link actually downloads the correct file; `download_count` increments in `/admin` →
      Orders → that order's details
- [ ] Trigger a cancelled checkout (abandon at Stripe's page) and confirm `cancelled.html` is shown and no
      order/license was created
- [ ] Issue a test refund in Stripe and confirm: order shows `REFUNDED` in `/admin`, license shows
      `REVOKED`, the previously-working download link now returns 403, and a refund-confirmation email
      arrives
- [ ] Confirm an expired/over-limit download link is correctly rejected (can be tested by temporarily
      lowering a product's `maxDownloads` to 1 and downloading twice, or by using
      **Generate Replacement Download Link** and confirming the old link's behavior is unaffected)

**No claim of production readiness should be made, and none is made here, until every box above is
checked against a real deployment** — this repository can prove the logic is correct in isolation (the
test suite), but only a real Stripe test-mode transaction proves the deployed system as a whole works.

## Phase 4 — Go-live (Owner approval required, explicitly, in addition to Phase 3)

- [ ] Owner has reviewed and approved `shop/terms-of-sale.html`, `shop/refund-policy.html`, and
      `shop/privacy.html` — ideally with counsel, per the "requires final legal review" notes on those
      pages and in the license text (`src/lib/license-text.ts`)
- [ ] Owner has explicitly approved switching Stripe to live mode
- [ ] Live-mode Stripe secret key and live webhook secret set for the `production` environment
      (`STRIPE_SHOP_SETUP.md` §6)
- [ ] `npm run deploy:production` run deliberately, by the Owner or with the Owner present
- [ ] The first real product is published deliberately (this does not happen automatically — see
      `PRODUCT_UPLOAD_AND_PUBLISHING_GUIDE.md`)

## Rollback

Because the Shop is fully isolated (`SHOP_ARCHITECTURE.md`), rollback is simple and cannot affect anything
else:

- To pull a product from sale immediately: **Unpublish** it in `/admin` (instant, no deploy needed)
- To take the whole Shop offline: `npx wrangler deploy` a previous Worker version, or delete the Worker
  entirely — the institutional site's only dependency on the Shop is one `<a href="shop/index.html">` nav
  link, which simply 404s gracefully if the Shop is removed
- Nothing about removing the Shop requires touching `backend/`, `frontend/`, or `bot/`
