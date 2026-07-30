import type { AccessIdentity } from "../../lib/auth";
import type { Env, ProductImageRow, ProductRow } from "../../types";
import {
  getProductById,
  insertProduct,
  listAllProducts,
  listProductFiles,
  listProductImages,
  updateProduct,
} from "../../lib/db";
import { logAdminAction } from "../../lib/audit";
import { newId } from "../../lib/ids";
import { isValidPriceCents, parsePriceInputToCents, formatUsdFromCents } from "../../lib/money";
import {
  checkPublishReadiness,
  coverImageOf,
  isNonEmptyString,
  isValidDownloadExpiryHours,
  isValidFaqArray,
  isValidLicenseType,
  isValidMaxDownloads,
  isValidSku,
  isValidSlug,
  isValidStringArray,
  PUBLICLY_PURCHASABLE_LICENSE_TYPES,
} from "../../lib/validate";
import { genericError, jsonResponse, safeServerError } from "../../lib/http";

function assetUrl(env: Env, r2Key: string): string {
  return `${env.SHOP_ASSETS_PUBLIC_BASE_URL.replace(/\/$/, "")}/${r2Key}`;
}

async function serializeProductAdmin(env: Env, product: ProductRow) {
  const images = await listProductImages(env.SHOP_DB, product.id);
  const files = await listProductFiles(env.SHOP_DB, product.id);
  const readiness = checkPublishReadiness(product, coverImageOf(images), files.length);

  return {
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    title: product.title,
    shortDescription: product.short_description,
    problemSolved: product.problem_solved,
    description: product.description,
    category: product.category,
    audience: product.audience,
    edition: product.edition,
    version: product.version,
    status: product.status,
    priceCents: product.price_cents,
    priceConfirmed: product.price_confirmed === 1,
    priceDisplay: product.price_cents !== null ? formatUsdFromCents(product.price_cents) : null,
    currency: product.currency,
    licenseType: product.license_type,
    publiclyPurchasable: product.publicly_purchasable === 1,
    supportedFormats: product.supported_formats,
    deliverables: safeParseArray(product.deliverables_json),
    notIncluded: safeParseArray(product.not_included_json),
    faqs: safeParseArray(product.faqs_json),
    responsibleUseText: product.responsible_use_text,
    refundEligible: product.refund_eligible === 1,
    refundPolicySummary: product.refund_policy_summary,
    termsAcknowledged: product.terms_acknowledged === 1,
    downloadLinkExpiryHours: product.download_link_expiry_hours,
    maxDownloads: product.max_downloads,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    publishedAt: product.published_at,
    images: images.map((img) => ({ id: img.id, kind: img.kind, url: assetUrl(env, img.r2_key), position: img.position, altText: img.alt_text })),
    files: files.map((f) => ({ id: f.id, filename: f.sanitized_filename, contentType: f.content_type, sizeBytes: f.size_bytes, position: f.position })),
    readiness,
  };
}

function safeParseArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function handleAdminListProducts(_request: Request, env: Env): Promise<Response> {
  try {
    const products = await listAllProducts(env.SHOP_DB);
    const serialized = await Promise.all(products.map((p) => serializeProductAdmin(env, p)));
    return jsonResponse({ ok: true, products: serialized });
  } catch (err) {
    return safeServerError("handleAdminListProducts", err);
  }
}

export async function handleAdminGetProduct(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  try {
    const product = await getProductById(env.SHOP_DB, params.id);
    if (!product) return genericError(404, "Product not found.");
    return jsonResponse({ ok: true, product: await serializeProductAdmin(env, product) });
  } catch (err) {
    return safeServerError("handleAdminGetProduct", err);
  }
}

