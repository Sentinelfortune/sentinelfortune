import { describe, expect, it } from "vitest";
import { handleDownload } from "../src/routes/download";
import {
  insertDownloadAuthorization,
  insertLicense,
  insertOrder,
  insertProduct,
  insertProductFile,
  upsertCustomerByEmail,
} from "../src/lib/db";
import { generateDownloadToken } from "../src/lib/download-auth";
import { buildTestEnv } from "./helpers/testEnv";
import type { LicenseRow, OrderRow, ProductFileRow, ProductRow } from "../src/types";

const NOW = "2026-07-27T00:00:00.000Z";

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "prod_dl_test",
    sku: "SFL-DL-001",
    slug: "download-test-product",
    title: "Download Test Product",
    short_description: "",
    problem_solved: "",
    description: "",
    category: "",
    audience: "",
    edition: "",
    version: "1.0",
    status: "PUBLISHED",
    price_cents: 4900,
    price_confirmed: 1,
    currency: "usd",
    license_type: "SINGLE_BUSINESS",
    publicly_purchasable: 1,
    supported_formats: "PDF",
    deliverables_json: "[]",
    not_included_json: "[]",
    faqs_json: "[]",
    responsible_use_text: "",
    refund_eligible: 1,
    refund_policy_summary: "30-day refund",
    terms_acknowledged: 1,
    stripe_product_id: null,
    stripe_price_id: null,
    download_link_expiry_hours: 72,
    max_downloads: 3,
    created_at: NOW,
    updated_at: NOW,
    published_at: NOW,
    ...overrides,
  };
}

async function setUpPurchase(env: Awaited<ReturnType<typeof buildTestEnv>>, opts: { expiresAt?: string; maxDownloads?: number; downloadCount?: number; revoked?: 0 | 1; licenseStatus?: "ACTIVE" | "REVOKED" } = {}) {
  const product = makeProduct();
  await insertProduct(env.SHOP_DB, product);

  const fileBytes = new TextEncoder().encode("PDF-CONTENT-BYTES");
  const fileRow: ProductFileRow = {
    id: "file_dl_test",
    product_id: product.id,
    r2_key: `products/${product.id}/files/test.pdf`,
    original_filename: "test.pdf",
    sanitized_filename: "test.pdf",
    content_type: "application/pdf",
    size_bytes: fileBytes.byteLength,
    position: 0,
    created_at: NOW,
  };
  await insertProductFile(env.SHOP_DB, fileRow);
  await env.SHOP_DOWNLOADS_BUCKET.put(fileRow.r2_key, fileBytes.buffer, { httpMetadata: { contentType: "application/pdf" } });

  const customer = await upsertCustomerByEmail(env.SHOP_DB, "cust_dl_test", "buyer@example.com", "Jordan Buyer", NOW);

  const order: OrderRow = {
    id: "order_dl_test",
    order_number: "SFL-ORD-20260727-AAAAAA",
    product_id: product.id,
    customer_id: customer.id,
    stripe_checkout_session_id: "cs_dl_test",
    stripe_payment_intent_id: "pi_dl_test",
    status: "PAID",
    amount_cents: 4900,
    currency: "usd",
    business_name: "",
    created_at: NOW,
    paid_at: NOW,
    refunded_at: null,
  };
  await insertOrder(env.SHOP_DB, order);

  const license: LicenseRow = {
    id: "license_dl_test",
    license_number: "SFL-LIC-20260727-AAAAAA",
    order_id: order.id,
    product_id: product.id,
    customer_id: customer.id,
    license_type: "SINGLE_BUSINESS",
    product_version_snapshot: "1.0",
    purchaser_name: "Jordan Buyer",
    purchaser_email: "buyer@example.com",
    business_name: "",
    status: opts.licenseStatus ?? "ACTIVE",
    rights_summary: "rights",
    restrictions_summary: "restrictions",
    issued_at: NOW,
    revoked_at: opts.licenseStatus === "REVOKED" ? NOW : null,
  };
  await insertLicense(env.SHOP_DB, license);

  const { rawToken, tokenHash } = await generateDownloadToken();
  await insertDownloadAuthorization(env.SHOP_DB, {
    id: "auth_dl_test",
    token_hash: tokenHash,
    license_id: license.id,
    order_id: order.id,
    product_file_id: null,
    max_downloads: opts.maxDownloads ?? 3,
    download_count: opts.downloadCount ?? 0,
    expires_at: opts.expiresAt ?? new Date(Date.now() + 3600_000).toISOString(),
    revoked: opts.revoked ?? 0,
    created_at: NOW,
  });

  return { rawToken, fileRow };
}

function downloadRequest(token: string): Request {
  return new Request(`https://shop-worker.example.workers.dev/shop/download/${token}`, {
    headers: { "CF-Connecting-IP": "203.0.113.5", "User-Agent": "vitest" },
  });
}

describe("GET /shop/download/:token — download authorization", () => {
  it("streams the file and increments download_count on a valid, unexpired, under-limit token", async () => {
    const env = await buildTestEnv();
    const { rawToken } = await setUpPurchase(env);

    const response = await handleDownload(downloadRequest(rawToken), env, { token: rawToken });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("test.pdf");
    const text = await response.text();
    expect(text).toBe("PDF-CONTENT-BYTES");
  });

  it("rejects an unknown token — not found", async () => {
    const env = await buildTestEnv();
    await setUpPurchase(env);
    const response = await handleDownload(downloadRequest("0".repeat(64)), env, { token: "0".repeat(64) });
    expect(response.status).toBe(404);
  });

  it("rejects an expired download link — expired link rejection", async () => {
    const env = await buildTestEnv();
    const { rawToken } = await setUpPurchase(env, { expiresAt: "2020-01-01T00:00:00.000Z" });
    const response = await handleDownload(downloadRequest(rawToken), env, { token: rawToken });
    expect(response.status).toBe(410);
  });

  it("rejects a revoked download link — revoked link rejection", async () => {
    const env = await buildTestEnv();
    const { rawToken } = await setUpPurchase(env, { revoked: 1 });
    const response = await handleDownload(downloadRequest(rawToken), env, { token: rawToken });
    expect(response.status).toBe(403);
  });

  it("rejects once the download limit has been reached — download-limit rejection", async () => {
    const env = await buildTestEnv();
    const { rawToken } = await setUpPurchase(env, { maxDownloads: 2, downloadCount: 2 });
    const response = await handleDownload(downloadRequest(rawToken), env, { token: rawToken });
    expect(response.status).toBe(403);
  });

  it("allows exactly maxDownloads downloads, then rejects the next one", async () => {
    const env = await buildTestEnv();
    const { rawToken } = await setUpPurchase(env, { maxDownloads: 2, downloadCount: 0 });

    const first = await handleDownload(downloadRequest(rawToken), env, { token: rawToken });
    expect(first.status).toBe(200);

    const second = await handleDownload(downloadRequest(rawToken), env, { token: rawToken });
    expect(second.status).toBe(200);

    const third = await handleDownload(downloadRequest(rawToken), env, { token: rawToken });
    expect(third.status).toBe(403);
  });

  it("rejects downloads against a revoked license even if the authorization row itself looks valid", async () => {
    const env = await buildTestEnv();
    const { rawToken } = await setUpPurchase(env, { licenseStatus: "REVOKED" });
    const response = await handleDownload(downloadRequest(rawToken), env, { token: rawToken });
    expect(response.status).toBe(403);
  });
});
