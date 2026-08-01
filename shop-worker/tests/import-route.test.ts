// Governed product-package import.
//
// Every test drives real ZIP bytes through the real handlers against a real
// SQLite-backed D1 and a fake R2, so the parsing, validation, write ordering
// and rollback are all exercised rather than described.

import { describe, expect, it, vi } from "vitest";
import { handleImportCommit, handleImportValidate } from "../src/routes/admin/import";
import worker from "../src/index";
import {
  getProductBySku,
  insertProduct,
  listAllProducts,
  listProductFiles,
  listAuditLog,
} from "../src/lib/db";
import { buildTestEnv } from "./helpers/testEnv";
import { buildPackage, buildZip, importRequest, validManifest } from "./helpers/zipFixture";
import type { Env, ProductRow } from "../src/types";

const IDENTITY = { email: "owner@sentinelfortune.com", sub: "owner-1" };
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

function makeExistingProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  const now = "2026-07-01T00:00:00.000Z";
  return {
    id: "prod_existing", sku: "SFL-TEST-001", slug: "governed-import-test-product",
    title: "Previously Imported", short_description: "", problem_solved: "", description: "",
    category: "", audience: "", edition: "", version: "0.9", status: "DRAFT",
    price_cents: null, price_confirmed: 0, currency: "usd", license_type: "SINGLE_BUSINESS",
    publicly_purchasable: 0, supported_formats: "", deliverables_json: "[]", not_included_json: "[]",
    faqs_json: "[]", responsible_use_text: "", refund_eligible: 1, refund_policy_summary: "",
    terms_acknowledged: 0, stripe_product_id: null, stripe_price_id: null,
    download_link_expiry_hours: 72, max_downloads: 5, created_at: now, updated_at: now,
    published_at: null, ...overrides,
  };
}

async function commit(env: Env, bytes: ArrayBuffer, search = ""): Promise<Response> {
  return handleImportCommit(importRequest(bytes, "package.zip", search), env, IDENTITY);
}

