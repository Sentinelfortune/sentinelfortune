import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleStripeWebhook } from "../src/routes/webhook";
import { getLicenseByOrderId, getOrderBySessionId, insertProduct, listOrders } from "../src/lib/db";
import { buildTestEnv, TEST_STRIPE_WEBHOOK_SECRET } from "./helpers/testEnv";
import type { ProductRow } from "../src/types";

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  const now = "2026-07-27T00:00:00.000Z";
  return {
    id: "prod_test_001",
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
    supported_formats: "PDF, DOCX",
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

async function signPayload(secret: string, timestamp: number, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signedWebhookRequest(payload: string, secret = TEST_STRIPE_WEBHOOK_SECRET): Promise<Request> {
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = await signPayload(secret, timestamp, payload);
  return new Request("https://shop-worker.example.workers.dev/shop/stripe/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${timestamp},v1=${sig}` },
    body: payload,
  });
}

function checkoutCompletedEvent(eventId: string, sessionId: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        payment_intent: `pi_${sessionId}`,
        payment_status: "paid",
        amount_total: 4900,
        currency: "usd",
        customer_details: { email: "buyer@example.com", name: "Jordan Buyer" },
        metadata: { product_id: "prod_test_001", product_slug: "ai-operations-playbook-toolkit" },
        ...overrides,
      },
    },
  });
}

describe("POST /shop/stripe/webhook", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "email_test_123" }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a request with an invalid signature — webhook signature rejection", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeProduct());

    const payload = checkoutCompletedEvent("evt_bad_sig", "cs_bad_sig");
    const request = new Request("https://shop-worker.example.workers.dev/shop/stripe/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=deadbeef" },
      body: payload,
    });

    const response = await handleStripeWebhook(request, env);
    expect(response.status).toBe(400);

    const order = await getOrderBySessionId(env.SHOP_DB, "cs_bad_sig");
    expect(order).toBeNull();
  });

  it("creates an order, license, and download authorization on a valid paid checkout.session.completed — successful order creation / license creation / download authorization", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeProduct());

    const payload = checkoutCompletedEvent("evt_success_1", "cs_success_1");
    const request = await signedWebhookRequest(payload);

    const response = await handleStripeWebhook(request, env);
    expect(response.status).toBe(200);

    const order = await getOrderBySessionId(env.SHOP_DB, "cs_success_1");
    expect(order).not.toBeNull();
    expect(order!.status).toBe("PAID");
    expect(order!.amount_cents).toBe(4900);

    const license = await getLicenseByOrderId(env.SHOP_DB, order!.id);
    expect(license).not.toBeNull();
    expect(license!.status).toBe("ACTIVE");
    expect(license!.license_type).toBe("SINGLE_BUSINESS");
    expect(license!.license_number).toMatch(/^SFL-LIC-\d{8}-[A-Z0-9]{6}$/);

    // Confirmation + delivery emails were sent via Resend.
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT create an order for a session with payment_status != paid — failed payment rejection", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeProduct());

    const payload = checkoutCompletedEvent("evt_unpaid_1", "cs_unpaid_1", { payment_status: "unpaid" });
    const request = await signedWebhookRequest(payload);

    const response = await handleStripeWebhook(request, env);
    expect(response.status).toBe(200); // Stripe still gets a 200 — we just don't fulfill.

    const order = await getOrderBySessionId(env.SHOP_DB, "cs_unpaid_1");
    expect(order).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is idempotent — the same Stripe event id delivered twice creates exactly one order", async () => {
    const env = await buildTestEnv();
    await insertProduct(env.SHOP_DB, makeProduct());

    const payload = checkoutCompletedEvent("evt_dup_1", "cs_dup_1");

    const first = await handleStripeWebhook(await signedWebhookRequest(payload), env);
    expect(first.status).toBe(200);

    const second = await handleStripeWebhook(await signedWebhookRequest(payload), env);
    expect(second.status).toBe(200);

    const allOrders = await listOrders(env.SHOP_DB);
    expect(allOrders.filter((o) => o.stripe_checkout_session_id === "cs_dup_1")).toHaveLength(1);

    // Only the first delivery should have triggered emails.
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("skips fulfillment gracefully when metadata.product_id references a product that no longer exists", async () => {
    const env = await buildTestEnv();
    // No product inserted at all.
    const payload = checkoutCompletedEvent("evt_missing_product", "cs_missing_product");
    const request = await signedWebhookRequest(payload);

    const response = await handleStripeWebhook(request, env);
    expect(response.status).toBe(200);

    const order = await getOrderBySessionId(env.SHOP_DB, "cs_missing_product");
    expect(order).toBeNull();
  });
});
