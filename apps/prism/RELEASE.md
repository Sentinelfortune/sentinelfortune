# Prism — release record

Internal. Not published (excluded from the Jekyll build). Written so this
release can be registered in House of Assets later without re-deriving anything.
No House of Assets system was called, modified, or referenced to produce it.

| Field | Value |
|---|---|
| Product candidate | **Prism** (name not locked — validate before committing to it) |
| Product ID | none assigned; no HoA record created |
| Version | 0.1.0 |
| Class | Hosted software (browser application) — **not** a Digital Shop downloadable |
| Source | `apps/prism/` on branch `flagship-7d-mvp` |
| Deployment URL | **none** — not deployed (see Blockers) |
| Readiness | Functionally complete MVP; **not** production-verified |

## What it is

One goal in, one plan out. The user states what they are trying to accomplish;
a deterministic router selects which of seven dimensions the goal actually
needs; each dimension is a focused workspace inside the same project; the
result is one exportable plan.

## Architecture

Static, zero-dependency ES modules. No build step, no framework, no server, no
database, no accounts, no analytics, no network requests of any kind.
Persistence is the browser's own `localStorage`.

That last choice is the product decision worth recording. VibraFlow collects
genuinely personal reflection. Keeping storage local means that content never
leaves the device, there is no breach surface, no credential to manage and
nothing to disclose in a privacy policy beyond "we do not collect anything".
The cost — no cross-device sync, and clearing site data loses work — is stated
in the UI, and export exists to answer it.

| Module | Responsibility |
|---|---|
| `js/dimensions.js` | The seven dimensions as data: id, job, field schema |
| `js/router.js` | Deterministic weighted-signal router with word-boundary matching |
| `js/store.js` | Project schema, validation, coercion, repository over injected storage |
| `js/export.js` | Unified summary → JSON and self-contained printable HTML |
| `js/ui.js` | View wiring; all DOM writes via `textContent`/`createElement` |

## The seven dimensions

| # | Dimension | Job |
|---|---|---|
| 1 | Sentinel Fortune Records | Plan a release |
| 2 | LumenGame | Build a challenge |
| 3 | VibraFlow Media | Work through a reflection *(marked sensitive)* |
| 4 | CodexWorld TV | Structure the story |
| 5 | Lumen School Academy | Plan the learning and the first action |
| 6 | LightNode Systems | Write the workflow |
| 7 | OG Legacy Store | Shape the offer |

## QA evidence

- **Unit/integration:** 36 tests, 36 passing — `node --test tests/core.test.mjs`.
  Covers router determinism and per-dimension routing, word-boundary false
  positives, validation, completion state, persistence across a simulated
  reload, corrupt-store recovery, unknown-field stripping, export round-trip and
  HTML escaping of injected content.
- **End-to-end:** 17 checks, 17 passing — real Chromium against a real HTTP
  origin. Covers all fifteen required flows plus workspace card count and a
  clean-console assertion.
- **Accessibility:** one `<h1>`, four landmarks, skip link, zero unlabelled
  inputs, zero unnamed buttons, zero touch targets under 44px, keyboard-reachable
  primary path. Two defects were found and fixed: a 29px brand link and seven
  `<h1>` elements across the view stack.
- **Public site:** Jekyll 25→26 pages, `validate_site` 70/0, `validate_build`
  1161 checks / 0 failures.

## Security review

No secrets in client source — there is no server, so there is nothing to hold
one. No `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon`: the application
makes no network requests at all. No `innerHTML`, no `eval`, no `new Function`,
no inline event handlers. Every user string reaches the DOM via `textContent`.
Export HTML escapes all five HTML metacharacters, verified by a test that
injects `<script>` and `<img onerror>` through project fields. Unknown keys are
stripped on load, so a hand-edited store cannot introduce fields. `vercel.json`
ships a `default-src 'none'` CSP with `connect-src 'none'`, plus nosniff,
`frame-ancestors 'none'` and a restrictive Permissions-Policy.

## SEO metadata

Title, description, canonical, Open Graph (incl. image), Twitter card, and a
`SoftwareApplication` JSON-LD block — emitted only because the application is
real and works. No `aggregateRating`, no `reviewCount`, no usage figures: none
exist, so none are claimed. `offers.price` is `0`, which is the present truth.

## Commercial definition

- **Value proposition:** Describe one goal; get back one plan across the
  dimensions it actually needs, in minutes rather than a week of deciding where
  to start.
- **Target user:** Operators and creators with real expertise and a goal that
  spans making something, explaining it, delivering it and pricing it.
- **Primary problem:** Not a shortage of ideas — a shortage of structure. The
  cost is time lost to deciding where to begin.
- **Limitations:** Produces a plan, not the work. No cross-device sync. No
  account. No professional advice of any kind.
- **Recommended commercial model:** Free for this MVP. It has no server and
  therefore no marginal cost per user, so charging now would add billing
  infrastructure before there is evidence anyone wants it. Revisit only when
  retention shows people return to a second project. **Do not implement
  recurring billing for this.**

## Blockers

1. **No deployment.** Vercel is unreachable from the build session: no CLI, no
   `VERCEL_TOKEN`, the Vercel MCP server disconnected, and the egress proxy
   denies `api.vercel.com` (`403` on CONNECT). Deploying needs credentials this
   session does not have.
2. **Remote E2E against a Vercel Preview has not been run.** The 17 checks
   passed against a served HTTP origin in a real browser, which is strong
   evidence but is not the Preview URL the release gate calls for.

## Note on hosting

The application is fully static with no backend, so GitHub Pages can host it
with no new credentials — it is already in the Jekyll build at
`/apps/prism/`, and its canonical URL points there. That is an alternative to
Vercel, not a substitute for the Preview gate. Owner's decision.