describe("import — a valid package becomes a populated draft", () => {
  it("imports every supported metadata field and attaches the package", async () => {
    const env = await buildTestEnv();

    const response = await commit(env, buildPackage());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(body.imported).toBe(true);
    expect(body.mode).toBe("create");
    expect(body.status).toBe("DRAFT");

    const product = await getProductBySku(env.SHOP_DB, "SFL-TEST-001");
    expect(product).not.toBeNull();
    expect(product!.title).toBe("Governed Import Test Product");
    expect(product!.slug).toBe("governed-import-test-product");
    expect(product!.version).toBe("1.0");
    expect(product!.edition).toBe("Standard Edition");
    expect(product!.category).toBe("Business Operations");
    expect(product!.audience).toBe("Home-service businesses");
    expect(product!.license_type).toBe("SINGLE_BUSINESS");
    expect(product!.supported_formats).toBe("PDF, DOCX");
    expect(product!.short_description).toContain("governed import");
    expect(product!.problem_solved).toContain("fully populated draft");
    expect(product!.description).toContain("longer description");
    expect(JSON.parse(product!.deliverables_json)).toHaveLength(2);
    expect(JSON.parse(product!.not_included_json)).toHaveLength(2);
    expect(JSON.parse(product!.faqs_json)).toHaveLength(1);
    expect(product!.responsible_use_text).toContain("Not legal");
    expect(product!.refund_policy_summary).toContain("case by case");
    expect(product!.download_link_expiry_hours).toBe(72);
    expect(product!.max_downloads).toBe(5);

    const files = await listProductFiles(env.SHOP_DB, product!.id);
    expect(files).toHaveLength(1);
    expect(files[0].sanitized_filename).toBe("SFL-TEST-001-v1.0.zip");
    expect(files[0].content_type).toBe("application/zip");
    expect(await env.SHOP_DOWNLOADS_BUCKET.head(files[0].r2_key)).not.toBeNull();
  });

  it("records the import in the audit log with its provenance", async () => {
    const env = await buildTestEnv();

    await commit(env, buildPackage());
    const entries = await listAuditLog(env.SHOP_DB, 10);
    const entry = entries.find((e) => e.action === "product.import");

    expect(entry).toBeDefined();
    expect(entry!.actor).toBe("owner@sentinelfortune.com");
    const meta = JSON.parse(String(entry!.details_json));
    expect(meta.importSource).toBe("package.zip");
    expect(meta.manifestContractVersion).toBe(1);
    expect(meta.sku).toBe("SFL-TEST-001");
    expect(meta.productVersion).toBe("1.0");
    expect(meta.producer).toBe("Test production studio");
    expect(meta.mode).toBe("create");
    expect(meta.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("previews without writing anything", async () => {
    const env = await buildTestEnv();

    const response = await handleImportValidate(
      importRequest(buildPackage(), "package.zip"), env,
    );
    const body = (await response.json()) as { ok: boolean; valid: boolean; preview: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.valid).toBe(true);
    expect(body.preview.sku).toBe("SFL-TEST-001");
    expect(body.preview.recommendedPriceDisplay).toBe("$49.00");
    expect(body.preview.fileCount).toBe(2);
    expect(await listAllProducts(env.SHOP_DB)).toHaveLength(0);
  });

  it("reports the cover image as still required when the package has none", async () => {
    const env = await buildTestEnv();

    const body = (await (await commit(env, buildPackage())).json()) as { remaining: string[]; coverImported: boolean };

    expect(body.coverImported).toBe(false);
    expect(body.remaining.join(" ")).toContain("cover image");
  });

  it("imports a cover image when the package carries one", async () => {
    const env = await buildTestEnv();
    const manifest = validManifest({
      coverImage: "cover.png",
      files: [
        { path: "01-Guide/Guide.pdf" },
        { path: "02-Template/Template.docx" },
        { path: "cover.png" },
      ],
    });

    const body = (await (await commit(env, buildPackage(manifest))).json()) as { coverImported: boolean };

    expect(body.coverImported).toBe(true);
    const product = await getProductBySku(env.SHOP_DB, "SFL-TEST-001");
    const images = await env.SHOP_DB.prepare(`SELECT * FROM product_images WHERE product_id = ?`)
      .bind(product!.id).all();
    expect(images.results).toHaveLength(1);
  });
});

describe("import — governance is not bypassable", () => {
  it("leaves the price unconfirmed even though the manifest recommends one", async () => {
    const env = await buildTestEnv();

    const body = (await (await commit(env, buildPackage())).json()) as { priceConfirmed: boolean };
    const product = await getProductBySku(env.SHOP_DB, "SFL-TEST-001");

    expect(product!.price_cents).toBe(4900);   // populated for the Owner to review
    expect(product!.price_confirmed).toBe(0);  // but never confirmed by the importer
    expect(body.priceConfirmed).toBe(false);
  });

  it("never ticks the Owner terms acknowledgement or makes the product purchasable", async () => {
    const env = await buildTestEnv();

    await commit(env, buildPackage());
    const product = await getProductBySku(env.SHOP_DB, "SFL-TEST-001");

    expect(product!.terms_acknowledged).toBe(0);
    expect(product!.publicly_purchasable).toBe(0);
  });

  it("imports as DRAFT and never as PUBLISHED, whatever the manifest says", async () => {
    const env = await buildTestEnv();
    // A manifest that tries to assert its own status must not be honoured.
    const manifest = validManifest({ status: "PUBLISHED", publiclyPurchasable: true, priceConfirmed: true });

    await commit(env, buildPackage(manifest));
    const product = await getProductBySku(env.SHOP_DB, "SFL-TEST-001");

    expect(product!.status).toBe("DRAFT");
    expect(product!.published_at).toBeNull();
    expect(product!.price_confirmed).toBe(0);
    expect(product!.publicly_purchasable).toBe(0);
  });

  it("leaves publishing blocked until the remaining readiness items are done", async () => {
    const env = await buildTestEnv();

    const body = (await (await commit(env, buildPackage())).json()) as { remaining: string[] };

    // A freshly imported product is deliberately not publishable.
    expect(body.remaining.length).toBeGreaterThan(0);
    expect(body.remaining.join(" ")).toMatch(/price|confirm/i);
    expect(body.remaining.join(" ")).toMatch(/terms/i);
  });
});

describe("import — validation refuses bad packages without writing", () => {
  async function expectRejected(env: Env, bytes: ArrayBuffer, match: RegExp) {
    const response = await commit(env, bytes);
    const body = (await response.json()) as { imported?: boolean; errors: string[] };

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(body.errors.join(" ")).toMatch(match);
    expect(await listAllProducts(env.SHOP_DB)).toHaveLength(0);
    return body;
  }

  it("rejects a package with no manifest", async () => {
    const env = await buildTestEnv();
    const bytes = buildZip([{ name: "01-Guide/Guide.pdf", content: "a file" }]);
    await expectRejected(env, bytes, /does not contain PRODUCT-MANIFEST\.json/);
  });

  it("rejects a manifest that is not valid JSON", async () => {
    const env = await buildTestEnv();
    const bytes = buildZip([{ name: "PRODUCT-MANIFEST.json", content: "{ not json" }]);
    await expectRejected(env, bytes, /not valid JSON/);
  });

  it("rejects a manifest missing required identity and copy fields", async () => {
    const env = await buildTestEnv();
    const manifest = validManifest();
    delete manifest.sku;
    delete manifest.version;
    delete manifest.title;
    delete manifest.licenseType;
    delete manifest.supportedFormats;
    delete manifest.shortDescription;

    const body = await expectRejected(env, buildPackage(manifest), /missing "sku"/);
    const joined = body.errors.join(" ");
    for (const field of ["version", "title", "licenseType", "supportedFormats", "short description"]) {
      expect(joined).toContain(field);
    }
  });

  it("rejects an unsupported contract version", async () => {
    const env = await buildTestEnv();
    await expectRejected(env, buildPackage(validManifest({ contractVersion: 99 })), /contract version 99 is not supported/);
  });

  it("rejects a manifest declaring a file the package does not contain", async () => {
    const env = await buildTestEnv();
    const manifest = validManifest({ files: [{ path: "01-Guide/Guide.pdf" }, { path: "missing/Nope.pdf" }] });
    const bytes = buildZip([
      { name: "PRODUCT-MANIFEST.json", content: JSON.stringify(manifest) },
      { name: "01-Guide/Guide.pdf", content: "a file" },
    ]);
    await expectRejected(env, bytes, /declares "missing\/Nope\.pdf", which is not in the package/);
  });

  it("rejects a package containing a file the manifest does not declare", async () => {
    const env = await buildTestEnv();
    const bytes = buildPackage(validManifest(), [{ name: "extra/Undeclared.pdf", content: "sneaky" }]);
    await expectRejected(env, bytes, /contains "extra\/Undeclared\.pdf", which the manifest does not declare/);
  });

  it("rejects a package containing an executable", async () => {
    const env = await buildTestEnv();
    const manifest = validManifest({
      files: [{ path: "01-Guide/Guide.pdf" }, { path: "02-Template/Template.docx" }, { path: "installer.exe" }],
    });
    await expectRejected(env, buildPackage(manifest), /prohibited executable or script file: "installer\.exe"/);
  });

  it("rejects placeholder text left in the manifest", async () => {
    const env = await buildTestEnv();
    const manifest = validManifest({ description: "REPLACE_WITH the real description" });
    await expectRejected(env, buildPackage(manifest), /placeholder text/);
  });

  it("rejects a deliverable pointing at a public URL", async () => {
    const env = await buildTestEnv();
    const manifest = validManifest({
      files: [{ path: "01-Guide/Guide.pdf" }, { path: "https://cdn.example.com/Template.docx" }],
    });
    await expectRejected(env, buildPackage(manifest), /is a URL\. Deliverables must be inside the package/);
  });

  it("rejects a corrupt archive", async () => {
    const env = await buildTestEnv();
    const good = new Uint8Array(buildPackage());
    good.set([0, 0, 0, 0], good.length - 6); // wreck the central directory offset
    await expectRejected(env, good.buffer, /ZIP|corrupt|truncated/i);
  });

  it("rejects an upload that is not a ZIP at all", async () => {
    const env = await buildTestEnv();
    await expectRejected(env, new TextEncoder().encode("this is a text file").buffer, /ZIP/i);
  });

  it("rejects an invalid licence type", async () => {
    const env = await buildTestEnv();
    await expectRejected(env, buildPackage(validManifest({ licenseType: "UNLIMITED" })), /licenseType" must be one of/);
  });

  it("reports every failure at once rather than one at a time", async () => {
    const env = await buildTestEnv();
    const manifest = validManifest({ sku: "", licenseType: "NOPE", deliverables: [] });
    const body = await expectRejected(env, buildPackage(manifest), /sku/);
    expect(body.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("import — SKU and version collisions", () => {
  it("refuses to overwrite an existing SKU without update mode", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeExistingProduct());

    const response = await commit(env, buildPackage());
    const body = (await response.json()) as { imported: boolean; requiresUpdateMode: boolean; errors: string[] };

    expect(response.status).toBe(409);
    expect(body.imported).toBe(false);
    expect(body.requiresUpdateMode).toBe(true);
    const product = await getProductBySku(env.SHOP_DB, "SFL-TEST-001");
    expect(product!.title).toBe("Previously Imported"); // untouched
  });

  it("updates the existing draft when update mode is explicit", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeExistingProduct());

    const response = await commit(env, buildPackage(), "?mode=update");
    const body = (await response.json()) as { imported: boolean; mode: string };

    expect(response.status).toBe(201);
    expect(body.mode).toBe("update");
    const product = await getProductBySku(env.SHOP_DB, "SFL-TEST-001");
    expect(product!.title).toBe("Governed Import Test Product");
    expect(product!.version).toBe("1.0");
    expect(product!.id).toBe("prod_existing");
    expect(await listAllProducts(env.SHOP_DB)).toHaveLength(1);
  });

  it("refuses to overwrite a PUBLISHED product even in update mode", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeExistingProduct({ status: "PUBLISHED" }));

    const response = await commit(env, buildPackage(), "?mode=update");
    const body = (await response.json()) as { errors: string[] };

    expect(response.status).toBe(409);
    expect(body.errors.join(" ")).toMatch(/PUBLISHED.*Unpublish it/);
    const product = await getProductBySku(env.SHOP_DB, "SFL-TEST-001");
    expect(product!.title).toBe("Previously Imported");
  });

  it("refuses a slug already held by a different product", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeExistingProduct({ id: "prod_other", sku: "SFL-OTHER-001" }));

    const response = await commit(env, buildPackage());
    const body = (await response.json()) as { errors: string[] };

    expect(response.status).toBe(409);
    expect(body.errors.join(" ")).toMatch(/slug .* already used/);
  });
});

describe("import — rollback leaves nothing behind", () => {
  it("removes the product row when the R2 upload fails", async () => {
    const env = await buildTestEnv();
    env.SHOP_DOWNLOADS_BUCKET.put = vi.fn(async () => {
      throw new Error("R2 unavailable");
    });

    const response = await commit(env, buildPackage());
    const body = (await response.json()) as { imported: boolean; errors: string[] };

    expect(response.status).toBe(502);
    expect(body.imported).toBe(false);
    expect(body.errors.join(" ")).toMatch(/could not be stored. Nothing was imported/);
    expect(await listAllProducts(env.SHOP_DB)).toHaveLength(0);
    expect(await getProductBySku(env.SHOP_DB, "SFL-TEST-001")).toBeNull();
  });

  it("removes both the product row and the stored object when the D1 file write fails", async () => {
    const env = await buildTestEnv();
    const realPrepare = env.SHOP_DB.prepare.bind(env.SHOP_DB);
    const stored: string[] = [];
    const realPut = env.SHOP_DOWNLOADS_BUCKET.put.bind(env.SHOP_DOWNLOADS_BUCKET);
    env.SHOP_DOWNLOADS_BUCKET.put = async (key, value, options) => {
      stored.push(key);
      return realPut(key, value, options);
    };
    env.SHOP_DB.prepare = (query: string) => {
      if (query.includes("INSERT INTO product_files")) throw new Error("D1 write failed");
      return realPrepare(query);
    };

    const response = await commit(env, buildPackage());
    const body = (await response.json()) as { imported: boolean; errors: string[] };

    expect(response.status).toBe(500);
    expect(body.imported).toBe(false);

    env.SHOP_DB.prepare = realPrepare;
    expect(await listAllProducts(env.SHOP_DB)).toHaveLength(0);
    expect(stored).toHaveLength(1);
    expect(await env.SHOP_DOWNLOADS_BUCKET.head(stored[0])).toBeNull();
  });

  it("does not touch an existing product when validation fails", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeExistingProduct());

    await commit(env, buildPackage(validManifest({ description: "TODO write this" })), "?mode=update");

    const product = await getProductBySku(env.SHOP_DB, "SFL-TEST-001");
    expect(product!.title).toBe("Previously Imported");
    expect(product!.description).toBe("");
    expect(await listProductFiles(env.SHOP_DB, "prod_existing")).toHaveLength(0);
  });
});

