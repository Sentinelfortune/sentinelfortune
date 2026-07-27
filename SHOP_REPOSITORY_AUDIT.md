# Sentinel Fortune LLC — Repository Audit

**Purpose:** Establish ground truth about what exists, what runs, and what is live, before any Digital Shop work begins.
**Method:** Static inspection of code, configuration, and committed state only. No deployed environment, dashboard, or third-party account (Cloudflare, Stripe, GitHub Pages settings, Replit) was accessible during this audit. Anything that can only be confirmed by logging into those dashboards is labeled **UNVERIFIED** below, even when a JSON file in the repo claims it is "live."
**Scope:** No production code was modified. This document and its two companions (`SHOP_REUSE_MAP.md`, `SHOP_MVP_IMPLEMENTATION_PLAN.md`) are the only files added.

---

## 1. Top-level shape of the repository

The repo is not one application — it is **five parallel, loosely-connected codebases** sharing one git history:

| Area | Path | What it is |
|---|---|---|
| Public static site | `/index.html`, `/app.js`, `/styles.css`, `/data/*.json` | Hand-built vanilla HTML/CSS/JS site, no build step |
| React SPA (source of truth) | `/frontend/` | Vite + React + wouter, "SFL Network Hub" |
| React SPA (stale mirror) | `/artifacts/sentinel-app/` | Partial, older copy of `/frontend/` |
| Express API (source of truth) | `/backend/` | Node/TS, Express 5 |
| Express API (stale mirror) | `/artifacts/api-server/` | Partial, incomplete copy of `/backend/` |
| Telegram bot | `/bot/` | Python (aiogram 3), the real business-logic core |
| Cloudflare config | `/cloudflare/`, `/config/cloudflare/` | Two divergent Worker scripts + wrangler configs |
| "Canon" self-documentation | `/originus/` | JSON files the project uses to describe its own architecture/status to itself |

There is **no root `package.json`**, **no root `pnpm-workspace.yaml`**, **no CI workflow**, **no `vercel.json` anywhere in the repo**, and **no Python `requirements.txt`/`pyproject.toml` anywhere**. This already answers several of the audit questions before going further: Vercel is not configured at all, and neither the Node workspaces nor the Python bot are installable/buildable directly from this checkout as-is.

---

## 2. Which website is actually live and authoritative

**The static root site is the only component whose live deployment can be confirmed from the repo itself.**

- `index.html` declares `<link rel="canonical" href="https://sentinelfortune.github.io/sentinelfortune/"/>` and matching OpenGraph/Twitter/JSON-LD tags, all pointing at the GitHub Pages URL.
- `sitemap.xml` lists exactly one URL: `https://sentinelfortune.github.io/sentinelfortune/`.
- There is no `CNAME` file in the repo, so GitHub Pages (if enabled via repo Settings, which is the classic no-workflow way to serve root-level HTML) would only serve on `sentinelfortune.github.io/sentinelfortune/`, not on a custom domain like `sentinelfortune.com`, unless a custom domain was configured purely through the GitHub UI (which normally writes a `CNAME` file back into the repo — none exists here).
- Commit history (`git log`) shows this file being edited repeatedly and recently — most recently `878bce0 "feat: add Latest Public Signals section (Phase 3)"` — i.e. this is the actively maintained surface.
- It contains one real, live-looking Stripe artifact: a hardcoded `https://buy.stripe.com/8x2aEXblC9eZeJ98n5bAs1c` anchor link ("Support the Vision" — commit `b197ee3`). This is a production `buy.stripe.com` Payment Link pasted directly into HTML — not a Checkout Session, not wired to any webhook or fulfillment logic in this repo.

**Everything else — the React SPA, the Express API, the Cloudflare Workers, R2 — has no evidence of a working production deployment in this repository.** No `vercel.json`, no GitHub Actions workflow, no Cloudflare Pages build success record. The only records of their state are self-reported JSON files inside `/originus/` and `/cloudflare/`, which contradict each other (see §9).

**Conclusion:** the live, authoritative public presence is the plain static site at `sentinelfortune.github.io/sentinelfortune`. `sentinelfortune.com` DNS/CDN routing could not be verified from this repo.

---

## 3. React/Vite frontend — deployed where?

**Nowhere, as far as this repo can prove.**

