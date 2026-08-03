import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { buildTestEnv } from "./helpers/testEnv";
import { handleAdminWhoami } from "../src/routes/admin/settings";

function ctx(): ExecutionContext {
  return { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

const ORIGIN = "https://shop-worker.example.workers.dev";

/**
 * The commerce bridge has a direction: the Owner Admin may know where the
 * public shop is, but nothing public may learn where the Admin is, and no
 * private column may cross into a public response. These tests pin that
 * direction so a future field addition cannot quietly reverse it.
 */
async function seedPublished(env: Awaited<ReturnType<typeof buildTestEnv>>) {
  await env.SHOP_DB.prepare(
    `INSERT INTO products
       (id, sku, slug, title, short_description, category, supported_formats, version,
        status, price_cents, price_confirmed, currency, publicly_purchasable,
        terms_acknowledged, stripe_product_id, stripe_price_id,
        created_at, updated_at, published_at)
     VALUES
       ('p-pub','SFL-PUB-001','live-product','Live Product','Visible to the public.',
        'Business & Professional','PDF','1.0','PUBLISHED',4900,1,'usd',1,1,
        'prod_SECRET123','price_SECRET456',
        '2026-01-01T00:00:00Z','2026-06-01T00:00:00Z','2026-02-01T00:00:00Z')`,
  ).run();
}

async function seedDraft(env: Awaited<ReturnType<typeof buildTestEnv>>) {
  await env.SHOP_DB.prepare(
    `INSERT INTO products (id, sku, slug, title, status, created_at, updated_at)
     VALUES ('p-draft','SFL-DRAFT-001','hidden-product','Hidden Product','DRAFT',
             '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
  ).run();
}

describe("publication state controls public visibility", () => {
  it("lists a PUBLISHED product and hides a DRAFT one", async () => {
    const env = await buildTestEnv();
    await seedPublished(env);
    await seedDraft(env);

    const res = await worker.fetch(new Request(`${ORIGIN}/shop/products`), env, ctx());
    const body = (await res.json()) as { products: { slug: string }[] };
    const slugs = body.products.map((p) => p.slug);

    expect(slugs).toContain("live-product");
    expect(slugs).not.toContain("hidden-product");
  });

  it("refuses a DRAFT product by direct slug, so guessing the URL gains nothing", async () => {
    const env = await buildTestEnv();
    await seedDraft(env);
    const res = await worker.fetch(new Request(`${ORIGIN}/shop/products/hidden-product`), env, ctx());
    expect(res.status).toBe(404);
  });
});

describe("public API exposes no private field", () => {
  it("keeps internal commerce columns out of the catalogue and the detail view", async () => {
    const env = await buildTestEnv();
    await seedPublished(env);

    for (const path of ["/shop/products", "/shop/products/live-product"]) {
      const res = await worker.fetch(new Request(ORIGIN + path), env, ctx());
      const raw = await res.text();

      // Stripe identifiers, internal ids and the Owner's gating flags are all
      // real columns on the row that was serialised — their absence here is
      // the serialiser choosing, not the data being missing.
      for (const leak of [
        "prod_SECRET123",
        "price_SECRET456",
        "stripe_product_id",
        "stripe_price_id",
        "terms_acknowledged",
        "price_confirmed",
        "publicly_purchasable",
        "p-pub",
      ]) {
        expect(raw, `${path} must not expose ${leak}`).not.toContain(leak);
      }
    }
  });

  it("never names the Owner Admin origin or Access configuration in a public response", async () => {
    const env = await buildTestEnv();
    await seedPublished(env);

    for (const path of ["/shop/products", "/shop/products/live-product", "/shop/health"]) {
      const raw = await (await worker.fetch(new Request(ORIGIN + path), env, ctx())).text();
      for (const leak of ["pages.dev", "cloudflareaccess", "CF_ACCESS", "SHOP_DOWNLOADS_BUCKET"]) {
        expect(raw, `${path} must not reveal ${leak}`).not.toContain(leak);
      }
    }
  });
});

describe("Cloudflare Access still guards the Admin", () => {
  it("rejects every admin route without a token, including the new whoami fields", async () => {
    const env = await buildTestEnv();
    for (const path of ["/shop/admin/whoami", "/shop/admin/products", "/shop/admin/orders",
                        "/shop/admin/licenses", "/shop/admin/settings"]) {
      const res = await worker.fetch(new Request(ORIGIN + path), env, ctx());
      expect(res.status, `${path} must be 401 unauthenticated`).toBe(401);
    }
  });

  it("gives an authenticated Owner the public shop URL so the Admin can link to it", async () => {
    // Called at the handler, the way every other admin-handler test does it.
    // The 401 sweep above is what proves the Access gate in front of it.
    const env = await buildTestEnv();
    const res = await handleAdminWhoami(
      new Request(`${ORIGIN}/shop/admin/whoami`),
      env,
      { email: "owner@example.com", sub: "owner-sub" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { publicShopBaseUrl: string; environment: string };
    expect(body.publicShopBaseUrl).toBe(env.SHOP_PUBLIC_BASE_URL);
    expect(body.environment).toBe("test");
  });
});
