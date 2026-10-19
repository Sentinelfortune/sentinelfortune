# DIGITAL PRODUCT — COMMERCIAL BOUNDARY

> **DIGITAL PRODUCT PRICE ≠ FREEMIUM PRICING**

A digital product is a commercial asset with its **own** price, licence and
fulfilment. It is not a plan, not a tier, and not an upgrade of the public
experience.

---

## 1. Authority

| Concern | Owner |
|---|---|
| sellable asset, packaging, versioning, commercial readiness, **governed price**, licensing | **House of Assets** |
| checkout, payment, order, licence, entitlement, download, fulfilment | **The Digital Shop** |
| **displaying** verified product information | the public engine |

The public site **displays**. It never sets, infers or overrides.

## 2. What the public site may never invent

price · discount · availability · licence · checkout URL · entitlement ·
payment state · a customer, testimonial, case study or partner

## 3. How "no fake Buy button" is structural, not a habit

Section F renders a product **only** when the one commercial heart agrees on
both counts:

```js
const money  = priceState(record);   // PAID, FREE or UNPRICED
const action = ctaState(record);     // refuses BUY without a governed price
money.state === "PAID" && action.enabled === true && action.kind === "BUY"
```

`ctaState()` already refuses a BUY whose price is unknown — *"A buy button with
no price is the single worst commercial state a storefront can be in"* — and
section F simply never shows what it refuses. Both conditions, or the product
does not appear.

**When no verified product exists**, the section renders an honest absence: no
placeholder grid, no "coming soon" price, no tiers, and a link to the Digital
Shop. Nothing is fabricated to fill the space.

## 4. No freemium ladder

There is **no** `FREE / PRO / PREMIUM` construct for digital products anywhere
in the implementation. The section states it on the page — *"Each product
carries its own governed price. These are not subscription tiers."* — and a
browser check scans the rendered text for a tier ladder and fails on a match.

## 5. Verified in this build

| Product | Price | Action destination |
|---|---|---|
| Ledger Watch | `$49` | `https://sentinelfortune.github.io/sentinelfortune/shop/` |
| Operations Starter | `$79` | `https://sentinelfortune.github.io/sentinelfortune/shop/` |

Both prices come from the governed feed. Both checkouts leave for the Shop —
**the homepage hosts no checkout**. Records that are `UNPRICED`, withheld or
unapproved do not appear at all.

*(These are TEST_PREVIEW fixtures. The preview banner is visible site-wide and
says so: "this catalogue is test content, not real inventory. Nothing here is
for sale.")*
