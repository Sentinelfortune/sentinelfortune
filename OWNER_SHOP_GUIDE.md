# Owner's Guide — Running the Digital Shop

This is the day-to-day operating guide for the Digital Shop, written for whoever is running it, not for a
developer. It assumes setup is complete (`CLOUDFLARE_SHOP_SETUP.md`, `STRIPE_SHOP_SETUP.md`,
`RESEND_SETUP.md`) and you can reach `/admin` through its Cloudflare Access-protected URL.

## Signing in

There is no username or password for `/admin`. Access is granted by Cloudflare Access to specific email
addresses configured when the Access application was set up (`CLOUDFLARE_SHOP_SETUP.md` §6). If you see
"Access Denied" on any admin page, either you're not on the allowed list, or the admin app wasn't deployed
correctly behind Access — it is never a login-form problem, because there is no login form.

## Creating and publishing a product

See `PRODUCT_UPLOAD_AND_PUBLISHING_GUIDE.md` for the full walkthrough. In short: **Products → New
Product**, fill in the details, set a confirmed price, upload a cover image and at least one downloadable
file, then **Publish** from the product's editor page. The Publish button is blocked with a specific list
of what's missing until every requirement is met — you cannot accidentally publish an incomplete listing.

## Managing existing products

From **Products**, each row shows status, price, license type, and a readiness indicator. Actions
available per product: **Edit**, **Publish/Unpublish**, **Archive**, **Duplicate**.

- **Unpublish** takes a product off the public catalog without deleting it — use this to pause sales.
- **Archive** is for retiring a product; it's a status, not a deletion — order/license history for past
  sales of that product is unaffected either way.
- **Duplicate** copies a product's text fields (title, description, pricing structure, etc.) into a new
  DRAFT with the price reset to unconfirmed. It does **not** copy the cover image or downloadable files —
  you'll need to re-upload those for the copy. See `SHOP_KNOWN_LIMITATIONS.md`.

## Handling an order

**Orders** lists every order. Click **Details** on any row to see the customer, license, and download
authorization status, plus three actions:

- **Resend Confirmation Email** — re-sends the original order confirmation. Use this if a customer says
  they never received it (check spam first).
- **Generate Replacement Download Link** — issues a brand-new download link (with a fresh expiry and
  download count) and emails it to the customer. Use this when their original link expired or hit its
  download limit. The old link, if somehow still valid, is unaffected — this adds a new one rather than
  extending the old one.
- **Revoke License** — immediately cuts off download access for this order. Use this for suspected fraud
  or a support decision made outside Stripe (a true refund should go through Stripe directly — see below —
  which revokes the license automatically as part of that flow).

## Refunds

Refunds happen **in Stripe**, not in this admin app — there is no "refund" button here. Issue the refund
from the Stripe Dashboard (or Stripe's own tools) as normal. The Shop Worker receives Stripe's
`charge.refunded` webhook automatically and, without any manual step here:

1. Marks the order `REFUNDED`
2. Revokes the license
3. Revokes every download authorization tied to that order (further download attempts get a 403)
4. Emails the customer a refund confirmation

If a refund doesn't show up as expected in **Orders**, check that the Stripe webhook is configured and
delivering successfully (Stripe Dashboard → Developers → Webhooks → your endpoint → recent deliveries).

## Licenses

**Licenses** lists every issued license across all products, with a **Revoke** action per active license
(same effect as revoking from an order's detail view — this list is just easier to scan across many
orders).

## Files

**Files** is a read-only-ish overview of every cover image, preview image, and downloadable file across
every product, so you can spot-check what's uploaded without opening each product individually. Delete
here works the same as deleting from a product's editor page. To add new files, open the specific
product's editor.

## Settings

**Settings** controls the shop-wide defaults for download link expiry (hours) and max downloads per link.
Individual products can override both on their own editor page — the shop-wide setting only applies as
the default for new products; changing it here does not retroactively change already-issued download
links.

## When something looks wrong

The **Dashboard** page shows whether the Shop Worker is reachable, rough counts of products/orders/
licenses, and the most recent admin actions (who did what, when) — useful for spotting an unexpected
change or confirming an action actually went through.