- `grep -ri vercel` across the entire repository returns **zero matches**. There is no `vercel.json`, no `.vercel/` folder, no Vercel-specific env handling anywhere. The task's premise that Vercel is in play is not supported by anything in the repo.
- `cloudflare/wrangler-pages.toml` documents (as comments, not as a working config a `wrangler pages deploy` could consume unattended) that the frontend is meant to be built from `artifacts/sentinel-app` via `pnpm run build` → `artifacts/sentinel-app/dist/public`, and deployed to Cloudflare Pages project `sentinel-fortune-hub`.
- `artifacts/sentinel-app/` — the directory the deploy instructions actually point at — is **incomplete**: it has no `package.json`, no `vite.config.ts`, no `main.tsx`, no `tsconfig.json`. It is a stale, partial snapshot (missing `hooks/`, several pages, `ui/` components) of the real app in `/frontend/`. **A `pnpm run build` against `artifacts/sentinel-app` as documented would fail** — there is no build tooling in that directory at all.
- `/frontend/` (the complete, current app — 21 routes per `App.tsx`, real `package.json`, real `vite.config` referenced) is **not referenced by any deployment script**. It appears to be newer/actively-developed source that was never wired back into the Cloudflare Pages instructions.
- `originus/_canon/DEPLOYMENT_READINESS_R2.json` (self-reported, dated 2026-03-25) states the frontend status as `"live_dev"` with the note *"Vite dev server :22543 — needs CF Pages build for production"* and separately marks `cloudflare_pages: "pending_owner"`. `cloudflare/REPLIT_DETACH_CHECKLIST.json` lists *"CF Pages connected to GitHub repo"* and *"CF Pages build tested"* both as `done: false`.

**Conclusion:** the React/Vite frontend has, by the project's own records, never left a Replit dev server. It is not deployed to Vercel (no config exists) and not confirmed deployed to Cloudflare Pages (explicitly marked pending, and the directory the build points at is broken) or GitHub Pages (the Pages slot is occupied by the static site).

---

## 4. Is the Express backend operational?

**Cannot be confirmed live; and as checked out, it is not even installable.**

- `backend/package.json` depends on three workspace packages that **do not exist anywhere in this repository**: `@workspace/db`, `@workspace/api-zod`, `@workspace/api-client-react` (the latter only used by `frontend/package.json`). No `lib/`, `packages/`, or similarly-named directory defines them.
- The only `pnpm-workspace.yaml` in the repo lives at `config/pnpm-workspace.yaml` (not repo root, so pnpm would not discover it from the root) and declares workspace packages under `artifacts/*`, `lib/*`, `lib/integrations/*`, `scripts` — none of which contain `backend/` or `frontend/`, and `lib/`/`scripts/` don't exist in the repo either.
- `config/build.sh` (the documented production build) runs `pnpm --filter @workspace/api-server run build`, targeting `artifacts/api-server` — which, like `artifacts/sentinel-app`, is an **incomplete stub**: it has only `src/routes/index.ts` and `src/routes/builders.ts`, with no `app.ts`, no `index.ts` entrypoint, no `package.json`, no build config. The build script as documented cannot succeed against what's in the repo.
- The complete, real Express app lives in `/backend/` (`app.ts`, `index.ts`, `lib/`, `routes/{health,deals,ecosystem,stripe}.ts`) but is not the target of any build/deploy script in the repo.
- Self-reported `DEPLOYMENT_READINESS_R2.json` claims `express_api: "live"` on port 8080 — but this is an unverifiable operator note about a Replit process, not something confirmed by this repo's config or CI.

**Conclusion:** source code for a working Express API exists (`/backend/`), and its design is sound (see §5), but neither this repo's workspace wiring nor its documented build/deploy path currently produces a runnable artifact. Any live instance, if one exists, is running on infrastructure (Replit) outside this repo's visibility.

---

## 5. Stripe integration — real, test-only, incomplete, or legacy?

There are **three separate, non-unified Stripe/payment mechanisms** in the codebase, at three different levels of completeness:

### a) Static Stripe Payment Link (root site) — real, minimal, unconnected
One `buy.stripe.com` link hardcoded in `index.html`. Real production link, but a plain anchor tag — no metadata, no webhook, no fulfillment. Functions only as a one-off donation button.

