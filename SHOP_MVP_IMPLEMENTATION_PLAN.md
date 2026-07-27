# Sentinel Fortune LLC — Digital Shop MVP Implementation Plan

Companion to `SHOP_REPOSITORY_AUDIT.md` and `SHOP_REUSE_MAP.md`. This is a **plan only** — nothing in this document has been implemented. It describes the smallest architecture that adds a Digital Shop (public catalog, product pages, Owner Admin, uploads, Stripe Checkout, verified webhook fulfillment, licenses, secure downloads, order records) **without** touching the institutional site, the existing tier/subscription business, or any of the paths flagged do-not-touch in `SHOP_REUSE_MAP.md`.

---

## 0. Design constraints, taken directly from the audit

1. **No second backend.** The Shop is new routes inside the existing Express app (`/backend`), not a new service.
2. **No new database technology.** Everything else here persists as JSON objects in R2. The Shop follows the same pattern (products/orders/licenses as R2-JSON records under a new `originus/shop/` prefix), rather than introducing Postgres/SQLite/etc. This is a deliberate MVP tradeoff — see §7 for its limits and when to revisit it.
3. **Never touch:** the 6 existing API routes, `originus/_canon/`, `delivery_service.py`, `auto_publish.py`, `ai_content.py`, the existing Stripe webhook's signature/idempotency/activation logic, the static root site content.
4. **Fully separate money path.** The Shop sells one-time digital products; the existing system sells recurring/one-time *tier access*. They must not share a webhook route, a product registry, or an R2 prefix, so a Shop bug can never affect tier sales or vice versa.
5. **Prerequisite repo-health fixes are out of Shop scope but block it.** Per the audit, `/backend` cannot currently be `pnpm install`ed (missing `@workspace/db`, `@workspace/api-zod`, `@workspace/api-client-react`), and the deploy scripts target incomplete `artifacts/*` mirrors instead of the real `/frontend` and `/backend`. These must be resolved — in coordination with the owner, since they may reflect an intentional in-progress migration — **before** Shop code can build or ship. This plan treats that as **Phase 0**, separate from Shop feature work, so it's clear the Shop isn't the one breaking the build.

---

## Phase 0 — Make the existing app buildable (prerequisite, not a Shop feature)

Do only what's needed to get `/frontend` and `/backend` installing and building; do not redesign anything.

1. Confirm with the owner: is `artifacts/api-server` / `artifacts/sentinel-app` an intentional Replit-managed export that will be regenerated, or dead weight that should be replaced by pointing deploy scripts at `/backend` and `/frontend` directly? This determines whether Phase 0 edits `config/build.sh` + `cloudflare/wrangler-pages.toml`, or the `artifacts/*` folders.
2. Add a root `pnpm-workspace.yaml` (or extend `config/pnpm-workspace.yaml` and move/symlink it to root) that includes `backend` and `frontend` as workspace packages.
3. Either implement the three missing workspace packages (`@workspace/db`, `@workspace/api-zod`, `@workspace/api-client-react`) with minimal real content, or remove those imports from `backend/package.json`/source if they're unused vestiges. `db` in particular should probably just not exist yet — see §7, the MVP doesn't need a relational DB.
4. Add a `requirements.txt` (or `pyproject.toml`) for `/bot` capturing its actual imports (`aiogram`, `aiohttp`, `stripe`, `boto3`, `openai`, `python-dotenv`, etc.), so the Python service is reproducible outside Replit.
5. Verify `pnpm install && pnpm --filter backend run build` and `pnpm --filter frontend run build` both succeed locally before starting Phase 1.

**This phase is a precondition, not a blocker to writing this plan — but it is a blocker to shipping anything from Phase 1 onward.**

---

## 1. Data model — new R2 prefix, additive only

All new state lives under `originus/shop/`, parallel to (never inside) the existing `originus/_canon/`, `originus/sales/`, `originus/access/` prefixes.

```
originus/shop/products/{product_id}.json         — product catalog entry (see schema below)
originus/shop/orders/{order_id}.json              — one order = one completed purchase
originus/shop/licenses/{license_id}.json          — one license = one issued grant tied to an order
originus/shop/stripe_events/{ts}_{event_id}.json  — Shop webhook event log (mirrors stripe_webhook.py's pattern)
originus/shop/stripe_events/processed/{event_id}.json  — idempotency lock (same pattern as existing webhook)
originus/shop/assets/{product_id}/{filename}       — the actual purchasable files (private; never listed/served directly)
```

