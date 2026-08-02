> **READ-ONLY AUDIT — 2026-08-01.** No infrastructure was modified. Nothing deployed, migrated or merged.
> Evidence sources: Cloudflare control-plane API (Workers/D1/R2/KV) and the local git repository.
> **All outbound HTTP from the audit environment is blocked** (every host returns `000`), so no live page,
> live endpoint or live redirect was fetched. Anything requiring HTTP or a Cloudflare API surface not
> exposed to this environment is marked **NOT VERIFIED**.

# Worker Connection Map

## Method note

`workers_get_worker` returns only `name` and `id` in this environment — **no bindings, routes, custom
domains, service bindings or environment variable names**. Everything below marked "from source" comes
from `shop-worker/wrangler.toml` in git and describes what *would* be bound by a deploy of that config,
not what the running Worker has attached. Treat live bindings as NOT VERIFIED.

## The one commerce Worker

### `sentinel-fortune-digital-shop-test`

| Property | Value | Source |
|---|---|---|
| Script ID | `43981f6eccae4f52916a2d4dbdd1840a` | API — VERIFIED |
| Created | 2026-07-30T23:56:05Z | API — VERIFIED |
| **Last modified** | **2026-07-31T04:12:52Z** | API — VERIFIED |
| Environment | `test` | from source |
| Repo | `sentinelfortune/sentinelfortune`, `shop-worker/` | from source |
| D1 `SHOP_DB` | `sentinel-fortune-shop-test` | from source — live binding NOT VERIFIED |
| R2 `SHOP_DOWNLOADS_BUCKET` | `sentinel-fortune-shop-downloads-test` | from source |
| R2 `SHOP_ASSETS_BUCKET` | `sentinel-fortune-shop-assets-test` | from source |
| Env var **names** | `ENVIRONMENT`, `RESEND_FROM_EMAIL`, `SHOP_PUBLIC_BASE_URL`, `SHOP_WORKER_BASE_URL`, `CF_ACCESS_TEAM_DOMAIN`, `ADMIN_ALLOWED_ORIGIN` | from source |
| Secret **names** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CF_ACCESS_AUD` | from source — values never read |
| Custom domain / routes | — | **NOT VERIFIED** |
| KV / Queues / DO / service bindings | none in source | — |

### Deployed vs source — the critical gap

Last modified **2026-07-31T04:12:52Z**. Therefore the running script **predates**:

| Commit | Time | Not deployed |
|---|---|---|
| `696dc91` | 2026-07-31T04:33Z | Access issuer verification; `ADMIN_ALLOWED_ORIGIN` fix |
| `488556c` | 2026-07-31T22:12Z | `GET /shop/order/status` (in-browser delivery) |
| `b3622a8` | 2026-08-01T02:38Z | `POST /shop/admin/import/validate` and `/commit` |

**The House of Assets import endpoints are NOT deployed.** Source-only.
Code-level confirmation by fetching the deployed bundle was **not performed** (response size risk);
the timestamp ordering is the evidence.

### Participation

| Function | This Worker |
|---|---|
| Product catalogue, product admin, checkout, Stripe, webhooks, orders, licenses, downloads, refunds, public assets | Yes (source) |
| Product imports | Source only — **not deployed** |
| Private app (`app.sentinelfortune.com`) | No relationship found |

## The other 64 Workers

None is shop-related by any verified evidence. Names suggest other product lines (`originus-*`,
`miar-*`, `sfl-*`, `je-suis-*`, `sentinelfortune-frontend*`, `core-sentinelfortune`, `solarium-seo`).

**Per the audit's own rule, naming is not evidence.** Purpose, routes and bindings for all 64 are
**NOT VERIFIED**. Notably: `solarium-seo` and `sentinel-content` KV exist and *may* relate to a content
pipeline, but nothing was confirmed.
