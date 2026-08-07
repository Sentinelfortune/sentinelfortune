# Shop Release Checklist

The exact sequence from "this branch exists" to "the Shop can take a real payment," and finally to
retiring Netlify. Every stage from **Stage 2 onward requires explicit Owner approval** — nothing in this
branch does any of it automatically, and no code in this repository switches Stripe to live mode,
publishes a product, deploys production secrets, or changes DNS on its own.

**Legend:** `[x]` = actually performed and verified, with the evidence noted. `[ ]` = not yet performed.
Nothing is marked complete that has not genuinely been done.

---

## Stage 1 — Local validation (no external accounts required)

Everything in this stage runs offline against test doubles and can be re-run by anyone with the repo.

- [x] Branch `claude/digital-shop-mvp` is 2 commits ahead of, 0 behind, `main` — no rebase required, no
      conflicts (`git rev-list --left-right --count origin/main...origin/claude/digital-shop-mvp` → `0 2`)
- [x] No secrets committed — scanned all added/modified files for live Stripe/Resend/AWS/GitHub/Slack/Google
      key patterns and private-key blocks: zero matches. `.dev.vars.example` contains only `*_REPLACE_ME`
      placeholders; `.gitignore` functionally ignores `.dev.vars` and `.wrangler/` (verified with
      `git check-ignore -v`)
- [x] No protected/legacy system modified — `git diff origin/main --stat` against `backend/ frontend/ bot/
      cloudflare/ config/ originus/ vault/ artifacts/ data/ app.js styles.css sitemap.xml` returns empty
- [x] `npm ci` completes from the committed lockfile (no lockfile regeneration, no package-manager change)
- [x] `npm run typecheck` → clean, exit 0, no output
- [x] `npm test` → **11 test files passed, 93 tests passed**, exit 0
- [x] Worker builds — `wrangler deploy --dry-run` succeeds for both the default and `--env production`
      configurations: **101.60 KiB / 22.62 KiB gzip**, all 3 bindings + 7 vars resolve. No deploy performed
- [x] D1 migrations apply cleanly in order (`0001_init.sql` → `0002_seed_first_product.sql`) against a
      clean SQLite database: 12 tables created, 0 foreign-key violations, seeded product is
      `DRAFT / price_cents=NULL / price_confirmed=0` (no invented price)
- [ ] Owner has reviewed the PR diff themselves

**Known, accepted at this stage:** `npm audit` reports 5 vulnerabilities (1 critical, 1 high, 3 moderate),
**all** in the `vitest`/`vite`/`esbuild` test toolchain under `devDependencies`. Runtime `dependencies` is
`{}` (empty) and the deployed Worker bundle contains no third-party code, so none of these reach
production. Upgrading vitest is recommended maintenance, not a release blocker.

---

## Stage 2 — Cloudflare test deployment (Owner approval required)

Follow `CLOUDFLARE_SHOP_SETUP.md`. Nothing below has been performed.

- [ ] D1 database created (`wrangler d1 create sentinel-fortune-shop`); real `database_id` written into
      **both** places in `wrangler.toml`
- [ ] Migrations applied remotely (`wrangler d1 migrations apply sentinel-fortune-shop --remote`)
- [ ] R2 bucket `sentinel-fortune-shop-downloads` created — **public access NOT enabled** (verify in the
      Cloudflare dashboard; this bucket must never have an r2.dev URL or custom domain)
- [ ] R2 bucket `sentinel-fortune-shop-assets` created — public access enabled; its public base URL written
      into `SHOP_ASSETS_PUBLIC_BASE_URL` in `wrangler.toml`
- [ ] Worker deployed to the non-production environment (`npm run deploy`); resulting `*.workers.dev` URL
      written into `SHOP_WORKER_BASE_URL` and redeployed
- [ ] `GET /shop/health` returns `{"ok":true,...}`
- [ ] `GET /shop/products` returns `{"ok":true,"products":[]}` (empty until a product is published)
- [ ] Cloudflare Access application created; team domain + AUD tag written into `CF_ACCESS_TEAM_DOMAIN` /
      `CF_ACCESS_AUD`
- [ ] `/admin` deployed to a **separate Cloudflare Pages project** behind that Access application
      (never GitHub Pages — see `SHOP_ARCHITECTURE.md`)
