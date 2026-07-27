import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleCreateCheckout } from "../src/routes/checkout";
import { insertProduct } from "../src/lib/db";
import { __resetRateLimitBucketsForTests } from "../src/lib/ratelimit";
import { buildTestEnv } from "./helpers/testEnv";
import type { ProductRow } from "../src/types";

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  const now = "2026-07-27T00:00:00.000Z";
  return {
    id: crypto.randomUUID(),
    sku: "SFL-AIOPS-001",
    slug: "ai-operations-playbook-toolkit",
    title: "AI Operations Playbook & Toolkit",
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
    supported_formats: "",
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
    max_downloads: 5,
    created_at: now,
    updated_at: now,
    published_at: now,
    ...overrides,
  };
}

function checkoutRequest(body: unknown, ip = "203.0.113.1"): Request {
  return new Request("https://shop-worker.example.workers.dev/shop/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /shop/checkout — server-authoritative pricing", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetRateLimitBucketsForTests();
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      return new Response(JSON.stringify({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a checkout session using the price stored in D1, ignoring anything the browser might have sent", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeProduct());

    // The browser sends only the slug — no price, no amount, nothing else trusted.
    const request = checkoutRequest({ slug: "ai-operations-playbook-toolkit", priceCents: 1 /* must be ignored if even parsed */ });
    const response = await handleCreateCheckout(request, env);
    const body = (await response.json()) as { ok: boolean; checkoutUrl: string };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_123");

    // Inspect exactly what was sent to Stripe's API.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    const sentBody = String(init.body);
    // 4900 cents ($49.00) came from the D1 product row, never from the request.
    expect(sentBody).toContain("unit_amount%5D=4900");
    expect(sentBody).not.toContain("unit_amount%5D=1");
  });

  it("rejects checkout for an unknown product slug", async () => {
    const env = await buildTestEnv();
    const request = checkoutRequest({ slug: "does-not-exist" });
    const response = await handleCreateCheckout(request, env);
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects checkout for a product whose price is not yet confirmed", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeProduct({ slug: "unconfirmed-price", sku: "SFL-UNCONF-001", price_confirmed: 0 }));

    const request = checkoutRequest({ slug: "unconfirmed-price" });
    const response = await handleCreateCheckout(request, env);
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects checkout for a DRAFT product (not yet published)", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeProduct({ slug: "still-draft", sku: "SFL-DRAFT-001", status: "DRAFT" }));

    const request = checkoutRequest({ slug: "still-draft" });
    const response = await handleCreateCheckout(request, env);
    expect(response.status).toBe(404);
  });

  it("rejects a missing slug", async () => {
    const env = await buildTestEnv();
    const request = checkoutRequest({});
    const response = await handleCreateCheckout(request, env);
    expect(response.status).toBe(400);
  });
});
