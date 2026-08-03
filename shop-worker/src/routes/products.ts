import type { Env, ProductImageRow, ProductRow } from "../types";
import { getProductBySlug, listProductImages, listPublishedProducts } from "../lib/db";
import { formatUsdFromCents } from "../lib/money";
import { assetUrl } from "../lib/assets";
import { genericError, jsonResponse, safeServerError } from "../lib/http";

function safeJsonArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toCatalogEntry(env: Env, product: ProductRow, cover: ProductImageRow | null) {
  return {
    slug: product.slug,
    title: product.title,
    shortDescription: product.short_description,
    category: product.category,
    audience: product.audience,
    // Carried on the catalogue entry so a card can show format and version
    // without the storefront fetching every product's detail endpoint just to
    // render a grid.
    supportedFormats: product.supported_formats,
    version: product.version,
    priceCents: product.price_cents,
    priceDisplay: product.price_cents !== null ? formatUsdFromCents(product.price_cents) : null,
    currency: product.currency,
    coverImageUrl: cover ? assetUrl(env, cover) : null,
  };
}

function toDetailEntry(env: Env, product: ProductRow, images: ProductImageRow[]) {
  const cover = images.find((img) => img.kind === "COVER") ?? null;
  const previews = images.filter((img) => img.kind === "PREVIEW");

  return {
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
    priceCents: product.price_cents,
    priceDisplay: product.price_cents !== null ? formatUsdFromCents(product.price_cents) : null,
    currency: product.currency,
    supportedFormats: product.supported_formats,
    deliverables: safeJsonArray(product.deliverables_json),
    notIncluded: safeJsonArray(product.not_included_json),
    faqs: safeJsonArray(product.faqs_json),
    responsibleUseText: product.responsible_use_text,
    refundEligible: product.refund_eligible === 1,
    refundPolicySummary: product.refund_policy_summary,
    // Publication dates only. created_at is internal production history and is
    // not a fact a customer needs, so it is not exposed.
    publishedAt: product.published_at,
    updatedAt: product.updated_at,
    coverImageUrl: cover ? assetUrl(env, cover) : null,
    previewImageUrls: previews.map((p) => assetUrl(env, p)),
    buyable: product.publicly_purchasable === 1 && product.price_confirmed === 1 && product.price_cents !== null,
  };
}

export async function handleListProducts(_request: Request, env: Env): Promise<Response> {
  try {
    const products = await listPublishedProducts(env.SHOP_DB);
    const withCovers = await Promise.all(
      products.map(async (p) => {
        const images = await listProductImages(env.SHOP_DB, p.id);
        const cover = images.find((img) => img.kind === "COVER") ?? null;
        return toCatalogEntry(env, p, cover);
      }),
    );
    return jsonResponse({ ok: true, products: withCovers });
  } catch (err) {
    return safeServerError("handleListProducts", err);
  }
}

export async function handleGetProduct(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  try {
    const product = await getProductBySlug(env.SHOP_DB, params.slug);
    if (!product || product.status !== "PUBLISHED") {
      return genericError(404, "Product not found.");
    }
    const images = await listProductImages(env.SHOP_DB, product.id);
    return jsonResponse({ ok: true, product: toDetailEntry(env, product, images) });
  } catch (err) {
    return safeServerError("handleGetProduct", err);
  }
}