### b) Tiered "6-tier engine" Stripe Payment Links (bot + backend) — real design, credentials not confirmed set
This is the system described in `README.md` (lite/monthly/starter/pro/oem/licensing) and it is genuinely well-built:
- `bot/handlers/buy.py` builds a personalized Stripe Payment Link per tier via `build_buy_url()`, embedding the Telegram user id.
- `bot/services/stripe_webhook.py` runs a **separate aiohttp server on port 8082** (not part of the Express app) that:
  - Verifies `Stripe-Signature` via `stripe.Webhook.construct_event()` **only if `STRIPE_WEBHOOK_SECRET` is set** — otherwise it explicitly logs a warning and skips verification ("dev/test mode only").
  - Resolves the paying user via `client_reference_id` → `metadata.telegram_id` → R2 email-map lookup, in that order.
  - Resolves the purchased tier via `payment_link` id → `metadata.tier` → `amount_total` lookup, in that order.
  - Is idempotent (`originus/sales/stripe_events/processed/{event_id}.json` lock in R2).
  - Delivers a **Telegram channel invite**, not a file or license — the product being sold is access, not a downloadable good.
- `backend/src/routes/stripe.ts` is **not a Stripe handler itself** — it's a raw-body-preserving reverse proxy that forwards `/api/stripe/webhook` straight to `localhost:8082`, where the Python service does the actual verification. If the bot process is down, it swallows the error and still returns `200` to Stripe (so Stripe won't retry) but the event is lost except for whatever external logging exists.
- `cloudflare/wrangler-api.toml` defines all the `STRIPE_BUY_LINK_*` vars as **empty strings** and lists `STRIPE_SECRET`/`STRIPE_WEBHOOK_SECRET`/`BOT_TOKEN` as needing `wrangler secret put` — i.e., not set in this config.
- The project's own tracking files are explicit that these are unset: `originus/global/system/MISSING_COMPONENTS.json` → `"stripe_buy_links": "pending_owner"`, impact *"/buy command and /enter checkout_url return null until set"*. `cloudflare/REPLIT_DETACH_CHECKLIST.json` → *"All STRIPE_BUY_LINK_* set as CF Worker secrets"* = `done: false`, *"STRIPE_WEBHOOK_SECRET set in CF Worker"* = `done: false`.

**This is a legitimately production-grade webhook design, but its live/test status cannot be verified from the repo, and the project's own audit files say the required secrets are not yet configured at the Cloudflare layer.**

### c) Legacy PayPal links (bot) — not Stripe, explicitly frozen
`bot/services/product_delivery.py` has a second, older sales path (`PAYPAL_LINKS`, `deliver_product`) explicitly documented as *"Legacy Store Layer... Unchanged."* This predates the Stripe tier system and sells the same kind of thing (channel access), via PayPal, not Stripe.

**Conclusion:** Stripe is neither purely "test" nor fully "live" — it's a real, well-engineered webhook architecture whose activation depends on secrets the project's own records say are unset, sitting alongside one live standalone donation link and one legacy PayPal path. None of the three deliver a downloadable digital product or a license key today — all deliver Telegram channel access.

---

## 6. Webhook implementation

Covered in detail in §5b. Key architectural facts relevant to the Shop:
- Signature verification logic lives in Python (`stripe.Webhook.construct_event`), not in the Express backend.
- The Express `stripe.ts` route is a dumb proxy that exists solely to preserve the raw byte body (mounted **before** `express.json()` in `app.ts`) and forward it to the bot's aiohttp server.
- `originus/global/system/PRESERVE_LIST.json` explicitly flags **"Stripe webhook signature verification logic"** and **"activate_user / deliver_tier_access await calls — must never use create_task"** as critical-do-not-touch. This is a strong signal from the project's own operators that this pathway is considered load-bearing and should not be casually rewritten.
- The webhook currently has exactly one handled event type: `checkout.session.completed`. There is no handling for `charge.refunded`, `payment_intent.payment_failed`, subscription lifecycle events, etc.

---

## 7. Database / persistence layer

**There is no relational or document database anywhere in this repository.** `@workspace/db` is referenced (backend `package.json`) but the package does not exist. All real persistence is one of:

