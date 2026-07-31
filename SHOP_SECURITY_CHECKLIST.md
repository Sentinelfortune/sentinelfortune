# Shop Security Checklist

Status of every security control the mission required, as implemented in this branch. "Implemented"
means the code exists and is unit-tested (see `shop-worker/tests/`); it does not mean it has been
verified against a live Cloudflare/Stripe/Resend deployment — that verification is tracked separately in
`SHOP_RELEASE_CHECKLIST.md`.

| Control | Status | Where |
|---|---|---|
| No secrets committed | ✅ Implemented | `.dev.vars.example` (placeholders only), `.gitignore` updated to exclude `shop-worker/.dev.vars` and `shop-worker/.wrangler/` |
| No private product files committed | ✅ Implemented | Downloadable files are uploaded to R2 at runtime via `/shop/admin/products/:id/files`; none are ever written into the git repo |
| Stripe webhook signature verification | ✅ Implemented, tested | `src/lib/stripe.ts::verifyStripeWebhookSignature` — HMAC-SHA256 recomputed independently, constant-time compared, timestamp-tolerance replay window. Tests: `tests/stripe.test.ts`, `tests/webhook-route.test.ts` |
| Cloudflare Access for admin | ✅ Implemented (Worker side); ⚠️ requires Owner deployment step | `src/lib/auth.ts::requireOwnerAccess` verifies the Access JWT's signature against Cloudflare's JWKS and checks audience + expiry on every `/shop/admin/*` request. **The Access application itself must be configured by the Owner** — see `CLOUDFLARE_SHOP_SETUP.md` §6, and the GitHub-Pages-can't-host-Access note in `SHOP_ARCHITECTURE.md` |
| Server-side authorization (not client-trust) | ✅ Implemented | Every admin route requires a verified identity before touching data; every public route re-derives price/purchasability from D1, never from the request |
| CORS restrictions | ✅ Implemented | `src/lib/cors.ts` — explicit origin allow-list (the GitHub Pages origin + local dev), not `*` |
| Input validation | ✅ Implemented, tested | `src/lib/validate.ts` — SKU/slug/email format, license type enum, FAQ/list shape, price bounds. Tests: `tests/validate.test.ts` |
| Rate limiting | ⚠️ Partial — best-effort only | `src/lib/ratelimit.ts` — an in-isolate fixed-window limiter on `/shop/checkout`. This bounds abuse per warm isolate, not globally across Cloudflare's edge. **The authoritative rate limit should be configured as a Cloudflare Rate Limiting Rule on the zone**, which this code does not (and cannot) configure — see `SHOP_KNOWN_LIMITATIONS.md` |
| Upload validation | ✅ Implemented, tested | `src/lib/validate.ts::validateDownloadFile` / `validateImageFile` — extension allow-list, explicit dangerous-extension deny-list, content-type check, size caps. Tests: `tests/validate.test.ts`, `tests/admin-files-route.test.ts` |
| Filename sanitization | ✅ Implemented, tested | `src/lib/validate.ts::sanitizeFilename` — strips path components, disallowed characters, caps length. Tests: `tests/validate.test.ts` |
| Download authorization | ✅ Implemented, tested | Random 256-bit token, only its SHA-256 hash stored; revoked/expired/limit-reached all independently checked. Tests: `tests/download-auth.test.ts`, `tests/download-route.test.ts` |
| Webhook idempotency | ✅ Implemented, tested | D1 UNIQUE constraint on `stripe_events.stripe_event_id`; business-object check (`getOrderBySessionId`) as a second layer. Tests: `tests/db.test.ts`, `tests/webhook-route.test.ts` |
| Admin audit logs | ✅ Implemented | Every mutating admin action (create/update/publish/unpublish/archive/duplicate/upload/delete/resend/replacement-link/revoke/settings) writes to `admin_audit_log` with the authenticated actor's email. Visible on the Dashboard page |
| No public directory listing | ✅ Implemented | Neither R2 bucket is given public access (documented requirement in `CLOUDFLARE_SHOP_SETUP.md` §2). Downloads are token-gated through the Worker; cover/preview images go through `/shop/asset/:id`, which resolves a `product_images` row id — an arbitrary R2 key cannot be requested. Tests: `tests/asset-route.test.ts` |
| Access JWT never exposed to browser JS | ✅ Implemented, tested | The admin calls only its own Pages origin (`/api`); `functions/_shared/proxy.ts` reads the token server-side and forwards it, stripping `Set-Cookie` and CORS headers from the response. No admin JavaScript references `CF_Authorization`, `Cf-Access-Jwt-Assertion` or `document.cookie`. Tests: `tests/admin-proxy.test.ts` |
| Admin proxy is not an open relay | ✅ Implemented, tested | Only `/shop/health` and `/shop/admin/*` are forwardable; checkout, webhook, download and catalog paths return 404 without the Worker being called. Tests: `tests/admin-proxy.test.ts` |
| Access token issuer verified | ✅ Implemented, tested | `verifyAccessJwtWithJwks` requires `iss === https://<team domain>` alongside signature, audience and expiry, so a validly signed token from another Cloudflare team is rejected. Tests: `tests/auth.test.ts`, `tests/admin-proxy.test.ts` |
| No card data handled directly | ✅ Implemented | All payment collection happens on Stripe's hosted Checkout page; this system never receives, transmits, or stores card numbers |
| No fabricated transactions | ✅ Implemented | An order/license is created only inside the signature-verified webhook handler, only when `payment_status === "paid"`, and only once (idempotency). There is no code path that creates an order from a client-side "I paid" claim |
| Generic customer errors / detailed safe server logs | ✅ Implemented | `src/lib/http.ts::safeServerError` logs the real error server-side and returns only a generic message to the caller |
| No exposure of existing Telegram invite links | ✅ Implemented | The Shop Worker has no code path that reads any existing tier/channel data; it doesn't know those invite links exist |

## Pre-existing gap this mission did not touch, per instructions

`frontend/src/pages/ops/*` (the existing tier-access system's operations dashboard) has **no
authentication of any kind** — it's a public route rendering, among other things, hardcoded private
Telegram channel invite links client-side. This was documented in `SHOP_REPOSITORY_AUDIT.md` §10 and
flagged as do-not-touch/out-of-scope for this mission (the mission's explicit instruction: "Do not expand
or refactor those legacy routes in this mission"). It remains exactly as found. Fixing it is a separate,
future piece of work on the existing frontend, not something the Shop's isolation should be used to avoid
mentioning.

## What still requires an Owner action before this checklist is "done" in practice

1. Configure the Cloudflare Access application (`CLOUDFLARE_SHOP_SETUP.md` §6) and deploy `/admin` behind
   it (§7) — until then, `/admin`'s HTML files are not reachable by anyone, but they are also not yet
   *protected by Access* in any real sense, because they aren't deployed at all.
2. Add a Cloudflare Rate Limiting Rule for `/shop/checkout` and `/shop/stripe/webhook` on the zone, as a
   stronger complement to the in-Worker best-effort limiter.
3. Run a full Stripe test-mode purchase (`STRIPE_SHOP_SETUP.md` §5) before this system handles a single
   real dollar.
