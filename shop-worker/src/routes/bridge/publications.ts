// POST /shop/bridge/publications — House of Assets direct publication.
//
// WHAT THIS ROUTE IS
// The Admin importer produces a DRAFT and stops, because the Owner has not
// yet looked at the price or accepted the terms. This route exists for the
// case where they already have: House of Assets carries the Owner's
// publication decision with the package, and that decision — decision,
// authority, terms acknowledgement, price approval, and the timestamps of
// both — is what authorizes going straight to PUBLISHED. If any part of that
// evidence is missing or is anything other than the exact expected value,
// nothing is written and the publication is refused.
//
// WHAT IT IS NOT
// It is not an Admin route and grants no Admin capability. It does not touch
// Stripe. It publishes exactly the one product in the payload and never walks
// the catalogue. The candidate/review path is a different route with a
// different meaning, and this one does not change it.
//
// WHAT THE CUSTOMER GETS
// A House of Assets publication package is a *publishing* bundle: it carries
// the channel builds and internal production material next to the buyer's
// file. Exactly one entry — delivery/customer-download.zip — is the product.
// This route extracts that single entry and stores only it. The outer package
// is never attached to a product, never stored in the downloads bucket, and
// never reachable by a customer.
//
// ATOMICITY
// D1 and R2 have no shared transaction, so every write registers a
// compensating action first and any failure unwinds them in reverse. A
// refused publication leaves no product row, no R2 object and no image.

import type { Env, HoaPublicationRow, ProductRow } from "../../types";
import {
  deleteHoaPublication,
  deleteProduct,
  getHoaPublicationByFingerprint,
  getLatestHoaPublicationForSource,
  getProductById,
  getProductBySku,
  getProductBySlug,
  insertHoaPublication,
  insertProduct,
  insertProductFile,
  insertProductImage,
  listProductFiles,
  listProductImages,
  updateProduct,
} from "../../lib/db";
import { logAdminAction } from "../../lib/audit";
import { assetUrl } from "../../lib/assets";
import { checkBridgeToken } from "../../lib/bridge-auth";
import { newId, sha256Hex, sha256HexBytes } from "../../lib/ids";
import { formatUsdFromCents } from "../../lib/money";
import { checkPublishReadiness, coverImageOf, validateDownloadFile } from "../../lib/validate";
import { MAX_PACKAGE_BYTES } from "../../lib/product-manifest";
import { ZipArchive, ZipError } from "../../lib/zip";
import {
  CUSTOMER_DOWNLOAD_PATH,
  fingerprintInput,
  isNeverDeliverable,
  validateHoaPublication,
} from "../../lib/hoa-publication";
import { genericError, jsonResponse, safeServerError } from "../../lib/http";

/** Whoever holds the bridge token is acting for the Owner; audit says so. */
const BRIDGE_ACTOR = "house-of-assets@bridge";

function refuse(status: number, errors: string[]): Response {
  return jsonResponse({ ok: false, published: false, errors }, status);
}

