import type { Env } from "../types";
import { getProductImageById } from "../lib/db";
import { assetContentType } from "../lib/assets";
import { genericError, safeServerError } from "../lib/http";

/**
 * GET /shop/asset/:id — serve a product cover/preview image.
 *
 * Keyed on product_images.id, NOT on the R2 key, so this route can only ever
 * return an object that is registered as a product image. There is no way to
 * address arbitrary keys in SHOP_ASSETS_BUCKET through it, which is what lets
 * the assets bucket stay private.
 *
 * Not gated on product status: the Owner Admin UI renders these same URLs for
 * DRAFT products. Image ids are server-generated UUIDs, so an unpublished
 * product's cover is unguessable — strictly stronger than the public-bucket
 * alternative, where every key would be readable by anyone.
 */
export async function handleGetAsset(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  try {
    const image = await getProductImageById(env.SHOP_DB, params.id);
    if (!image) return genericError(404, "Asset not found.");

    // Uploads are already restricted to png/jpg/jpeg/webp; re-derive the type
    // here rather than trusting whatever content type R2 has stored.
    const contentType = assetContentType(image.r2_key);
    if (!contentType) return genericError(404, "Asset not found.");

    const object = await env.SHOP_ASSETS_BUCKET.get(image.r2_key);
    if (!object || !object.body) return genericError(404, "Asset not found.");

    return new Response(object.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Covers/previews are public marketing images and immutable once
        // uploaded (a replacement gets a new id), so they are safe to cache.
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return safeServerError("handleGetAsset", err);
  }
}
