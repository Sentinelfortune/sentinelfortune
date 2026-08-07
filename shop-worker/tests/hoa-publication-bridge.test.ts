// POST /shop/bridge/publications — the House of Assets direct publication
// receiver.
//
// Every test drives a real multipart delivery through the real Worker
// entrypoint, against a real SQLite-backed D1 and a fake R2, with real ZIP
// bytes and real SHA-256 digests. Nothing here is stubbed at the boundary
// that matters, so the authorization gate, the integrity checks, the
// extraction of the single customer file, and the rollback are exercised
// rather than described.

import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { buildTestEnv, TEST_HOA_BRIDGE_TOKEN } from "./helpers/testEnv";
import type { FakeR2Bucket } from "./helpers/fakeR2";
import {
  BRIDGE_URL,
  bridgeRequest,
  buildDelivery,
  CHANNEL_ARTEFACTS,
  customerDownloadZip,
  section,
} from "./helpers/hoaPublicationFixture";
import { buildZip } from "./helpers/zipFixture";
import { listAuditLog, listAllProducts, listProductFiles, listProductImages } from "../src/lib/db";
import { CUSTOMER_DOWNLOAD_PATH, majorUnitsToCents, mapLicenseType } from "../src/lib/hoa-publication";
import type { Env } from "../src/types";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

async function post(env: Env, request: Request): Promise<Response> {
  return worker.fetch(request, env, ctx);
}

async function publish(
  env: Env,
  mutate: (m: Record<string, unknown>) => void = () => {},
): Promise<{ response: Response; body: Record<string, unknown> }> {
  const delivery = await buildDelivery(mutate);
  const response = await post(env, bridgeRequest(delivery));
  return { response, body: (await response.json()) as Record<string, unknown> };
}

function errorsOf(body: Record<string, unknown>): string {
  return JSON.stringify(body.errors ?? body.error ?? body);
}

// ---------------------------------------------------------------------------
// 1. Authentication
// ---------------------------------------------------------------------------

describe("the bridge is not reachable without the bridge token", () => {
  it("refuses a delivery with no Authorization header", async () => {
    const env = await buildTestEnv();
    const delivery = await buildDelivery();
    const res = await post(env, bridgeRequest(delivery, { token: null }));

    expect(res.status).toBe(401);
    // Nothing was parsed, stored or published.
    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
    expect((env.SHOP_DOWNLOADS_BUCKET as FakeR2Bucket).keys()).toEqual([]);
  });

  it("refuses a delivery carrying the wrong token", async () => {
    const env = await buildTestEnv();
    const delivery = await buildDelivery();
    const res = await post(env, bridgeRequest(delivery, { token: "hoa_bridge_wrong_token_of_same_ish_length" }));

    expect(res.status).toBe(401);
    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
  });

  it("fails closed when the bridge secret is not configured at all", async () => {
    // An unset secret must never mean "accept anything" — that is exactly how
    // an internal bridge becomes a public publishing endpoint.
    const env = await buildTestEnv({ HOA_PUBLICATION_BRIDGE_TOKEN: undefined });
    const delivery = await buildDelivery();

    const withToken = await post(env, bridgeRequest(delivery, { token: TEST_HOA_BRIDGE_TOKEN }));
    expect(withToken.status).toBe(503);

    const withEmpty = await post(env, bridgeRequest(delivery, { token: "" }));
    expect(withEmpty.status).toBe(503);

    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
  });

  it("is a bridge route, not an admin route: it never asks for Cloudflare Access", async () => {
    // The Access gate covers /shop/admin/ only. Holding the bridge token must
    // therefore grant this one route and no Admin capability at all.
    const env = await buildTestEnv();
    expect(new URL(BRIDGE_URL).pathname.startsWith("/shop/admin/")).toBe(false);

    for (const adminPath of ["/shop/admin/products", "/shop/admin/settings", "/shop/admin/orders"]) {
      const res = await post(
        env,
        new Request(`https://shop-worker.example.workers.dev${adminPath}`, {
          headers: { Authorization: `Bearer ${TEST_HOA_BRIDGE_TOKEN}` },
        }),
      );
      expect(res.status, `${adminPath} must not accept the bridge token`).toBe(401);
    }
  });

  it("cannot be called from a browser: CORS never allows an Authorization header", async () => {
    const env = await buildTestEnv();
    const preflight = await post(
      env,
      new Request(BRIDGE_URL, {
        method: "OPTIONS",
        headers: { Origin: "https://sentinelfortune.github.io" },
      }),
    );
    const allowed = preflight.headers.get("Access-Control-Allow-Headers") ?? "";
    expect(allowed.toLowerCase()).not.toContain("authorization");
  });
});

