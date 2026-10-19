# PUBLIC EXPERIENCE V2 — IMPLEMENTATION REPORT

**Branch:** `feature/public-experience-v2` · **Base:** `085b1b5`
**Classification:** `LOCALLY_TESTED` — not `REMOTELY_VERIFIED`, not `PRODUCTION_LIVE`.

---

## 1. Files changed

| File | Change | Lines |
|---|---|---|
| `platform/engine/hub.js` | **new** — the homepage view | 430 |
| `platform/tests/hub.test.mjs` | **new** — 17 unit tests | 215 |
| `platform/e2e/hub.mjs` | **new** — 56 browser checks | 250 |
| `platform/engine/identities.js` | deep-blue rebase; `role`/`cta`/`focus`/`readiness`; `HUB`; `worldState()` | +180 |
| `platform/app.css` | homepage layer + refinement, appended | +375 |
| `platform/engine/core.js` | `selectAllPublic()`; media `role` | +40 |
| `platform/engine/visual.js` | `roleCover()`, `MEDIA_ROLES`, salted art, company backdrop | +70 |
| `platform/engine/boot.js` | `bootHub()`; shell serves world **or** company | +75 |
| `platform/engine/router.js` | `isPublicHost()`, `HUB_PUBLIC_HOSTS` | +22 |
| `platform/feed/public-site.json` | 3 TEST_PREVIEW releases | +3 records |
| `platform/e2e/acceptance.mjs` | root-path assertion updated to the new contract | ±12 |
| 8 × `*.md` | deliverables | — |

**Not touched:** the root Jekyll site, `apps/floor/`, `corridor/`, `transport/`,
`_data/`, `main`, DNS, Cloudflare, Stripe, the Shop, House of Assets.

## 2. Hero result

One story, not seven. H1: *"Original experiences across technology, music,
learning, stories, interactive worlds and digital culture."* Sub: *"One company.
One connected ecosystem. Seven specialized worlds."* Two CTAs — *Explore our
worlds*, *Latest releases* — and no more. Direction phrase *"Choose your world"*
carries the worlds section, not the hero, so the hero stays one message.

## 3. Seven-world implementation

Seven boards, declared order, seven distinct accents, each with name · mark ·
tag · role · published count · one CTA **or** an honest state. Reachability is
driven by the readiness contract mirrored from `_data/identities.yml`; a drift
test makes the mirror safe. On a public host, zero of the seven are anchors
today, because the Owner has surfaced none.

## 4. Latest-release implementation

Exactly three, newest first, ordered **only** by governed `publishedAt`. Each
carries artwork (`ATTENTION` role), world, content type, title, value statement
and one CTA — the world's canonical action when reachable, an honest state
label when not. The three newest are the three TEST_PREVIEW releases required
by §23: a VibraFlow teaching, an Academy lesson and a LightNode technical guide.

## 5. Featured / Knowledge / Products / Support / Business

- **Featured experiences** — phrased as the doing (Listen, Read, Play, Learn,
  Explore), `VALUE` role artwork.
- **Knowledge and ideas** — courses, teachings and books, `DISCOVERY` role;
  "Free to read" appears only when the governed price state is FREE.
- **Digital products** — two verified products at `$49` and `$79`, both handing
  off to the Digital Shop. No tiers. Honest-absence block when none qualify.
- **Support the work** — $5 / $10 / $25 / Custom as **inert spans**; no payment
  action exists, and the page says so.
- **Work with Sentinel Fortune** — six outcome-led offers, two CTAs, no
  fabricated customers, testimonials or partners.

## 6. Colour system

Deep dark blue is the foundation on all eight fields, enforced by test. Gold
moved out of `--accent` into a separate scarce `--gold`. Full detail and the
before/after table: `SEVEN_WORLDS_VISUAL_SYSTEM.md`.

## 7. Two defects found by looking, not by testing

1. **`isCanonicalHost` was the wrong gate for the homepage.** It covers the
   seven world hosts only, so on `sentinelfortune.com` itself the homepage would
   have rendered in *preview* mode and made all seven boards clickable in
   public. Fixed with `isPublicHost()`.
2. **The first render still read black-and-gold**, and the board grid left a
   hole in its last row. Both invisible in the token values; both obvious in the
   screenshot. Fixed, re-rendered, re-verified.

## 8. Classification

| Item | Status |
|---|---|
| Homepage sections A–H | `IMPLEMENTED` · `LOCALLY_TESTED` |
| Seven-world boards + readiness | `IMPLEMENTED` · `LOCALLY_TESTED` |
| Three-image role system | `IMPLEMENTED` · `LOCALLY_TESTED` |
| Deep-blue foundation | `IMPLEMENTED` · `LOCALLY_TESTED` |
| Free / premium / product / support boundary | `IMPLEMENTED` · `LOCALLY_TESTED` |
| Mobile + accessibility basics | `IMPLEMENTED` · `LOCALLY_TESTED` |
| **Real human / technology imagery** | **`BLOCKED`** — Owner content |
| **Support payment** | **`BLOCKED`** — no verified infrastructure |
| **Premium experience tier** | **`BLOCKED`** — none verified to exist |
| Remote / production | **`BLOCKED`** — nothing deployed |

Nothing local is promoted to remote or production status.