### `product.json`
```json
{
  "product_id": "slug-string",
  "title": "string",
  "description": "string",
  "price_cents": 2900,
  "currency": "usd",
  "status": "draft | published | archived",
  "asset_key": "originus/shop/assets/{product_id}/{filename}",
  "cover_image_key": "originus/shop/assets/{product_id}/cover.jpg",
  "stripe_price_id": "price_...",
  "created_at": "iso8601",
  "updated_at": "iso8601"
}
```

### `order.json`
```json
{
  "order_id": "uuid",
  "product_id": "slug-string",
  "stripe_session_id": "cs_...",
  "stripe_payment_intent": "pi_...",
  "customer_email": "string",
  "amount_cents": 2900,
  "currency": "usd",
  "status": "paid | refunded",
  "license_id": "uuid",
  "created_at": "iso8601"
}
```

### `license.json`
```json
{
  "license_id": "uuid",
  "order_id": "uuid",
  "product_id": "slug-string",
  "customer_email": "string",
  "license_key": "string (opaque, random)",
  "download_count": 0,
  "max_downloads": 5,
  "issued_at": "iso8601",
  "revoked": false
}
```

This mirrors exactly the "one JSON object per entity, prefix-listed" pattern already used for `originus/sales/stripe_events/` and `originus/access/{product_id}/{user_id}.json` — no new persistence *concept* enters the codebase, only a new prefix.

---

## 2. Backend routes — additive, mounted separately from existing routes

New file: `backend/src/routes/shop.ts`, mounted in `backend/src/app.ts` alongside (not replacing) the existing mounts:

```
app.use("/api/shop/stripe", shopStripeWebhookRouter);  // raw body, same ordering rule as existing /api/stripe
app.use(express.json());
...
app.use("/api/shop", shopRouter);
```

