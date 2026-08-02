# Product Package Contract — `PRODUCT-MANIFEST.json` v1

The governed contract between a production studio and the Sentinel Fortune Shop Admin.

A **product package** is a ZIP archive carrying `PRODUCT-MANIFEST.json` at its root plus exactly the
deliverables that manifest declares. Any producer emitting a conforming manifest can be imported — the
contract is the manifest, not the producer. Nothing in the importer is specific to one SKU.

Implementation: `shop-worker/src/lib/product-manifest.ts` (validation) and
`shop-worker/src/routes/admin/import.ts` (import). Reference emitter:
`scripts/build_product_aiops.py`. Reference manifest: `product-source/SFL-AIOPS-001/`.

---

## 1. Package layout

```
<package>.zip
├── PRODUCT-MANIFEST.json      required, at the root, exactly this name
├── <folders and files>        every one declared in manifest.files
└── ...
```

Rules the importer enforces:

- `PRODUCT-MANIFEST.json` must exist at the archive root.
- Every path in `files[]` must exist in the archive.
- Every file in the archive (other than the manifest) must appear in `files[]`. An undeclared file is a
  rejection, not a warning — a package the manifest does not describe is not governed.
- No file may carry an executable or script extension.
- Paths must be relative and must not contain `..`.
- The archive must be a readable ZIP; the manifest entry's CRC-32 is verified on extraction.
- ZIP64 archives are refused rather than misread.

---

## 2. Fields

### Required

| Field | Type | Notes |
|---|---|---|
| `contractVersion` | number | Must be `1`. |
| `sku` | string | 3–64 chars: letters, digits, `.`, `_`, `-`. The product's stable identity. |
| `slug` | string | Lowercase words separated by single hyphens. Must be unique across products. |
| `title` | string | Customer-facing product name. |
| `version` | string | Product version, e.g. `1.0`. Combined with `sku` for collision detection. |
| `licenseType` | enum | `SINGLE_BUSINESS`, `MULTI_LOCATION`, `CONSULTANT`, `WHITE_LABEL`. |
| `supportedFormats` | string | Human-readable, e.g. `"PDF, DOCX, XLSX"`. |
| `shortDescription` | string | One or two sentences for the catalogue. |
| `problemSolved` | string | The operational problem the product addresses. |
| `description` | string | Full listing copy. Newlines preserved. |
| `deliverables` | string[] | What the customer receives. Must be non-empty. |
| `notIncluded` | string[] | Explicit exclusions. |
| `faqs` | `{q, a}[]` | Both fields non-empty on every entry. |
| `responsibleUseText` | string | Responsible-use statement. |
| `refundPolicySummary` | string | Refund terms summary. |
| `files` | `{path, …}[]` | Deliverable inventory. See §3. |

### Optional

| Field | Type | Default | Notes |
|---|---|---|---|
| `edition` | string | `""` | e.g. `"Standard Self-Customization Edition"`. |
| `category` | string | `""` | Warns if absent. |
| `audience` | string | `""` | Warns if absent. |
| `licenseName` | string | — | Display name; `licenseType` is authoritative. |
| `refundEligible` | boolean | `true` | |
| `recommendedPriceCents` | integer \| null | `null` | Positive, under 100,000,00. **Populated but never confirmed** — see §5. |
| `currency` | string | `"usd"` | |
| `downloadLinkExpiryHours` | number | `72` | |
| `maxDownloads` | number | `5` | |
| `coverImage` | string \| null | `null` | Path inside the package; PNG, JPG or WEBP. |
| `producer` | string | — | Recorded in the audit log. |
| `builtAt` | string | — | ISO 8601. Recorded in the audit log. |

Any other field is ignored. Producers may add their own production metadata (the reference emitter adds
`promptCount`, `assetCount` and similar) without affecting the import.

---

## 3. `files[]`

```json
{ "path": "01-Guide/Guide.pdf", "title": "The guide", "format": "pdf", "bytes": 17640 }
```

Only `path` is required and only `path` is validated against the archive. `title`, `format` and `bytes`
are informational.

---

## 4. Validation

The importer evaluates **every** rule and returns all failures together, so one upload surfaces the full
picture rather than one error per attempt.

