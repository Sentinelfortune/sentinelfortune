> **READ-ONLY AUDIT — 2026-08-01.** No infrastructure was modified. Nothing deployed, migrated or merged.
> Evidence sources: Cloudflare control-plane API (Workers/D1/R2/KV) and the local git repository.
> **All outbound HTTP from the audit environment is blocked** (every host returns `000`), so no live page,
> live endpoint or live redirect was fetched. Anything requiring HTTP or a Cloudflare API surface not
> exposed to this environment is marked **NOT VERIFIED**.

# Existing Connections

Classification is against **deployed reality**, not source.

| # | Connection | Status | Evidence |
|---|---|---|---|
| 1 | app.sentinelfortune.com → Shop Admin | **NOT VERIFIED** | Nothing known about the host |
| 2 | app.sentinelfortune.com → Shop Worker | **NOT VERIFIED** | ditto |
| 3 | app.sentinelfortune.com → Public Website | **NOT VERIFIED** | ditto |
| 4 | Shop Admin → Shop Worker | **PARTIALLY CONNECTED** | Same-origin `/api/*` proxy exists in source; deployment of both halves NOT VERIFIED; the Worker is 3 commits stale |
| 5 | Shop Admin → D1 | **CONNECTED** (via Worker) | 12 tables live; seed row readable |
| 6 | Shop Admin → R2 | **PARTIALLY CONNECTED** | Both `-test` buckets exist; `product_files`=0 and `product_images`=0, so nothing has ever been written |
| 7 | Shop Admin → Public Shop | **NOT CONNECTED** | Shared D1 by design, but the public side cannot reach the API |
| 8 | Public Shop → Shop Worker | **NOT CONNECTED** | `main` `shop-config.js` = `REPLACE_WITH_SHOP_WORKER_URL` |
| 9 | Shop Worker → Stripe | **NOT VERIFIED** | Secret names in config; presence of secrets not readable; `stripe_events`=0 — never exercised |
| 10 | Stripe → Webhook | **NOT VERIFIED** | Endpoint exists in deployed code; `stripe_events`=0 ⇒ no event ever received |
| 11 | Webhook → Orders | **NOT CONNECTED (unexercised)** | `orders`=0 |
| 12 | Orders → Licenses | **NOT CONNECTED (unexercised)** | `licenses`=0 |
| 13 | Licenses → Secure Downloads | **NOT CONNECTED (unexercised)** | `download_authorizations`=0 |
| 14 | Shop Import → Product Draft | **NOT CONNECTED** | Endpoints exist only in `b3622a8`; deployed Worker predates it |
| 15 | Product Draft → Public Catalogue | **NOT CONNECTED** | One DRAFT product; `published`=0; public side broken anyway |

## Summary

Nothing in the commerce chain has ever executed end to end. Every counter downstream of a purchase is
zero. The system is correctly built and correctly wired **in source**; almost none of it is live.