1. **Cloudflare R2, as a JSON key-value store** (via `boto3`/S3-compatible client in `bot/services/r2_service.py`, and via `@aws-sdk/client-s3` in `backend/src/lib/r2Reader.ts` / `r2Writer.ts`). Every "record" is a single JSON object at a conventionally-named key (e.g. `originus/sales/stripe_events/{ts}_{event_id}.json`, `originus/users/{id}/delivery.json`, `originus/access/{product_id}/{user_id}.json`). There is no query engine — reading a "list" means `ListObjectsV2` over a prefix and fetching each object individually (see `backend/src/lib/r2Reader.ts` `listDeals()`).
2. **Local filesystem JSON fallback** (`data/users/{id}/*.json`) used by the Express backend when R2 is unreachable — explicitly a fallback, not primary storage, and not persistent across redeploys of an ephemeral host.
3. **Pure in-process Python dicts with zero persistence**, e.g. `bot/services/product_store.py` (`_product_store: dict[int, dict]`) and part of `bot/services/delivery_service.py` (`_registry: list[dict]`). These reset to empty on every process restart. `product_store.py` in particular is the backing store for whatever admin flow creates ad-hoc "products" via bot commands — it cannot be considered a real product catalog.

**Conclusion:** the persistence model is "R2 as a JSON object store," by design, everywhere it's taken seriously. A Digital Shop needs to either extend this pattern (R2 JSON records for products/orders/licenses) or introduce a real database — this is a first-order architectural decision for the MVP plan.

---

## 8. Cloudflare Workers and R2 — actually connected?

**Not confirmed connected; the project's own checklists say it is not.**

- `cloudflare/wrangler-api.toml` defines an `ORIGINUS_R2` binding to bucket `originus`, and a route `sentinelfortune.com/api/*`. This is a config file describing an intended deployment; it is not proof of a live binding (that only exists inside the Cloudflare dashboard/API).
- `cloudflare/REPLIT_DETACH_CHECKLIST.json`: *"R2 bucket 'originus' bound as ORIGINUS_R2"* → `done: false`.
- `originus/global/system/MISSING_COMPONENTS.json`: *"r2_originus_binding": "pending_owner"*, impact *"GET /api/status/:id falls back to local data/ files; R2 reads fail silently"*.
- `originus/_canon/DEPLOYMENT_READINESS_R2.json`: `r2_binding: "pending_owner"`.
- Two **different, drifted** Cloudflare Worker scripts exist: `cloudflare/api-worker.js` (255 lines, "v2.0.0 — Portable, migration-ready") and `config/cloudflare/ecosystem-worker.js` (522 lines, "v1.4.0"). They are not the same code. `wrangler-api.toml` points `main` at `cloudflare/api-worker.js`; nothing in the repo builds or deploys `ecosystem-worker.js`, so its relationship to what's actually live (if anything) is unclear.
- Separately, the **Python bot's own R2 client** (`bot/services/r2_service.py`) uses a *different* env var set (`CF_ACCOUNT_ID`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `CF_R2_BUCKET` defaulting to `originus-infinity-vault`) than the Worker binding (`ORIGINUS_R2` → bucket `originus`). Two different bucket names appear in the codebase for what is presumably meant to be the same store — `originus` (Worker binding, canon docs) vs. `originus-infinity-vault` (bot's default). This is either an unresolved rename or a real inconsistency; it could not be resolved by static inspection.
- `bot/config.py` treats all R2 vars as **optional**, with the bot explicitly designed to run without R2 configured (in-memory-only fallback).

**Conclusion:** R2 is architecturally wired into three different codepaths (bot, Express backend, Cloudflare Worker) with real, non-trivial code — but nothing in the repo proves credentials are actually set anywhere, the bucket name is inconsistent between components, and the project's own checklist says the binding is not done.

---

## 9. Does a secure digital-product delivery system already exist?

**No — not in the sense the Shop needs (buyer-facing download link / license key). What exists is Telegram-native, not web-native:**

