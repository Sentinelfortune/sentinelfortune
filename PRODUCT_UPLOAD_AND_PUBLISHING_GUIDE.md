# Product Upload & Publishing Guide

Step-by-step walkthrough of taking a product from the editor to live on the public catalog, using the
seeded first product as the running example.

## The seeded first product

`migrations/0002_seed_first_product.sql` inserts one product, as a **DRAFT**, not visible on the public
catalog:

| Field | Value |
|---|---|
| Title | AI Operations Playbook & Toolkit |
| Slug | `ai-operations-playbook-toolkit` |
| SKU | `SFL-AIOPS-001` |
| Category | Business Operations |
| Audience | HVAC, plumbing, electrical, and home-service businesses |
| Edition | Standard Self-Customization Edition |
| Version | 1.0 |
| License | SINGLE_BUSINESS |
| Price | **Not set** — `price_cents` is `NULL`, `price_confirmed` is `0` |
| Status | DRAFT |

Per the mission brief, the price was deliberately not invented. Every text field beyond the ones above
(short description, problem solved, full description, responsible-use text, refund policy summary) was
also left as an honest "pending Owner finalization" placeholder rather than fabricated marketing copy —
you'll replace those in the editor.

## Step 1 — Open the product

`/admin/products.html` → find "AI Operations Playbook & Toolkit" → **Edit**. You're now on
`product-editor.html?id=prod_ai_ops_playbook_seed_0001`.

## Step 2 — Fill in the content fields

Replace every "Draft product — ... pending Owner finalization" placeholder with real copy:

- **Short Description** — one or two sentences for the catalog card
- **Problem Solved** — what pain point this toolkit addresses for the stated audience
- **Full Description** — the complete product description
- **What's Included** — add one line per deliverable (click "+ Add item")
- **Not Included** (optional) — anything a buyer might assume is included but isn't
- **FAQs** — add question/answer pairs as needed
- **Responsible-Use Statement** — replace the placeholder with real guidance
- **Refund Policy Summary** — this is required to publish; write the specific refund terms for this
  product, or reuse the language from `shop/refund-policy.html`

Click **Save Product** after filling these in.

## Step 3 — Set and confirm the price

In the **Price** panel: enter a dollar amount (e.g. `49.00`), check **Confirm this price for sale**, then
**Update Price**. The price will not go live, and the product cannot be published, until this box is
checked — this is enforced server-side (`checkPublishReadiness` in `src/lib/validate.ts`), not just a UI
suggestion.

## Step 4 — Upload a cover image

**Cover & Preview Images** panel → choose a PNG/JPG/WEBP file (≤15 MB) → **Upload / Replace Cover**. This
is required to publish. Uploading again replaces the existing cover (there is only ever one).

Optionally add up to 6 preview images the same way, using **Add Preview Image**.

## Step 5 — Upload the downloadable file(s)

**Downloadable Files** panel → choose the actual product file(s) (PDF/DOCX/XLSX/PPTX/ZIP/PNG/JPG/WEBP/CSV/
TXT, ≤500 MB each) → **Upload File**. At least one is required to publish. If you upload more than one
file, buyers will see a file-selection list at their download link rather than a single direct download —
this is the intended behavior for multi-file products (see `SHOP_ARCHITECTURE.md`).

Executable, script, and markup file types (`.exe`, `.js`, `.html`, `.svg`, etc.) are rejected automatically
regardless of the extension you try to give them.

## Step 6 — Check readiness

The **readiness panel** at the top of the editor lists exactly what's still missing, live, as you complete
each step. Once it shows "✓ Ready to publish," every requirement is met:

- Price entered and confirmed
- Cover image present
- At least one downloadable file present
- A valid license type selected
- Owner terms acknowledgement checked
- A non-empty refund policy summary

## Step 7 — Preview

Click **Preview Public Page** to see exactly what a buyer will see on the product page, using the same
data the public API would return — without actually publishing.

## Step 8 — Publish

Once readiness shows all-clear, click **Publish** (in the lifecycle panel). The product immediately
appears on `/shop/index.html`'s catalog and becomes purchasable at `/shop/product.html?slug=ai-operations-
playbook-toolkit` — **do this only after Owner approval and only after a full Stripe test-mode purchase
has been verified end-to-end** (see `SHOP_RELEASE_CHECKLIST.md`).

## Publishing subsequent products

The exact same flow applies to any new product — **Products → New Product**, fill in the fields, set and
confirm a price, upload a cover and at least one file, then Publish. No code changes or redeployments are
required to add, price, or publish a new product.
