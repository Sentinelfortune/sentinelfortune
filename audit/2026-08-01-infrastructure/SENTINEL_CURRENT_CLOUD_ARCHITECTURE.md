> **READ-ONLY AUDIT — 2026-08-01.** No infrastructure was modified. Nothing deployed, migrated or merged.
> Evidence sources: Cloudflare control-plane API (Workers/D1/R2/KV) and the local git repository.
> **All outbound HTTP from the audit environment is blocked** (every host returns `000`), so no live page,
> live endpoint or live redirect was fetched. Anything requiring HTTP or a Cloudflare API surface not
> exposed to this environment is marked **NOT VERIFIED**.

# Current Cloud Architecture

## What was verifiable, and what was not

| Surface | Method | Status |
|---|---|---|
| Workers inventory | Cloudflare API | VERIFIED |
| D1 databases + schema + row counts | Cloudflare API + read-only SQL | VERIFIED |
| R2 buckets | Cloudflare API | VERIFIED |
| KV namespaces | Cloudflare API | VERIFIED |
| Git repository, branches, file contents | local git | VERIFIED |
| Pages projects and deployments | no API tool exposed | **NOT VERIFIED** |
| Custom domains / routes / DNS | no API tool exposed | **NOT VERIFIED** |
| Cloudflare Access applications & policies | no API tool exposed | **NOT VERIFIED** |
| Worker bindings, service bindings, env var names | `workers_get_worker` returns name+id only | **NOT VERIFIED** |
| Queues, Durable Objects, Workflows | no API tool exposed | **NOT VERIFIED** |
| Any live HTTP behaviour | network blocked | **NOT VERIFIED** |

## The commercial system as actually deployed

There is exactly **one** deployed commerce Worker, **one** D1 database and **two** R2 buckets. All three
are `-test`. **No production shop resources exist in this account.**

```
GitHub Pages (public)            Cloudflare Pages (private)        Cloudflare Worker
sentinelfortune.github.io        sentinel-fortune-shop-admin        sentinel-fortune-digital-shop-test
  built from main @550fd5d         NOT VERIFIED (no API)              modified 2026-07-31T04:12:52Z
        │                                  │                                  │
        │ SHOP_API_BASE =                  │ /api/* proxy                     ├── D1  sentinel-fortune-shop-test
        │ "REPLACE_WITH_..."               │ NOT VERIFIED as deployed         │      12 tables, 1 product (seed)
        │ ✗ BROKEN                         │                                  ├── R2  ...-downloads-test (0 shop objects)
        ▼                                  ▼                                  └── R2  ...-assets-test
   cannot reach the API              Access-gated admin
```

## Decisive findings

1. **The public storefront cannot reach the API.** `shop/shop-config.js` on `main` is still
   `https://REPLACE_WITH_SHOP_WORKER_URL.workers.dev`. Every catalogue and product-detail fetch fails.
2. **The deployed Worker is three commits stale.** It was last modified 2026-07-31T04:12:52Z. Commits
   `696dc91` (04:33), `488556c` (22:12) and `b3622a8` (2026-08-01 02:38) all postdate it.
3. **The D1 holds only the seed row.** One product, `SFL-AIOPS-001`, `status=DRAFT`, short description
   literally `"Draft product — short description pending Owner finalization"`, `price_cents=NULL`.
   Zero orders, licenses, customers, files, images, Stripe events, download authorizations, audit entries.
   **No product has ever been created or edited through the deployed admin.**
4. **No production commerce resources exist.** No `sentinel-fortune-shop` D1, no `-downloads`/`-assets`
   R2 without the `-test` suffix, no production shop Worker.
5. `main` is at `550fd5d` (2026-07-30). Every subsequent fix lives only on
   `claude/cloudflare-shop-test-deployment`, unmerged.

## Correction to a Cloudflare API field

`d1_databases_list` reports `num_tables: 0` for both databases. That field is wrong. A direct
`sqlite_master` query returns **12 tables**. Do not trust `num_tables` from the list endpoint.