Rejected if: the manifest is missing, unparseable, or not an object · `contractVersion` is absent or
unsupported · any required field is missing or empty · `sku` or `slug` is malformed · `licenseType` is not
one of the four · `deliverables` is empty · any FAQ is incomplete · any string field contains placeholder
text (`REPLACE_WITH`, `TODO`, `FIXME`, `TBD`, `XXX`, `LOREM IPSUM`, `PLACEHOLDER`, `COMING SOON`,
`CHANGEME`, `PENDING OWNER FINALIZATION`) · any declared file is missing from the archive · any archive
file is undeclared · any file has an executable extension · any path is a URL or escapes the archive root
· `coverImage` is declared but absent or not an image · `recommendedPriceCents` is not a positive integer ·
the package is empty or over 500 MB · the ZIP is corrupt, truncated, or ZIP64.

Warnings (import proceeds): no cover image · no recommended price · no category · no audience.

**A failed validation writes nothing.** No product row, no R2 object, no partial state.

---

## 5. Governance — what the import will not do

The import produces a **draft and stops**. It does not:

- confirm the price — `recommendedPriceCents` populates `price_cents`, but `price_confirmed` stays `0`;
- tick the Owner terms acknowledgement;
- mark the product publicly purchasable;
- publish, or set a published date;
- bypass the publish readiness check.

A manifest asserting `status`, `priceConfirmed` or `publiclyPurchasable` is ignored. Those fields are not
part of the contract and the importer does not read them.

Every import is written to the admin audit log with the actor, import source filename, manifest contract
version, producer, SKU, product version, create-or-update mode, package size, file count, and timestamp.

---

## 6. Collisions

| Situation | Result |
|---|---|
| SKU not present | Creates a new DRAFT product. |
| SKU present, no update mode | **409.** Nothing changes. Response sets `requiresUpdateMode: true`. |
| SKU present, `?mode=update`, product is DRAFT | Updates that draft's metadata in place and replaces its attached package. |
| SKU present, product is not DRAFT | **409.** Unpublish first — an import must never overwrite a live listing. |
| Slug already held by a different product | **409.** |

---

## 7. Storage

The package ZIP is uploaded to the **private downloads bucket** and attached as the product's downloadable
file. It is only ever reachable through the Worker's token-gated `/shop/download/:token` route; the raw R2
object URL is never exposed. A declared cover image is extracted to the assets bucket and served through
`/shop/asset/:id`. Neither bucket has public access.

A re-import in update mode deletes the superseded ZIP and cover image so a customer never receives two.

---

## 8. Atomicity

There is no transaction spanning D1 and R2, so the importer sequences its writes and compensates on
failure: product row → R2 object → file row. A failure at any step unwinds the steps before it.

| Failure | Result |
|---|---|
| Validation | Nothing written. |
| R2 upload | Product row deleted. **502.** |
| D1 file-row write | R2 object deleted, product row deleted. **500.** |
| Cover image | Import succeeds; the cover is reported as still required. |

The cover image is deliberately non-fatal — it is a publishing requirement, and throwing away a good
import over an asset the Owner can upload by hand would be the wrong trade.

---

## 9. Minimal example

```json
{
  "contractVersion": 1,
  "sku": "SFL-EXAMPLE-001",
  "slug": "example-product",
  "title": "Example Product",
  "version": "1.0",
  "licenseType": "SINGLE_BUSINESS",
  "supportedFormats": "PDF",
  "shortDescription": "One sentence for the catalogue.",
  "problemSolved": "The operational problem this addresses.",
  "description": "Full listing copy.",
  "deliverables": ["The guide (PDF)"],
  "notIncluded": ["Software", "Professional advice of any kind"],
  "faqs": [{ "q": "Is this software?", "a": "No — it is a document package." }],
  "responsibleUseText": "Templates and guidance only. Not legal, financial, HR or safety advice.",
  "refundPolicySummary": "Digital product. Refunds reviewed case by case within 14 days.",
  "recommendedPriceCents": 4900,
  "coverImage": "cover.png",
  "files": [
    { "path": "01-Guide/Guide.pdf" },
    { "path": "cover.png" }
  ]
}
```

A working full-scale manifest is produced by `python3 scripts/build_product_aiops.py` from
`product-source/SFL-AIOPS-001/product.json`.

---

## 10. Endpoints

| Method | Path | Writes | Purpose |
|---|---|---|---|
| POST | `/shop/admin/import/validate` | none | Validate and return a preview. |
| POST | `/shop/admin/import/commit` | D1 + R2 | Re-validate, then import. |
| POST | `/shop/admin/import/commit?mode=update` | D1 + R2 | As above, permitting an existing DRAFT to be overwritten. |

Both sit behind the Cloudflare Access gate like every other `/shop/admin/*` route. `/commit` never trusts
`/validate`: it re-runs the identical validation on the bytes it is given, so a preview cannot be used to
smuggle a different package past the gate.
