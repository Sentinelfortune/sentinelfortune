// Product cover/preview image URLs.
//
// By default the Worker serves images itself from SHOP_ASSETS_BUCKET via
// GET /shop/asset/:imageId. That keeps the assets R2 bucket entirely private:
// nothing in this system requires public bucket access. Serving through the
// Worker also means only images registered in the product_images table are
// reachable — the bucket's key space is never addressable directly.
//
// SHOP_ASSETS_PUBLIC_BASE_URL remains supported as an OPTIONAL override for a
// CDN or custom domain in front of a public assets bucket. Left unset (or left
// as a REPLACE_WITH_* placeholder, matching how lib/cors.ts treats unset
// config) the Worker-served path is used.

export interface AssetUrlEnv {
  SHOP_WORKER_BASE_URL: string;
  SHOP_ASSETS_PUBLIC_BASE_URL?: string;
}

export interface AssetImageRef {
  id: string;
  r2_key: string;
}

/** File extension → Content-Type, restricted to the upload image allow-list. */
export const ASSET_CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function isConfigured(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("REPLACE_WITH");
}

export function assetUrl(env: AssetUrlEnv, image: AssetImageRef): string {
  if (isConfigured(env.SHOP_ASSETS_PUBLIC_BASE_URL)) {
    return `${env.SHOP_ASSETS_PUBLIC_BASE_URL.replace(/\/$/, "")}/${image.r2_key}`;
  }
  return `${env.SHOP_WORKER_BASE_URL.replace(/\/$/, "")}/shop/asset/${image.id}`;
}

/** Content-Type for an image R2 key, or null if the extension is not an allowed image type. */
export function assetContentType(r2Key: string): string | null {
  const parts = r2Key.split(".");
  if (parts.length < 2) return null;
  const ext = parts[parts.length - 1].toLowerCase();
  return ASSET_CONTENT_TYPES[ext] ?? null;
}