- `bot/services/product_delivery.py::deliver_product_to_user()` is a genuinely solid pattern: given a `product_id`, it fetches bytes from R2 (`get_bytes`) and pushes them to the user as a Telegram document/audio message, in a fixed sequence (welcome → PDF → optional TTS audio → CTA), with per-step success/failure tracked and logged. **This is real, working, reusable delivery logic** — but it delivers via Telegram bot API `send_document`, not via a web download link, presigned URL, or license key. There is no equivalent for a web buyer who never opens Telegram.
- No presigned/signed URL generation exists anywhere (`grep` for `presign`, `signed_url`, `generate_presigned` across bot/backend/frontend/cloudflare returns nothing).
- No license-key concept exists anywhere (`grep` for `license_key`, `download_token` returns nothing). "License" in the current system means a *pricing tier* (`licensing` @ $15,000, `governance: "owner_onboarding_required"`), not a per-purchase artifact.
- What is sold today is **access** (a private Telegram channel invite), not a **thing** (a file, a license). The entire tier system (`PRODUCT_REGISTRY.json`, `TIER_CHANNELS`, `CHANNEL_LINKS`) models subscriptions-to-a-channel, not SKUs-with-downloadable-assets.

**Conclusion:** the R2-fetch + fixed-delivery-sequence pattern in `product_delivery.py` is worth reusing as a template, but a genuine "buy → get a secure download link / license key on the website" flow does not exist and must be built new.

---

## 10. Authentication mechanisms

There is **no web-based authentication anywhere in this repository** — no login form, no session cookie, no JWT, no OAuth flow, in either `/frontend/` or `/backend/`.

- The React app's `/ops`, `/ops/content`, `/ops/pipeline`, `/ops/access`, `/ops/logs` routes (`frontend/src/App.tsx`) are **public routes with no guard whatsoever** — any visitor who knows or guesses the URL sees the full operations dashboard, including (in `OpsAccess.tsx`) the actual private Telegram channel invite links, hardcoded in client-side JSX and therefore visible to anyone who views page source or the network tab, logged-in or not.
- The only real access-control mechanism in the whole system is Telegram-side: `bot/services/access_control.py::is_owner(user_id)` checks a Telegram numeric user id against a comma-separated `OWNER_TELEGRAM_IDS` env var, and gates a handful of bot commands (`bot/handlers/premium_admin.py` uses it correctly: `/grant_premium`, `/revoke_premium`).
- This owner check is **inconsistently applied**. `bot/handlers/admin.py` (a *different* file from `premium_admin.py`) defines `/deliveries`, `/validate`, `/grant`, `/complete`, `/grants`, `/markdone` — all of which mutate delivery/grant state — with **no owner check at all**. Any Telegram user who can message the bot can currently call these commands. This is a genuine gap in the existing system, noted here for visibility, not fixed (out of scope for an audit).

**Conclusion:** "Owner Admin" as a concept does not exist yet on the web. It must be built from zero — there is no auth primitive to extend, only an env-var owner-id pattern from the bot side that could inform (but not directly reuse for) a web admin's auth design.

---

## 11. Product / order / customer / payment / delivery models

None of these exist as a coherent, unified data model. What exists is fragmented across three registries with three different shapes:

| Concept | Where defined | Shape |
|---|---|---|
| Pricing tiers | `originus/products/registry/PRODUCT_REGISTRY.json`, mirrored in `frontend/src/lib/tokens.ts` (`TIERS`), `bot/services/sales_flow.py` | 6 fixed tiers (lite/monthly/starter/pro/oem/licensing), each mapping to one or more Telegram channels |
| "Products" (legacy PayPal) | `bot/services/product_delivery.py` (`PRODUCTS` dict) | 6 hardcoded channel-access SKUs, PayPal links, no relation to the Stripe tiers above |
| Ad-hoc "products" (bot admin) | `bot/services/product_store.py` | In-memory only, one product per user, wiped on restart — not a catalog |
| Delivery queue | `bot/services/delivery_service.py` + `canon_service` (R2) | Free-text intake, keyword-guessed "offer" (`architect`/`engine`/`access`), pending/validated/completed states, manually advanced via Telegram admin commands |
| Orders | *(does not exist)* | Stripe webhook writes an event log + idempotency lock, not an order record with line items |
| Customers | *(does not exist)* | User identity is a bare Telegram numeric id; an email↔id map exists (`originus/users/email_map/`) but there's no customer profile, address, or purchase history object |
| Payments | Stripe event log (`originus/sales/stripe_events/`) | Raw webhook payload dump, not a normalized payment ledger |
| Licenses | *(does not exist)* | "License" = a $15,000 pricing tier label, not an issued artifact |
| Downloads | *(does not exist)* | Delivery = Telegram message, not a URL |

