import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { buildTestEnv } from "./helpers/testEnv";

function fakeCtx(): ExecutionContext {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
}

const ORIGIN = "https://shop-worker.example.workers.dev";

async function publishOne(env: Awaited<ReturnType<typeof buildTestEnv>>) {
  await env.SHOP_DB.prepare(
    `INSERT INTO products
       (id, sku, slug, title, short_description, category, audience,
        supported_formats, version, status, price_cents, price_confirmed,
        currency, publicly_purchasable, terms_acknowledged,
        created_at, updated_at, published_at)
     VALUES
       ('p-cat-1','SFL-CAT-001','catalogue-probe','Catalogue Probe',
        'A published product used to assert the catalogue shape.',
        'Business & Professional','Small operators',
        'PDF, DOCX','2.1','PUBLISHED',4900,1,'usd',1,1,
        '2026-01-01T00:00:00Z','2026-06-15T09:30:00Z','2026-02-02T00:00:00Z')`,
  ).run();
}

async function catalogue(env: Awaited<ReturnType<typeof buildTestEnv>>) {
  const res = await worker.fetch(new Request(`${ORIGIN}/shop/products`), env, fakeCtx());
  expect(res.status).toBe(200);
  return (await res.json()) as { ok: boolean; products: Record<string, unknown>[] };
}

describe("public catalogue entry shape", () => {
  it("carries supportedFormats and version so a card can show format and version", async () => {
    const env = await buildTestEnv();
    await publishOne(env);

    const body = await catalogue(env);
    const entry = body.products.find((p) => p.slug === "catalogue-probe");

    expect(entry).toBeDefined();
    // Without these two the storefront would have to fetch every product's
    // detail endpoint just to render a grid.
    expect(entry!.supportedFormats).toBe("PDF, DOCX");
    expect(entry!.version).toBe("2.1");
    expect(entry!.category).toBe("Business & Professional");
  });

  it("does not leak internal or unpriced-product fields into the catalogue", async () => {
    const env = await buildTestEnv();
    await publishOne(env);

    const body = await catalogue(env);
    const entry = body.products.find((p) => p.slug === "catalogue-probe")!;

    for (const leaked of [
      "id", "stripe_product_id", "stripe_price_id", "terms_acknowledged",
      "price_confirmed", "publicly_purchasable", "created_at",
    ]) {
      expect(entry, `catalogue entry must not expose ${leaked}`).not.toHaveProperty(leaked);
    }
  });

  it("still excludes products that are not PUBLISHED", async () => {
    const env = await buildTestEnv();
    await publishOne(env);
    await env.SHOP_DB.prepare(
      `INSERT INTO products (id, sku, slug, title, status, created_at, updated_at)
       VALUES ('p-cat-2','SFL-CAT-002','draft-probe','Draft Probe','DRAFT',
               '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
    ).run();

    const body = await catalogue(env);
    expect(body.products.some((p) => p.slug === "draft-probe")).toBe(false);
    expect(body.products.some((p) => p.slug === "catalogue-probe")).toBe(true);
  });
});

describe("product detail publication dates", () => {
  it("exposes updatedAt and publishedAt but never created_at", async () => {
    const env = await buildTestEnv();
    await publishOne(env);

    const res = await worker.fetch(
      new Request(`${ORIGIN}/shop/products/catalogue-probe`), env, fakeCtx(),
    );
    expect(res.status).toBe(200);
    const { product } = (await res.json()) as { product: Record<string, unknown> };

    // The product page shows "Last updated <date>"; that needs a real field.
    expect(product.updatedAt).toBe("2026-06-15T09:30:00Z");
    expect(product.publishedAt).toBe("2026-02-02T00:00:00Z");
    // created_at is internal production history, not a customer fact.
    expect(product).not.toHaveProperty("createdAt");
    expect(product).not.toHaveProperty("created_at");
  });
});