/** Public-shape preview, but bypasses the PUBLISHED-only restriction — for the Owner's "Preview" button. */
export async function handleAdminPreviewProduct(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  try {
    const product = await getProductById(env.SHOP_DB, params.id);
    if (!product) return genericError(404, "Product not found.");
    const images = await listProductImages(env.SHOP_DB, product.id);
    const cover = images.find((i) => i.kind === "COVER") ?? null;
    const previews = images.filter((i) => i.kind === "PREVIEW");
    return jsonResponse({
      ok: true,
      product: {
        slug: product.slug,
        title: product.title,
        shortDescription: product.short_description,
        problemSolved: product.problem_solved,
        description: product.description,
        category: product.category,
        audience: product.audience,
        edition: product.edition,
        version: product.version,
        licenseType: product.license_type,
        priceDisplay: product.price_cents !== null ? formatUsdFromCents(product.price_cents) : "Price not yet confirmed",
        supportedFormats: product.supported_formats,
        deliverables: safeParseArray(product.deliverables_json),
        notIncluded: safeParseArray(product.not_included_json),
        faqs: safeParseArray(product.faqs_json),
        responsibleUseText: product.responsible_use_text,
        refundPolicySummary: product.refund_policy_summary,
        coverImageUrl: cover ? assetUrl(env, cover.r2_key) : null,
        previewImageUrls: previews.map((p) => assetUrl(env, p.r2_key)),
        status: product.status,
        buyable: false,
      },
    });
  } catch (err) {
    return safeServerError("handleAdminPreviewProduct", err);
  }
}

interface ProductWriteBody {
  sku?: unknown;
  slug?: unknown;
  title?: unknown;
  shortDescription?: unknown;
  problemSolved?: unknown;
  description?: unknown;
  category?: unknown;
  audience?: unknown;
  edition?: unknown;
  version?: unknown;
  licenseType?: unknown;
  supportedFormats?: unknown;
  deliverables?: unknown;
  notIncluded?: unknown;
  faqs?: unknown;
  responsibleUseText?: unknown;
  refundEligible?: unknown;
  refundPolicySummary?: unknown;
  termsAcknowledged?: unknown;
  downloadLinkExpiryHours?: unknown;
  maxDownloads?: unknown;
}

function validateProductWriteBody(body: ProductWriteBody, requireIdentityFields: boolean): string[] {
  const errors: string[] = [];

  if (requireIdentityFields || body.sku !== undefined) {
    if (!isValidSku(body.sku)) errors.push("SKU must be 3-40 uppercase alphanumeric/dash characters.");
  }
  if (requireIdentityFields || body.slug !== undefined) {
    if (!isValidSlug(body.slug)) errors.push("Slug must be lowercase, URL-safe, 3-80 characters.");
  }
  if (requireIdentityFields || body.title !== undefined) {
    if (!isNonEmptyString(body.title, 200)) errors.push("Title is required (max 200 characters).");
  }
  if (body.shortDescription !== undefined && !isNonEmptyString(body.shortDescription, 400) && body.shortDescription !== "") {
    errors.push("Short description must be a string up to 400 characters.");
  }
  if (body.licenseType !== undefined && !isValidLicenseType(body.licenseType)) {
    errors.push("License type must be one of SINGLE_BUSINESS, MULTI_LOCATION, CONSULTANT, WHITE_LABEL.");
  }
  if (body.deliverables !== undefined && !isValidStringArray(body.deliverables)) {
    errors.push("Deliverables must be an array of short strings.");
  }
  if (body.notIncluded !== undefined && !isValidStringArray(body.notIncluded)) {
    errors.push("Not-included list must be an array of short strings.");
  }
  if (body.faqs !== undefined && !isValidFaqArray(body.faqs)) {
    errors.push("FAQs must be an array of { q, a } string pairs.");
  }
  if (body.downloadLinkExpiryHours !== undefined && !isValidDownloadExpiryHours(body.downloadLinkExpiryHours)) {
    errors.push("Download link expiry must be an integer number of hours between 1 and 720.");
  }
  if (body.maxDownloads !== undefined && !isValidMaxDownloads(body.maxDownloads)) {
    errors.push("Max downloads must be an integer between 1 and 100.");
  }

  return errors;
}

