# Sentinel Fortune LLC — Digital Shop Worker

An isolated Cloudflare Worker that is the sole backend for the Digital Shop
MVP: public product catalog, Stripe Checkout, verified webhook fulfillment,
license issuance, and token-gated secure downloads.

This Worker is intentionally **separate** from the existing
`sentinel-fortune-ecosystem` Worker (`cloudflare/api-worker.js`) and does not
share its D1 database, R2 buckets, routes, or Stripe webhook endpoint. See
`SHOP_ARCHITECTURE.md` at the repo root for the full rationale and diagram.

## Zero runtime dependencies

Stripe and Resend are both called with raw `fetch` (`src/lib/stripe.ts`,
`src/lib/resend.ts`) — there is no `stripe` or `resend` npm package in
`dependencies`. `devDependencies` only contains TypeScript tooling
(`typescript`, `vitest`, `wrangler`, `@cloudflare/workers-types`). This keeps
the deployed Worker small and every external call explicit and auditable.

## Local setup

```bash
cd shop-worker
npm install
cp .dev.vars.example .dev.vars   # then fill in real Stripe TEST keys + Resend key
```

`wrangler.toml` contains placeholder IDs (`REPLACE_WITH_...`) for the D1
database and R2 buckets — these must be created and filled in before
`wrangler dev`/`wrangler deploy` will work against real Cloudflare resources.
See `CLOUDFLARE_SHOP_SETUP.md` at the repo root for the exact commands.

## Commands

| Command | Purpose |
|---|---|
| `npm run typecheck` | `tsc --noEmit` — no build output, just type checking |
| `npm test` | Runs the vitest unit test suite (see `tests/`) |
| `npm run dev` | `wrangler dev` — local Worker with local D1/R2 emulation |
| `npm run db:migrate:local` | Applies `migrations/*.sql` to the local D1 emulator |
| `npm run db:migrate:remote` | Applies `migrations/*.sql` to the real, remote D1 database |
| `npm run deploy` | `wrangler deploy` — deploys the `development` environment |
| `npm run deploy:production` | `wrangler deploy --env production` — **do not run without Owner approval** |

## Directory layout

```
src/
  index.ts              — fetch() entrypoint, route table, admin auth gate
  router.ts             — minimal dependency-free path router
  types.ts              — Env bindings + D1 row types
  lib/
    db.ts                — all D1 queries (routes never write raw SQL)
    stripe.ts             — Checkout Session creation + webhook signature verification (fetch-based)
    resend.ts              — transactional email sending (fetch-based)
    email-templates.ts     — branded HTML+text email bodies
    auth.ts                 — Cloudflare Access JWT verification (defense-in-depth)
    download-auth.ts         — download token generation/hashing/expiry evaluation
    validate.ts               — filename sanitization, file-type allow-list, publish-readiness gate
    money.ts                   — integer-cents helpers, price parsing
    ids.ts                      — ID/order-number/license-number/token generation
    license-text.ts              — per-license-type rights/restrictions text
    ratelimit.ts                  — best-effort in-isolate rate limiter
    audit.ts                       — admin_audit_log writer
    cors.ts                         — restrictive CORS allow-list
    http.ts                          — response helpers (generic customer errors, safe server logs)
  routes/
    products.ts   — public catalog + product detail
    checkout.ts    — POST /shop/checkout (server-authoritative pricing)
    webhook.ts       — POST /shop/stripe/webhook
    download.ts       — GET /shop/download/:token
    admin/
      products.ts    — CRUD, price confirmation, publish/unpublish/archive/duplicate
      files.ts         — cover/preview image + downloadable file upload/delete
      orders.ts          — order/license listing, resend email, replacement link, revoke
      settings.ts          — default download expiry/limit, whoami, audit log

migrations/     — D1 schema (0001) + first-product seed (0002)
tests/          — vitest unit tests, see repo-root SHOP_MVP_README.md for exact run output
```

## What this Worker does NOT do

- It does not touch `ORIGINUS_R2`, `originus/_canon/`, the existing six
  tier-access API routes, or the Telegram bot's delivery pipeline.
- It does not implement username/password authentication — Owner Admin
  routes require a valid Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`),
  checked both by Access at the edge and again inside this Worker.
- It does not trust the browser for price or payment status — see
  `src/routes/checkout.ts` and `src/routes/webhook.ts`.
