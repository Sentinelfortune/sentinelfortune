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
