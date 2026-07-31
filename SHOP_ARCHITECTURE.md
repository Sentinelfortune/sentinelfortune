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
│  /shop/download/:token, /shop/asset/:id, /shop/admin/*      │
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

**The admin browser never crosses an origin.** Access authenticates the Owner on the *Pages* hostname: it
scopes `CF_Authorization` to that hostname and injects `Cf-Access-Jwt-Assertion` only on requests it
forwards to that origin. A `fetch()` from Pages to the Worker's separate `*.workers.dev` hostname is
cross-site, so the cookie is not sent and page JavaScript cannot set the header — the Worker would see no
token and return 401, which is exactly what it should do.

So the admin calls only its own origin (`window.SHOP_API_BASE = "/api"`), and a Pages Function
(`functions/api/[[path]].ts` → `functions/_shared/proxy.ts`) runs server-side inside the
Access-authenticated request, reads the token there, and forwards it to the Worker server-to-server:

```
browser ──same-origin──> /api/shop/admin/*  (Pages Function, behind Access)
                              │  reads Cf-Access-Jwt-Assertion / CF_Authorization
                              │  server-side; never returns it to the page
                              ▼
                    Worker /shop/admin/*  — verifies signature, issuer,
                                            audience and expiry against JWKS
```

The proxy is transport, not authority: it forwards a token and returns the Worker's own status unchanged,
so a forged or wrong-audience token still 401s, and a request with no token 401s at the proxy without the
Worker being called at all. It refuses to forward anything but `/shop/health` and `/shop/admin/*`, so it
cannot be used as a general relay. Direct calls to the Worker's hostname are unaffected and still require
a valid token.

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

---

# Public / private boundary (pre-launch alignment)

The repository holds public web content, private operational source, and internal
governance material side by side. This section is the authoritative statement of which
is which, and who serves what.

## 1. What is public

Only these are intended to reach the open web:

| Surface | Served by | Contents |
|---|---|---|
| Institutional homepage | GitHub Pages | `index.html` (self-contained: inline CSS + JS), `IMG_7098.jpeg`, `sitemap.xml` |
| Digital Shop storefront | GitHub Pages | `shop/` — catalog, product pages, success/cancel, policy pages |
| S.5 ASCENT game | GitHub Pages | `frontend/games/` — linked from the homepage |
| Product covers / previews | Cloudflare R2 (private assets bucket), served by the Worker at `/shop/asset/:id` | Uploaded by the Owner through the admin |

`app.js`, `styles.css`, and `data/` remain published but are orphaned legacy files —
`index.html` does not load them. They contain no secrets and are left in place
deliberately rather than risk breaking something not visible from this repository.

## 2. What is private

Never public, regardless of where the file lives in this repository:

- `admin/` — Owner Admin UI (separate Cloudflare Pages project, behind Cloudflare Access)
- `functions/` — that Pages project's server-side `/api/*` proxy
- `shop-worker/` — Worker source, tests, migrations, wrangler config
- `bot/` — Telegram bot source (contains private channel invite links)
- `frontend/src`, `frontend/modules` — React app source (its `/ops` pages embed private
  channel invite codes and an internal Worker hostname client-side)
- `backend/`, `cloudflare/`, `config/` — internal API/Worker/build infrastructure
- `originus/`, `vault/` — ORIGINUS governance manifests and canon
- `artifacts/` — stale build mirrors
- The Shop's internal operational documentation (setup guides, security and release
  checklists, known limitations)

## 3. What GitHub Pages publishes

Pages serves the repository root under `/sentinelfortune/`, minus everything in
`_config.yml`'s `exclude:` list. After the pre-launch hardening that list reduces the
published surface from **342 tracked files to 33**. Every entry in that list carries an
inline comment explaining why it is excluded; `frontend` is excluded *per subdirectory*
precisely so `frontend/games/` stays reachable.

Nothing is deleted or moved by this — excluded paths stay in version control and stay
available to their real deployment targets.

## 4. What Cloudflare serves

- **Worker** — the entire Shop API: catalog, checkout, Stripe webhook, token-gated
  downloads, and all admin endpoints
- **D1** — products, orders, customers, licenses, download authorizations, Stripe event
  ledger, admin audit log
- **R2 (downloads, private)** — purchasable files; never publicly readable, streamed only
  through the Worker's `/shop/download/:token` route
- **R2 (assets, private)** — cover and preview images only, served through the Worker's
  `/shop/asset/:id` route (keyed on the `product_images` row id, so the bucket's key space
  is never directly addressable); no R2 bucket in this system needs public access
- **Cloudflare Pages + Access** — the Owner Admin UI, plus the same-origin `/api/*` Pages
  Function that carries the Access token to the Worker (`functions/`)

## 5. What the admin interface is

`admin/` is the Owner-only control surface for products, pricing, uploads, orders,
licenses, and settings. It has **no username/password login by design**: Cloudflare Access
authenticates at the edge, and the Worker independently re-verifies the Access JWT on
every `/shop/admin/*` request. GitHub Pages cannot enforce Access, which is why `admin/`
is excluded from the Pages surface and deployed separately.

## 6. House of Assets

House of Assets is the private production operating system of Sentinel Fortune LLC. It is
**not part of this repository**, is not a public product, is not embedded in the
storefront, and is outside the scope of the Digital Shop. Nothing in the public surface
references it — verified.

## 7. What the Owner must configure before test deployment

Non-secret, committed in `shop-worker/wrangler.toml` (replace each `REPLACE_WITH_*`):
`database_id`, `SHOP_WORKER_BASE_URL`, `CF_ACCESS_TEAM_DOMAIN`, `ADMIN_ALLOWED_ORIGIN`.
(`SHOP_ASSETS_PUBLIC_BASE_URL` is optional and deliberately unset — see §"R2 (assets, private)"
above.)

Non-secret, in the front-end config files (one per front end, never inline in logic):
`shop/shop-config.js` and `admin/admin-config.js` → `window.SHOP_API_BASE`.

Secrets, via `wrangler secret put` only — never committed:
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CF_ACCESS_AUD`.

`CF_ACCESS_AUD` is a secret rather than a var for two reasons: it identifies a specific Access
application and does not belong in Git, and Cloudflare rejects a `secret put` for a binding name
already declared as a var (error 10053). `CF_ACCESS_TEAM_DOMAIN` stays a var — it is the public
Zero Trust hostname that serves the JWKS.

Every one of these fails closed while unset: missing Stripe/Resend config produces a real
error rather than a fabricated success, and an unset `ADMIN_ALLOWED_ORIGIN` simply leaves
the admin origin off the CORS allow-list without affecting the storefront.

## 8. Launch order

1. Local validation (typecheck, tests, wrangler dry-run) — see `SHOP_RELEASE_CHECKLIST.md` Stage 1
2. Cloudflare test deployment: D1 + R2 ×2 + Worker + Access + admin Pages (Stage 2)
3. Stripe **test-mode** payment (Stage 3)
4. Webhook validation, including idempotency and a bad-signature rejection (Stage 4)
5. Secure download validation: limit, expiry, revocation (Stage 5)
6. Email validation via Resend (Stage 6)
7. Refund path validation (Stage 7)
8. Merge PR #3, then GitHub Pages validation — including asserting `/admin/` and
   `/shop-worker/` return 404 (Stage 8)
9. Production deployment, live Stripe, first real product (Stage 9)
10. Netlify retirement, last (Stage 10)