export async function handleAdminCreateProduct(request: Request, env: Env, identity: AccessIdentity): Promise<Response> {
  try {
    let body: ProductWriteBody;
    try {
      body = (await request.json()) as ProductWriteBody;
    } catch {
      return genericError(400, "Invalid request body.");
    }

    const errors = validateProductWriteBody(body, true);
    if (errors.length > 0) return jsonResponse({ ok: false, errors }, 422);

    const now = new Date().toISOString();
    const row: ProductRow = {
      id: newId(),
      sku: String(body.sku),
      slug: String(body.slug),
      title: String(body.title),
      short_description: typeof body.shortDescription === "string" ? body.shortDescription : "",
      problem_solved: typeof body.problemSolved === "string" ? body.problemSolved : "",
      description: typeof body.description === "string" ? body.description : "",
      category: typeof body.category === "string" ? body.category : "",
      audience: typeof body.audience === "string" ? body.audience : "",
      edition: typeof body.edition === "string" ? body.edition : "",
      version: typeof body.version === "string" && body.version ? body.version : "1.0",
      status: "DRAFT",
      price_cents: null,
      price_confirmed: 0,
      currency: "usd",
      license_type: isValidLicenseType(body.licenseType) ? body.licenseType : "SINGLE_BUSINESS",
      publicly_purchasable: 0,
      supported_formats: typeof body.supportedFormats === "string" ? body.supportedFormats : "",
      deliverables_json: JSON.stringify(isValidStringArray(body.deliverables) ? body.deliverables : []),
      not_included_json: JSON.stringify(isValidStringArray(body.notIncluded) ? body.notIncluded : []),
      faqs_json: JSON.stringify(isValidFaqArray(body.faqs) ? body.faqs : []),
      responsible_use_text: typeof body.responsibleUseText === "string" ? body.responsibleUseText : "",
      refund_eligible: body.refundEligible === false ? 0 : 1,
      refund_policy_summary: typeof body.refundPolicySummary === "string" ? body.refundPolicySummary : "",
      terms_acknowledged: 0,
      stripe_product_id: null,
      stripe_price_id: null,
      download_link_expiry_hours: isValidDownloadExpiryHours(body.downloadLinkExpiryHours) ? body.downloadLinkExpiryHours : 72,
      max_downloads: isValidMaxDownloads(body.maxDownloads) ? body.maxDownloads : 5,
      created_at: now,
      updated_at: now,
      published_at: null,
    };

    try {
      await insertProduct(env.SHOP_DB, row);
    } catch (err) {
      return genericError(409, "A product with this SKU or slug already exists.");
    }

    await logAdminAction(env.SHOP_DB, identity.email, "product.create", "product", row.id, { sku: row.sku, slug: row.slug });

    return jsonResponse({ ok: true, product: await serializeProductAdmin(env, row) }, 201);
  } catch (err) {
    return safeServerError("handleAdminCreateProduct", err);
  }
}

