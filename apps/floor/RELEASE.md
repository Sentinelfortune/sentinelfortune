# Floor — release record

Internal. Excluded from the published site. Written so this release can be
registered in House of Assets later without re-deriving anything. No House of
Assets system was called or modified to produce it.

| Field | Value |
|---|---|
| Product | **Floor** |
| Version | 1.0.0 |
| Class | Hosted mini-SaaS (browser application) — **not** a Digital Shop downloadable |
| Source | `apps/floor/` on branch `flagship-7d-mvp` |
| Deployment URL | **none** — not deployed (see Blockers) |
| Deployment ID | none |
| Supersedes | Prism prototype (removed; failed the one-customer / one-pain principle) |

## Product contract

```
targetUser             Owner-operators of small trades / home-service businesses
primaryPain            Quoting from gut feel; discovering losses after the job
secondaryRelatedPain   Cannot identify which job type is unprofitable
desiredOutcome         A defensible price floor per job, and the reason margin was lost
valueProposition       Know the price below which a job loses you money
primaryWorkflow        Set overhead → add jobs → compute → rank → diagnose → export
coreBusinessLogic      Overhead recovery rate; true cost; margin; break-even floor;
                       target price solved as cost/(1-margin); hourly yield;
                       component diagnosis vs portfolio median; portfolio findings
coreOutput             Ranked table, price floor per job, headline finding, CSV + report
persistence            localStorage — no account, no server, no collection
timeToValue            118ms to a full worked result via sample data (measured)
primaryCTA             "Check a job"
pricingHypothesis      Free at 1.0; $49 one-time hypothesis, unvalidated
```

## Capabilities

**Used:** CORE_UI, LOCAL_PERSISTENCE, BUSINESS_RULE_ENGINE, CSV_EXPORT,
PDF_EXPORT (print-to-PDF via self-contained HTML), RESPONSIVE_UI,
LOCAL_FUNCTIONAL_TEST, QA, SECURITY, SEO, PACKAGE.

**Excluded, and not needed:** AUTH, STRIPE, EMAIL, TEAMS, ADMIN, CRM,
AI_GENERATION, DATABASE_PERSISTENCE. Nothing in the contract requires an
account, a payment, a message, or a model.

## Architecture

Static ES modules, zero dependencies, no build step. `model.js` holds the entire
calculation engine as pure functions and is the product; `store.js`, `export.js`
and `ui.js` exist to feed it and render it.

## QA evidence

**Unit — 39 tests, 39 passing** (`node --test tests/model.test.mjs`). The
arithmetic is asserted against hand-worked figures, not against whatever the
code produced: 10 hours at 32/hr labour with 30/hr recovery, 500 materials and
50 travel gives labour 320, overhead 300, direct 870, true cost 1170, margin 330
at 22%, floor 1170, target price 1560 — and a job priced at exactly 1560 is
re-verified to yield exactly 25%. Also covers: a job covering direct cost but
not overhead is still a loss by exactly the unrecovered overhead; cost shares
sum to 100%; portfolio totals reconcile; a healthy portfolio reports no problem
rather than inventing one; diagnosis declines to compare with fewer than three
jobs; CSV formula injection is neutralised; HTML export escapes injected markup.

**End-to-end — 15 checks, 15 passing**, real Chromium against a served origin.
Covers start → invalid input → real input → primary action → correct result →
loss detection → reload → persistence → re-render → CSV → printable report →
recalculation on delete → mobile → accessibility → clean console. Check 6
asserts the in-browser numbers equal the hand-worked ones (672 / 228 / 25.33% /
floor 672 / target 896).

**Defects found and fixed during the gates:** a duplicate `id` attribute on the
setup form with `aria-controls` pointing at the wrong element; and a bug in the
E2E harness itself, where the `confirm` dialog handler was registered after the
click rather than before, so a reset silently never happened and six checks
failed for a reason that had nothing to do with the product.

## Security evidence

No secrets in client source — there is no server, so there is nothing to hold
one. Zero `fetch` / `XMLHttpRequest` / `WebSocket` / `sendBeacon`: the
application makes no network requests. Zero `innerHTML`; every user string
reaches the DOM through `textContent`. No `eval`, no `new Function`, no inline
handlers. Unknown keys are stripped when the store is read, so a hand-edited
localStorage cannot introduce fields. All numeric input is parsed through a
strict regex that rejects `12px`, `NaN` and `Infinity`. CSV cells beginning
`=`, `+`, `-` or `@` are prefixed with an apostrophe so a job name cannot become
an executable formula in the recipient's spreadsheet. `vercel.json` ships
`default-src 'none'` with `connect-src 'none'`, nosniff, `frame-ancestors
'none'` and a restrictive Permissions-Policy.

## SEO

Title, description, canonical, Open Graph with image, Twitter card, and a
`SoftwareApplication` JSON-LD block. No `aggregateRating` and no `reviewCount`:
there are no reviews, so none are claimed. `offers.price` is `0`, which is true.

## Commercial readiness

- **Who is it for?** Owner-operators of small trades businesses.
- **What problem?** Quotes that miss overhead and lose money invisibly.
- **What result?** A break-even price floor per job and the reason margin was lost.
- **Why pay?** One correctly-priced job repays it many times over.
- **First action?** "See it with example figures" — a full result in under a second.
- **Understandable without the Owner?** Yes: the landing paragraph states the
  problem, the sample produces a real answer with no input, and each field
  carries a hint explaining what figure belongs there.
- **Workflow complete?** Yes: input → computation → result → export.

## Blockers

1. **No deployment.** Vercel is unreachable from the build session: no CLI, no
   `VERCEL_TOKEN`, and the egress proxy denies `api.vercel.com` (403 on
   CONNECT). Deploying requires credentials this session does not have.
2. **Remote E2E against a Vercel Preview has not been run.** The 15 checks
   passed against a served HTTP origin in a real browser, which is the same
   suite pointed at a different host — `npm run e2e:remote <url>` runs it
   against a Preview unchanged — but it is not the Preview evidence the gate
   requires.

## Hosting note

Fully static with no backend, so GitHub Pages can host it with no new
credentials. It is already in the Jekyll build at `/apps/floor/` and its
canonical URL points there. That is an alternative host, not a substitute for
the Preview gate.
