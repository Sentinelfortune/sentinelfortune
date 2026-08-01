# Main Branch Merge Readiness — Shop Commerce MVP

Branch: `claude/cloudflare-shop-test-deployment` · Base: `main` @ `550fd5d`
74 files changed, +10,328 / −236.

**Do not merge until the live end-to-end test in `SHOP_MVP_RUNBOOK.md` §5 passes.** Merging publishes
the public storefront changes; publishing a storefront whose purchase path has never completed once is
the wrong order.

---

## 1. Safe to merge

| Area | Files | Note |
|---|---|---|
| Shop Worker source | `shop-worker/src/**` | Adds `/shop/order/status`, `/shop/asset/:id`, `/shop/admin/import/*`; hardens Access with an issuer check |
| Worker tests | `shop-worker/tests/**` | 187 tests, 17 files |
| Owner Admin | `admin/**` | Light-premium redesign, `/api` same-origin proxy, import UI, prebuilt `_worker.js` |
| Pages Function | `functions/**` | Server-side Access-token proxy |
| Public storefront | `shop/success.js`, `shop/success.html`, `shop/shop-config.js` | In-browser delivery + the API base fix |
| Build tooling | `scripts/**` | Product, cover and admin-bundle builders + validators |
| Product source | `product-source/**` | SFL-AIOPS-001 content and cover generator |
| Documentation | `PRODUCT_MANIFEST_SCHEMA.md`, `SHOP_MVP_RUNBOOK.md`, `SHOP_*` updates | |
| Publication boundary | `_config.yml` | Adds `functions`, `scripts`, `dist`, `product-source`, `audit` exclusions |

## 2. The one change that actually alters the live public site

`shop/shop-config.js` — `REPLACE_WITH_SHOP_WORKER_URL` → the real test Worker hostname.

**This points the public storefront at the TEST Worker.** That is correct for a controlled test and
must be revisited before real customers. Everything else in `shop/` is additive.

## 3. Test-only configuration — must not reach production

All confined to `[env.test.vars]` in `shop-worker/wrangler.toml`. `[env.production.vars]` is a separate
block and none of these values leak into it:

```
ENVIRONMENT              = "test"
SHOP_WORKER_BASE_URL     = "…-test.sentinelfortunellc.workers.dev"
CF_ACCESS_TEAM_DOMAIN    = "sentinelfortunellc.cloudflareaccess.com"
ADMIN_ALLOWED_ORIGIN     = "https://sentinel-fortune-shop-admin.pages.dev"
```

Bindings are `-test` only: D1 `sentinel-fortune-shop-test`, R2 `…-downloads-test` / `…-assets-test`.
Verified by `wrangler deploy --env test --dry-run`.

## 4. Production placeholders still present — intentionally

| Line | Placeholder | Blocks |
|---|---|---|
| 28, 159 | `database_id = "REPLACE_WITH_REAL_D1_DATABASE_ID"` | Production D1 does not exist |
| 58, 146 | `SHOP_WORKER_BASE_URL` subdomain | Production Worker not deployed |
| 59, 147 | `CF_ACCESS_TEAM_DOMAIN` | Production Access app not created |
| 69, 154 | `ADMIN_ALLOWED_ORIGIN` | Production admin not deployed |

These are safe to merge: `wrangler deploy --env production` would fail on the unresolved
`database_id` rather than deploy something wrong. **No production commerce resource exists in the
Cloudflare account** — no production D1, R2 or Worker. Production launch is resource creation, not
configuration.

`CF_ACCESS_AUD` is absent from every `vars` block by design — it is a secret, and declaring it as a var
makes `wrangler secret put` fail with Cloudflare error 10053.

## 5. Audit directory

`audit/2026-08-01-infrastructure/` carries the Worker inventory, D1 UUID, KV namespace ids and bucket
names. `_config.yml` excludes `audit`. **Verify that exclusion survives the merge** — without it,
GitHub Pages publishes the internal architecture map from `main`.

## 6. Not in this branch

- No production deployment of anything.
- No House of Assets connection, no Bridge change, no cross-repository orchestration.
- No content system — the public site still has none.
- No Stripe live-mode change.

## 7. Merge sequence

1. Complete the live E2E test against TEST (runbook §5).
2. Confirm `_config.yml` still excludes `audit`, `product-source`, `dist`, `scripts`, `functions`.
3. Open the PR against `main`; do not auto-merge.
4. After merge, GitHub Pages rebuilds and the public storefront points at the TEST Worker.
5. Before real customers: create production resources, re-run migrations, resolve the four placeholders,
   verify the Resend sending domain, and switch the storefront to the production Worker.
