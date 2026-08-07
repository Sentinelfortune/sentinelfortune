import { describe, expect, it } from "vitest";
import { handleAdminUploadFile, handleAdminUploadImage } from "../src/routes/admin/files";
import { insertProduct } from "../src/lib/db";
import { buildTestEnv } from "./helpers/testEnv";
import type { ProductRow } from "../src/types";

const IDENTITY = { email: "owner@sentinelfortune.com", sub: "owner-1" };

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  const now = "2026-07-27T00:00:00.000Z";
  return {
    id: "prod_upload_test",
    sku: "SFL-UP-001",
    slug: "upload-test-product",
    title: "Upload Test Product",
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
    created_at: now,
    updated_at: now,
    published_at: null,
    ...overrides,
  };
}

function uploadRequest(file: File, extraFields: Record<string, string> = {}): Request {
  const form = new FormData();
  form.set("file", file);
  for (const [k, v] of Object.entries(extraFields)) form.set(k, v);
  return new Request("https://shop-worker.example.workers.dev/shop/admin/products/prod_upload_test/files", {
    method: "POST",
    body: form,
  });
}

describe("admin file upload — invalid upload type rejection", () => {
  it("rejects an .exe upload with 422 and does not write it to R2", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeProduct());

    const badFile = new File([new Uint8Array([0x4d, 0x5a])], "installer.exe", { type: "application/x-msdownload" });
    const response = await handleAdminUploadFile(uploadRequest(badFile), env, { id: "prod_upload_test" }, IDENTITY);

    expect(response.status).toBe(422);
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });

  it("rejects an HTML file (script-capable) even with a permissive content-type", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeProduct());

    const badFile = new File(["<script>alert(1)</script>"], "page.html", { type: "text/html" });
    const response = await handleAdminUploadFile(uploadRequest(badFile), env, { id: "prod_upload_test" }, IDENTITY);
    expect(response.status).toBe(422);
  });

  it("accepts a valid PDF upload and stores it privately in R2", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeProduct());

    const goodFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "Playbook (Final)!.pdf", { type: "application/pdf" });
    const response = await handleAdminUploadFile(uploadRequest(goodFile), env, { id: "prod_upload_test" }, IDENTITY);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { ok: boolean; file: { filename: string } };
    expect(body.ok).toBe(true);
    // Filename sanitization applied on upload.
    expect(body.file.filename).toBe("Playbook-Final.pdf");
  });

  it("rejects an SVG cover image (script-capable image format)", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeProduct());

    const svg = new File(["<svg onload='alert(1)'></svg>"], "cover.svg", { type: "image/svg+xml" });
    const form = new FormData();
    form.set("file", svg);
    form.set("kind", "COVER");
    const request = new Request("https://shop-worker.example.workers.dev/shop/admin/products/prod_upload_test/images", { method: "POST", body: form });

    const response = await handleAdminUploadImage(request, env, { id: "prod_upload_test" }, IDENTITY);
    expect(response.status).toBe(422);
  });

  it("enforces the 6-image cap on preview images", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeProduct());

    for (let i = 0; i < 6; i++) {
      const img = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], `preview-${i}.png`, { type: "image/png" });
      const form = new FormData();
      form.set("file", img);
      form.set("kind", "PREVIEW");
      const request = new Request("https://shop-worker.example.workers.dev/shop/admin/products/prod_upload_test/images", { method: "POST", body: form });
      const response = await handleAdminUploadImage(request, env, { id: "prod_upload_test" }, IDENTITY);
      expect(response.status).toBe(201);
    }

    const seventh = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "preview-7.png", { type: "image/png" });
    const form = new FormData();
    form.set("file", seventh);
    form.set("kind", "PREVIEW");
    const request = new Request("https://shop-worker.example.workers.dev/shop/admin/products/prod_upload_test/images", { method: "POST", body: form });
    const response = await handleAdminUploadImage(request, env, { id: "prod_upload_test" }, IDENTITY);
    expect(response.status).toBe(422);
  });
});