**Conclusion:** every one of the Shop's required models (product catalog, order, license, secure download) needs to be designed and built. The one asset worth carrying forward is the *pattern* — R2-JSON-record-per-entity, prefix-based listing — since it's proven, R2 is already wired in three places, and it avoids introducing a database dependency the rest of the system doesn't have.

---

## 12. Secret handling

- `.gitignore` correctly excludes `.env`, `.env.local`, `.replit`, `replit.nix` — no secret files are committed.
- No `.env.example` exists anywhere, so the full set of required environment variables is not documented in one place; it has to be reconstructed by reading `os.environ.get(...)` calls across `bot/config.py`, `bot/services/*.py`, `backend/src/routes/*.ts`.
- Secrets are read directly from `process.env` / `os.environ` at call time in most places (good — allows late injection without restart, as `stripe_webhook.py` explicitly comments). No secret ever appears logged (`r2_service.py` explicitly logs only `type(e).__name__` on errors, not exception bodies that might contain payloads).
- `cloudflare/SECRETS_MANIFEST.template.json` exists as a template listing what should be set via `wrangler secret put`, but (like `SYSTEM_HEALTH.json`) it's a scaffold/placeholder, not evidence of what's actually configured.
- Two inconsistent R2 credential env-var namings exist between the bot (`CF_R2_*`) and are shared with the Express backend (`CF_ACCOUNT_ID`, `CF_R2_ACCESS_KEY_ID`, `CF_R2_SECRET_ACCESS_KEY`, `CF_R2_BUCKET`) — these do at least match each other, which is good; the bucket *value* mismatch is the issue (see §8).

**No committed secrets or credentials were found in the repository during this audit.**

---

## 13. Existing public domains / production URLs

Confirmed from code/config (not all confirmed *live*):

- **`sentinelfortune.github.io/sentinelfortune`** — confirmed live target of the static site (canonical tag, sitemap, OG tags). This is the one domain this audit can affirmatively call "the current production website."
- **`sentinelfortune.com`** — referenced everywhere (README, wrangler config, worker route pattern, `DOMAIN_BRAND_IP_MAP.json`) as the intended institutional domain, and used in the Express `ecosystem.ts` `DOMAIN_MAP`. Its actual DNS target (Cloudflare, GitHub Pages, parked, or something else) could not be determined from this repo.
- **7 other domains** listed in `frontend/src/lib/tokens.ts` `DOMAINS` and `backend/src/routes/ecosystem.ts` `DOMAIN_MAP`: `sentinelfortunerecords.one`, `codexworldtv.homes`, `lumengame.vip`, `lumenschoolacademy.online`, `vibraflowmedia.casa`, `lightnodesystems.my`, `oglegacystore.homes`. No evidence any of these resolve to a working site; they appear to be planned/reserved domains for the wider "ecosystem," referenced only as data, not backed by content in this repo.
- **`https://t.me/sentinelfortune_bot`** — the Telegram bot's public entry point, referenced consistently across frontend CTAs and bot code. Its liveness could not be verified (would require contacting Telegram's API), but the username is used consistently everywhere with no contradiction, unlike the domain/worker inconsistencies above.
- **`sentinel-fortune-ecosystem.sentinelfortunellc.workers.dev`** — referenced directly in `frontend/src/pages/ops/OpsLogs.tsx` as a health-check target, implying a Worker was deployed under this name at some point. Not independently verifiable here.

---

## 14. Current build and deployment commands

As documented in-repo (not verified to succeed):

```bash
# Backend/API — config/build.sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build   # targets artifacts/api-server — INCOMPLETE, will fail
# → artifacts/api-server/dist/index.cjs

# Start — config/start.sh
python -m bot.main &          # Telegram bot, background
node artifacts/api-server/dist/index.cjs   # Express, foreground (from the same broken build)

# Frontend — cloudflare/wrangler-pages.toml (comment-documented, not a script)
cd artifacts/sentinel-app && pnpm run build   # artifacts/sentinel-app has no package.json — will fail
wrangler pages deploy dist/public --project-name sentinel-fortune-hub --branch main

# Cloudflare Worker
wrangler deploy --config cloudflare/wrangler-api.toml   # deploys cloudflare/api-worker.js
```

