import { describe, expect, it } from "vitest";
import { handleGetAsset } from "../src/routes/asset";
import { assetContentType, assetUrl } from "../src/lib/assets";
import { insertProduct, insertProductImage } from "../src/lib/db";
import { buildTestEnv } from "./helpers/testEnv";
import type { Env, ProductImageRow, ProductRow } from "../src/types";

const NOW = "2026-07-31T00:00:00.000Z";
const PRODUCT_ID = "prod_asset_test";
const COVER_ID = "img_cover_asset_test";
const COVER_KEY = `products/${PRODUCT_ID}/images/cover-${COVER_ID}.png`;
const COVER_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: PRODUCT_ID,
    sku: "SFL-AST-001",
    slug: "asset-test-product",
    title: "Asset Test Product",
    short_description: "",
    problem_solved: "",
    description: "",
    category: "",
    audience: "",
    edition: "",
    version: "1.0",
    status: "DRAFT",
    price_cents: null,
    price_confirmed: 0,
    currency: "usd",
    license_type: "SINGLE_BUSINESS",
    publicly_purchasable: 0,
    supported_formats: "",
    deliverables_json: "[]",
    not_included_json: "[]",
    faqs_json: "[]",
    responsible_use_text: "",
    refund_eligible: 1,
    refund_policy_summary: "",
    terms_acknowledged: 0,
    stripe_product_id: null,
    stripe_price_id: null,
    download_link_expiry_hours: 72,
    max_downloads: 5,
    created_at: NOW,
    updated_at: NOW,
    published_at: null,
    ...overrides,
  };
}

function makeImage(overrides: Partial<ProductImageRow> = {}): ProductImageRow {
  return {
    id: COVER_ID,
    product_id: PRODUCT_ID,
    kind: "COVER",
    r2_key: COVER_KEY,
    position: 0,
    alt_text: "Cover",
    created_at: NOW,
    ...overrides,
  };
}

async function seedEnv(image: ProductImageRow = makeImage(), storeBytes = true): Promise<Env> {
  const env = await buildTestEnv();
  await insertProduct(env.SHOP_DB, makeProduct());
  await insertProductImage(env.SHOP_DB, image);
  if (storeBytes) {
    await env.SHOP_ASSETS_BUCKET.put(image.r2_key, COVER_BYTES.buffer, { httpMetadata: { contentType: "image/png" } });
  }
  return env;
}

const request = new Request("https://shop-worker.example.workers.dev/shop/asset/x");

describe("GET /shop/asset/:id — Worker-served product images", () => {
  it("serves a registered image with its derived content type", async () => {
    const env = await seedEnv();

    const response = await handleGetAsset(request, env, { id: COVER_ID });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(COVER_BYTES);
  });

  it("returns 404 for an unknown image id", async () => {
    const env = await seedEnv();

    const response = await handleGetAsset(request, env, { id: "img_does_not_exist" });

    expect(response.status).toBe(404);
  });

  it("cannot be used to read an arbitrary key in the assets bucket", async () => {
    const env = await seedEnv();
    // An object present in the bucket but NOT registered in product_images
    // must remain unreachable — the route is keyed on the image id, not the key.
    await env.SHOP_ASSETS_BUCKET.put("products/other/secret.png", COVER_BYTES.buffer);

    const response = await handleGetAsset(request, env, { id: "products/other/secret.png" });

    expect(response.status).toBe(404);
  });

  it("returns 404 when the row exists but the object is missing from R2", async () => {
    const env = await seedEnv(makeImage(), false);

    const response = await handleGetAsset(request, env, { id: COVER_ID });

    expect(response.status).toBe(404);
  });

  it("refuses to serve a row whose key is not an allowed image extension", async () => {
    const image = makeImage({ r2_key: `products/${PRODUCT_ID}/images/cover.html` });
    const env = await seedEnv(image);

    const response = await handleGetAsset(request, env, { id: COVER_ID });

    expect(response.status).toBe(404);
  });
});

describe("assetUrl — no public R2 bucket required", () => {
  const image = { id: COVER_ID, r2_key: COVER_KEY };

  it("builds a Worker-served URL when SHOP_ASSETS_PUBLIC_BASE_URL is unset", async () => {
    const env = await buildTestEnv();

    expect(env.SHOP_ASSETS_PUBLIC_BASE_URL).toBeUndefined();
    expect(assetUrl(env, image)).toBe(`https://shop-worker.example.workers.dev/shop/asset/${COVER_ID}`);
  });

  it("ignores a REPLACE_WITH_* placeholder and still serves through the Worker", () => {
    const url = assetUrl(
      {
        SHOP_WORKER_BASE_URL: "https://shop-worker.example.workers.dev",
        SHOP_ASSETS_PUBLIC_BASE_URL: "https://REPLACE_WITH_ASSETS_BUCKET_PUBLIC_URL",
      },
      image,
    );

    expect(url).toBe(`https://shop-worker.example.workers.dev/shop/asset/${COVER_ID}`);
  });

  it("uses the CDN override when one is genuinely configured", () => {
    const url = assetUrl(
      { SHOP_WORKER_BASE_URL: "https://shop-worker.example.workers.dev", SHOP_ASSETS_PUBLIC_BASE_URL: "https://assets.example.com/" },
      image,
    );

    expect(url).toBe(`https://assets.example.com/${COVER_KEY}`);
  });

  it("maps only the allowed image extensions to a content type", () => {
    expect(assetContentType("a/b/c.png")).toBe("image/png");
    expect(assetContentType("a/b/c.JPG")).toBe("image/jpeg");
    expect(assetContentType("a/b/c.jpeg")).toBe("image/jpeg");
    expect(assetContentType("a/b/c.webp")).toBe("image/webp");
    expect(assetContentType("a/b/c.svg")).toBeNull();
    expect(assetContentType("a/b/c.html")).toBeNull();
    expect(assetContentType("a/b/c")).toBeNull();
  });
});