Routes:

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/shop/products` | List published products (id, title, price, cover image URL) | Public |
| `GET` | `/api/shop/products/:id` | Single product detail | Public |
| `POST` | `/api/shop/checkout` | Create a Stripe Checkout Session for a product, return `checkout_url` | Public |
| `POST` | `/api/shop/stripe/webhook` | Verify signature, fulfill order (write order + license, no delivery side-effects on the existing tier system) | Stripe only (signature-verified) |
| `GET` | `/api/shop/download/:license_id?token=...` | Issue a short-lived presigned R2 URL for the licensed asset, decrementing `download_count` | Token-gated (see §5) |
| `GET` | `/api/shop/admin/products` | List all products including drafts | Owner Admin |
| `POST` | `/api/shop/admin/products` | Create/update a product | Owner Admin |
| `POST` | `/api/shop/admin/products/:id/asset` | Upload the product's file to R2 | Owner Admin |
| `GET` | `/api/shop/admin/orders` | List orders | Owner Admin |

This keeps the Shop's webhook **completely separate** from `/api/stripe/webhook`, satisfying the "never touch" constraint at the routing level, not just the code level — a Shop webhook outage cannot 500 or double-consume events meant for the tier system, and vice versa.

---

## 3. Stripe Checkout — real Checkout Sessions, not Payment Links

The existing tier system uses static Stripe **Payment Links** (good enough for a fixed 6-tier menu). The Shop needs a real product catalog with per-product pricing, so it should use Stripe **Checkout Sessions**, created server-side per purchase (`stripe.checkout.sessions.create`) with:
- `mode: "payment"` (one-time, not subscription)
- `line_items` referencing the product's `stripe_price_id`
- `metadata.product_id` and `metadata.order_id` (server-generated UUID, written to R2 *before* redirecting to Stripe, so the webhook can find it even if delivery races the redirect)
- `success_url` / `cancel_url` pointing back at the Shop's product/thank-you pages

This reuses the *idea* from `resolve_tier()` (metadata-first resolution) established in `stripe_webhook.py`, applied to products instead of tiers.

---

## 4. Verified webhook fulfillment

`shopStripeWebhookRouter` handler, directly modeled on `bot/services/stripe_webhook.py`'s proven shape, reimplemented in TypeScript in `backend/` (this is new code, not shared code, precisely so the existing Python webhook is never imported into/coupled with the new one):

1. Read raw body (same pattern as `backend/src/routes/stripe.ts`).
2. Verify `Stripe-Signature` via the Node Stripe SDK's `stripe.webhooks.constructEvent`, using a **separate** `SHOP_STRIPE_WEBHOOK_SECRET` env var (never the existing `STRIPE_WEBHOOK_SECRET` — different Stripe webhook endpoint, different secret, so rotating one can never break the other).
3. Idempotency check against `originus/shop/stripe_events/processed/{event_id}.json`, same as the existing bot webhook.
4. On `checkout.session.completed`: read `metadata.order_id`/`metadata.product_id`, write `order.json` (`status: "paid"`), generate a `license.json` (random `license_key`, `max_downloads` default), mark the event processed.
5. On `charge.refunded`: mark the matching order `status: "refunded"` and set `license.revoked = true`. (The existing tier webhook does not even handle this event — the Shop should, since a refunded digital-good license must stop granting downloads.)
6. Always respond `200` to Stripe once the event is durably logged, matching the existing "never let Stripe retry into a duplicate" behavior.

---

## 5. Secure downloads (new capability — nothing to reuse here)

Because buyers are web users, not Telegram users, delivery cannot reuse `deliver_product_to_user`'s `send_document` call — but it reuses that function's *fetch-by-R2-key* half.

- On successful checkout, the buyer is redirected to a `success_url` that includes the `license_id` and a one-time `token` (e.g. an HMAC of `license_id` + secret + short expiry, not the raw license key — keeps the license key itself reserved for "prove you own this later" use cases like re-downloading from an email receipt).
- `GET /api/shop/download/:license_id?token=...` validates the token, checks `license.revoked === false` and `download_count < max_downloads`, then calls R2 `GetObjectCommand` with `getSignedUrl` (presigned, short expiry — e.g. 5 minutes) for `asset_key`, increments `download_count`, and redirects the browser to the presigned URL.
- The product's `asset_key` in R2 is **never** public-listable and never served through a public route directly — only through this token-gated endpoint. This is the one genuinely new security-sensitive primitive in the whole plan and should get the most scrutiny/testing before launch.
- Order confirmation email (or an on-screen success page, for a true v0) should include the license key and a "re-download" link using the same token mechanism, regenerated per request rather than embedding a long-lived token in the email.

---

## 6. Owner Admin (new capability — nothing to reuse here)

The audit found **no existing web auth of any kind**, and found the existing `/ops/*` pattern (public route, no guard) to be exactly what *not* to repeat. Minimum viable, consistent with how light the rest of this system's auth is (`OWNER_TELEGRAM_IDS` env-var allowlist):

- A single `SHOP_ADMIN_PASSWORD` (or passphrase) env var, checked by a `POST /api/shop/admin/login` route that sets a signed, `httpOnly`, `secure` session cookie (e.g. via a small HMAC-signed token, no session store needed — stateless, consistent with the rest of the system avoiding a database).
- All `/api/shop/admin/*` routes require that cookie; the React admin pages (`/shop-admin`, *not* under the existing unguarded `/ops/*` tree) redirect to a login form if a `GET /api/shop/admin/whoami`-style check fails.
- This is intentionally minimal — one owner, one shared credential, no user table, no OAuth. It matches the project's existing security posture rather than over-building. If multi-admin or audit-per-admin becomes a real requirement later, that's a v1.1 problem, not MVP.
- Product upload (`POST /api/shop/admin/products/:id/asset`) streams the uploaded file straight to R2 under `originus/shop/assets/{product_id}/`, behind the same admin auth — reusing the `put_bytes`-equivalent Node R2 write pattern from `r2Writer.ts`, extended to binary bodies (currently that file only writes JSON).

---

## 7. Why R2-JSON instead of a real database — and when to reconsider

This plan deliberately does **not** introduce Postgres/SQLite/Drizzle for the MVP, even though `backend/package.json` already lists `drizzle-orm` as a dependency and references a `@workspace/db` package that doesn't exist. Reasons:

- Every other persistence path in this system (bot, Express, Worker) is R2-JSON. Introducing a second storage technology for just the Shop adds a new operational dependency (a hosted DB, migrations, connection pooling) for a component whose MVP scale (a handful of digital products, low order volume) doesn't need it.
- R2-JSON-per-entity is already proven to work end-to-end in this codebase for exactly this kind of data (event logs, access grants, delivery queues).

**This is explicitly a scaling tradeoff, not a permanent architecture decision.** Reconsider a real database when any of these happen: order volume makes prefix-listing slow, you need real transactional guarantees (e.g. inventory limits with concurrent buyers), or you need relational queries (e.g. "all orders for this customer email" across products) that prefix-scanning R2 can't do efficiently. At that point, resolving what `@workspace/db` was meant to be (Phase 0, item 3) becomes the right moment to introduce it properly — not before.

---

## 8. Frontend — additive pages only

New files under `frontend/src/pages/shop/`, new routes added to `frontend/src/App.tsx` (additive `<Route>` entries, no existing routes touched):

```
/shop                    → ShopCatalog.tsx     (public product grid, uses GET /api/shop/products)
/shop/:id                → ShopProduct.tsx     (public product detail + "Buy" → POST /api/shop/checkout)
/shop/success             → ShopSuccess.tsx     (post-checkout: shows license key + download link)
/shop-admin               → ShopAdminLogin.tsx  (owner login)
/shop-admin/products      → ShopAdminProducts.tsx (list/create/edit products, upload asset)
/shop-admin/orders        → ShopAdminOrders.tsx   (read-only order/license list)
```

Built from the existing, working `Layout`, `SectionTitle`, `GoldButton` components (per `SHOP_REUSE_MAP.md`) for visual consistency with `Store.tsx`/`Membership.tsx` — the Shop should look like it belongs to the same app, not a bolted-on subsystem. `Store.tsx`/`Membership.tsx` themselves are untouched; the Shop is a new, parallel section, and the existing site should link to it (e.g. a "Digital Shop" nav entry) rather than the Shop replacing the tier-purchase flow.

---

## 9. Explicit non-goals for the MVP

To keep this the *smallest* stable architecture, the following are deliberately deferred:

- Subscriptions/recurring digital products (the existing tier system already covers recurring access; the Shop is one-time purchases only for v1).
- Multi-currency, tax calculation, coupons/discounts.
- Customer accounts/login for buyers (license lookup is via emailed link + license key, not a password-protected buyer dashboard).
- Multi-admin roles/permissions (single shared owner credential only).
- Inventory limits / stock counts.
- Email delivery infrastructure (v1 can show the license/download link on the Stripe `success_url` return page; transactional email is a fast-follow, not a blocker, and should reuse whatever email capability — if any — already exists rather than introducing a new provider).
- Any change to `bot/`, the existing tier Stripe webhook, or `originus/_canon/` — the Shop's Python-side touchpoint, if any is needed at all, is a *new* module calling the *existing* `r2_service.py` primitives, never a modification of `delivery_service.py` or `stripe_webhook.py`.

---

## 10. Suggested build order

1. **Phase 0** (repo-health prerequisite, coordinate with owner first).
2. R2 schema + `backend/src/lib/shopR2.ts` (product/order/license read/write helpers, following `r2Reader.ts`/`r2Writer.ts` conventions).
3. `GET /api/shop/products`, `GET /api/shop/products/:id` + `ShopCatalog.tsx`, `ShopProduct.tsx` — get a real, empty-but-functioning public catalog live first, before any money moves.
4. `POST /api/shop/checkout` + Stripe Checkout Session creation — verify a full purchase reaches Stripe in test mode.
5. `POST /api/shop/stripe/webhook` + order/license fulfillment — verify a Stripe CLI test event produces a correct `order.json` + `license.json`.
6. `GET /api/shop/download/:license_id` + `ShopSuccess.tsx` — close the loop end-to-end in Stripe test mode.
7. Owner Admin auth + product CRUD + asset upload — only once the buyer-facing path is proven, since admin tooling with no products to sell has no urgency.
8. Cut over from Stripe test keys to live keys only after a full manual test purchase succeeds end-to-end, exactly as the existing `STRIPE_WEBHOOK_SECRET`-present/absent dev-mode-warning pattern already models as the right way to gate that transition.
