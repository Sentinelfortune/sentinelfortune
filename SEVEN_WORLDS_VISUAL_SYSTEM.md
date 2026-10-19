# SEVEN WORLDS — VISUAL SYSTEM

One family, seven worlds. Shared: typography, spacing, component anatomy,
focus, touch targets, motion discipline. Different: atmosphere, accent, the
lead interaction.

---

## 1. The correction this mission made

The configuration that existed before V2 was **near-black with gold accents**:

| World | was | now |
|---|---|---|
| Sentinel Fortune Records | `#07060d` | `#070f24` |
| Codex World TV | `#06080f` | `#060d1f` |
| Lumen Game | `#050a0b` | `#061024` |
| Lumen School Academy | `#070b18` | `#070f22` |
| VibraFlow Media | `#0a0a0c` | `#080e1d` |
| LightNode Systems | `#06090c` | `#050d1c` |
| OG Legacy Store | `#0b0806` | `#080e20` |
| **Sentinel Fortune (company)** | *did not exist* | `#050b1a` |

Four of the seven accents were gold or warm, the root Jekyll site's
`theme-color` is `#04060f`, and its share-image alt text literally reads *"gold
on navy"*. The result was the generic black-and-gold luxury template §7 names.

**Two changes fixed it:**

1. **Every field moved into one deep-blue family.** Enforced by test — the blue
   channel must exceed both red and green **and** be ≥ `0x18`, so "technically
   blue" near-black cannot pass.
2. **Gold stopped being the accent.** The company's accent is now luminous blue
   `#7fb4e8`; gold lives in a separate `--gold` token spent only on a governed
   price, the support edge, the eyebrow and one hairline under the headline.

This mattered more than it sounds: every kicker, arrow, badge and generated
stroke inherits `--accent`. With gold there, "restrained accent" *was* the whole
palette. It was only visible by rendering the page and looking at it — the token
values alone looked fine.

## 2. Tokens

| Layer | Token | Role |
|---|---|---|
| Brand | `--bg` | deep blue field. Never black |
| | `--surface` | raised deep blue |
| | `--line` | structural blue-grey |
| | `--ink` / `--ink-soft` | light typography |
| | `--accent` | the world's own voice |
| | `--gold` | premium emphasis **only**; scarce by construction |
| Board | `--board-accent` / `--board-surface` / `--board-line` | per-world, set inline on the board |

Black survives only inside media treatment — the board scrim is
`rgba(5,11,26,…)`, a blue-black, not `#000`.

## 3. The seven boards

Each board carries: world name · mark · tag · short role · published count ·
one CTA **or** an honest state. Visually distinct through `--board-accent` and
its own generated field; obviously one family through the shared frame, type
and scrim.

| World | Accent | Lead action |
|---|---|---|
| Sentinel Fortune Records | `#c9a227` gold | Listen / Discover |
| Codex World TV | `#6fb3d9` cyan-blue | Watch / Explore story |
| Lumen Game | `#3fd9b4` luminous green | Play |
| Lumen School Academy | `#c8a84b` gold | Learn |
| VibraFlow Media | `#d8c9a8` warm light | Read / Listen / Reflect |
| LightNode Systems | `#7fa8c9` luminous blue | Explore / Try / Request |
| OG Legacy Store | `#d9a66c` warm | Discover / Buy |

Layout: 1 column on a phone, 2 at 620px, 3 at 1000px with the **seventh board
spanning the full width** — seven items in a three-column grid otherwise leave a
hole in the last row, and the seventh being OG Legacy Store leads directly into
Digital products beneath it.

## 4. State honesty

A board is a link **only** when the world's own readiness says so. On the
Owner's current data **no world is `hubVisible`**, so on a public host **not one
of the seven boards is an anchor** — each states `In build`, or `Ready — not yet
published` for Lumen School Academy. Verified in real Chromium against
`sentinelfortune.com`: *zero anchors*.

An unreachable world is **not an anchor styled as disabled** — it is not an
anchor at all. There is nothing to click, so there is nothing to mislead.

## 5. Honest limitation

The experience layer §8 asks for — artists, learners, studios, interfaces, code,
real products — is **not present**. Every non-logo visual on the page is
deterministic generated SVG. This is the designed premium fallback, not
photography, and it is the single largest gap between this implementation and
the brief. See `PUBLIC_EXPERIENCE_V2_MEDIA_SYSTEM.md` §4.