- [ ] `ADMIN_ALLOWED_ORIGIN` in `wrangler.toml` set to that Pages deployment's origin, and the Worker
      redeployed. **Until this is set the admin UI cannot call the Worker from a browser** — its
      credentialed cross-origin requests are not CORS-permitted (deliberately fail-safe)
- [ ] `window.SHOP_API_BASE` set in **both** `shop/shop-config.js` and `admin/admin-config.js`
- [ ] Verified: opening the admin URL in a logged-out/private browser window produces a Cloudflare Access
      challenge, not the admin UI
- [ ] Verified: calling any `/shop/admin/*` Worker route without an Access JWT returns HTTP 401

---

## Stage 3 — Stripe test payment (Owner approval required)

Follow `STRIPE_SHOP_SETUP.md`. **Stripe test mode only.** Nothing below has been performed.

- [ ] Stripe test-mode secret key set: `wrangler secret put STRIPE_SECRET_KEY` (`sk_test_...`)
- [ ] A test product completed through `PRODUCT_UPLOAD_AND_PUBLISHING_GUIDE.md`: content filled in, price
      entered **and confirmed**, cover image uploaded, at least one downloadable file uploaded
- [ ] Readiness panel shows "Ready to publish"; product published by the Owner
- [ ] Product appears on the public catalog and its product page loads
- [ ] "Buy Now" redirects to Stripe-hosted Checkout
- [ ] Payment completes with test card `4242 4242 4242 4242`
- [ ] Browser lands on `success.html`
- [ ] Verified in the Stripe Dashboard that the charge is present and in **test** mode

---

## Stage 4 — Webhook validation (Owner approval required)

- [ ] Webhook endpoint created in Stripe pointing at `https://<worker>/shop/stripe/webhook`, subscribed to
      `checkout.session.completed` and `charge.refunded`
- [ ] Signing secret set: `wrangler secret put STRIPE_WEBHOOK_SECRET` (`whsec_...`)
- [ ] Stripe Dashboard → Webhooks → recent deliveries shows the `checkout.session.completed` delivery
      returning **200**
- [ ] Exactly **one** order row exists for the test purchase (`/admin` → Orders)
- [ ] Exactly **one** license row was issued, status `ACTIVE`, with a `SFL-LIC-...` number
- [ ] Idempotency confirmed: re-send the same event from the Stripe Dashboard and verify **no second
      order** is created
- [ ] Negative test: send a request to the webhook URL with an invalid/absent `Stripe-Signature` and
      confirm HTTP **400** and that no order was created

---

## Stage 5 — Secure download validation (Owner approval required)

- [ ] The download link from the delivery email downloads the correct file
- [ ] `download_count` increments in `/admin` → Orders → order detail after each download
- [ ] Download limit enforced: exhaust `max_downloads` and confirm further attempts return **403**
- [ ] Expiry enforced: confirm an expired link returns **410** (temporarily set a short expiry on a test
      product to check this without waiting 72 hours)
- [ ] Revocation enforced: revoke the license in `/admin` and confirm the link immediately returns **403**
- [ ] "Generate Replacement Download Link" issues a working new link
- [ ] Confirm the private downloads R2 bucket is **not** directly reachable by URL (no public bucket access)

---

## Stage 6 — Email validation (Owner approval required)

Follow `RESEND_SETUP.md`.

- [ ] Resend API key set: `wrangler secret put RESEND_API_KEY`
- [ ] Sending domain verified in Resend (SPF/DKIM DNS records added and confirmed)
- [ ] `RESEND_FROM_EMAIL` in `wrangler.toml` points at an address on that verified domain
- [ ] Order confirmation email received, renders correctly in both HTML and plain-text
- [ ] Download delivery email received, and its link works
- [ ] Refund confirmation email received after a test refund (see Stage 7)
- [ ] "Resend Confirmation Email" from `/admin` → Orders works

---

## Stage 7 — Refund path validation (Owner approval required)

- [ ] Refund the test payment from the Stripe Dashboard
- [ ] Order status flips to `REFUNDED` in `/admin`
- [ ] License status flips to `REVOKED`
- [ ] Previously working download link now returns **403**
- [ ] Refund confirmation email received

---

## Stage 8 — GitHub Pages validation (after PR #3 is merged)

None of this can be verified before merge — the Shop pages do not exist on the live site until then.

