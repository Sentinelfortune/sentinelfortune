# Shop Architecture

## Design goal

Add a Digital Shop without touching, extending, or risking anything already working. Concretely, that
meant: no changes to the six existing tier-access API routes, no changes to the Telegram bot's delivery
pipeline, no new R2 prefix inside anything the existing system reads, no shared Stripe webhook secret, and
no dependency on the parts of the repo the audit found to be broken (the incomplete `artifacts/*` build
targets, the non-installable `/backend`).

The result is a system that could be deleted entirely — Worker, D1 database, R2 buckets, `/shop`, `/admin`
— without anything else in the repository noticing.

## Component diagram

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Institutional site          │        │  Existing Telegram/Stripe     │
│  (GitHub Pages, unchanged)   │        │  tier-access system            │
│  index.html / app.js / ...   │        │  (bot/, backend/, unchanged)   │
│                               │        │                                │
│  + one new nav link → /shop  │        │  Untouched. Different Stripe   │
└──────────────┬────────────────┘        │  webhook secret, different R2  │
               │                          │  prefix, different everything. │
               ▼                          └────────────────────────────────┘
┌─────────────────────────────┐
│  /shop  (GitHub Pages)       │
│  Plain HTML/CSS/JS catalog,  │
│  product pages, checkout     │
│  initiation, policy pages    │
└──────────────┬────────────────┘
               │ fetch() — public JSON API
               ▼
