# PUBLIC EXPERIENCE V2 — BLUEPRINT

**RECALL:** RECALL-SFL-PUBLIC-EXPERIENCE-DAN-CORRIDOR-2026-10-18-V2
**Branch:** `feature/public-experience-v2` · **Base:** `085b1b5`
**Status:** implemented and locally tested. Not deployed.

---

## 1. The anti-duplication gate (§3), reported before implementation

### What already existed

| # | Implementation | Where | Scale | Live? |
|---|---|---|---|---|
| 1 | **Root Jekyll site** | `index.html`, `_layouts/` ×5, `_includes/` ×6, `_data/` ×8 | 2,146-line homepage | **YES** — this is `sentinelfortune.github.io/sentinelfortune/` |
| 2 | **`platform/` shared platform** | `platform/engine/` ×12, `app.css`, `index.html` | 3,852 lines | **No** — feature branches only; **0 files on `origin/main`** |
| 3 | `apps/floor/` | a single product app | — | separate concern |

**Two competing implementations existed. A third was not created.** Per §3 the
target is the canonical shared platform — `platform/` — and that is what was
upgraded, in place. The root Jekyll site was **not modified**: §3 says preserve
historical implementations until Owner-approved cleanup, and this mission
performs no destructive cleanup.

### The tension the Owner must know about

§2 names the current public experience as
`https://sentinelfortune.github.io/sentinelfortune/`. That URL is served by
implementation **#1**. The canonical shared platform §3 directs us to upgrade is
**#2**, which is not deployed anywhere.

So "upgrade the existing public experience in place" was executed against the
**architecture** the Owner designated canonical, not against the **URL**
currently serving. Making V2 the thing at that URL is a deployment decision,
not a code one — see `PUBLIC_EXPERIENCE_V2_ACTIVATION_PLAN.md`.

### What was reused, extended, adapted

| Module | Action | Note |
|---|---|---|
| `engine/core.js` | **extended** | `+selectAllPublic()` — the SAME `publicReadiness()` gate, without the identity filter. `+media role` on `normalizeMedium` |
| `engine/commerce.js` | **reused unchanged** | the one commercial heart — `priceState`, `ctaState` |
| `engine/router.js` | **extended** | `+isPublicHost()` / `+HUB_PUBLIC_HOSTS` |
| `engine/identities.js` | **extended** | deep-blue theme rebase; `+role/cta/focus/readiness` per world; `+HUB`, `+worldState()`, `+WORLD_ORDER` |
| `engine/visual.js` | **extended** | `+roleCover()`, `+MEDIA_ROLES`, salted `generatedArt`, a company backdrop |
| `engine/boot.js` | **extended** | `+bootHub()`; the shell renders a world **or** the company with one renderer |
| `engine/rails.js` · `ui.js` · `renderers.js` · `feed.js` · `seo.js` · `continuity.js` | **reused unchanged** | |
| `app.css` | **extended** | +375 lines, appended; nothing rewritten |
| `engine/hub.js` | **NEW — the only new module** | a **view**, not an engine. Imports core/commerce/rails/visual/ui; defines no rule of its own |

**No duplicate public platform, engine, router, core, commercial heart or
source of truth was created.** Asserted mechanically: `hub.test.mjs` greps
`hub.js` for any local definition of `priceState`, `ctaState`, `pricingTier` or
a tier ladder and fails if one appears.

---

## 2. Architecture, preserved exactly

```
                       ONE COMPANY
                            │
        ┌───────────────────┴───────────────────┐
        │          ONE PUBLIC ENGINE            │   platform/engine/boot.js
        │          ONE SHARED CORE              │   core.js    (one gate)
        │          ONE COMMERCIAL HEART         │   commerce.js(one price, one CTA)
        │          ONE IDENTITY ROUTER          │   router.js  (hostname wins)
        └───────────────────┬───────────────────┘
                            │
   ┌────────┬────────┬──────┴─────┬────────┬────────┬────────┐
 Records  Codex    Lumen      Academy  VibraFlow LightNode  OG Legacy
          World TV  Game                                     Store
```

The homepage is **not an eighth world**. It is the company: it is excluded from
`IDENTITIES`, it owns no content types, no segment and no rails — and a test
asserts that.

---

## 3. Homepage structure (§9)

| § | Section | What it does |
|---|---|---|
| A | **Hero** | one unified story, ≤2 CTAs: *Explore our worlds* · *Latest releases* |
| B | **Latest from Sentinel Fortune** | exactly 3, newest first, from governed `publishedAt` only |
| C | **Explore our worlds** | seven gateway boards, seven distinct accents, state-honest |
| D | **Featured experiences** | phrased as the doing — Listen, Read, Play, Learn, Explore |
| E | **Knowledge and ideas** | courses, teachings, books; free stated only when governed FREE |
| F | **Digital products** | verified commercial assets only — no tiers, no fake Buy |
| G | **Support the work** | voluntary; **no payment action exists** until infrastructure is verified |
| H | **Work with Sentinel Fortune** | licensing, OEM, distribution, collaboration; outcomes first |

## 4. Routing (§18)

One system. The hostname decides:

- a world's canonical host → that world's experience
- `sentinelfortune.com` / `www` / `sentinelfortune.github.io` → the homepage
- anything else (preview, local) → the homepage in **preview** mode, with every
  world walkable via `/i/<slug>/` and visibly labelled `Preview`

No second app, no second router, no per-world deployment.
