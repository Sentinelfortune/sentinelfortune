import { describe, expect, it } from "vitest";
import { createTestD1 } from "./helpers/d1-sqlite-adapter";
import {
  getProductBySlug,
  insertProduct,
  listPublishedProducts,
  markStripeEventProcessed,
  recordStripeEventIfNew,
} from "../src/lib/db";
import type { ProductRow } from "../src/types";

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  const now = "2026-07-27T00:00:00.000Z";
  return {
    id: overrides.id ?? crypto.randomUUID(),
    sku: overrides.sku ?? `SFL-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    slug: overrides.slug ?? `test-product-${Math.random().toString(36).slice(2, 8)}`,
    title: "Test Product",
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

describe("products — published listing / draft exclusion", () => {
  it("returns only PUBLISHED products from listPublishedProducts", async () => {
    const db = await createTestD1(false);

    await insertProduct(db, makeProduct({ slug: "draft-one", status: "DRAFT" }));
    await insertProduct(db, makeProduct({ slug: "published-one", status: "PUBLISHED", published_at: "2026-07-01T00:00:00.000Z" }));
    await insertProduct(db, makeProduct({ slug: "archived-one", status: "ARCHIVED" }));
    await insertProduct(db, makeProduct({ slug: "unpublished-one", status: "UNPUBLISHED" }));

    const published = await listPublishedProducts(db);

    expect(published).toHaveLength(1);
    expect(published[0].slug).toBe("published-one");
  });

  it("the seeded first product (DRAFT) is excluded from the public catalog", async () => {
    const db = await createTestD1(true); // applies 0002 seed

    const published = await listPublishedProducts(db);
    expect(published.find((p) => p.slug === "ai-operations-playbook-toolkit")).toBeUndefined();

    const draft = await getProductBySlug(db, "ai-operations-playbook-toolkit");
    expect(draft).not.toBeNull();
    expect(draft!.status).toBe("DRAFT");
    expect(draft!.price_cents).toBeNull();
    expect(draft!.price_confirmed).toBe(0);
  });

  it("enforces unique slugs (DB-level constraint)", async () => {
    const db = await createTestD1(false);
    await insertProduct(db, makeProduct({ slug: "duplicate-slug", sku: "SFL-A-001" }));
    await expect(insertProduct(db, makeProduct({ slug: "duplicate-slug", sku: "SFL-B-002" }))).rejects.toThrow();
  });

  it("enforces unique SKUs (DB-level constraint)", async () => {
    const db = await createTestD1(false);
    await insertProduct(db, makeProduct({ slug: "slug-a", sku: "SFL-DUP-001" }));
    await expect(insertProduct(db, makeProduct({ slug: "slug-b", sku: "SFL-DUP-001" }))).rejects.toThrow();
  });
});

describe("stripe_events — webhook idempotency ledger", () => {
  it("records a new event and returns true", async () => {
    const db = await createTestD1(false);
    const isNew = await recordStripeEventIfNew(db, {
      id: crypto.randomUUID(),
      stripe_event_id: "evt_test_1",
      type: "checkout.session.completed",
      payload_json: "{}",
      received_at: new Date().toISOString(),
    });
    expect(isNew).toBe(true);
  });

  it("returns false for a duplicate Stripe event id (idempotency)", async () => {
    const db = await createTestD1(false);
    const eventRow = {
      id: crypto.randomUUID(),
      stripe_event_id: "evt_test_duplicate",
      type: "checkout.session.completed",
      payload_json: "{}",
      received_at: new Date().toISOString(),
    };

    const first = await recordStripeEventIfNew(db, eventRow);
    const second = await recordStripeEventIfNew(db, { ...eventRow, id: crypto.randomUUID() });

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("markStripeEventProcessed does not affect idempotency of a still-duplicate id", async () => {
    const db = await createTestD1(false);
    const stripeEventId = "evt_test_2";

    await recordStripeEventIfNew(db, { id: crypto.randomUUID(), stripe_event_id: stripeEventId, type: "x", payload_json: "{}", received_at: new Date().toISOString() });
    await markStripeEventProcessed(db, stripeEventId, new Date().toISOString());

    const secondAttempt = await recordStripeEventIfNew(db, { id: crypto.randomUUID(), stripe_event_id: stripeEventId, type: "x", payload_json: "{}", received_at: new Date().toISOString() });
    expect(secondAttempt).toBe(false);
  });
});
