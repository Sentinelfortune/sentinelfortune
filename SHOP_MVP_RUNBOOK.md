# Sentinel Fortune Digital Shop — Owner Runbook (TEST)

Everything needed to take the TEST environment from "deployed" to "one controlled
purchase proven end to end". Stripe stays in **Sandbox** throughout. No step here
touches production, live payments, or House of Assets.

---

## 1. What is deployed where

| Surface | Location | Deploy method |
|---|---|---|
| Owner Admin | `https://sentinel-fortune-shop-admin.pages.dev` | Cloudflare Pages, Direct Upload of `dist/sentinel-fortune-shop-admin-pages.zip` |
| Shop Worker (API) | `https://sentinel-fortune-digital-shop-test.sentinelfortunellc.workers.dev` | `wrangler deploy --env test` |
| Public storefront | `https://sentinelfortune.github.io/sentinelfortune/shop/` | GitHub Pages, automatic on push to `main` |

The storefront is **not** deployed by this branch — it publishes from `main`. Until
this branch is merged, the live storefront still carries the old
`shop/shop-config.js` placeholder and cannot reach the Worker. That is expected;
see §6.

---

## 2. Deploy the admin

Cloudflare dashboard → **Workers & Pages** → **sentinel-fortune-shop-admin** →
**Create deployment** → production branch → upload
`dist/sentinel-fortune-shop-admin-pages.zip`.

The ZIP is flat: `_worker.js` and `_routes.json` sit at the archive root, not under
an `admin/` folder. Cloudflare reads them directly — do not unpack and re-zip a
nested folder.

Confirm afterwards: `https://sentinel-fortune-shop-admin.pages.dev/api/shop/health`
returns JSON. If it returns admin HTML, `_worker.js` did not make it into the upload.

## 3. Deploy the Worker

```
wrangler deploy --env test
```

Run from `shop-worker/`. Required secrets (already set; re-run only if rotated):
`STRIPE_SECRET_KEY` (sk_test_ only), `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`,
`CF_ACCESS_AUD`.

---

## 4. Create the one controlled test product

In the admin → **Products** → **New Product**. Use exactly these values so the
product is unmistakably a test artifact and makes no commercial claim:

| Field | Value |
|---|---|
| SKU | `SFL-E2E-001` |
| Slug | `end-to-end-test-product` |
| Title | Sentinel Fortune Digital Shop End-to-End Test Product |
| Short description | Internal test product used to verify checkout, delivery and refund handling. Not a commercial offering. |
| Category / Audience | Test / Internal |
| Edition / Version | Test / 1.0 |
| License type | SINGLE_BUSINESS |
| Supported formats | PDF |
| Refund policy summary | Test-only product. Refunds processed on request. |
| Download link expiry | 72 hours |
| Max downloads | 5 |

Then:

1. **Upload a cover image** (PNG/JPG/WEBP) — required for publishing.
2. **Upload one small PDF** as the downloadable file. Use a file you own outright.
   Do not upload House of Assets material.
3. **Set the price** to a low Sandbox amount (e.g. `5.00`) and tick the price
   confirmation box. Price is never inferred — it must be explicitly confirmed.
4. Tick the Owner **terms acknowledgement**.
5. The **readiness panel** must show "Ready to publish". If it lists issues, they
   are the exact remaining requirements.
6. **Publish**.

---

## 5. Run the end-to-end purchase

1. Open the product page on the storefront and click through to Stripe Checkout.
2. Pay with Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC.
3. You land on `success.html`. It polls `/shop/order/status` and should show the
   order number, license number, and a **Download your files** button within a few
   seconds. This is the in-browser delivery path — it works even if email does not.
4. Check your inbox for the confirmation and delivery emails. If Resend's sender
   domain is unverified these will not arrive; that is an external DNS matter and
   does not block delivery, because of step 3.
5. In the admin, **Orders** shows the order as PAID and **Licenses** shows an
   ACTIVE license.
6. Click the download link. The file downloads.
7. Confirm an unauthorized download fails: alter one character of the token in the
   URL — expect **404**. Wait past the expiry or exceed the download count —
   expect **410** / **403**.

## 6. Verify the boundaries

| Check | Expected |
|---|---|
| `…workers.dev/shop/health` | `{"ok":true,…}` |
| `…workers.dev/shop/products` | the published test product |
| `…workers.dev/shop/admin/whoami` (no Access session) | **401** |
| `…pages.dev/api/shop/health` (through Access) | JSON, not HTML |
| R2 buckets | no public access on either |

---

## 7. Refund

In the Stripe Sandbox dashboard, refund the payment. Stripe sends
`charge.refunded`; the Worker verifies the signature, marks the order REFUNDED,
revokes the license, and revokes every outstanding download authorization.

Confirm: the admin shows the order REFUNDED and the license REVOKED; reloading the
success page shows the refunded notice with no download button; the previously
working download link now returns **403**.

---

## 8. Support actions

- **Customer lost their link** — Orders → order → *Generate Replacement Download
  Link*. Emails a fresh link, or returns it inline if email fails.
- **Resend a confirmation** — Orders → order → *Resend Confirmation Email*.
- **Withdraw access** — Licenses → *Revoke*. Immediate.

Every one of these is written to the admin audit log with the acting Owner email.

---

## 9. Before real customers

This runbook covers **controlled test use only**. Selling to real customers
additionally requires: final legal pages reviewed, final refund policy, Stripe
live-mode activation, a verified production email sending domain, a genuine
commercial product, final public-site content, and backup/monitoring validation.
Do not activate live payments before those are done.