// ---------------------------------------------------------------------------
// 2. The routing envelope
// ---------------------------------------------------------------------------

describe("the bridge accepts only its own contract", () => {
  it("refuses an unknown schema", async () => {
    const env = await buildTestEnv();
    const { response, body } = await publish(env, (m) => { m.schema = "hoa.shop-publication/2.0"; });
    expect(response.status).toBe(422);
    expect(errorsOf(body)).toContain("hoa.shop-publication/1.0");
  });

  it("refuses a publication addressed to another destination", async () => {
    const env = await buildTestEnv();
    const { response, body } = await publish(env, (m) => { m.destination = "SOME_OTHER_STORE"; });
    expect(response.status).toBe(422);
    expect(errorsOf(body)).toContain("destination");
    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
  });

  it("refuses an intent other than PUBLISH", async () => {
    const env = await buildTestEnv();
    const { response, body } = await publish(env, (m) => { m.intent = "REVIEW"; });
    expect(response.status).toBe(422);
    expect(errorsOf(body)).toContain("intent");
  });
});

// ---------------------------------------------------------------------------
// 3. Owner authorization
// ---------------------------------------------------------------------------

describe("nothing publishes without complete Owner authorization", () => {
  const cases: [string, (m: Record<string, unknown>) => void][] = [
    ["decision is not APPROVE_AND_PUBLISH", (m) => { section(m, "authorization").decision = "APPROVE_FOR_REVIEW"; }],
    ["authority is not OWNER", (m) => { section(m, "authorization").authority = "AUTOMATION"; }],
    ["terms_acknowledged is false", (m) => { section(m, "authorization").terms_acknowledged = false; }],
    ["terms_acknowledged is merely truthy", (m) => { section(m, "authorization").terms_acknowledged = "yes"; }],
    ["price_approved is false", (m) => { section(m, "authorization").price_approved = false; }],
    ["price_approved is merely truthy", (m) => { section(m, "authorization").price_approved = 1; }],
    ["terms_acknowledged_at is missing", (m) => { delete section(m, "authorization").terms_acknowledged_at; }],
    ["price_approved_at is missing", (m) => { delete section(m, "authorization").price_approved_at; }],
    ["an approval timestamp is not a timestamp", (m) => { section(m, "authorization").price_approved_at = "recently"; }],
    ["the whole authorization block is absent", (m) => { delete m.authorization; }],
  ];

  for (const [label, mutate] of cases) {
    it(`refuses when ${label}`, async () => {
      const env = await buildTestEnv();
      const { response } = await publish(env, mutate);
      expect(response.status).toBe(422);
      expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
      expect((env.SHOP_DOWNLOADS_BUCKET as FakeR2Bucket).keys()).toEqual([]);
      expect((env.SHOP_ASSETS_BUCKET as FakeR2Bucket).keys()).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Package integrity
// ---------------------------------------------------------------------------

describe("the manifest must describe the bytes that arrived", () => {
  it("refuses a package whose SHA-256 does not match the delivered bytes", async () => {
    const env = await buildTestEnv();
    const { response, body } = await publish(env, (m) => {
      section(m, "package").sha256 = "0".repeat(64);
    });
    expect(response.status).toBe(422);
    expect(errorsOf(body)).toContain("does not match the delivered package");
    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
  });

  it("refuses a package whose declared byte size is wrong", async () => {
    const env = await buildTestEnv();
    const { response, body } = await publish(env, (m) => {
      section(m, "package").byte_size = 12;
    });
    expect(response.status).toBe(422);
    expect(errorsOf(body)).toContain("byte_size");
  });

  it("refuses a customer download whose SHA-256 does not match the extracted entry", async () => {
    const env = await buildTestEnv();
    const delivery = await buildDelivery((m) => {
      (section(m, "package").customer_download as Record<string, unknown>).sha256 = "a".repeat(64);
    });
    // The package digest itself still has to be right, or we would be testing
    // the outer check instead of the inner one.
    const res = await post(env, bridgeRequest(delivery));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(422);
    expect(errorsOf(body)).toContain("customer_download.sha256");
    expect((env.SHOP_DOWNLOADS_BUCKET as FakeR2Bucket).keys()).toEqual([]);
  });

  it("refuses a cover whose SHA-256 does not match the extracted image", async () => {
    const env = await buildTestEnv();
    const { response, body } = await publish(env, (m) => {
      (section(m, "package").cover_image as Record<string, unknown>).sha256 = "b".repeat(64);
    });
    expect(response.status).toBe(422);
    expect(errorsOf(body)).toContain("cover_image.sha256");
  });

  it("refuses a delivery that is not a readable ZIP archive at all", async () => {
    const env = await buildTestEnv();
    const notAZip = new TextEncoder().encode("this is not a zip file, whatever the manifest claims").buffer;
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", notAZip)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const delivery = await buildDelivery((m) => {
      section(m, "package").sha256 = digest;
      section(m, "package").byte_size = notAZip.byteLength;
    });
    const res = await post(env, bridgeRequest({ manifest: delivery.manifest, packageBytes: notAZip }));

    expect(res.status).toBe(422);
    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. The one file a customer may receive
// ---------------------------------------------------------------------------

describe("only delivery/customer-download.zip is ever sold", () => {
  it("refuses a manifest naming any other path as the customer download", async () => {
    const env = await buildTestEnv();
    for (const forbidden of ["ALL_CHANNELS_MASTER/master.zip", "BRAND_PACKAGE/brand-kit.zip", "publication.zip"]) {
      const { response, body } = await publish(env, (m) => {
        (section(m, "package").customer_download as Record<string, unknown>).path = forbidden;
      });
      expect(response.status, `${forbidden} must be refused`).toBe(422);
      expect(errorsOf(body)).toContain(CUSTOMER_DOWNLOAD_PATH);
    }
    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
  });

  it("refuses a package that has no customer download entry", async () => {
    const env = await buildTestEnv();
    // A package containing only channel artefacts and a cover — everything a
    // publishing bundle has except the thing a buyer is owed.
    const cover = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const packageBytes = buildZip([
      { name: "media/cover.png", content: cover },
      ...CHANNEL_ARTEFACTS.map((name) => ({ name, content: `internal artefact: ${name}` })),
    ]);
    const hex = async (b: ArrayBuffer | Uint8Array) => {
      const data = b instanceof Uint8Array ? (b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) : b;
      return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
        .map((x) => x.toString(16).padStart(2, "0")).join("");
    };

    const delivery = await buildDelivery((m) => {
      section(m, "package").sha256 = "";
      section(m, "package").byte_size = packageBytes.byteLength;
    });
    section(delivery.manifest, "package").sha256 = await hex(packageBytes);
    (section(delivery.manifest, "package").cover_image as Record<string, unknown>).sha256 = await hex(cover);
    (section(delivery.manifest, "package").cover_image as Record<string, unknown>).byte_size = cover.byteLength;

    const res = await post(env, bridgeRequest({ manifest: delivery.manifest, packageBytes }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(422);
    expect(errorsOf(body)).toContain(CUSTOMER_DOWNLOAD_PATH);
    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
  });

  it("stores the inner customer ZIP and never the outer publishing package", async () => {
    const env = await buildTestEnv();
    const delivery = await buildDelivery();
    const res = await post(env, bridgeRequest(delivery));
    expect(res.status, await res.text().catch(() => "")).toBe(201);

    const downloads = env.SHOP_DOWNLOADS_BUCKET as FakeR2Bucket;
    expect(downloads.keys().length).toBe(1);

    const stored = downloads.bytes(downloads.keys()[0])!;
    const expected = new Uint8Array(delivery.customerDownloadBytes);

    // Byte-for-byte the inner ZIP...
    expect(stored.byteLength).toBe(expected.byteLength);
    expect([...stored]).toEqual([...expected]);
    // ...and emphatically not the outer package.
    expect(stored.byteLength).not.toBe(delivery.packageBytes.byteLength);
  });

  it("stores no channel artefact, brand package, media suite or internal file", async () => {
    const env = await buildTestEnv();
    const res = await post(env, bridgeRequest(await buildDelivery()));
    expect(res.status).toBe(201);

    const everyKey = [
      ...(env.SHOP_DOWNLOADS_BUCKET as FakeR2Bucket).keys(),
      ...(env.SHOP_ASSETS_BUCKET as FakeR2Bucket).keys(),
    ].join(" ").toLowerCase();

    for (const artefact of ["brand", "media_suite", "media-suite", "kdp", "payhip", "gumroad", "all_channels", "internal"]) {
      expect(everyKey, `no stored object may be named for ${artefact}`).not.toContain(artefact);
    }

    // Exactly one deliverable is attached, and it is the customer download.
    const [product] = await listAllProducts(env.SHOP_DB);
    const files = await listProductFiles(env.SHOP_DB, product.id);
    expect(files.length).toBe(1);
    expect(files[0].original_filename).toBe(CUSTOMER_DOWNLOAD_PATH);
    expect(files[0].sanitized_filename).toBe("SFL-HOA-0431-v1.0.zip");
  });
});

// ---------------------------------------------------------------------------
// 6. License mapping
// ---------------------------------------------------------------------------

describe("license types are mapped, never guessed", () => {
  it("maps SINGLE_PURCHASER_BUSINESS_USE to SINGLE_BUSINESS", async () => {
    expect(mapLicenseType("SINGLE_PURCHASER_BUSINESS_USE")).toBe("SINGLE_BUSINESS");

    const env = await buildTestEnv();
    const { response } = await publish(env);
    expect(response.status).toBe(201);

    const [product] = await listAllProducts(env.SHOP_DB);
    expect(product.license_type).toBe("SINGLE_BUSINESS");
  });

  it("refuses every unmapped license type rather than defaulting to one", async () => {
    const env = await buildTestEnv();
    for (const unknownLicense of [
      "MULTI_LOCATION_BUSINESS_USE",
      "AGENCY_RESALE",
      "SINGLE_BUSINESS",          // a Shop-side name is not an HoA name
      "single_purchaser_business_use",
    ]) {
      expect(mapLicenseType(unknownLicense)).toBeNull();
      const { response, body } = await publish(env, (m) => {
        section(m, "product").license_type = unknownLicense;
      });
      expect(response.status, `${unknownLicense} must be refused`).toBe(422);
      expect(errorsOf(body)).toContain("no mapping");
    }
    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Price and currency
// ---------------------------------------------------------------------------

describe("price crosses the boundary as exact integer cents", () => {
  it("converts major currency units to cents without floating-point drift", () => {
    expect(majorUnitsToCents(224)).toBe(22400);
    expect(majorUnitsToCents(224.99)).toBe(22499);
    expect(majorUnitsToCents(19.9)).toBe(1990);
    expect(majorUnitsToCents(1)).toBe(100);

    // Anything with no exact cents representation is refused, not rounded.
    expect(majorUnitsToCents(224.999)).toBeNull();
    expect(majorUnitsToCents(-5)).toBeNull();
    expect(majorUnitsToCents(0)).toBeNull();
    expect(majorUnitsToCents(Number.NaN)).toBeNull();
    expect(majorUnitsToCents(Number.POSITIVE_INFINITY)).toBeNull();
    expect(majorUnitsToCents(1e21)).toBeNull();
    expect(majorUnitsToCents("224")).toBeNull();
  });

  it("publishes 224 USD as 22400 cents and displays it as $224.00", async () => {
    const env = await buildTestEnv();
    const { response, body } = await publish(env);
    expect(response.status).toBe(201);

    const [product] = await listAllProducts(env.SHOP_DB);
    expect(product.price_cents).toBe(22400);
    expect(product.currency).toBe("usd");

    const receipt = body.receipt as Record<string, unknown>;
    expect(receipt.priceCents).toBe(22400);
    expect(receipt.priceDisplay).toBe("$224.00");
  });

  it("refuses a currency the Shop cannot actually sell in", async () => {
    const env = await buildTestEnv();
    for (const currency of ["EUR", "GBP", "XYZ"]) {
      const { response, body } = await publish(env, (m) => { section(m, "pricing").currency = currency; });
      expect(response.status, `${currency} must be refused`).toBe(422);
      expect(errorsOf(body)).toContain("currency");
    }
  });

  it("refuses a price that has no exact cents representation", async () => {
    const env = await buildTestEnv();
    const { response, body } = await publish(env, (m) => { section(m, "pricing").amount = 224.999; });
    expect(response.status).toBe(422);
    expect(errorsOf(body)).toContain("pricing.amount");
    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 8. A successful publication
// ---------------------------------------------------------------------------

describe("an authorized publication becomes a live listing", () => {
  it("publishes the product and returns a complete receipt", async () => {
    const env = await buildTestEnv();
    const { response, body } = await publish(env);

    expect(response.status).toBe(201);
    expect(body.published).toBe(true);
    expect(body.duplicate).toBe(false);

    const receipt = body.receipt as Record<string, unknown>;
    expect(receipt.sku).toBe("SFL-HOA-0431");
    expect(receipt.slug).toBe("operations-readiness-pack");
    expect(receipt.status).toBe("PUBLISHED");
    expect(receipt.productId).toBeTruthy();
    expect(receipt.publicProductUrl).toBe(
      `${env.SHOP_PUBLIC_BASE_URL}/product.html?slug=operations-readiness-pack`,
    );
    expect(typeof receipt.fingerprint).toBe("string");
    expect((receipt.fingerprint as string).length).toBe(64);
    expect(receipt.publishedAt).toBeTruthy();

    const source = receipt.source as Record<string, unknown>;
    expect(source.commercialProductId).toBe("hoa-cp-000431");
    expect(source.commercialProductVersion).toBe("1.0.0");
    expect(source.packageId).toBe("hoa-pkg-000431-a");
  });

  it("sets exactly the three gates the Owner authorized, and nothing about Stripe", async () => {
    const env = await buildTestEnv();
    expect((await publish(env)).response.status).toBe(201);

    const [product] = await listAllProducts(env.SHOP_DB);
    expect(product.status).toBe("PUBLISHED");
    expect(product.price_confirmed).toBe(1);
    expect(product.terms_acknowledged).toBe(1);
    expect(product.publicly_purchasable).toBe(1);
    expect(product.published_at).toBeTruthy();
    // This route does not touch Stripe. Checkout builds its own session from
    // the confirmed price at purchase time.
    expect(product.stripe_product_id).toBeNull();
    expect(product.stripe_price_id).toBeNull();
  });

  it("makes the product visible and buyable through the public storefront API", async () => {
    const env = await buildTestEnv();
    expect((await publish(env)).response.status).toBe(201);

    const list = await post(env, new Request("https://shop-worker.example.workers.dev/shop/products"));
    const catalogue = (await list.json()) as { products: Record<string, unknown>[] };
    const entry = catalogue.products.find((p) => p.slug === "operations-readiness-pack");
    expect(entry).toBeDefined();
    expect(entry!.priceDisplay).toBe("$224.00");
    expect(entry!.coverImageUrl).toBeTruthy();

    const detail = await post(
      env,
      new Request("https://shop-worker.example.workers.dev/shop/products/operations-readiness-pack"),
    );
    const { product } = (await detail.json()) as { product: Record<string, unknown> };
    expect(product.buyable).toBe(true);
    expect(product.licenseType).toBe("SINGLE_BUSINESS");
  });

  it("attaches the cover image and serves it through the Worker, not from R2 directly", async () => {
    const env = await buildTestEnv();
    const { body } = await publish(env);

    const [product] = await listAllProducts(env.SHOP_DB);
    const images = await listProductImages(env.SHOP_DB, product.id);
    expect(images.length).toBe(1);
    expect(images[0].kind).toBe("COVER");

    const coverUrl = (body.receipt as Record<string, string>).coverImageUrl;
    expect(coverUrl).toBe(`${env.SHOP_WORKER_BASE_URL}/shop/asset/${images[0].id}`);

    const asset = await post(env, new Request(coverUrl));
    expect(asset.status).toBe(200);
  });

  it("records the publication and its authorization evidence in the audit log", async () => {
    const env = await buildTestEnv();
    expect((await publish(env)).response.status).toBe(201);

    const log = await listAuditLog(env.SHOP_DB);
    const entry = log.find((e) => e.action === "product.publish.hoa-bridge");
    expect(entry).toBeDefined();

    const details = JSON.parse(entry!.details_json as string) as Record<string, unknown>;
    expect(details.decision).toBe("APPROVE_AND_PUBLISH");
    expect(details.authority).toBe("OWNER");
    expect(details.termsAcknowledgedAt).toBe("2026-08-07T08:55:00Z");
    expect(details.priceApprovedAt).toBe("2026-08-07T08:58:00Z");
    expect(details.priceCents).toBe(22400);
    expect(details.sourceLicenseType).toBe("SINGLE_PURCHASER_BUSINESS_USE");
  });
});

// ---------------------------------------------------------------------------
// 9. Idempotency
// ---------------------------------------------------------------------------

describe("a retried delivery publishes once", () => {
  it("returns the original receipt on a byte-identical replay and creates nothing new", async () => {
    const env = await buildTestEnv();
    const delivery = await buildDelivery();

    const first = await post(env, bridgeRequest(delivery));
    const firstBody = (await first.json()) as Record<string, unknown>;
    expect(first.status).toBe(201);
    expect(firstBody.duplicate).toBe(false);

    const second = await post(env, bridgeRequest(delivery));
    const secondBody = (await second.json()) as Record<string, unknown>;

    expect(second.status).toBe(200);
    expect(secondBody.duplicate).toBe(true);
    // The identical receipt, not a recomputed one — same publication id,
    // same timestamps, same everything.
    expect(secondBody.receipt).toEqual(firstBody.receipt);

    expect((await listAllProducts(env.SHOP_DB)).length).toBe(1);
    expect((env.SHOP_DOWNLOADS_BUCKET as FakeR2Bucket).keys().length).toBe(1);
    expect((env.SHOP_ASSETS_BUCKET as FakeR2Bucket).keys().length).toBe(1);
  });

  it("treats a changed price as a different publication, not a retry", async () => {
    const env = await buildTestEnv();
    const first = await publish(env);
    expect(first.response.status).toBe(201);

    const { response, body } = await publish(env, (m) => {
      section(m, "pricing").amount = 249;
      section(m, "authorization").price_approved_at = "2026-08-08T09:00:00Z";
    });

    expect(response.status).toBe(201);
    expect(body.duplicate).toBe(false);
    expect((body.receipt as Record<string, unknown>).fingerprint)
      .not.toBe((first.body.receipt as Record<string, unknown>).fingerprint);

    // Same commercial product, so it updates the one listing rather than
    // creating a second one at a different price.
    const products = await listAllProducts(env.SHOP_DB);
    expect(products.length).toBe(1);
    expect(products[0].price_cents).toBe(24900);
  });

  it("treats changed package bytes as a different publication", async () => {
    const env = await buildTestEnv();
    const first = await publish(env);
    expect(first.response.status).toBe(201);

    // A genuinely different package: an extra entry changes the outer digest.
    const changed = await buildDelivery(() => {}, {
      extraEntries: [{ name: "media/preview.png", content: "a second image" }],
    });
    (changed.manifest.package as Record<string, unknown>).package_id = "hoa-pkg-000431-b";
    const res = await post(env, bridgeRequest(changed));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    expect(body.duplicate).toBe(false);
    expect((body.receipt as Record<string, unknown>).fingerprint)
      .not.toBe((first.body.receipt as Record<string, unknown>).fingerprint);
  });

  it("replaces the previous customer download rather than stacking a second one", async () => {
    const env = await buildTestEnv();
    expect((await publish(env)).response.status).toBe(201);

    const changed = await buildDelivery(() => {}, {
      extraEntries: [{ name: "media/preview.png", content: "a second image" }],
    });
    (changed.manifest.package as Record<string, unknown>).package_id = "hoa-pkg-000431-b";
    expect((await post(env, bridgeRequest(changed))).status).toBe(201);

    const [product] = await listAllProducts(env.SHOP_DB);
    const files = await listProductFiles(env.SHOP_DB, product.id);
    expect(files.length).toBe(1);
    expect((env.SHOP_DOWNLOADS_BUCKET as FakeR2Bucket).keys().length).toBe(1);
    expect((await listProductImages(env.SHOP_DB, product.id)).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 10. Collisions with products the bridge does not own
// ---------------------------------------------------------------------------

describe("the bridge cannot take over a listing it did not create", () => {
  it("refuses when the SKU already belongs to a product from elsewhere", async () => {
    const env = await buildTestEnv();
    await env.SHOP_DB.prepare(
      `INSERT INTO products (id, sku, slug, title, status, created_at, updated_at)
       VALUES ('p-hand','SFL-HOA-0431','hand-built','Hand Built','PUBLISHED',
               '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
    ).run();

    const { response, body } = await publish(env);
    expect(response.status).toBe(409);
    expect(errorsOf(body)).toContain("SFL-HOA-0431");

    const [product] = await listAllProducts(env.SHOP_DB);
    expect(product.title).toBe("Hand Built");
    expect((env.SHOP_DOWNLOADS_BUCKET as FakeR2Bucket).keys()).toEqual([]);
  });

  it("refuses when the slug is already used by another product", async () => {
    const env = await buildTestEnv();
    await env.SHOP_DB.prepare(
      `INSERT INTO products (id, sku, slug, title, status, created_at, updated_at)
       VALUES ('p-other','SFL-OTHER-001','operations-readiness-pack','Someone Else','DRAFT',
               '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
    ).run();

    const { response, body } = await publish(env);
    expect(response.status).toBe(409);
    expect(errorsOf(body)).toContain("operations-readiness-pack");
    expect((await listAllProducts(env.SHOP_DB)).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 11. Failed publications leave nothing behind
// ---------------------------------------------------------------------------

describe("a refused publication is a no-op", () => {
  it("unwinds every write when the deliverable cannot be stored", async () => {
    const env = await buildTestEnv();
    (env.SHOP_DOWNLOADS_BUCKET as unknown as { put: () => Promise<never> }).put = async () => {
      throw new Error("simulated R2 outage");
    };

    const { response } = await publish(env);
    expect(response.status).toBe(502);
    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
    expect((env.SHOP_ASSETS_BUCKET as FakeR2Bucket).keys()).toEqual([]);
  });

  it("unwinds every write when the cover cannot be stored", async () => {
    const env = await buildTestEnv();
    (env.SHOP_ASSETS_BUCKET as unknown as { put: () => Promise<never> }).put = async () => {
      throw new Error("simulated R2 outage");
    };

    const { response } = await publish(env);
    expect(response.status).toBe(502);
    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
    expect((env.SHOP_DOWNLOADS_BUCKET as FakeR2Bucket).keys()).toEqual([]);
  });

  it("refuses a delivery that is missing the manifest or the package entirely", async () => {
    const env = await buildTestEnv();
    const delivery = await buildDelivery();

    const noManifest = new FormData();
    noManifest.set("package", new File([delivery.packageBytes], "publication.zip", { type: "application/zip" }));
    const a = await post(env, new Request(BRIDGE_URL, {
      method: "POST", body: noManifest, headers: { Authorization: `Bearer ${TEST_HOA_BRIDGE_TOKEN}` },
    }));
    expect(a.status).toBe(400);

    const noPackage = new FormData();
    noPackage.set("manifest", JSON.stringify(delivery.manifest));
    const b = await post(env, new Request(BRIDGE_URL, {
      method: "POST", body: noPackage, headers: { Authorization: `Bearer ${TEST_HOA_BRIDGE_TOKEN}` },
    }));
    expect(b.status).toBe(400);

    const badJson = await post(env, bridgeRequest(delivery, { manifestText: "{not json" }));
    expect(badJson.status).toBe(400);

    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 12. The receipt reveals nothing private
// ---------------------------------------------------------------------------

describe("the receipt exposes no storage detail", () => {
  it("names no R2 key, bucket, Access configuration or Stripe identifier", async () => {
    const env = await buildTestEnv();
    const { response } = await publish(env);
    expect(response.status).toBe(201);

    // Re-run to capture the raw body text rather than the parsed object.
    const env2 = await buildTestEnv();
    const raw = await (await post(env2, bridgeRequest(await buildDelivery()))).text();

    for (const leak of [
      "SHOP_DOWNLOADS_BUCKET", "SHOP_ASSETS_BUCKET", "r2_key", "products/",
      "cloudflareaccess", "CF_ACCESS", "sk_test", "whsec_", "pages.dev",
      TEST_HOA_BRIDGE_TOKEN,
    ]) {
      expect(raw, `the receipt must not contain ${leak}`).not.toContain(leak);
    }
  });

  it("keeps the House of Assets linkage out of every public response", async () => {
    const env = await buildTestEnv();
    expect((await publish(env)).response.status).toBe(201);

    for (const path of ["/shop/products", "/shop/products/operations-readiness-pack"]) {
      const raw = await (await post(env, new Request(`https://shop-worker.example.workers.dev${path}`))).text();
      for (const leak of ["hoa-cp-000431", "hoa-pkg-000431-a", "HOUSE_OF_ASSETS", "fingerprint", "SINGLE_PURCHASER"]) {
        expect(raw, `${path} must not expose ${leak}`).not.toContain(leak);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 13. The route is a receiver, not a publisher of anything else
// ---------------------------------------------------------------------------

describe("the bridge publishes exactly one product", () => {
  it("leaves every other product's status untouched", async () => {
    const env = await buildTestEnv();
    await env.SHOP_DB.prepare(
      `INSERT INTO products (id, sku, slug, title, status, created_at, updated_at)
       VALUES ('p-draft','SFL-DRAFT-900','a-waiting-draft','A Waiting Draft','DRAFT',
               '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
    ).run();

    expect((await publish(env)).response.status).toBe(201);

    const products = await listAllProducts(env.SHOP_DB);
    expect(products.length).toBe(2);
    expect(products.find((p) => p.id === "p-draft")!.status).toBe("DRAFT");
    expect(products.find((p) => p.sku === "SFL-HOA-0431")!.status).toBe("PUBLISHED");
  });

  it("accepts only POST", async () => {
    const env = await buildTestEnv();
    for (const method of ["GET", "PUT", "DELETE"]) {
      const res = await post(env, new Request(BRIDGE_URL, {
        method, headers: { Authorization: `Bearer ${TEST_HOA_BRIDGE_TOKEN}` },
      }));
      expect(res.status, `${method} must not be routed`).toBe(404);
    }
  });

  it("still refuses a package whose customer download is not a usable deliverable", async () => {
    // An empty inner ZIP has no bytes to sell.
    const env = await buildTestEnv();
    const empty = new Uint8Array(0);
    const hex = async (b: ArrayBuffer | Uint8Array) => {
      const data = b instanceof Uint8Array ? (b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) : b;
      return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
        .map((x) => x.toString(16).padStart(2, "0")).join("");
    };
    const cover = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);
    const packageBytes = buildZip([
      { name: CUSTOMER_DOWNLOAD_PATH, content: empty },
      { name: "media/cover.png", content: cover },
    ]);

    const delivery = await buildDelivery();
    const pkg = section(delivery.manifest, "package");
    pkg.sha256 = await hex(packageBytes);
    pkg.byte_size = packageBytes.byteLength;
    (pkg.customer_download as Record<string, unknown>).sha256 = await hex(empty);
    (pkg.customer_download as Record<string, unknown>).byte_size = 0;
    (pkg.cover_image as Record<string, unknown>).sha256 = await hex(cover);
    (pkg.cover_image as Record<string, unknown>).byte_size = cover.byteLength;

    const res = await post(env, bridgeRequest({ manifest: delivery.manifest, packageBytes }));
    expect(res.status).toBe(422);
    expect((await listAllProducts(env.SHOP_DB)).length).toBe(0);
  });

  it("sanity: the fixture's customer ZIP really is a smaller, different archive", async () => {
    const inner = customerDownloadZip();
    const delivery = await buildDelivery();
    expect(inner.byteLength).toBeLessThan(delivery.packageBytes.byteLength);
  });
});
