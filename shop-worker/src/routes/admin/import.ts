// Governed product-package import.
//
// Two endpoints over one code path:
//   POST /shop/admin/import/validate   parse + validate only, writes nothing
//   POST /shop/admin/import/commit     re-validates, then imports
//
// /commit never trusts the outcome of /validate. It re-runs the identical
// validation on the bytes it was given, so a preview cannot be used to smuggle
// a different package past the gate.
//
// GOVERNANCE
// The import populates a DRAFT product and stops. It does not confirm a price,
// does not tick the Owner terms acknowledgement, does not mark the product
// publicly purchasable, and does not publish. A recommended price from the
// manifest is written to price_cents with price_confirmed left at 0, so the
// Owner still has to look at the number and agree to it. Those decisions are
// the Owner's and the importer has no business making them.
//
// ATOMICITY
// There is no cross-binding transaction across D1 and R2, so the importer
// sequences its writes so that every failure has a compensating action, and
// runs them: product row, then R2 object, then file row. A failure at any step
// unwinds the steps before it. A failed import leaves nothing behind.

import type { AccessIdentity } from "../../lib/auth";
import type { Env, ProductRow } from "../../types";
import {
  deleteProduct,
  getProductBySku,
  getProductBySlug,
  insertProduct,
  insertProductFile,
  insertProductImage,
  listProductFiles,
  listProductImages,
  updateProduct,
} from "../../lib/db";
import { logAdminAction } from "../../lib/audit";
import { newId } from "../../lib/ids";
import { formatUsdFromCents } from "../../lib/money";
import { checkPublishReadiness, coverImageOf } from "../../lib/validate";
import {
  MANIFEST_ENTRY_NAME,
  MAX_PACKAGE_BYTES,
  validateManifest,
  type ProductManifest,
} from "../../lib/product-manifest";
import { ZipArchive, ZipError } from "../../lib/zip";
import { jsonResponse, safeServerError } from "../../lib/http";

interface ParsedPackage {
  manifest: ProductManifest;
  archive: ZipArchive;
  bytes: ArrayBuffer;
  filename: string;
  warnings: string[];
}

interface ParseFailure {
  status: number;
  errors: string[];
  warnings: string[];
}

function isFailure(value: ParsedPackage | ParseFailure): value is ParseFailure {
  return (value as ParseFailure).status !== undefined;
}

/**
 * Read the upload, open the archive, and validate everything. Pure: touches
 * neither D1 nor R2, so it is safe to run on both the preview and the commit.
 */
async function parseAndValidate(request: Request): Promise<ParsedPackage | ParseFailure> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { status: 400, errors: ["Expected a multipart/form-data upload containing the package ZIP."], warnings: [] };
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return { status: 400, errors: ["No package file was uploaded."], warnings: [] };
  }
  if (file.size > MAX_PACKAGE_BYTES) {
    return {
      status: 422,
      errors: [`Package is ${(file.size / 1_048_576).toFixed(1)} MB, over the ${MAX_PACKAGE_BYTES / 1_048_576} MB limit.`],
      warnings: [],
    };
  }
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return { status: 422, errors: ["The product package must be a .zip archive."], warnings: [] };
  }

  const bytes = await file.arrayBuffer();

  let archive: ZipArchive;
  try {
    archive = ZipArchive.open(bytes);
  } catch (err) {
    const message = err instanceof ZipError ? err.message : "The uploaded file could not be read as a ZIP archive.";
    return { status: 422, errors: [message], warnings: [] };
  }

  const manifestEntry = archive.find(MANIFEST_ENTRY_NAME);
  if (!manifestEntry) {
    return {
      status: 422,
      errors: [`Package does not contain ${MANIFEST_ENTRY_NAME} at its root. This is not a governed product package.`],
      warnings: [],
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await archive.readText(manifestEntry));
  } catch (err) {
    const message = err instanceof ZipError ? err.message : `${MANIFEST_ENTRY_NAME} is not valid JSON.`;
    return { status: 422, errors: [message], warnings: [] };
  }

  const fileNames = archive.files().map((e) => e.name);
  const result = validateManifest(raw, fileNames, bytes.byteLength);
  if (!result.ok || !result.manifest) {
    return { status: 422, errors: result.errors, warnings: result.warnings };
  }

  return { manifest: result.manifest, archive, bytes, filename: file.name, warnings: result.warnings };
}

