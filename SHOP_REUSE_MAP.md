# Sentinel Fortune LLC — Shop Reuse Map

Companion to `SHOP_REPOSITORY_AUDIT.md`. Classifies every relevant existing component as **Reuse**, **Reuse-with-changes**, **Leave alone (do not touch)**, or **Legacy/unrelated (ignore)**, for the purpose of adding a Digital Shop MVP.

Guiding rule from the task: *do not delete, replace, or restructure working systems; do not create a second competing backend.* Everything marked "Reuse" or "Reuse-with-changes" below is chosen specifically to avoid a second backend — the Shop should be new **routes and R2 prefixes added to the existing Express app**, not a parallel service.

---

## ✅ Reuse as-is

These are sound, working patterns that a Shop can build directly on top of without modification.

| Component | Path | Why it's reusable |
|---|---|---|
| Express app shell + raw-body-before-json ordering | `backend/src/app.ts` | Correct pattern already solved for Stripe: mounting a raw-body route before `express.json()`. The Shop's own webhook route must follow the exact same ordering — copy the pattern, don't touch the existing mount. |
| R2 client construction (Node) | `backend/src/lib/r2Reader.ts`, `r2Writer.ts` | Working `@aws-sdk/client-s3` client against R2's S3-compatible endpoint, correct env var usage, graceful `null` return when unconfigured. New Shop R2 access code should follow this exact construction pattern (new file, same style) rather than inventing a different client setup. |
| R2 client construction (Python) | `bot/services/r2_service.py` | Same idea on the bot side — `get_json`/`put_json`/`get_bytes`/`put_bytes`/`key_exists`/`append_to_array`, all async-wrapped, all fail-soft. If the Shop's fulfillment needs a Python-side touchpoint (e.g., notifying the bot of a web purchase), this module is the correct low-level primitive to call, unchanged. |
| R2-JSON-record-per-entity persistence pattern | Used throughout `bot/services/*`, `backend/src/lib/r2Reader.ts` | The whole system stores every "thing that happened" as one JSON object at a structured key, listed via prefix `ListObjectsV2`. This is the right model to extend for `products/`, `orders/`, `licenses/` — it avoids introducing a database the rest of the system doesn't have, and keeps the Shop consistent with how everything else here already works. |
| Idempotent webhook processing pattern | `bot/services/stripe_webhook.py` (`_is_duplicate`, `_mark_processed`, event-id lock file) | Exactly the idempotency mechanism the Shop's own Stripe webhook needs (a customer must not get double-fulfilled on Stripe retries). Copy the pattern into the new webhook handler. |
| Signature verification approach | `bot/services/stripe_webhook.py::_stripe_webhook_handler` | Strict-when-secret-present, clearly-logged-when-absent. This is the right default behavior to replicate for the Shop's webhook (fail closed in production, loud warning in dev). |
| Generic file-delivery pattern | `bot/services/product_delivery.py::deliver_product_to_user` | Fetch-bytes-from-R2-by-key → deliver, with per-step success/failure tracking and a registry-driven (not hardcoded-per-product) design. The Shop's own "generate a secure download" logic should follow this same shape: look up the product's R2 key, generate access (a presigned URL, in the Shop's case, rather than a Telegram `send_document`), log the step. |
| Domain/tier mapping conventions | `frontend/src/lib/tokens.ts`, `backend/src/routes/ecosystem.ts` `DOMAIN_MAP` | Not functionally needed by the Shop, but establishes the project's naming/typing conventions (slug, label, price_display) that new Shop types should match for visual/UX consistency. |
| Visual design tokens & layout shell | `frontend/src/lib/tokens.ts` (colors), `frontend/src/components/Layout.tsx`, `Nav.tsx`, `SectionTitle.tsx`, `GoldButton.tsx` | Real, working, already-styled components. New Shop pages (`/shop`, `/shop/:slug`) should be built as new pages inside `frontend/src/pages/` using these existing components — not a new design system. |
| React app's routing shell | `frontend/src/App.tsx` (`wouter` `<Switch>`) | Just add new `<Route>` entries for the Shop; the routing mechanism itself needs no change. |

---

## 🔧 Reuse with changes

Real and useful, but needs modification, hardening, or extension before the Shop can depend on it.

| Component | Path | What needs to change | Why |
|---|---|---|---|
| `backend/package.json` | `backend/` | Remove or stub the three missing workspace deps (`@workspace/db`, `@workspace/api-zod`, `@workspace/api-client-react`), or add a minimal root `pnpm-workspace.yaml` that actually resolves them. | Currently not installable. Cannot add Shop routes to a backend that can't `pnpm install`. This is a prerequisite fix, not a Shop feature, and should be scoped/confirmed with the owner before touching (see implementation plan). |
| Deploy targets in `config/build.sh` / `cloudflare/wrangler-pages.toml` | `config/`, `cloudflare/` | Repoint at `/frontend` and `/backend` (the real, complete sources) instead of the incomplete `artifacts/*` mirrors, or delete/regenerate the `artifacts/*` mirrors so they match. | The Shop's new frontend pages and backend routes will be written in `/frontend` and `/backend`. If deploy scripts still point at the stale `artifacts/*` copies, the Shop will never actually ship. |
| Stripe webhook proxy | `backend/src/routes/stripe.ts` | Extend (additively) to also forward/dual-handle Shop-specific event types, or add a second, clearly-separated route (e.g. `/api/shop/stripe/webhook`) so the existing tier-webhook path is never touched. | `PRESERVE_LIST.json` explicitly marks Stripe webhook signature verification as critical-do-not-touch. The Shop needs its own event handling (`checkout.session.completed` for a *product* purchase, not a *tier* purchase) without risking the existing tier-activation logic. |
| R2 bucket name | `bot/config.py` default (`originus-infinity-vault`) vs. `cloudflare/wrangler-api.toml` binding (`originus`) | Confirm with the owner which bucket is actually in use, and have every new Shop code path read the *same* env var the rest of the system already uses (`CF_R2_BUCKET`), not a hardcoded literal. | Don't let the Shop introduce a *third* bucket-name guess on top of the existing unresolved mismatch. |
| `is_owner` / `OWNER_TELEGRAM_IDS` pattern | `bot/services/access_control.py` | Cannot be reused directly for web auth (it's a Telegram-id check), but the *shape* — a small allowlist read from an env var, fail-closed if malformed — is a reasonable model for a first-cut web Owner Admin auth (e.g. a single owner password/passphrase or a static allowlisted email, read from env, no user table). | Keeps the MVP's admin auth as simple as the rest of the system's auth, rather than introducing OAuth/sessions/JWT complexity the project has nowhere else. |

---

## 🚫 Leave alone — do not touch

Explicitly flagged by the project's own `originus/global/system/PRESERVE_LIST.json`, or judged load-bearing by this audit. The Shop must be built *around* these, never *through* them.

| Component | Path | Why it must not be touched |
|---|---|---|
| `delivery_service.py` | `bot/services/delivery_service.py` | Explicitly listed in `PRESERVE_LIST.json` as critical-do-not-touch, and referenced by name in the frontend's own `/ops/access` page ("Channel delivery is handled exclusively by delivery_service.py — do not edit this file"). |
| `auto_publish.py`, `ai_content.py` | `bot/services/` | Explicitly listed in `PRESERVE_LIST.json`. Unrelated to commerce; do not touch while building the Shop. |
| `originus/_canon/` (R2 prefix, and its local mirror) | `originus/_canon/*.json` | Explicitly marked READ-ONLY at runtime everywhere it's mentioned (`SYSTEM_HEALTH.json` R2 namespace table, `PRESERVE_LIST.json`, `Ops.tsx`'s "Hard rule"). New Shop canon/config data must live in a new prefix (e.g. `originus/shop/`), never inside `_canon/`. |
| The 6 existing API routes | `GET /api/health`, `GET /api/healthz`, `POST /api/enter-system`, `POST /api/buy`, `GET /api/status/:id`, `POST /api/stripe/webhook` | Explicitly listed as critical-do-not-touch in `PRESERVE_LIST.json`. New Shop routes must be additive (new paths under, e.g., `/api/shop/*`), never a modification of these six. |
| `activate_user` / `deliver_tier_access` await semantics | `bot/services/user_activation.py` (called from `stripe_webhook.py`) | `PRESERVE_LIST.json`: "must never use create_task" — these calls are intentionally synchronous/awaited to guarantee R2 state is written before delivery. Do not refactor even if it looks parallelizable. |
| Cloudflare Worker `isApiRoute` guard | `sentinelfortunellc v2` Worker (referenced, not fully present in this repo) | Explicitly listed in `PRESERVE_LIST.json`. If the Shop needs new Worker routing, add new rules; do not modify the existing guard logic. |
| The existing tiered Stripe Payment Link flow end-to-end | `bot/handlers/buy.py`, `bot/services/sales_flow.py`, `bot/services/stripe_webhook.py`, `bot/services/user_activation.py` | This is the system's actual revenue mechanism today (subscriptions/tier access). The Shop is a *second, additive* monetization surface (one-time digital products), not a replacement. Keep them fully independent — different products, different R2 prefixes, different webhook route if practical — so a bug in the Shop can never take down tier sales. |
| Static root site content and its GitHub Pages deployment | `/index.html`, `/app.js`, `/styles.css`, `/data/*.json` | This is the one confirmed-live public asset (§2 of the audit). Per instructions, the existing institutional website must be preserved. The Shop should be additive (new pages/links from the existing site, or a separate `/shop` route in the React app), not a rewrite of this file. |

---

## 🗑️ Legacy, unsafe, unused, or unrelated — ignore for Shop purposes

| Component | Path | Classification | Notes |
|---|---|---|---|
| PayPal legacy store layer | `bot/services/product_delivery.py` (`PAYPAL_LINKS`, `PRODUCTS`, `deliver_product`, `log_sale`, `log_access_registry`) | Legacy | Explicitly documented in its own docstring as "Legacy Store Layer... Unchanged." A different payment provider, different product set, predates the Stripe tier system. Do not extend it for the Shop; do not delete it either (out of scope) — just don't build on it. |
| `bot/services/product_store.py` | `bot/services/` | Unsafe/unused for real use | In-memory only (`dict[int, dict]`), one entry per Telegram user, wiped on every restart. Not a real catalog — cannot back a Shop product listing. Whatever bot admin flow currently uses this should stay as-is; the Shop needs a real, persistent product model instead (R2-backed, per the reuse pattern above). |
| `artifacts/sentinel-app/` | `artifacts/` | Stale/unrelated | Incomplete, out-of-date mirror of `/frontend`. Missing files, no build config. Do not develop the Shop here — it is not the app that should ship, and diverges further from `/frontend` every time either one is edited without the other. |
| `artifacts/api-server/` | `artifacts/` | Stale/unrelated | Same issue as above, for the backend. Only 2 of the real backend's ~7 source files are present, and none of its infrastructure files (`app.ts`, `index.ts`, `package.json`) exist here. |
| `config/cloudflare/ecosystem-worker.js` | `config/cloudflare/` | Unclear/possibly dead | 522-line Worker script not referenced by `wrangler-api.toml` (which points at `cloudflare/api-worker.js` instead). Diverged from the other Worker file. Do not build Shop Worker routes here without first confirming with the owner which Worker script (if either) is actually deployed. |
| `bot/handlers/admin.py` unauthenticated commands | `bot/handlers/admin.py` | Unsafe (pre-existing) | `/deliveries`, `/validate`, `/grant`, `/complete`, `/grants`, `/markdone` have no owner check, unlike `premium_admin.py`. Not part of the Shop scope to fix, but the Shop's own admin commands/routes (if any are added to the bot) must not copy this pattern — they must use `is_owner`. |
| Frontend `/ops/*` public routes | `frontend/src/pages/ops/*.tsx` | Unsafe (pre-existing) | No auth guard; renders private channel invite links client-side. Not part of the Shop's job to fix in this pass, but the new Owner Admin the Shop needs must **not** be built as an unguarded route the way these were — see the implementation plan for the minimum viable guard. |
| 7 secondary "ecosystem" domains | `frontend/src/lib/tokens.ts` `DOMAINS`, `backend/src/routes/ecosystem.ts` `DOMAIN_MAP` | Unrelated | Reserved/planned domains for other product lines (music, games, education, etc.), not connected to any content in this repo. Irrelevant to the Shop; do not build multi-domain routing for the Shop MVP. |
| `frontend/games/`, `frontend/src/pages/Games.tsx`, `Music.tsx`, `Rhapsodies.tsx`, `Teachings.tsx`, `Corridor(s).tsx`, `Agent.tsx`, `Content.tsx` | `frontend/` | Unrelated | Other content verticals of the same app. Leave untouched; the Shop is new, sibling pages, not a modification of these. |
| `bot/handlers/{coach,meditation,rhapsody,scene,story,teach,seed,export,workflow}.py` and related services | `bot/handlers/`, `bot/services/` | Unrelated | Content/creative-engine features of the bot, unconnected to commerce. Not touched by, and not needed for, the Shop. |
| `originus/global/agents/` builder registry | `originus/global/agents/*.json`, `artifacts/api-server/src/routes/builders.ts` | Unrelated / not production-ready | A generic "invoke a builder job" system (e.g. PDF generation, house-signature). `MISSING_COMPONENTS.json` itself says PDF generation is a "stub_registered" — not implemented. Not needed for a Shop MVP; if license/receipt PDFs are wanted later, this registry is a plausible future extension point, not a Shop MVP dependency. |
| Scaffold/placeholder JSON files | `cloudflare/SYSTEM_HEALTH.json`, `cloudflare/SECRETS_MANIFEST.template.json`, `cloudflare/AUTO_HEAL_LOGS.json`, `cloudflare/CF_DEPLOY_SEQUENCE.json`, `cloudflare/CLOUDFLARE_MIGRATION_PLAN.json` | Unrelated / not live data | Templates and empty logs, not live telemetry (e.g. `SYSTEM_HEALTH.json` has every status field set to `"unknown"` and `last_checked: null`). Do not treat their contents as evidence of what's actually running; safe to ignore for Shop purposes. |
