# PUBLIC EXPERIENCE V2 — TEST EVIDENCE

All runs are **local**. Nothing was deployed; no result here is remote or
production evidence.

---

## 1. Totals

| Suite | Result |
|---|---|
| `platform/tests/engine.test.mjs` (existing engine) | **76 / 76** |
| `platform/tests/hub.test.mjs` (**new**, V2) | **17 / 17** |
| `platform/e2e/hub.mjs` (**new**, real Chromium) | **56 / 56 checks** |
| `platform/e2e/acceptance.mjs` (existing, 7 worlds) | **435 / 435 checks** |
| `corridor/tests/corridor.test.mjs` | **23 / 23** |
| `corridor/e2e/acceptance.mjs` | **47 / 47 checks** |
| `transport/tests/transport.test.mjs` | **29 / 29** |
| `transport/e2e/live.mjs` | **64 / 64 checks** |

**0 failures.** No console error, page error or failed request on any page.

## 2. The §25 acceptance list

| # | Check | Result |
|---|---|---|
| 1 | ONE public engine | **PASS** — one `index.html`, identical bytes for all seven |
| 2 | ONE shared core | **PASS** — `selectAllPublic` reuses `publicReadiness`; union equals the seven per-world selections |
| 3 | ONE commercial heart | **PASS** — `hub.js` defines no `priceState`/`ctaState`/`pricingTier` |
| 4 | ONE identity router | **PASS** — hostname wins; one `resolveIdentity` |
| 5 | seven worlds map correctly | **PASS** — `WORLD_ORDER` equals `IDENTITIES` |
| 6 | no duplicate public platform | **PASS** — one new module, a view |
| 7 | no cross-world leakage | **PASS** — 10 records hidden from the Academy |
| 8 | one coherent story | **PASS** — single h1, unified hero, ≤2 CTAs |
| 9 | seven worlds visible | **PASS** — 7 boards, public and preview |
| 10 | latest supports 3 releases | **PASS** — exactly 3, newest first |
| 11 | boards visually distinct | **PASS** — 7 distinct accents |
| 12 | people / technology / real experiences visible | **FAIL — see §4** |
| 13 | free content remains free | **PASS** — no record changed tier |
| 14 | product prices independent | **PASS** — `$49`, `$79` from the feed |
| 15 | freemium does not set product prices | **PASS** — no tier ladder rendered |
| 16 | no fake checkout | **PASS** — both actions leave for the Shop |
| 17 | support separate from purchase | **PASS** — inert spans, no href, explicit copy |
| 18 | institutional alignment | **PASS** — readiness mirrors `_data/identities.yml`, drift fails the build |
| 19 | mobile works | **PASS** — 360px, no h-scroll, 7 boards, 0 targets under 40px |
| 20 | accessibility basics | **PASS** — skip link first, one h1, alt on all images, decorative art `aria-hidden`, 45 focusable |
| 21 | no localhost links | **PASS** — zero, public and preview |
| 22 | no broken asset paths | **PASS** — every `<img>` under `/assets/` |

**21 of 22 pass. Item 12 fails and is not being reported as anything else.**

## 3. The two checks that mattered most

**On a public host, not one unsurfaced world is a link.** Run in real Chromium
with `--host-resolver-rules` mapping `sentinelfortune.com`, so the browser
genuinely believes it is on the canonical host:

```
PASS  39. NOT ONE unsurfaced world is a link  — zero anchors
PASS  40. each unsurfaced world states its honest state instead
          — In build | In build | In build | Ready — not yet published | In build | In build | In build
PASS  41. the Academy reads READY, the other six read In build
PASS  42. no preview affordance leaks onto a public host
```

**Every field is blue-dominant** — the §7 correction as something a test can
fail on (blue channel must exceed red and green **and** be ≥ `0x18`):

```
PASS  49. sentinel fortune (homepage)  #050b1a  r5  g11 b26
PASS  50. sentinelfortunerecords       #070f24  r7  g15 b36
PASS  51. codexworldtv                 #060d1f  r6  g13 b31
PASS  52. lumengame                    #061024  r6  g16 b36
PASS  53. lumenschoolacademy           #070f22  r7  g15 b34
PASS  54. vibraflowmedia               #080e1d  r8  g14 b29
PASS  55. lightnodesystems             #050d1c  r5  g13 b28
PASS  56. oglegacystore                #080e20  r8  g14 b32
```

## 4. What failed, stated plainly

**Item 12 — "people / technology / real experiences are visible" — FAILS.**

Every non-logo visual is deterministic generated SVG. There is no photography
of artists, learners, studios, interfaces or products, because this session has
no way to produce or license it, and fabricating it would breach §22. The media
*slots* are implemented and tested; the imagery is Owner content work. See
`PUBLIC_EXPERIENCE_V2_MEDIA_SYSTEM.md` §4.

## 5. One contract change, recorded not hidden

`platform/e2e/acceptance.mjs` previously asserted the root rendered an identity
**chooser**. V2 replaces that with the company homepage. The assertion was
**replaced, not deleted** — it now asserts `surface === "HUB"`, seven boards and
one h1 — so the change reads as intended, not as a dropped check.

## 6. Visual evidence

Full-page screenshots captured in Chromium at 1280×1200 and 360×740. Two
renders were taken: the first showed the page still reading black-and-gold with
a hole in the board grid; both were corrected and re-verified.

*Screenshots are session artefacts and are not committed to the repository.*
