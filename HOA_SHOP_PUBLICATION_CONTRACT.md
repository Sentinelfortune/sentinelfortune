# `hoa.shop-publication/1.0` — House of Assets → Sentinel Fortune Digital Shop

Internal document. Not published. This is the specification the *sending* side must satisfy;
the receiving side is `shop-worker/src/routes/bridge/publications.ts` and
`shop-worker/src/lib/hoa-publication.ts`.

## What this route is for

The Shop already had one governed way in: the Owner uploads a package through the Admin importer,
which produces a **DRAFT** and stops, because nobody has yet confirmed the price or accepted the
terms. This route is for the case where the Owner *has* already decided. House of Assets carries
that decision with the package, and that evidence — and only that evidence — is what authorizes
going straight to **PUBLISHED**.

It does not touch Stripe. It does not walk the catalogue. It publishes exactly the one product in
the payload.

## Endpoint

```
POST {SHOP_WORKER_BASE_URL}/shop/bridge/publications
Authorization: Bearer {HOA_PUBLICATION_BRIDGE_TOKEN}
Content-Type: multipart/form-data
```

Two form fields:

| Field | Type | Contents |
|---|---|---|
| `manifest` | text | The JSON payload below |
| `package` | file | The publication package ZIP |

The bridge is **not** under `/shop/admin/`, so it does not use Cloudflare Access — there is no
browser and no human at the keyboard. It authenticates the bearer token instead, in constant time.
Holding that token grants this route and nothing else: no Admin capability, no Access session.

If `HOA_PUBLICATION_BRIDGE_TOKEN` is unset on the deployment, every request is refused with **503**.
An unset secret never means "accept anything".

## The one file a customer receives

A House of Assets publication package is a *publishing* bundle. It carries the brand package, the
media suite, the KDP and Payhip and Gumroad builds, an all-channels master, and internal production
material — none of which a buyer may ever receive.

Exactly one entry is the product:

```
delivery/customer-download.zip
```

That path is a constant in the receiver. It is not read from the manifest and not inferred by
scanning the archive. The receiver extracts that one entry, verifies its SHA-256, and stores **only
it** in the private downloads bucket. The outer package is never stored and never attached to a
product.

## Payload

```jsonc
{
  "schema": "hoa.shop-publication/1.0",
  "destination": "SENTINEL_FORTUNE_DIGITAL_SHOP",
  "intent": "PUBLISH",

  "source": {
    "system": "HOUSE_OF_ASSETS",
    "commercial_product_id": "hoa-cp-000431",      // stable identity across versions
    "commercial_product_version": "1.0.0",
    "generated_at": "2026-08-07T09:00:00Z"          // optional
  },

  // Every field here is required, and each must be exactly the value shown.
  // This block is the entire justification for publishing without a human
  // touching the Admin. If any part of it is missing, the publication is
  // refused — it is then an ordinary candidate, not an authorized publication.
  "authorization": {
    "decision": "APPROVE_AND_PUBLISH",
    "authority": "OWNER",
    "terms_acknowledged": true,                     // must be boolean true, not "yes" or 1
    "price_approved": true,
    "terms_acknowledged_at": "2026-08-07T08:55:00Z",
    "price_approved_at": "2026-08-07T08:58:00Z",
    "approved_by": "owner"                          // optional, recorded on the receipt
  },

  "package": {
    "package_id": "hoa-pkg-000431-a",
    "sha256": "<64 hex chars — digest of the uploaded package bytes>",
    "byte_size": 4194304,                           // optional; checked if present

    "customer_download": {
      "path": "delivery/customer-download.zip",     // must be exactly this
      "sha256": "<digest of that entry's uncompressed bytes>",
      "byte_size": 1048576,                         // optional; checked if present
      "content_type": "application/zip"
    },

    "cover_image": {
      "path": "media/cover.png",                    // anywhere in the package
      "sha256": "<digest of that entry's uncompressed bytes>",
      "byte_size": 204800,                          // optional; checked if present
      "content_type": "image/png"                   // must agree with the extension
    }
  },

  "product": {
    "sku": "SFL-HOA-0431",
    "slug": "operations-readiness-pack",
    "title": "Operations Readiness Pack",
    "short_description": "…",
    "problem_solved": "…",                          // optional
    "description": "…",
    "category": "Business & Professional",          // optional; drives storefront filtering
    "audience": "Owner-operators",                  // optional
    "edition": "Standard Edition",                  // optional
    "version": "1.0",
    "supported_formats": "PDF, DOCX",
    "deliverables": ["…"],
    "not_included": ["…"],
    "faqs": [{ "q": "…", "a": "…" }],
    "responsible_use_text": "…",                    // optional
    "refund_eligible": true,
    "refund_policy_summary": "…",                   // required — a live listing cannot omit it
    "license_type": "SINGLE_PURCHASER_BUSINESS_USE"
  },

  "pricing": {
    "amount": 224,                                  // major units, ≤2 decimal places
    "currency": "USD"
  }
}
```