describe("import — unauthorized attempts", () => {
  it("returns 401 for an unauthenticated import through the Worker entrypoint", async () => {
    const env = await buildTestEnv();
    const form = new FormData();
    form.set("file", new File([buildPackage()], "package.zip", { type: "application/zip" }));

    for (const path of ["/shop/admin/import/validate", "/shop/admin/import/commit"]) {
      const response = await worker.fetch(
        new Request(`https://shop-worker.example.workers.dev${path}`, { method: "POST", body: form }),
        env,
        ctx,
      );
      expect(response.status).toBe(401);
    }
    expect(await listAllProducts(env.SHOP_DB)).toHaveLength(0);
  });

  it("returns 401 for an import carrying a garbage Access token", async () => {
    const env = await buildTestEnv();
    const form = new FormData();
    form.set("file", new File([buildPackage()], "package.zip", { type: "application/zip" }));

    const response = await worker.fetch(
      new Request("https://shop-worker.example.workers.dev/shop/admin/import/commit", {
        method: "POST",
        body: form,
        headers: { "Cf-Access-Jwt-Assertion": "not.a.token" },
      }),
      env,
      ctx,
    );

    expect(response.status).toBe(401);
    expect(await listAllProducts(env.SHOP_DB)).toHaveLength(0);
  });
});
