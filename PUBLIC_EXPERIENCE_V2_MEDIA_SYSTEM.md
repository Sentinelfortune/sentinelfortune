# PUBLIC EXPERIENCE V2 — MEDIA SYSTEM

## 1. The three publication roles (§13)

Every important editorial release supports three media roles:

| Role | Job | Used in |
|---|---|---|
| `ATTENTION` | the cover that earns a look | Latest, share preview |
| `VALUE` | the human or real-use scene saying why this matters | Featured experiences |
| `DISCOVERY` | the collection visual inviting a deeper look | Knowledge and ideas |

Declared on the medium itself and normalised by the one core:

```json
{ "kind": "IMAGE", "role": "VALUE", "src": "/media/…", "alt": "…" }
```

An unknown or absent role becomes `null` rather than being guessed, so a record
with unroled media behaves exactly as it did before roles existed.

## 2. Resolution order

`roleCover(record, identity, role)` resolves:

1. the governed image carrying that role, if House of Assets supplied one;
2. for `ATTENTION` only, any unroled governed image — a single supplied cover
   *is* an attention image;
3. otherwise **deterministic generated art, salted by the role**.

The salt is what makes the three slots three genuinely different artworks
rather than one picture repeated three times. Same record + same role always
yields the same artwork, so nothing shimmers between renders.

**Reusable across** Latest · a world's home · a category · the Featured rail ·
related content · share preview. No hand-coded page per release exists or is
needed — the SPA rewrite serves every detail route from one `index.html`.

## 3. Never a broken frame

`cover()` guarantees two outcomes and no third: a governed image with an error
handler that swaps in generated art, or generated art directly. In this build
the only real `<img>` elements on the homepage are the two shipped logos
(`/assets/sf-logo-128.webp`, `/assets/sf-logo-256.webp`) — verified by a check
that asserts every `<img src>` starts with `/assets/`.

No path to a non-existent media file is emitted anywhere.

## 4. THE HONEST GAP — read this one

§8 asks the experience layer to show **artists, learners, entrepreneurs, teams,
studios, software and AI interfaces, code, learning environments, cinematic
scenes, game worlds, books, products, real-use environments** — and warns
explicitly against relying almost entirely on abstract gradients.

**That imagery does not exist in this build, and this session could not create
it.** There is no photography, no stock licence and no image generation
available here, and fabricating people or products would violate §22 besides.

So: **every non-logo visual on the homepage is deterministic generated SVG.**
The structure, the slots, the roles and the fallbacks are all real and tested.
The photography is not. The page currently reads more abstract than the brief
intends, and after the first render the generated art was deliberately reduced
in dominance — bands rather than panels in Knowledge and Featured — so that it
reads as atmosphere rather than as placeholder wallpaper.

**This is the single largest remaining item before public activation**, and it
is Owner content work, not engineering:

| Need | Per release | Notes |
|---|---|---|
| `ATTENTION` | 1 | 3:2 or the type's ratio, ≥1280px wide |
| `VALUE` | 1 | a human or real-use scene, 16:9 |
| `DISCOVERY` | 1 | collection/world visual, 3:2 |

Supply them as governed media on the record with `role` set, and they replace
the generated art with **no code change** — that is what the role system is
for.

## 5. Performance

- Generated SVG is inline, costs no request, and scales losslessly.
- Real imagery should ship WEBP or AVIF with responsive sizes.
- Below-the-fold media is `loading="lazy"`; the hero is `eager` with
  `fetchpriority="high"`.
- Explicit `width`/`height` on every `<img>` so nothing shifts.
- Total page requests in this build: the shell, one stylesheet, the ES modules,
  one feed JSON, two logos, and the Google Fonts stylesheet.

---

## 6. MEDIA AUDIT — approved media integration

Audited: the Owner-provided explainer, and assets already present in the
platform. **No private storage was searched.**

| Asset | Classification | Used in | Size |
|---|---|---|---|
| `sentinel-fortune-explainer-720.webm` (VP9/Opus) | `OWNER_APPROVED_BRAND_MEDIA` | homepage, "See the system" | 3.19 MB |
| `sentinel-fortune-explainer-720.mp4` (H.264/AAC) | `OWNER_APPROVED_BRAND_MEDIA` | same — fallback source | 3.31 MB |
| `sentinel-fortune-explainer-poster.webp` | `OWNER_APPROVED_MECHANISM_MEDIA` | film poster | 72 KB |
| `sentinel-fortune-explainer-poster.jpg` | `OWNER_APPROVED_MECHANISM_MEDIA` | poster fallback | 108 KB |
| `sf-logo-128.webp` / `sf-logo-256.webp` | `OWNER_APPROVED_BRAND_MEDIA` | header, footer | 4 KB |
| every other visual on the homepage | `GENERATED_FALLBACK` | boards, cards, rails | 0 bytes (inline SVG) |

### Source handling

The 16.09 MB 1920×1080 master was transcoded to 720p. **The master is not
committed** — only the two web encodes and the posters are.

720p is the floor rather than a compromise: the argument is carried by small
labels on the orchestration diagram, and 540p makes them unreadable.

### Why two encodes

A browser fetches only the first source it can play, so no visitor pays for
both. WebM/VP9 is listed first because it is marginally smaller, and because
an open-source Chromium build carries no H.264 or AAC at all — which is what
makes this film verifiable in an automated browser rather than only by hand.
MP4 alone would serve every real browser.

### What was integrated, and where

The poster is the frame at **t=14.0s** — the complete diagram, seven inputs
(*ideas in*) into the orchestration engine, seven outputs (*worlds out*). It
was chosen because it states the whole thesis in one still, and because those
seven outputs map one-to-one onto the seven worlds:

| Film output | World |
|---|---|
| Music | Sentinel Fortune Records |
| Stories and media | Codex World TV |
| Games and interactive worlds | Lumen Game |
| Learning | Lumen School Academy |
| Reflection and editorial | VibraFlow Media |
| Systems and technology | LightNode Systems |
| Store and commerce | OG Legacy Store |

### Still missing

Per-release `ATTENTION` / `VALUE` / `DISCOVERY` imagery. **`VALUE` no longer
implies a photograph of a person** — a mechanism, interface, workflow,
product-in-context or educational visualisation all qualify, and the film
demonstrates exactly that register. Everything outside the film and the logos
still renders generated fallback art.

### A measured defect, found and fixed

`preload="metadata"` was the obvious choice and it was **wrong**. Measured in
Chromium, it fetched **3,343,758 of the film's 3,346,000 bytes — 99.9% — on
initial page load**, because a WebM keeps its index at the end of the file, so
"just the metadata" means reading to the end. `preload` is a hint a browser is
free to exceed, and this one did.

Changed to `preload="none"`. Initial page weight went from **3.60 MB to
0.41 MB**, with **zero** video bytes fetched until a visitor presses play.
Asserted by a check that fails if a single video byte is pulled on load.
