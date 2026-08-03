// GET /shop/order/status — post-checkout delivery for the buyer's browser.
//
// Drives the real webhook first so the order, license and download
// authorization come from the actual fulfilment path, then checks what the
// success page is allowed to collect. Also asserts the negative cases: nothing
// is released for an unknown session, an unpaid order, a refunded order, or a
// revoked license, and the mint cap holds.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleOrderStatus, MAX_AUTHORIZATIONS_PER_LICENSE, isValidCheckoutSessionId } from "../src/routes/order-status";
import { handleStripeWebhook } from "../src/routes/webhook";
import { handleDownload } from "../src/routes/download";
import {
  getLicenseByOrderId,
  getOrderBySessionId,
  insertProduct,
  insertProductFile,
  revokeLicense,
} from "../src/lib/db";
import { buildTestEnv, TEST_STRIPE_WEBHOOK_SECRET } from "./helpers/testEnv";
import type { Env, ProductRow } from "../src/types";

const SESSION_ID = "cs_test_orderstatus_0000000001";
const PRODUCT_ID = "prod_status_test";
const FILE_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  const now = "2026-07-31T00:00:00.000Z";
  return {
    id: PRODUCT_ID,
    sku: "SFL-E2E-001",
    slug: "end-to-end-test-product",
    title: "Sentinel Fortune Digital Shop End-to-End Test Product",
    short_description: "Test-only product.",
    problem_solved: "",
    description: "",
    category: "Test",
    audience: "Internal",
    edition: "Test",
    version: "1.0",
    status: "PUBLISHED",
    price_cents: 500,
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
    refund_policy_summary: "Test refund policy",
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
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signedWebhook(payload: string): Promise<Request> {
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = await signPayload(TEST_STRIPE_WEBHOOK_SECRET, timestamp, payload);
  return new Request("https://shop-worker.example.workers.dev/shop/stripe/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${timestamp},v1=${sig}` },
    body: payload,
  });
}

function checkoutCompleted(eventId: string, sessionId: string): string {
  return JSON.stringify({
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        payment_intent: `pi_${sessionId}`,
        payment_status: "paid",
        amount_total: 500,
        currency: "usd",
        customer_details: { email: "buyer@example.com", name: "Test Buyer" },
        metadata: { product_id: PRODUCT_ID, product_slug: "end-to-end-test-product" },
      },
    },
  });
}

function refundedCharge(eventId: string, sessionId: string): string {
  return JSON.stringify({
    id: eventId,
    type: "charge.refunded",
    data: { object: { id: `ch_${sessionId}`, payment_intent: `pi_${sessionId}`, amount_refunded: 500 } },
  });
}

function statusRequest(sessionId: string): Request {
  return new Request(`https://shop-worker.example.workers.dev/shop/order/status?session_id=${encodeURIComponent(sessionId)}`);
}

/** Seeds a product with one downloadable file, then completes a real purchase. */
async function purchasedEnv(): Promise<Env> {
  const env = await buildTestEnv();
  await insertProduct(env.SHOP_DB, makeProduct());
  await env.SHOP_DOWNLOADS_BUCKET.put(`products/${PRODUCT_ID}/files/test.pdf`, FILE_BYTES.buffer);
  await insertProductFile(env.SHOP_DB, {
    id: "file_status_test",
    product_id: PRODUCT_ID,
    r2_key: `products/${PRODUCT_ID}/files/test.pdf`,
    original_filename: "test.pdf",
    sanitized_filename: "test.pdf",
    content_type: "application/pdf",
    size_bytes: FILE_BYTES.length,
    position: 0,
    created_at: "2026-07-31T00:00:00.000Z",
  });
  const response = await handleStripeWebhook(await signedWebhook(checkoutCompleted("evt_status_1", SESSION_ID)), env);
  expect(response.status).toBe(200);
  return env;
}

