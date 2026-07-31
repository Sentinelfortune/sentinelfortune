# Cloudflare Setup — Digital Shop

Every command below is run from `shop-worker/` unless noted otherwise. These steps create **new**
Cloudflare resources — none of them modify the existing `sentinel-fortune-ecosystem` Worker, its R2
binding, or any existing DNS record.

Nothing in this document should be run against production until the Owner has approved moving past
Stripe test mode — see `SHOP_RELEASE_CHECKLIST.md`.

## 0. Prerequisites

- A Cloudflare account with Workers, D1, R2, Pages, and Access available on the plan in use.
- `wrangler` authenticated: `npx wrangler login` (run from `shop-worker/`, where `wrangler` is a
  devDependency — `npm install` first).

## 1. Create the D1 database

```bash
cd shop-worker
npx wrangler d1 create sentinel-fortune-shop
```

Copy the `database_id` from the output into **both** places it appears in `wrangler.toml`
(`[[d1_databases]]` under the top level, and again under `[[env.production.d1_databases]]`).

Apply the schema:

```bash
npx wrangler d1 migrations apply sentinel-fortune-shop --local    # for local `wrangler dev`
npx wrangler d1 migrations apply sentinel-fortune-shop --remote   # for the real, hosted database
```

This runs both `migrations/0001_init.sql` (schema) and `migrations/0002_seed_first_product.sql` (the
first product, seeded as an unpublished `DRAFT` — see `PRODUCT_UPLOAD_AND_PUBLISHING_GUIDE.md`).

## 2. Create the two R2 buckets

```bash
npx wrangler r2 bucket create sentinel-fortune-shop-downloads   # PRIVATE — purchasable files
npx wrangler r2 bucket create sentinel-fortune-shop-assets      # PRIVATE — covers/previews only
```

**Neither bucket needs public access. Do not enable the `r2.dev` public URL on either one.**

`sentinel-fortune-shop-downloads` is read only through the Worker's token-gated `/shop/download/:token`
route, which streams bytes — it never returns a direct R2 URL.

`sentinel-fortune-shop-assets` holds cover/preview images shown on public product pages. Those are read
through the Worker's `/shop/asset/:id` route, which is keyed on the `product_images` row id, so only
images registered against a product are reachable and the bucket's key space is never addressable.

`SHOP_ASSETS_PUBLIC_BASE_URL` is therefore **optional** and unset by default. Set it only if you later
want a CDN or custom domain in front of a public assets bucket; leaving it unset keeps everything private.

## 3. Update `wrangler.toml`

Replace every `REPLACE_WITH_...` placeholder in `shop-worker/wrangler.toml`:

| Placeholder | Value |
|---|---|
| `database_id` (×2) | From step 1 |
| `SHOP_WORKER_BASE_URL` (×2) | The Worker's `*.workers.dev` URL (known after first deploy — step 5 — or your custom route) |
| `CF_ACCESS_TEAM_DOMAIN` (×2) | Your Cloudflare Zero Trust team domain, e.g. `sentinelfortunellc.cloudflareaccess.com` |

`CF_ACCESS_AUD` is **not** in this table — it is a secret, see step 4.

## 4. Set secrets (never written to `wrangler.toml`)

```bash
npx wrangler secret put STRIPE_SECRET_KEY        # sk_test_... first — see STRIPE_SHOP_SETUP.md
npx wrangler secret put STRIPE_WEBHOOK_SECRET     # whsec_... — from the Stripe webhook endpoint
npx wrangler secret put RESEND_API_KEY            # re_...
npx wrangler secret put CF_ACCESS_AUD             # Access application Audience tag — from step 6
```

A binding name can be a plain var **or** a secret, never both. `CF_ACCESS_AUD` is therefore absent from
every `vars` block in `wrangler.toml`; adding it back there makes this upload fail with Cloudflare error
**10053 — binding name already in use**. `CF_ACCESS_TEAM_DOMAIN` stays a plain var: it is the public Zero
Trust hostname serving the JWKS, not a credential.

Until the `CF_ACCESS_AUD` secret exists, `requireOwnerAccess()` treats Access as unconfigured and every
`/shop/admin/*` request is rejected with 401 — an unconfigured deployment fails closed, it does not open.

Repeat with `--env production` for the production environment once you're ready for it (not before — see
`SHOP_RELEASE_CHECKLIST.md`).

## 5. Deploy the Worker

```bash
npm run deploy               # development environment
# npm run deploy:production  # DO NOT RUN without explicit Owner approval
```

Note the resulting `*.workers.dev` URL and fill it into `SHOP_WORKER_BASE_URL` in `wrangler.toml`
(step 3), then redeploy so the Worker knows its own public URL (used to build download links in emails).

## 6. Configure Cloudflare Access for `/admin`

1. In the Cloudflare Zero Trust dashboard, note your **team domain** (e.g.
   `sentinelfortune.cloudflareaccess.com`) — this is `CF_ACCESS_TEAM_DOMAIN`.
2. Create a Cloudflare **Pages** project for the admin app (see step 7) first, so you have a hostname to
   attach a policy to — e.g. `shop-admin.sentinelfortune.com` or the Pages `*.pages.dev` URL.
3. Under Zero Trust → Access → Applications, create a new **Self-hosted** application:
   - Domain: the admin Pages project's hostname from step 2
   - Policy: allow only the Owner's email address (or a short allowlist) — no public access, no
     self-signup
4. Upload the application's **Audience (AUD) tag** as the `CF_ACCESS_AUD` secret (step 4) — do not put it
   in `wrangler.toml`.

## 7. Deploy `/admin` to Cloudflare Pages (NOT GitHub Pages)

GitHub Pages cannot enforce Cloudflare Access — see `SHOP_ARCHITECTURE.md` for why. `/admin` must be
deployed to a Cloudflare-proxied hostname instead:

```bash
# From the repo root:
npx wrangler pages deploy admin --project-name sentinel-fortune-shop-admin
```

(Or connect the repo to a Cloudflare Pages project in the dashboard, with build output directory set to
`admin/` and no build command — it's static HTML/CSS/JS, no build step.)

After deploying, attach the Access application from step 6 to this Pages project's hostname (or a custom
domain pointed at it), and update `admin/admin.js`'s `SHOP_API_BASE` constant to point at the deployed
Shop Worker URL from step 5.

## 8. Update `/shop`'s config

Edit `shop/shop-config.js` (deployed via the existing GitHub Pages pipeline — no separate deploy step) and
set `window.SHOP_API_BASE` to the Worker URL from step 5.

## 9. Verify

```bash
curl https://<your-worker>.workers.dev/shop/health
# {"ok":true,"service":"sentinel-fortune-shop-worker"}

curl https://<your-worker>.workers.dev/shop/products
# {"ok":true,"products":[]}   — empty until the first product is published
```

Then continue with `STRIPE_SHOP_SETUP.md` and `RESEND_SETUP.md` before attempting any purchase.
