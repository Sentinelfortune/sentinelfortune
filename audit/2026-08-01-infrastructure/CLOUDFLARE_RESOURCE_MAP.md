> **READ-ONLY AUDIT — 2026-08-01.** No infrastructure was modified. Nothing deployed, migrated or merged.
> Evidence sources: Cloudflare control-plane API (Workers/D1/R2/KV) and the local git repository.
> **All outbound HTTP from the audit environment is blocked** (every host returns `000`), so no live page,
> live endpoint or live redirect was fetched. Anything requiring HTTP or a Cloudflare API surface not
> exposed to this environment is marked **NOT VERIFIED**.

# Cloudflare Resource Map

Account inventory as returned by the Cloudflare API.

## D1 (2 total)

| Name | UUID | Created | Tables (verified by SQL) | Size |
|---|---|---|---|---|
| `sentinel-fortune-shop-test` | `54dbbd38-85b6-40e9-a879-55f717c7404b` | 2026-07-30 | **12** | 225,280 B |
| `oriflare_db` | `a9114d59-…ba9e` | 2025-11-05 | not inspected (out of scope) | 12,288 B |

`sentinel-fortune-shop-test` tables: `admin_audit_log`, `customers`, `download_authorizations`,
`download_events`, `licenses`, `order_items`, `orders`, `product_files`, `product_images`, `products`,
`settings`, `stripe_events`.

**No production shop database exists.**

## R2 (6 total)

| Bucket | Created | Role |
|---|---|---|
| `sentinel-fortune-shop-downloads-test` | 2026-07-30 | Private paid files |
| `sentinel-fortune-shop-assets-test` | 2026-07-30 | Cover/preview images |
| `originus` | 2025-10-29 | Pre-existing, not shop |
| `originus-infinity-vault` | 2025-10-20 | Pre-existing, not shop |
| `originus-staging` | 2025-11-08 | Pre-existing, not shop |
| `staging` | 2025-11-04 | Pre-existing, not shop |

Public-access settings per bucket: **NOT VERIFIED** (no API tool). Object listings: **NOT VERIFIED**.
**No production shop buckets exist.**

## KV (12 total) — none shop-related

`sfl_sentinelfortune_cfg` · `sfl_sentinelfortune_cache` · `SFL_GLOBAL_KV` · `SENTINEL_OPS_KV` ·
`sentinel-members` · `sentinel-content` · `originus_state` · `originus_inbox` · `ORIGINUS_QUEUE` ·
`miar_inbox` · `miar_cfg` · `miar_cache`

The Shop Worker uses no KV. `sentinel-content` and `sentinel-members` exist but their consumers are
**NOT VERIFIED**.

## Workers — 65 total

One is shop-related: `sentinel-fortune-digital-shop-test`. See `WORKER_CONNECTION_MAP.md`.

## Not inspectable from this environment

Pages projects · custom domains · routes · DNS · Access applications · Queues · Durable Objects ·
Workflows · Hyperdrive (tool exists, not queried — out of scope) · secrets (correctly inaccessible).