beforeEach(() => {
  // Resend is called during fulfilment; keep it offline and deterministic.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "email_test" }), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /shop/order/status — delivery to the buyer's browser", () => {
  it("returns the order, license and a working download link after a paid checkout", async () => {
    const env = await purchasedEnv();

    const response = await handleOrderStatus(statusRequest(SESSION_ID), env);
    const body = (await response.json()) as Record<string, string>;

    expect(response.status).toBe(200);
    expect(body.status).toBe("PAID");
    expect(body.orderNumber).toMatch(/^SFL-ORD-/);
    expect(body.licenseNumber).toMatch(/^SFL-LIC-/);
    expect(body.amountDisplay).toBe("$5.00");
    expect(body.downloadUrl).toContain("/shop/download/");

    // The link it hands out must actually work.
    const token = body.downloadUrl.split("/shop/download/")[1];
    const download = await handleDownload(new Request(`https://w.example/shop/download/${token}`), env, { token });
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(FILE_BYTES);
  });

  it("does not leak the customer email or Stripe identifiers", async () => {
    const env = await purchasedEnv();

    const text = await (await handleOrderStatus(statusRequest(SESSION_ID), env)).text();

    expect(text).not.toContain("buyer@example.com");
    expect(text).not.toContain("pi_cs_test");
  });

  it("reports PENDING for a session that has no order yet, releasing nothing", async () => {
    const env = await buildTestEnv();

    const body = (await (await handleOrderStatus(statusRequest("cs_test_never_seen_00001"), env)).json()) as Record<string, unknown>;

    expect(body.status).toBe("PENDING");
    expect(body.downloadUrl).toBeUndefined();
    expect(body.licenseNumber).toBeUndefined();
  });

  it("rejects a malformed session_id", async () => {
    const env = await buildTestEnv();

    for (const bad of ["", "../../etc/passwd", "sess_123", "cs_", "'; DROP TABLE orders;--"]) {
      const response = await handleOrderStatus(statusRequest(bad), env);
      expect(response.status).toBe(400);
    }
  });

  it("withdraws access after a refund and issues no further links", async () => {
    const env = await purchasedEnv();

    const refund = await handleStripeWebhook(await signedWebhook(refundedCharge("evt_status_2", SESSION_ID)), env);
    expect(refund.status).toBe(200);

    const body = (await (await handleOrderStatus(statusRequest(SESSION_ID), env)).json()) as Record<string, unknown>;

    expect(body.status).toBe("REFUNDED");
    expect(body.downloadUrl).toBeUndefined();
  });

  it("issues no link when the license has been revoked by the Owner", async () => {
    const env = await purchasedEnv();
    const order = await getOrderBySessionId(env.SHOP_DB, SESSION_ID);
    const license = await getLicenseByOrderId(env.SHOP_DB, order!.id);
    await revokeLicense(env.SHOP_DB, license!.id, new Date().toISOString());

    const body = (await (await handleOrderStatus(statusRequest(SESSION_ID), env)).json()) as Record<string, unknown>;

    expect(body.status).toBe("PAID");
    expect(body.downloadUrl).toBeNull();
  });

  it("caps how many download authorizations one order can mint", async () => {
    const env = await purchasedEnv();

    let lastBody: Record<string, unknown> = {};
    for (let i = 0; i < MAX_AUTHORIZATIONS_PER_LICENSE + 2; i++) {
      lastBody = (await (await handleOrderStatus(statusRequest(SESSION_ID), env)).json()) as Record<string, unknown>;
    }

    expect(lastBody.status).toBe("PAID");
    expect(lastBody.downloadUrl).toBeNull();
    expect(String(lastBody.message)).toContain("limit reached");
  });
});

describe("isValidCheckoutSessionId", () => {
  it("accepts Stripe-shaped ids and rejects everything else", () => {
    expect(isValidCheckoutSessionId("cs_test_a1b2c3d4e5f6")).toBe(true);
    expect(isValidCheckoutSessionId("cs_live_a1b2c3d4e5f6")).toBe(true);
    expect(isValidCheckoutSessionId("cs_short")).toBe(false);
    expect(isValidCheckoutSessionId("pi_test_a1b2c3d4e5f6")).toBe(false);
    expect(isValidCheckoutSessionId("cs_test_../../secret")).toBe(false);
    expect(isValidCheckoutSessionId(null)).toBe(false);
    expect(isValidCheckoutSessionId(42)).toBe(false);
  });
});