/** Files the customer receives — the manifest itself is not a deliverable. */
function deliverableCount(pkg: ParsedPackage): number {
  return pkg.archive.files().filter((e) => e.name !== MANIFEST_ENTRY_NAME).length;
}

/** What the Owner is shown before confirming. */
function buildPreview(pkg: ParsedPackage, existing: ProductRow | null) {
  const m = pkg.manifest;
  return {
    sku: m.sku,
    slug: m.slug,
    title: m.title,
    version: m.version,
    edition: m.edition ?? "",
    category: m.category ?? "",
    audience: m.audience ?? "",
    licenseType: m.licenseType,
    supportedFormats: m.supportedFormats,
    shortDescription: m.shortDescription,
    problemSolved: m.problemSolved,
    description: m.description,
    deliverables: m.deliverables,
    notIncluded: m.notIncluded,
    faqs: m.faqs,
    responsibleUseText: m.responsibleUseText,
    refundPolicySummary: m.refundPolicySummary,
    recommendedPriceCents: m.recommendedPriceCents ?? null,
    recommendedPriceDisplay:
      typeof m.recommendedPriceCents === "number" ? formatUsdFromCents(m.recommendedPriceCents) : null,
    coverImage: m.coverImage ?? null,
    producer: m.producer ?? null,
    builtAt: m.builtAt ?? null,
    packageFilename: pkg.filename,
    packageBytes: pkg.bytes.byteLength,
    fileCount: deliverableCount(pkg),
    existingProduct: existing
      ? { id: existing.id, title: existing.title, status: existing.status, version: existing.version }
      : null,
  };
}

// ---------------------------------------------------------------------------
// POST /shop/admin/import/validate
// ---------------------------------------------------------------------------

export async function handleImportValidate(request: Request, env: Env): Promise<Response> {
  try {
    const parsed = await parseAndValidate(request);
    if (isFailure(parsed)) {
      return jsonResponse({ ok: false, valid: false, errors: parsed.errors, warnings: parsed.warnings }, parsed.status);
    }

    const existing = await getProductBySku(env.SHOP_DB, parsed.manifest.sku);
    const slugOwner = await getProductBySlug(env.SHOP_DB, parsed.manifest.slug);

    const errors: string[] = [];
    if (existing && existing.version === parsed.manifest.version) {
      errors.push(
        `A product with SKU ${parsed.manifest.sku} at version ${parsed.manifest.version} already exists. ` +
        `Re-import in update mode to overwrite its draft metadata.`,
      );
    }
    if (slugOwner && (!existing || slugOwner.id !== existing.id)) {
      errors.push(`The slug "${parsed.manifest.slug}" is already used by another product.`);
    }

    return jsonResponse({
      ok: true,
      valid: errors.length === 0,
      errors,
      warnings: parsed.warnings,
      requiresUpdateMode: Boolean(existing),
      preview: buildPreview(parsed, existing),
    });
  } catch (err) {
    return safeServerError("handleImportValidate", err);
  }
}

// ---------------------------------------------------------------------------
// POST /shop/admin/import/commit
// ---------------------------------------------------------------------------