### License mapping

| House of Assets | Shop |
|---|---|
| `SINGLE_PURCHASER_BUSINESS_USE` | `SINGLE_BUSINESS` |

Deliberately a one-entry table. Anything else is **refused**, not defaulted — guessing that some
unfamiliar license "is probably single-business" would sell rights nobody granted. Adding a mapping
is a code change and a decision, which is the point.

### Price

`pricing.amount` is in major currency units and is converted to the integer cents the Shop stores:
`224` → `22400`. The conversion goes through the string form rather than `amount * 100`, so a value
with no exact cents representation (`224.999`) is refused rather than silently rounded. Only `USD`
is accepted today, because the storefront formats prices as USD and Checkout is configured for it.

## What the receiver checks, in order

1. Bearer token (constant-time; 503 if the secret is unconfigured, 401 if wrong or absent).
2. The routing envelope — schema, destination, intent.
3. The complete authorization block.
4. Product metadata, license mapping, currency and price.
5. SHA-256 of the delivered package against `package.sha256` — **before opening the archive**.
6. `delivery/customer-download.zip` exists, extracts, and matches its declared digest.
7. The cover image exists, extracts, and matches its declared digest.
8. Idempotency (below).
9. SKU and slug are not already owned by a product this commercial product did not create.
10. The same publish-readiness gate the Admin publish button uses.

Only then does it publish. Every check that fails returns the full list of problems, so one round
trip tells the sender everything that has to change.

## Idempotency

The receiver computes a SHA-256 fingerprint over: schema, destination, intent,
`commercial_product_id`, `commercial_product_version`, `package_id`, `package.sha256`, the customer
download's digest, price in cents, currency, mapped license type, decision, authority, and both
approval timestamps.

* Same fingerprint → the original receipt is returned with `200` and `"duplicate": true`. Nothing
  is written. Retrying a delivery is always safe.
* Different fingerprint, same `commercial_product_id` → a new publication of the same commercial
  product. It **updates** the existing listing and replaces the previous customer download rather
  than stacking a second one beside it.

The `UNIQUE` index on `fingerprint` is the real guard, not the lookup: a concurrent identical
delivery that loses the race unwinds its own writes and returns the winner's receipt, so both
callers see exactly one publication.

## Response

**201** on a new publication, **200** on a replay:

```jsonc
{
  "ok": true,
  "published": true,
  "duplicate": false,
  "receipt": {
    "publicationId": "…",
    "fingerprint": "<64 hex chars>",
    "productId": "…",
    "sku": "SFL-HOA-0431",
    "slug": "operations-readiness-pack",
    "title": "…",
    "version": "1.0",
    "status": "PUBLISHED",
    "publicProductUrl": "https://…/shop/product.html?slug=operations-readiness-pack",
    "coverImageUrl": "https://…/shop/asset/<image id>",
    "priceCents": 22400,
    "priceDisplay": "$224.00",
    "currency": "USD",
    "licenseType": "SINGLE_BUSINESS",
    "source": {
      "system": "HOUSE_OF_ASSETS",
      "commercialProductId": "hoa-cp-000431",
      "commercialProductVersion": "1.0.0",
      "packageId": "hoa-pkg-000431-a",
      "packageSha256": "…",
      "customerDownloadSha256": "…"
    },
    "authorizedBy": "owner",
    "publishedAt": "2026-08-07T…",
    "receivedAt": "2026-08-07T…"
  }
}
```

The receipt names no R2 key, no bucket, no Access configuration and no Stripe identifier. The cover
is addressed through the Worker (`/shop/asset/:id`), never as a storage path.

Failures return `{ "ok": false, "published": false, "errors": [ … ] }` with **400** (malformed
delivery), **401** / **503** (authentication), **409** (SKU or slug collision), **422** (contract,
authorization or integrity), **500** / **502** (storage).

## Atomicity

D1 and R2 share no transaction, so every write registers a compensating action before it runs and
any failure unwinds them in reverse. A refused publication leaves no product row, no R2 object and
no image — verified by tests that simulate an R2 outage at each write point.

## Governance boundary

This route sets three flags the Admin importer is forbidden to set — `price_confirmed`,
`terms_acknowledged`, `publicly_purchasable` — and it sets them **only** because the payload
carried the Owner's explicit decision for each one. Remove any part of that evidence and the
publication is refused. The Admin path is unchanged and remains the way an unapproved package
becomes a reviewable draft.

## Operational note

The route needs migration `0003_hoa_publications.sql` applied to the target D1 database before it
can accept anything.
