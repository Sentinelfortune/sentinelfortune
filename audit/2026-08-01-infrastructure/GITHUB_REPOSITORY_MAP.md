> **READ-ONLY AUDIT — 2026-08-01.** No infrastructure was modified. Nothing deployed, migrated or merged.
> Evidence sources: Cloudflare control-plane API (Workers/D1/R2/KV) and the local git repository.
> **All outbound HTTP from the audit environment is blocked** (every host returns `000`), so no live page,
> live endpoint or live redirect was fetched. Anything requiring HTTP or a Cloudflare API surface not
> exposed to this environment is marked **NOT VERIFIED**.

# GitHub Repository Map

## In scope and verified

**`sentinelfortune/sentinelfortune`** — the only repository this session may access.

| Branch | HEAD | Date | Role |
|---|---|---|---|
| `main` | `550fd5d` | 2026-07-30T11:43:56-07:00 | Source for the public GitHub Pages site |
| `claude/cloudflare-shop-test-deployment` | `b3622a8` | 2026-08-01T02:38:06Z | All post-merge work; unmerged |

### Divergence — what exists only on the branch

| Path | `main` | branch |
|---|---|---|
| `shop-worker/src/routes/order-status.ts` | ABSENT | present (`488556c`) |
| `shop-worker/src/routes/admin/import.ts` | ABSENT | present (`b3622a8`) |
| `functions/api/[[path]].ts` | ABSENT | present (`696dc91`) |
| `admin/_worker.js` | ABSENT | present (`bce03d6`) |
| `shop/shop-config.js` API base | `REPLACE_WITH_SHOP_WORKER_URL` | real test hostname |

**Consequence:** the live public site is built from `main` and therefore still carries the placeholder API
base. The storefront is non-functional until the branch merges.

## Deployment wiring

| Target | Mechanism | Status |
|---|---|---|
| GitHub Pages | Deploy-from-branch, `main`, root; Jekyll `exclude:` in `_config.yml` is the publication boundary | VERIFIED from repo |
| Shop Worker | `wrangler deploy --env test`, manual | VERIFIED from `wrangler.toml` |
| Admin Pages | Direct Upload, no Git connection (stated by Owner) | **NOT VERIFIED** — no Pages API |

## Other repositories

**NOT VERIFIED.** Session GitHub scope is limited to `sentinelfortune/sentinelfortune`. The 64
non-shop Workers may have source in other repositories; none of that is inspectable here.