export async function handleHoaPublication(request: Request, env: Env): Promise<Response> {
  const auth = checkBridgeToken(request, env);
  if (auth === "NOT_CONFIGURED") {
    // Deliberately distinct from 401 and deliberately vague in the body: the
    // caller learns the bridge is unavailable, not why.
    console.error("[shop-bridge] HOA_PUBLICATION_BRIDGE_TOKEN is not configured — refusing every bridge request.");
    return genericError(503, "The publication bridge is not available.");
  }
  if (auth !== "OK") {
    return genericError(401, "Bridge authentication required.");
  }

  const undo: (() => Promise<void>)[] = [];
  const rollback = async () => {
    for (const step of undo.reverse()) {
      try {
        await step();
      } catch (err) {
        console.error("[shop-bridge] rollback step failed:", err);
      }
    }
  };

  try {
    // --- 1. read the delivery ---------------------------------------------
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return refuse(400, [
        'Expected a multipart/form-data delivery with a "manifest" JSON field and a "package" file.',
      ]);
    }

    const rawManifest = form.get("manifest");
    const manifestText =
      typeof rawManifest === "string"
        ? rawManifest
        : rawManifest instanceof File
          ? await rawManifest.text()
          : null;
    if (manifestText === null) {
      return refuse(400, ['A "manifest" field carrying the hoa.shop-publication/1.0 payload is required.']);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(manifestText);
    } catch {
      return refuse(400, ["The manifest field is not valid JSON."]);
    }

    const packageFile = form.get("package");
    if (!(packageFile instanceof File)) {
      return refuse(400, ['A "package" file containing the publication package is required.']);
    }
    if (packageFile.size <= 0 || packageFile.size > MAX_PACKAGE_BYTES) {
      return refuse(422, [`The publication package must be between 1 byte and ${MAX_PACKAGE_BYTES / 1_048_576} MB.`]);
    }

    // --- 2. the contract ---------------------------------------------------
    const validation = validateHoaPublication(payload);
    if (!validation.ok || !validation.publication) {
      return refuse(422, validation.errors);
    }
    const pub = validation.publication;

    // --- 3. integrity: the manifest must describe the bytes we received ----
    const packageBytes = await packageFile.arrayBuffer();
    const actualPackageDigest = await sha256HexBytes(packageBytes);
    if (actualPackageDigest !== pub.packageSha256) {
      return refuse(422, [
        "package.sha256 does not match the delivered package bytes. The delivery was refused without being opened.",
      ]);
    }
    if (pub.packageByteSize !== null && pub.packageByteSize !== packageBytes.byteLength) {
      return refuse(422, ["package.byte_size does not match the delivered package."]);
    }

    let archive: ZipArchive;
    try {
      archive = ZipArchive.open(packageBytes);
    } catch (err) {
      const message = err instanceof ZipError ? err.message : "The publication package could not be read as a ZIP archive.";
      return refuse(422, [message]);
    }

    // --- 4. the one file a customer may receive ---------------------------
    // Resolved from the constant, not from the manifest and not by scanning
    // the archive for something that looks right.
    const deliveryEntry = archive.find(CUSTOMER_DOWNLOAD_PATH);
    if (!deliveryEntry || deliveryEntry.isDirectory) {
      return refuse(422, [
        `The publication package contains no "${CUSTOMER_DOWNLOAD_PATH}". ` +
        `That entry is the only thing this Shop will sell.`,
      ]);
    }
    if (deliveryEntry.name !== CUSTOMER_DOWNLOAD_PATH || isNeverDeliverable(deliveryEntry.name)) {
      return refuse(422, ["The resolved customer download is not the permitted delivery entry."]);
    }

    let deliveryBytes: Uint8Array;
    try {
      deliveryBytes = await archive.read(deliveryEntry);
    } catch (err) {
      const message = err instanceof ZipError ? err.message : "The customer download could not be extracted.";
      return refuse(422, [message]);
    }

    const deliveryDigest = await sha256HexBytes(deliveryBytes);
    if (deliveryDigest !== pub.customerDownload.sha256) {
      return refuse(422, ["package.customer_download.sha256 does not match the extracted customer download."]);
    }
    if (pub.customerDownload.byteSize !== null && pub.customerDownload.byteSize !== deliveryBytes.byteLength) {
      return refuse(422, ["package.customer_download.byte_size does not match the extracted customer download."]);
    }

    const deliveryFilename = `${pub.sku}-v${pub.version}.zip`;
    const deliveryCheck = validateDownloadFile(deliveryFilename, "application/zip", deliveryBytes.byteLength);
    if (!deliveryCheck.ok) {
      return refuse(422, [deliveryCheck.error ?? "The customer download is not an acceptable deliverable."]);
    }

    // --- 5. the cover ------------------------------------------------------
    const coverEntry = archive.find(pub.coverImage.path);
    if (!coverEntry || coverEntry.isDirectory) {
      return refuse(422, [`The publication package contains no cover image at "${pub.coverImage.path}".`]);
    }
    let coverBytes: Uint8Array;
    try {
      coverBytes = await archive.read(coverEntry);
    } catch (err) {
      const message = err instanceof ZipError ? err.message : "The cover image could not be extracted.";
      return refuse(422, [message]);
    }
    if ((await sha256HexBytes(coverBytes)) !== pub.coverImage.sha256) {
      return refuse(422, ["package.cover_image.sha256 does not match the extracted cover image."]);
    }

    // --- 6. idempotency ----------------------------------------------------
    const fingerprint = await sha256Hex(fingerprintInput(pub));
    const already = await getHoaPublicationByFingerprint(env.SHOP_DB, fingerprint);
    if (already) {
      // Byte-identical replay of a publication already accepted. Return the
      // receipt that was issued the first time rather than a recomputed one,
      // and write nothing.
      return jsonResponse(
        { ok: true, published: true, duplicate: true, receipt: JSON.parse(already.receipt_json) },
        200,
      );
    }

    // --- 7. which Shop product this is ------------------------------------
    const priorForSource = await getLatestHoaPublicationForSource(env.SHOP_DB, pub.commercialProductId);
    let existing: ProductRow | null = priorForSource
      ? await getProductById(env.SHOP_DB, priorForSource.product_id)
      : null;

    const skuOwner = await getProductBySku(env.SHOP_DB, pub.sku);
    if (skuOwner && (!existing || skuOwner.id !== existing.id)) {
      // A product with this SKU exists but did not come from this House of
      // Assets commercial product. Overwriting it would let the bridge
      // silently take over a listing the Owner built by hand.
      return refuse(409, [
        `SKU ${pub.sku} already belongs to a Shop product that was not published from ` +
        `commercial product ${pub.commercialProductId}.`,
      ]);
    }
    if (!existing && skuOwner) existing = skuOwner;

    const slugOwner = await getProductBySlug(env.SHOP_DB, pub.slug);
    if (slugOwner && (!existing || slugOwner.id !== existing.id)) {
      return refuse(409, [`The slug "${pub.slug}" is already used by another Shop product.`]);
    }

    const now = new Date().toISOString();

    // Everything the publication authorizes, including the three flags the
    // importer is not allowed to set. They are set here — and only here —
    // because the payload carried the Owner's explicit decision for each one.
    const metadata = {
      sku: pub.sku,
      slug: pub.slug,
      title: pub.title,
      short_description: pub.shortDescription,
      problem_solved: pub.problemSolved,
      description: pub.description,
      category: pub.category,
      audience: pub.audience,
      edition: pub.edition,
      version: pub.version,
      price_cents: pub.priceCents,
      price_confirmed: 1 as const,        // authorization.price_approved
      currency: pub.currency.toLowerCase(),
      license_type: pub.licenseType,
      publicly_purchasable: 1 as const,   // authorization.decision
      supported_formats: pub.supportedFormats,
      deliverables_json: JSON.stringify(pub.deliverables),
      not_included_json: JSON.stringify(pub.notIncluded),
      faqs_json: JSON.stringify(pub.faqs),
      responsible_use_text: pub.responsibleUseText,
      refund_eligible: (pub.refundEligible ? 1 : 0) as 0 | 1,
      refund_policy_summary: pub.refundPolicySummary,
      terms_acknowledged: 1 as const,     // authorization.terms_acknowledged
      updated_at: now,
    };

    // --- 8. product row ----------------------------------------------------
    // Written as a DRAFT first. Nothing goes live until the same readiness
    // gate the Admin publish button uses has passed on the finished row.
    let productId: string;
    if (existing) {
      productId = existing.id;
      await updateProduct(env.SHOP_DB, productId, { ...metadata, status: "DRAFT" });
    } else {
      productId = newId();
      await insertProduct(env.SHOP_DB, {
        ...metadata,
        id: productId,
        status: "DRAFT",
        stripe_product_id: null,
        stripe_price_id: null,
        download_link_expiry_hours: 72,
        max_downloads: 5,
        created_at: now,
        published_at: null,
      } as ProductRow);
      undo.push(async () => deleteProduct(env.SHOP_DB, productId));
    }

    // --- 9. the customer download, and only it -----------------------------
    const deliveryKey = `products/${productId}/files/${newId()}-${deliveryFilename}`;
    try {
      await env.SHOP_DOWNLOADS_BUCKET.put(deliveryKey, deliveryBytes.slice().buffer as ArrayBuffer, {
        httpMetadata: { contentType: "application/zip" },
        customMetadata: {
          sku: pub.sku,
          productVersion: pub.version,
          sourcePackageId: pub.packageId,
          publishedAt: now,
        },
      });
    } catch (err) {
      await rollback();
      console.error("[shop-bridge] customer download upload failed:", err);
      return refuse(502, ["The customer download could not be stored. Nothing was published."]);
    }
    undo.push(async () => env.SHOP_DOWNLOADS_BUCKET.delete(deliveryKey));

    const fileId = newId();
    try {
      // A new version replaces the old ZIP rather than stacking beside it, so
      // a buyer never receives two conflicting downloads.
      for (const old of await listProductFiles(env.SHOP_DB, productId)) {
        await env.SHOP_DOWNLOADS_BUCKET.delete(old.r2_key);
        await env.SHOP_DB.prepare(`DELETE FROM product_files WHERE id = ?`).bind(old.id).run();
      }
      await insertProductFile(env.SHOP_DB, {
        id: fileId,
        product_id: productId,
        r2_key: deliveryKey,
        original_filename: CUSTOMER_DOWNLOAD_PATH,
        sanitized_filename: deliveryFilename,
        content_type: "application/zip",
        size_bytes: deliveryBytes.byteLength,
        position: 0,
        created_at: now,
      });
    } catch (err) {
      await rollback();
      console.error("[shop-bridge] attaching the customer download failed:", err);
      return refuse(500, ["The customer download could not be attached. Nothing was published."]);
    }
    undo.push(async () => {
      await env.SHOP_DB.prepare(`DELETE FROM product_files WHERE id = ?`).bind(fileId).run();
    });

    // --- 10. cover image ---------------------------------------------------
    const coverExt = pub.coverImage.path.toLowerCase().split(".").pop() ?? "png";
    const coverKey = `products/${productId}/images/cover-${newId()}.${coverExt}`;
    const imageId = newId();
    try {
      for (const old of await listProductImages(env.SHOP_DB, productId)) {
        if (old.kind === "COVER") {
          await env.SHOP_ASSETS_BUCKET.delete(old.r2_key);
          await env.SHOP_DB.prepare(`DELETE FROM product_images WHERE id = ?`).bind(old.id).run();
        }
      }
      await env.SHOP_ASSETS_BUCKET.put(coverKey, coverBytes.slice().buffer as ArrayBuffer, {
        httpMetadata: { contentType: pub.coverImage.contentType },
      });
      undo.push(async () => env.SHOP_ASSETS_BUCKET.delete(coverKey));
      await insertProductImage(env.SHOP_DB, {
        id: imageId,
        product_id: productId,
        kind: "COVER",
        r2_key: coverKey,
        position: 0,
        alt_text: pub.title,
        created_at: now,
      });
      undo.push(async () => {
        await env.SHOP_DB.prepare(`DELETE FROM product_images WHERE id = ?`).bind(imageId).run();
      });
    } catch (err) {
      await rollback();
      console.error("[shop-bridge] cover image storage failed:", err);
      // Unlike the Admin import, a missing cover is fatal here: this route
      // publishes, and a published listing must have a cover.
      return refuse(502, ["The cover image could not be stored. Nothing was published."]);
    }

    // --- 11. the same readiness gate the Admin publish button uses ---------
    const images = await listProductImages(env.SHOP_DB, productId);
    const files = await listProductFiles(env.SHOP_DB, productId);
    const candidate = { ...metadata, id: productId } as unknown as ProductRow;
    const readiness = checkPublishReadiness(candidate, coverImageOf(images), files.length);
    if (!readiness.ready) {
      await rollback();
      return refuse(422, [
        "The publication does not satisfy the Shop's publish requirements.",
        ...readiness.errors,
      ]);
    }

    // --- 12. publish -------------------------------------------------------
    await updateProduct(env.SHOP_DB, productId, { status: "PUBLISHED", published_at: now, updated_at: now });
    const previousStatus = existing?.status ?? null;
    const previousPublishedAt = existing?.published_at ?? null;
    undo.push(async () => {
      await updateProduct(env.SHOP_DB, productId, {
        status: previousStatus ?? "DRAFT",
        published_at: previousPublishedAt,
      });
    });

    // --- 13. the receipt ---------------------------------------------------
    const cover = images.find((img) => img.kind === "COVER") ?? null;
    const receipt = {
      publicationId: newId(),
      fingerprint,
      productId,
      sku: pub.sku,
      slug: pub.slug,
      title: pub.title,
      version: pub.version,
      status: "PUBLISHED" as const,
      publicProductUrl: `${env.SHOP_PUBLIC_BASE_URL.replace(/\/$/, "")}/product.html?slug=${encodeURIComponent(pub.slug)}`,
      coverImageUrl: cover ? assetUrl(env, cover) : null,
      priceCents: pub.priceCents,
      priceDisplay: formatUsdFromCents(pub.priceCents),
      currency: pub.currency,
      licenseType: pub.licenseType,
      // The fingerprint of where this listing came from. Enough to trace a
      // live product back to one House of Assets package; not enough to
      // locate anything in storage.
      source: {
        system: "HOUSE_OF_ASSETS",
        commercialProductId: pub.commercialProductId,
        commercialProductVersion: pub.commercialProductVersion,
        packageId: pub.packageId,
        packageSha256: pub.packageSha256,
        customerDownloadSha256: pub.customerDownload.sha256,
      },
      authorizedBy: pub.approvedBy ?? pub.authority,
      publishedAt: now,
      receivedAt: now,
    };

    const row: HoaPublicationRow = {
      id: receipt.publicationId,
      fingerprint,
      product_id: productId,
      commercial_product_id: pub.commercialProductId,
      commercial_product_version: pub.commercialProductVersion,
      package_id: pub.packageId,
      package_sha256: pub.packageSha256,
      package_byte_size: packageBytes.byteLength,
      customer_download_sha256: pub.customerDownload.sha256,
      customer_download_path: CUSTOMER_DOWNLOAD_PATH,
      schema_id: pub.schema,
      destination: pub.destination,
      intent: pub.intent,
      decision: pub.decision,
      authority: pub.authority,
      terms_acknowledged_at: pub.termsAcknowledgedAt,
      price_approved_at: pub.priceApprovedAt,
      price_cents: pub.priceCents,
      currency: pub.currency,
      license_type: pub.licenseType,
      source_license_type: pub.sourceLicenseType,
      receipt_json: JSON.stringify(receipt),
      received_at: now,
      published_at: now,
    };

    try {
      await insertHoaPublication(env.SHOP_DB, row);
    } catch (err) {
      // The UNIQUE index on fingerprint is the real idempotency guard: a
      // concurrent identical delivery can lose this race even though the
      // lookup in step 6 found nothing. The loser unwinds and returns the
      // winner's receipt, so both callers see one publication.
      const winner = await getHoaPublicationByFingerprint(env.SHOP_DB, fingerprint);
      await rollback();
      if (winner) {
        return jsonResponse(
          { ok: true, published: true, duplicate: true, receipt: JSON.parse(winner.receipt_json) },
          200,
        );
      }
      console.error("[shop-bridge] recording the publication failed:", err);
      return refuse(500, ["The publication could not be recorded. Nothing was published."]);
    }
    undo.push(async () => deleteHoaPublication(env.SHOP_DB, row.id));

    await logAdminAction(env.SHOP_DB, BRIDGE_ACTOR, "product.publish.hoa-bridge", "product", productId, {
      fingerprint,
      commercialProductId: pub.commercialProductId,
      commercialProductVersion: pub.commercialProductVersion,
      packageId: pub.packageId,
      packageSha256: pub.packageSha256,
      customerDownloadSha256: pub.customerDownload.sha256,
      decision: pub.decision,
      authority: pub.authority,
      termsAcknowledgedAt: pub.termsAcknowledgedAt,
      priceApprovedAt: pub.priceApprovedAt,
      priceCents: pub.priceCents,
      currency: pub.currency,
      licenseType: pub.licenseType,
      sourceLicenseType: pub.sourceLicenseType,
      mode: existing ? "update" : "create",
    });

    return jsonResponse({ ok: true, published: true, duplicate: false, receipt }, 201);
  } catch (err) {
    await rollback();
    return safeServerError("handleHoaPublication", err);
  }
}
