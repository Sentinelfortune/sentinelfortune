# PUBLIC FREEMIUM BOUNDARY

Four things that must never collapse into each other:

```
FREE PUBLIC CONTENT  ≠  OPTIONAL PREMIUM EXPERIENCE
                     ≠  DIGITAL PRODUCT WITH ITS OWN PRICE
                     ≠  VOLUNTARY SUPPORT
```

Freemium applies **only** to public content and the public experience. It never
reaches a digital product. See `DIGITAL_PRODUCT_COMMERCIAL_BOUNDARY.md`.

---

## 1. FREE public content

Teachings, articles, stories, podcasts, music discovery, previews, lessons,
tutorials, challenges, demos, selected utilities.

**Existing free content stays free unless the Owner explicitly changes it.**
Nothing in V2 moves a record from free to paid; the homepage only *reads*
`pricingTier` and the governed price.

**The three-state rule, unchanged from the existing core:**

| State | Meaning | Rendered as |
|---|---|---|
| `FREE` | governed FREE | "Free to read" |
| `PAID` | a governed price exists | the price |
| `UNPRICED` | **no price is published** | the honest label — **never "free"** |

An absent price is **not** free. `governedPrice()` has no default and no
fallback, so the homepage cannot invent one by omission.

## 2. OPTIONAL PREMIUM EXPERIENCE

May exist only when real and verified. It is **not** a digital product. No
premium experience is implemented in V2 and none is claimed — `pricingTier:
"PAID"` records surface as **products**, through the Shop, not as an experience
upgrade.

**No `FREE / PRO / PREMIUM` ladder exists anywhere on the page.** Asserted by a
browser check that scans rendered text for a tier ladder and fails on a match.

## 3. VOLUNTARY SUPPORT

See §11 and `sectionG` of `platform/engine/hub.js`. Voluntary, no entitlement,
not charitable, not tax-deductible, and distinguishable from a product sale.

**With no verified support infrastructure configured, no payment action
exists.** The amounts render as inert `<span>` elements with no `href`, plus a
visible line: *"Support is not open yet… no payment action exists on this page
until support infrastructure is verified."*

There is **no default endpoint anywhere in the module** — a test greps `hub.js`
for any hardcoded donate/pay/checkout/stripe URL and fails if one appears. A
payment action cannot show up because someone forgot to configure it; it can
only show up because the Owner deliberately injected `window.SF_SUPPORT` with an
`https://` destination and `enabled: true`.

## 4. What the engine enforces, not the copy

| Rule | Enforced by |
|---|---|
| absence of a price is never "free" | `governedPrice()` — no default |
| a BUY with no price renders no button | `ctaState()` — refuses it |
| the corridor cannot price anything | `assertNoCommercialAuthority()` |
| editorial is FREE by default | corridor `toPublicRecord()` hardcodes it |
| support ≠ purchase | separate CTA kind `SUPPORT`, in the engine's free-actions list |