export async function handleAdminUpdateProduct(request: Request, env: Env, params: Record<string, string>, identity: AccessIdentity): Promise<Response> {
  try {
    const product = await getProductById(env.SHOP_DB, params.id);
    if (!product) return genericError(404, "Product not found.");

    let body: ProductWriteBody;
    try {
      body = (await request.json()) as ProductWriteBody;
    } catch {
      return genericError(400, "Invalid request body.");
    }

    const errors = validateProductWriteBody(body, false);
    if (errors.length > 0) return jsonResponse({ ok: false, errors }, 422);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.sku !== undefined) patch.sku = body.sku;
    if (body.slug !== undefined) patch.slug = body.slug;
    if (body.title !== undefined) patch.title = body.title;
    if (body.shortDescription !== undefined) patch.short_description = body.shortDescription;
    if (body.problemSolved !== undefined) patch.problem_solved = body.problemSolved;
    if (body.description !== undefined) patch.description = body.description;
    if (body.category !== undefined) patch.category = body.category;
    if (body.audience !== undefined) patch.audience = body.audience;
    if (body.edition !== undefined) patch.edition = body.edition;
    if (body.version !== undefined) patch.version = body.version;
    if (body.licenseType !== undefined) {
      patch.license_type = body.licenseType;
      patch.publicly_purchasable = PUBLICLY_PURCHASABLE_LICENSE_TYPES.includes(body.licenseType as never) && product.status === "PUBLISHED" ? 1 : 0;
    }
    if (body.supportedFormats !== undefined) patch.supported_formats = body.supportedFormats;
    if (body.deliverables !== undefined) patch.deliverables_json = JSON.stringify(body.deliverables);
    if (body.notIncluded !== undefined) patch.not_included_json = JSON.stringify(body.notIncluded);
    if (body.faqs !== undefined) patch.faqs_json = JSON.stringify(body.faqs);
    if (body.responsibleUseText !== undefined) patch.responsible_use_text = body.responsibleUseText;
    if (body.refundEligible !== undefined) patch.refund_eligible = body.refundEligible ? 1 : 0;
    if (body.refundPolicySummary !== undefined) patch.refund_policy_summary = body.refundPolicySummary;
    if (body.termsAcknowledged !== undefined) patch.terms_acknowledged = body.termsAcknowledged ? 1 : 0;
    if (body.downloadLinkExpiryHours !== undefined) patch.download_link_expiry_hours = body.downloadLinkExpiryHours;
    if (body.maxDownloads !== undefined) patch.max_downloads = body.maxDownloads;

    try {
      await updateProduct(env.SHOP_DB, product.id, patch);
    } catch {
      return genericError(409, "A product with this SKU or slug already exists.");
    }

    await logAdminAction(env.SHOP_DB, identity.email, "product.update", "product", product.id, { fields: Object.keys(patch) });

    const updated = await getProductById(env.SHOP_DB, product.id);
    return jsonResponse({ ok: true, product: await serializeProductAdmin(env, updated as ProductRow) });
  } catch (err) {
    return safeServerError("handleAdminUpdateProduct", err);
  }
}

interface SetPriceBody {
  priceInput?: unknown;
  confirm?: unknown;
}

export async function handleAdminSetPrice(request: Request, env: Env, params: Record<string, string>, identity: AccessIdentity): Promise<Response> {
  try {
    const product = await getProductById(env.SHOP_DB, params.id);
    if (!product) return genericError(404, "Product not found.");

    let body: SetPriceBody;
    try {
      body = (await request.json()) as SetPriceBody;
    } catch {
      return genericError(400, "Invalid request body.");
    }

    if (typeof body.priceInput !== "string") return genericError(422, "priceInput is required, e.g. \"29.00\".");
    const cents = parsePriceInputToCents(body.priceInput);
    if (cents === null || !isValidPriceCents(cents)) {
      return genericError(422, "Price must be a valid dollar amount between $1.00 and $500,000.00.");
    }

    const confirmed = body.confirm === true;

    await updateProduct(env.SHOP_DB, product.id, {
      price_cents: cents,
      price_confirmed: confirmed ? 1 : 0,
      updated_at: new Date().toISOString(),
    });

    await logAdminAction(env.SHOP_DB, identity.email, "product.set_price", "product", product.id, {
      priceCents: cents,
      confirmed,
    });

    const updated = await getProductById(env.SHOP_DB, product.id);
    return jsonResponse({ ok: true, product: await serializeProductAdmin(env, updated as ProductRow) });
  } catch (err) {
    return safeServerError("handleAdminSetPrice", err);
  }
}

