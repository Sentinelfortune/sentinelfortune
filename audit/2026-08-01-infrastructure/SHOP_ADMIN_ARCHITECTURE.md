> **READ-ONLY AUDIT — 2026-08-01.** No infrastructure was modified. Nothing deployed, migrated or merged.
> Evidence sources: Cloudflare control-plane API (Workers/D1/R2/KV) and the local git repository.
> **All outbound HTTP from the audit environment is blocked** (every host returns `000`), so no live page,
> live endpoint or live redirect was fetched. Anything requiring HTTP or a Cloudflare API surface not
> exposed to this environment is marked **NOT VERIFIED**.

# Shop Admin Architecture

`https://sentinel-fortune-shop-admin.pages.dev/`

## Live state: NOT VERIFIED

No Pages API tool; all HTTP blocked. The Pages project, its deployment mode, its current deployment,
and the live behaviour of `/products`, `/orders`, `/licenses`, `/files`, `/settings` could **not** be
observed. Everything below is from repository source.

## Source architecture (VERIFIED in git)

| Component | Detail |
|---|---|
| Static assets | `admin/` — 12 files at ZIP root |
| Pages Function | `admin/_worker.js`, prebuilt (18,872 B) from `functions/` |
| Routing | `admin/_routes.json` — `include: ["/api/*"]`, `exclude: []` |
| API base | `admin/admin-config.js` → `window.SHOP_API_BASE = "/api"` — same-origin |
| Auth | Access at the edge; the `/api/*` Function reads the token server-side and forwards it; the Worker re-verifies |
| Data | 100% from `sentinel-fortune-digital-shop-test`; the admin holds no state |

Products, orders, licenses and files pages all read from that one Worker, which reads
`sentinel-fortune-shop-test` (D1) and the two `-test` R2 buckets.

## Is `b3622a8` deployed?

**No — source only.**

- The import UI (`admin/products.html` "Import Product Package", `initImport()` in `admin.js`) exists
  only on the branch.
- Its backend, `/shop/admin/import/*`, is not in the deployed Worker (see `WORKER_CONNECTION_MAP.md`).
- Whether the *admin Pages project* currently serves the `bce03d6`/`696dc91` bundle is **NOT VERIFIED**.

**Even if the admin ZIP were uploaded today, import would fail** — the Worker half is not deployed.
Both halves must ship together.

## Evidence the admin has never been used to author a product

D1 holds exactly one product: the migration seed, placeholders intact, `updated_at` identical to
`created_at` (2026-07-27T00:00:00.000Z). `admin_audit_log` is **empty** — every mutating admin action
writes there. No product has been created, edited, priced or published through the deployed admin.

## Relationship to the public shop

Same Worker, same D1 — one source of truth by design. Currently moot: the public storefront cannot
reach the Worker at all (see `PUBLIC_SHOP_ARCHITECTURE.md`).