**As checked out, none of these commands can succeed**: the Node build targets (`artifacts/api-server`, `artifacts/sentinel-app`) are incomplete stubs missing entry points and manifests, the Python start command has no installable dependency list, and there is no root workspace file that would let pnpm resolve `@workspace/db` / `@workspace/api-zod` / `@workspace/api-client-react` even if the artifacts folders were complete. The real, complete source (`/frontend`, `/backend`) is not what these scripts point at.

The static site (`/index.html` et al.) has **no build step at all** — it is served as-is, which is exactly why it's the one thing that reliably works.

---

## 15. Tests and known failures

**There are no automated tests anywhere in this repository.** No `*.test.*`, `*_test.py`, `test_*.py`, `pytest.ini`, `jest.config.*`, or `vitest.config.*` files exist. No `package.json` in `frontend/` or `backend/` defines a `test` script. This was verified by direct search across the whole tree.

Known-broken states, established by direct inspection above (not inference):
1. `config/build.sh` build target (`artifacts/api-server`) is missing its app entrypoint and `package.json` — cannot build.
2. `cloudflare/wrangler-pages.toml` build target (`artifacts/sentinel-app`) is missing `package.json`, `vite.config.ts`, and several source files present in the real `/frontend` — cannot build.
3. `backend/package.json` depends on three workspace packages (`@workspace/db`, `@workspace/api-zod`, `@workspace/api-client-react`) that do not exist in this repo at any path.
4. No root `pnpm-workspace.yaml` — the one that exists (`config/pnpm-workspace.yaml`) is not in a location pnpm would auto-discover, and its `packages:` globs don't include `backend/` or `frontend/` anyway.
5. `bot/` has no dependency manifest (`requirements.txt`/`pyproject.toml`) despite importing `aiogram`, `aiohttp`, `stripe`, `boto3`, `openai`, `python-dotenv`.
6. Two Cloudflare Worker scripts (`cloudflare/api-worker.js` vs `config/cloudflare/ecosystem-worker.js`) have diverged; only one is wired into `wrangler-api.toml`.
7. R2 bucket name mismatch between the Worker binding (`originus`) and the bot's default (`originus-infinity-vault`).
8. `bot/handlers/admin.py` commands (`/deliveries`, `/validate`, `/grant`, `/complete`, `/grants`, `/markdone`) have no owner/permission check, unlike the equivalent commands in `premium_admin.py`.
9. `/ops/*` frontend routes are fully public with no authentication, and render private Telegram channel invite links in client-visible code.

None of the above were fixed as part of this audit, per instructions.

---

## Summary answers to the 9 audit questions

1. **Which website is live and authoritative?** The static site at `sentinelfortune.github.io/sentinelfortune` (root `index.html`/`app.js`/`styles.css`/`data/*.json`). Everything else is unconfirmed or explicitly marked pending by the project's own records.
2. **Vercel, GitHub Pages, or both?** GitHub Pages only, for the static site. Vercel is not configured anywhere in this repo. Cloudflare Pages is the documented (not confirmed working) target for the React app, and is explicitly marked "pending_owner" / not connected.
3. **Is the Express backend operational?** Source code is real and reasonably well-designed, but not buildable from this repo as checked out (missing workspace packages, broken build targets). Any live instance would be running outside this repo's visibility (e.g., Replit), unverifiable here.
4. **Stripe: real, test-only, incomplete, or legacy?** All four, depending on which of the three separate payment paths you mean: (a) one real static Payment Link with no fulfillment, (b) a well-built but credential-unconfirmed tiered webhook system, (c) an explicitly frozen legacy PayPal path.
5. **Is Cloudflare R2 already connected?** Code-level integration exists in three places (bot, Express, Worker), but the project's own checklists say the binding is not done, and there's an unresolved bucket-name mismatch between components.
6. **Does a secure digital-product delivery system already exist?** Not for the web. A working Telegram-native fetch-from-R2-and-send-file pattern exists (`product_delivery.py`) and is worth reusing as a template, but no download-link/license-key system exists.
7. **What can be reused for a Shop MVP?** See `SHOP_REUSE_MAP.md`.
8. **What's legacy/unsafe/unused/unrelated?** See `SHOP_REUSE_MAP.md`.
9. **Smallest stable architecture to add the Shop?** See `SHOP_MVP_IMPLEMENTATION_PLAN.md`.