async function transitionStatus(
  env: Env,
  identity: AccessIdentity,
  productId: string,
  action: "publish" | "unpublish" | "archive",
): Promise<Response> {
  const product = await getProductById(env.SHOP_DB, productId);
  if (!product) return genericError(404, "Product not found.");

  if (action === "publish") {
    const images = await listProductImages(env.SHOP_DB, productId);
    const files = await listProductFiles(env.SHOP_DB, productId);
    const readiness = checkPublishReadiness(product, coverImageOf(images), files.length);
    if (!readiness.ready) {
      return jsonResponse({ ok: false, errors: readiness.errors }, 422);
    }
    const nowIso = new Date().toISOString();
    await updateProduct(env.SHOP_DB, productId, {
      status: "PUBLISHED",
      published_at: nowIso,
      updated_at: nowIso,
      publicly_purchasable: PUBLICLY_PURCHASABLE_LICENSE_TYPES.includes(product.license_type) ? 1 : 0,
    });
    await logAdminAction(env.SHOP_DB, identity.email, "product.publish", "product", productId, {});
  } else if (action === "unpublish") {
    await updateProduct(env.SHOP_DB, productId, { status: "UNPUBLISHED", updated_at: new Date().toISOString() });
    await logAdminAction(env.SHOP_DB, identity.email, "product.unpublish", "product", productId, {});
  } else {
    await updateProduct(env.SHOP_DB, productId, { status: "ARCHIVED", updated_at: new Date().toISOString() });
    await logAdminAction(env.SHOP_DB, identity.email, "product.archive", "product", productId, {});
  }

  const updated = await getProductById(env.SHOP_DB, productId);
  return jsonResponse({ ok: true, product: await serializeProductAdmin(env, updated as ProductRow) });
}

export async function handleAdminPublishProduct(_request: Request, env: Env, params: Record<string, string>, identity: AccessIdentity): Promise<Response> {
  try {
    return await transitionStatus(env, identity, params.id, "publish");
  } catch (err) {
    return safeServerError("handleAdminPublishProduct", err);
  }
}

export async function handleAdminUnpublishProduct(_request: Request, env: Env, params: Record<string, string>, identity: AccessIdentity): Promise<Response> {
  try {
    return await transitionStatus(env, identity, params.id, "unpublish");
  } catch (err) {
    return safeServerError("handleAdminUnpublishProduct", err);
  }
}

export async function handleAdminArchiveProduct(_request: Request, env: Env, params: Record<string, string>, identity: AccessIdentity): Promise<Response> {
  try {
    return await transitionStatus(env, identity, params.id, "archive");
  } catch (err) {
    return safeServerError("handleAdminArchiveProduct", err);
  }
}

/**
 * Duplicates product metadata only (title, description, pricing structure,
 * license terms, etc.) as a new DRAFT with price_confirmed reset to 0.
 * Cover/preview images and downloadable files are NOT copied — R2 objects
 * are not duplicated in the MVP; the Owner re-uploads assets for the copy.
 * See SHOP_KNOWN_LIMITATIONS.md.
 */
export async function handleAdminDuplicateProduct(_request: Request, env: Env, params: Record<string, string>, identity: AccessIdentity): Promise<Response> {
  try {
    const original = await getProductById(env.SHOP_DB, params.id);
    if (!original) return genericError(404, "Product not found.");

    const now = new Date().toISOString();
    const suffix = newId().slice(0, 6);
    const copy: ProductRow = {
      ...original,
      id: newId(),
      sku: `${original.sku}-COPY-${suffix.toUpperCase()}`,
      slug: `${original.slug}-copy-${suffix}`,
      status: "DRAFT",
      price_confirmed: 0,
      publicly_purchasable: 0,
      terms_acknowledged: 0,
      stripe_product_id: null,
      stripe_price_id: null,
      created_at: now,
      updated_at: now,
      published_at: null,
    };

    await insertProduct(env.SHOP_DB, copy);
    await logAdminAction(env.SHOP_DB, identity.email, "product.duplicate", "product", copy.id, { fromProductId: original.id });

    return jsonResponse({ ok: true, product: await serializeProductAdmin(env, copy) }, 201);
  } catch (err) {
    return safeServerError("handleAdminDuplicateProduct", err);
  }
}

export type { ProductImageRow };