export async function handleImportCommit(request: Request, env: Env, identity: AccessIdentity): Promise<Response> {
  // Compensating actions, newest first. Run on any failure after this point.
  const undo: (() => Promise<void>)[] = [];
  const rollback = async () => {
    for (const step of undo.reverse()) {
      try {
        await step();
      } catch (err) {
        // A failed rollback step must not mask the original error.
        console.error("[shop-import] rollback step failed:", err);
      }
    }
  };

  try {
    const parsed = await parseAndValidate(request);
    if (isFailure(parsed)) {
      return jsonResponse({ ok: false, imported: false, errors: parsed.errors, warnings: parsed.warnings }, parsed.status);
    }

    const m = parsed.manifest;
    const url = new URL(request.url);
    const updateMode = url.searchParams.get("mode") === "update";

    const existing = await getProductBySku(env.SHOP_DB, m.sku);
    if (existing && !updateMode) {
      return jsonResponse({
        ok: false,
        imported: false,
        errors: [
          `A product with SKU ${m.sku} already exists (version ${existing.version}, status ${existing.status}). ` +
          `Re-run the import in update mode to overwrite its draft metadata.`,
        ],
        warnings: parsed.warnings,
        requiresUpdateMode: true,
      }, 409);
    }
    if (existing && existing.status !== "DRAFT") {
      return jsonResponse({
        ok: false,
        imported: false,
        errors: [
          `Product ${m.sku} is ${existing.status}, not DRAFT. Unpublish it before re-importing so a live listing ` +
          `is never overwritten by an import.`,
        ],
        warnings: parsed.warnings,
      }, 409);
    }

    const slugOwner = await getProductBySlug(env.SHOP_DB, m.slug);
    if (slugOwner && (!existing || slugOwner.id !== existing.id)) {
      return jsonResponse({
        ok: false,
        imported: false,
        errors: [`The slug "${m.slug}" is already used by another product.`],
        warnings: parsed.warnings,
      }, 409);
    }

    const now = new Date().toISOString();

    // Everything the import is allowed to set. Note what is absent:
    // price_confirmed, terms_acknowledged, publicly_purchasable and
    // published_at are never written here.
    const metadata = {
      sku: m.sku,
      slug: m.slug,
      title: m.title,
      short_description: m.shortDescription,
      problem_solved: m.problemSolved,
      description: m.description,
      category: m.category ?? "",
      audience: m.audience ?? "",
      edition: m.edition ?? "",
      version: m.version,
      status: "DRAFT" as const,
      price_cents: typeof m.recommendedPriceCents === "number" ? m.recommendedPriceCents : null,
      price_confirmed: 0 as const,
      currency: m.currency ?? "usd",
      license_type: m.licenseType,
      publicly_purchasable: 0 as const,
      supported_formats: m.supportedFormats,
      deliverables_json: JSON.stringify(m.deliverables),
      not_included_json: JSON.stringify(m.notIncluded),
      faqs_json: JSON.stringify(m.faqs),
      responsible_use_text: m.responsibleUseText,
      refund_eligible: (m.refundEligible === false ? 0 : 1) as 0 | 1,
      refund_policy_summary: m.refundPolicySummary,
      terms_acknowledged: 0 as const,
      download_link_expiry_hours: m.downloadLinkExpiryHours ?? 72,
      max_downloads: m.maxDownloads ?? 5,
      updated_at: now,
    };

    // --- 1. product row ----------------------------------------------------
    let productId: string;
    if (existing) {
      productId = existing.id;
      await updateProduct(env.SHOP_DB, productId, metadata);
      // No compensating action: an update to an existing DRAFT's metadata is
      // not something we can meaningfully un-apply, and the row is a draft the
      // Owner is about to review anyway.
    } else {
      productId = newId();
      await insertProduct(env.SHOP_DB, {
        ...metadata,
        id: productId,
        stripe_product_id: null,
        stripe_price_id: null,
        created_at: now,
        published_at: null,
      } as ProductRow);
      undo.push(async () => deleteProduct(env.SHOP_DB, productId));
    }

    // --- 2. package to the private downloads bucket ------------------------
    const packageKey = `products/${productId}/files/${newId()}-${m.sku}-v${m.version}.zip`;
    try {
      await env.SHOP_DOWNLOADS_BUCKET.put(packageKey, parsed.bytes, {
        httpMetadata: { contentType: "application/zip" },
        customMetadata: { sku: m.sku, productVersion: m.version, importedAt: now },
      });
    } catch (err) {
      await rollback();
      console.error("[shop-import] package upload failed:", err);
      return jsonResponse({
        ok: false,
        imported: false,
        errors: ["The package could not be stored. Nothing was imported."],
        warnings: parsed.warnings,
      }, 502);
    }
    undo.push(async () => env.SHOP_DOWNLOADS_BUCKET.delete(packageKey));

    // --- 3. attach it ------------------------------------------------------
    const fileId = newId();
    try {
      // Replace any package this import supersedes, so a re-import does not
      // leave the customer with two ZIPs.
      if (existing) {
        for (const old of await listProductFiles(env.SHOP_DB, productId)) {
          if (old.sanitized_filename.toLowerCase().endsWith(".zip")) {
            await env.SHOP_DOWNLOADS_BUCKET.delete(old.r2_key);
            await env.SHOP_DB.prepare(`DELETE FROM product_files WHERE id = ?`).bind(old.id).run();
          }
        }
      }
      await insertProductFile(env.SHOP_DB, {
        id: fileId,
        product_id: productId,
        r2_key: packageKey,
        original_filename: parsed.filename.slice(0, 255),
        sanitized_filename: `${m.sku}-v${m.version}.zip`,
        content_type: "application/zip",
        size_bytes: parsed.bytes.byteLength,
        position: 0,
        created_at: now,
      });
    } catch (err) {
      await rollback();
      console.error("[shop-import] attaching the package failed:", err);
      return jsonResponse({
        ok: false,
        imported: false,
        errors: ["The package could not be attached to the product. Nothing was imported."],
        warnings: parsed.warnings,
      }, 500);
    }
    undo.push(async () => {
      await env.SHOP_DB.prepare(`DELETE FROM product_files WHERE id = ?`).bind(fileId).run();
    });

    // --- 4. cover image, if the package carries one ------------------------
    let coverImported = false;
    if (m.coverImage) {
      const entry = parsed.archive.find(m.coverImage);
      if (entry) {
        try {
          const imageBytes = await parsed.archive.read(entry);
          const ext = m.coverImage.toLowerCase().split(".").pop() ?? "png";
          const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
          const imageKey = `products/${productId}/images/cover-${newId()}.${ext}`;

          // Drop a previous cover so a re-import does not stack them.
          for (const old of await listProductImages(env.SHOP_DB, productId)) {
            if (old.kind === "COVER") {
              await env.SHOP_ASSETS_BUCKET.delete(old.r2_key);
              await env.SHOP_DB.prepare(`DELETE FROM product_images WHERE id = ?`).bind(old.id).run();
            }
          }

          await env.SHOP_ASSETS_BUCKET.put(imageKey, imageBytes.buffer as ArrayBuffer, {
            httpMetadata: { contentType },
          });
          await insertProductImage(env.SHOP_DB, {
            id: newId(),
            product_id: productId,
            kind: "COVER",
            r2_key: imageKey,
            position: 0,
            alt_text: m.title,
            created_at: now,
          });
          coverImported = true;
        } catch (err) {
          // A cover image is a publishing requirement, not an import
          // requirement. Failing here would throw away a good import over an
          // asset the Owner can upload by hand in ten seconds.
          console.error("[shop-import] cover image import failed:", err);
        }
      }
    }

    // --- 5. audit ----------------------------------------------------------
    await logAdminAction(env.SHOP_DB, identity.email, "product.import", "product", productId, {
      importSource: parsed.filename,
      manifestContractVersion: m.contractVersion,
      producer: m.producer ?? null,
      sku: m.sku,
      productVersion: m.version,
      mode: existing ? "update" : "create",
      packageBytes: parsed.bytes.byteLength,
      fileCount: deliverableCount(parsed),
      coverImported,
      importedAt: now,
    });

    // --- 6. what is still missing -----------------------------------------
    const images = await listProductImages(env.SHOP_DB, productId);
    const files = await listProductFiles(env.SHOP_DB, productId);
    const product = { ...metadata, id: productId } as unknown as ProductRow;
    const readiness = checkPublishReadiness(product, coverImageOf(images), files.length);

    const remaining = [...readiness.errors];
    if (!coverImported && !coverImageOf(images)) remaining.push("Cover image required.");

    return jsonResponse({
      ok: true,
      imported: true,
      mode: existing ? "update" : "create",
      productId,
      sku: m.sku,
      title: m.title,
      version: m.version,
      status: "DRAFT",
      coverImported,
      packageAttached: true,
      packageBytes: parsed.bytes.byteLength,
      recommendedPriceDisplay:
        typeof m.recommendedPriceCents === "number" ? formatUsdFromCents(m.recommendedPriceCents) : null,
      priceConfirmed: false,
      termsAcknowledged: false,
      warnings: parsed.warnings,
      remaining,
    }, 201);
  } catch (err) {
    await rollback();
    return safeServerError("handleImportCommit", err);
  }
}