- [ ] Owner confirms **Settings → Pages** reads: Source **"Deploy from a branch"**, branch **`main`**,
      folder **`/ (root)`** (this was inferred from the `pages-build-deployment` workflow, never read
      directly — see the PR description)
- [ ] After merge, the `pages-build-deployment` workflow run for the merge commit completes successfully
- [ ] `https://sentinelfortune.github.io/sentinelfortune/` still loads the institutional site unchanged
- [ ] The **Shop** nav link is visible in the desktop header and navigates to the storefront
- [ ] The **Shop** nav link is visible in the mobile menu and navigates to the storefront
- [ ] `https://sentinelfortune.github.io/sentinelfortune/shop/` loads the catalog, with CSS and JS applied
      (confirms base-path correctness on the real host)
- [ ] Each of these returns **404**, confirming the `_config.yml` publication boundary took effect:
      `/admin/`, `/shop-worker/`, `/bot/`, `/backend/`, `/cloudflare/`, `/config/`, `/originus/`,
      `/vault/`, `/artifacts/`, `/frontend/src/`
- [ ] `https://sentinelfortune.github.io/sentinelfortune/frontend/games/s5-ascent-lite/` still **loads**
      (this subdirectory is deliberately kept public and is linked from the homepage)
- [ ] Storefront policy pages (licenses, refund, terms, privacy, contact) all load and cross-link correctly

---

## Stage 9 — Production deployment (Owner approval required, in addition to every stage above)

- [ ] Owner has reviewed and approved `shop/terms-of-sale.html`, `shop/refund-policy.html`,
      `shop/privacy.html`, and the generated license text — ideally with counsel, per the
      "requires final legal review" notices on those pages
- [ ] Owner explicitly approves switching Stripe to **live** mode
- [ ] Live-mode Stripe secret key set for production: `wrangler secret put STRIPE_SECRET_KEY --env production`
- [ ] A **separate live-mode** Stripe webhook endpoint created; its signing secret set with
      `wrangler secret put STRIPE_WEBHOOK_SECRET --env production`
- [ ] `wrangler secret put RESEND_API_KEY --env production`
- [ ] `npm run deploy:production` run deliberately, by or with the Owner
- [ ] The first real product published deliberately (does not happen automatically)
- [ ] One real end-to-end purchase verified in live mode before any marketing/announcement

---

## Stage 10 — Netlify retirement (only after Stages 8 and 9 are complete)

Per the Netlify audit: **7 legacy Netlify projects** are still connected to this repository and generate
Deploy Previews on every PR. Nothing about Netlify has been changed, disabled, or deleted. Each step is
reversible up to the deletion steps.

- [ ] Owner opens each of the 7 Netlify project dashboards and records whether any has a **custom domain**
      or is serving **production traffic** (this is the one fact the audit could not determine from GitHub)
- [ ] Owner checks GitHub **Settings → Webhooks** for any `hooks.netlify.com` entries
- [ ] Owner checks GitHub **Settings → GitHub Apps** for the Netlify installation's repository scope
- [ ] Owner checks **Settings → Secrets and variables → Actions** for `NETLIFY_BUILD_HOOK` /
      `VERCEL_DEPLOY_HOOK` (referenced only by a dormant template workflow that has never run)
- [ ] Confirm GitHub Pages + Cloudflare together serve everything Netlify was serving
- [ ] Disable **Deploy Previews** on all 7 Netlify projects (stops PR comment noise; fully reversible)
- [ ] Wait and confirm nothing broke
- [ ] Uninstall the Netlify GitHub App from this repository
- [ ] Delete the 7 Netlify projects **one at a time**, with a wait between each
- [ ] Remove any Netlify DNS records — **last**, and only after confirming replacement DNS is already live

---

## Rollback

Because the Shop is fully isolated (`SHOP_ARCHITECTURE.md`), rollback cannot affect anything else:

- Pull a product from sale: **Unpublish** it in `/admin` — instant, no deploy
- Take the whole Shop offline: redeploy a previous Worker version, or delete the Worker. The institutional
  site's only dependency on the Shop is one `<a href="shop/index.html">` nav link, which degrades to a 404
- Revert the whole feature: revert the merge commit — no other system depends on these files
- None of the above requires touching `backend/`, `frontend/`, `bot/`, or any Netlify project