┌───────────────────────────────────────────────────────────┐
│  Shop Worker  (Cloudflare Workers — new, isolated)          │
│  /shop/products, /shop/checkout, /shop/stripe/webhook,      │
│  /shop/download/:token, /shop/admin/*                       │
│                                                               │
│  ┌─────────────┐   ┌────────────────────┐   ┌─────────────┐ │
│  │ SHOP_DB (D1)│   │ SHOP_DOWNLOADS_BUCKET│  │SHOP_ASSETS_  │ │
│  │ products,   │   │ (R2, PRIVATE)        │  │BUCKET (R2,   │ │
│  │ orders,     │   │ purchasable files —   │  │PUBLIC)       │ │
│  │ licenses,   │   │ never public          │  │covers/       │ │
│  │ downloads,  │   └────────────────────┘   │previews only │ │
│  │ stripe      │                             └─────────────┘ │
│  │ events,     │                                              │
│  │ audit log   │                                              │
│  └─────────────┘                                              │
└──────────────┬──────────────────────────┬────────────────────┘
               │ webhook (signed)          │ REST (fetch, no SDK)
               ▼                           ▼
      ┌────────────────┐          ┌────────────────┐
      │     Stripe      │          │     Resend      │
      │ (separate acct/  │          │ transactional   │
      │  webhook secret  │          │ email            │
      │  from tier system)│         └────────────────┘
      └────────────────┘

┌──────────────────────────────────────────────┐
│  /admin  (Cloudflare Pages — SEPARATE from     │
│  GitHub Pages; behind Cloudflare Access)        │
│  Owner-only UI, calls the same Shop Worker       │
│  admin routes, each independently re-checked      │
│  server-side against the Access JWT                │
└──────────────────────────────────────────────┘
```

## Why a separate Cloudflare Worker, not a route on the existing one

`cloudflare/api-worker.js` and `config/cloudflare/ecosystem-worker.js` (the two existing, mutually
divergent Worker scripts found in the audit) both serve the tier-access system. Adding Shop routes to
either would mean:

- Every Shop deploy risks the tier-access routes (`PRESERVE_LIST.json` explicitly flags those as
  critical-do-not-touch)
- Sharing one `wrangler.toml`, one set of secrets, one R2 binding, one blast radius

Instead, `shop-worker/wrangler.toml` defines a brand-new Worker (`sentinel-fortune-digital-shop`) with its
own D1 database and its own two R2 buckets. It can be deployed, rolled back, or deleted independently.

## Why D1 instead of the existing R2-JSON pattern

The audit found that every other part of this system persists state as JSON objects in R2 (no database
anywhere). The Shop instead uses D1 (SQLite), for reasons specific to what the Shop needs that the
R2-JSON pattern doesn't give you cheaply:

- **Foreign keys and UNIQUE constraints** enforced at write time (a product can't have two orders racing
  to reuse the same Stripe session id; a slug/SKU collision is rejected atomically) — see
  `migrations/0001_init.sql`.
- **Idempotency that doesn't depend on read-then-write races.** `recordStripeEventIfNew` relies on a
  UNIQUE constraint on `stripe_event_id`, not a check-then-write pattern.
- It's a genuinely separate concern from the R2-JSON store the rest of the system uses — no code path in
  the Shop reads or writes `originus/*` at all.

This is a deliberate scope decision, not a rejection of the existing pattern — see
`SHOP_MVP_IMPLEMENTATION_PLAN.md` §7 for the original reasoning and `SHOP_KNOWN_LIMITATIONS.md` for what
it costs.

## Why zero runtime dependencies in the Worker

`src/lib/stripe.ts` and `src/lib/resend.ts` call both providers' REST APIs with raw `fetch` instead of
their official SDKs. This keeps the deployed Worker small, keeps every outbound request legible in one
file each, and avoids any Node-compatibility question for either SDK inside the Workers runtime.
`package.json`'s `dependencies` field is empty; only dev tooling (TypeScript, vitest, wrangler,
`@cloudflare/workers-types`) is a `devDependency`.

## Why GitHub Pages for `/shop` but Cloudflare Pages for `/admin`

The confirmed-live institutional site is on classic GitHub Pages (`sentinelfortune.github.io/sentinelfortune`
— see `SHOP_REPOSITORY_AUDIT.md` §2). The mission's explicit instruction was to extend that site, not
replace it, so `/shop`'s plain HTML pages live in this repo and ship with the same GitHub Pages deploy the
institutional site already uses.

**Cloudflare Access cannot protect a GitHub Pages URL.** Access is a Cloudflare edge product — it only
gates traffic that passes through Cloudflare's network (a Cloudflare Pages project, a Worker route, or a
domain proxied through Cloudflare DNS). `sentinelfortune.github.io` never touches Cloudflare's edge, so no
Access policy can apply to it, no matter how the HTML is written.

That's why `/admin`'s HTML/CSS/JS files live in this repo (for version control and review) but are meant
to be **deployed to a separate Cloudflare Pages project**, with a Cloudflare Access application configured
on that Pages project's hostname. `CLOUDFLARE_SHOP_SETUP.md` has the exact steps. Until that Pages project
exists and Access is configured on it, the files in `/admin` are not reachable by anyone — they aren't
wired into any deploy pipeline in this repo.

**Defense in depth, not reliance on one layer.** Even assuming Access is configured correctly, every
`/shop/admin/*` Worker route independently re-verifies the Cloudflare Access JWT server-side
(`src/lib/auth.ts::requireOwnerAccess`) using Cloudflare's own JWKS endpoint. If the admin UI were ever
served from an unprotected location by mistake, every API call it makes would still be rejected with 401 —
the UI would just be an empty shell with no login form and no way to authenticate (see
`SHOP_SECURITY_CHECKLIST.md`).

## Request flows

### Checkout

1. Browser sends `{ slug }` only to `POST /shop/checkout`.
2. Worker loads the product from D1 by slug; rejects if not `PUBLISHED`, not `publicly_purchasable`, or
   price not `price_confirmed`.
3. Worker creates a Stripe Checkout Session server-side (`src/lib/stripe.ts::createCheckoutSession`),
   embedding `product_id` in `metadata` — the only place price or product identity is decided.
4. Browser is redirected to Stripe's hosted Checkout page. Nothing about price ever round-trips through
   client-controlled state.

### Webhook fulfillment

1. Stripe POSTs to `/shop/stripe/webhook` with a raw JSON body and a `Stripe-Signature` header.
2. `verifyStripeWebhookSignature` recomputes the HMAC-SHA256 signature independently — a bad signature is
   rejected with 400 before any database write happens.
3. `recordStripeEventIfNew` (D1 UNIQUE constraint on `stripe_event_id`) makes replay/duplicate delivery a
   safe no-op.
4. On `checkout.session.completed` with `payment_status === "paid"`: an order, an order item, a license,
   and a download authorization (random 256-bit token, only its SHA-256 hash stored) are written, then two
   emails are sent via Resend.
5. On `charge.refunded`: the matching order (found by `payment_intent`) is marked `REFUNDED`, its license
   is revoked, and every download authorization tied to that order is revoked — a refunded customer loses
   download access immediately, not eventually.

### Secure download

1. `GET /shop/download/:token` hashes the incoming token and looks up the authorization by hash — the raw
   token is never stored, so a database read alone can't produce a working link.
2. `evaluateDownloadAuthorization` checks revoked → expired → limit-reached → OK, in that order, against a
   `now` passed in explicitly (fully unit-testable without wall-clock flakiness).
3. On success, the Worker streams the R2 object body directly in the response — the private downloads
   bucket's contents are never exposed as a public URL at any point.
