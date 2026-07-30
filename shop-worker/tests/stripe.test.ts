import { describe, expect, it } from "vitest";
import { parseStripeEvent, parseStripeSignatureHeader, verifyStripeWebhookSignature } from "../src/lib/stripe";

const SECRET = "whsec_test_secret_for_unit_tests";

async function signPayload(secret: string, timestamp: number, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("parseStripeSignatureHeader", () => {
  it("parses a well-formed header", () => {
    const parsed = parseStripeSignatureHeader("t=1700000000,v1=abc123,v1=def456");
    expect(parsed).toEqual({ timestamp: 1700000000, v1Signatures: ["abc123", "def456"] });
  });

  it("returns null when timestamp is missing", () => {
    expect(parseStripeSignatureHeader("v1=abc123")).toBeNull();
  });

  it("returns null when no v1 signature is present", () => {
    expect(parseStripeSignatureHeader("t=1700000000,v0=abc123")).toBeNull();
  });
});

describe("verifyStripeWebhookSignature — webhook signature rejection / acceptance", () => {
  const payload = JSON.stringify({ id: "evt_test_1", type: "checkout.session.completed", data: { object: { id: "cs_test_1" } } });

  it("accepts a correctly signed payload within the tolerance window", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sig = await signPayload(SECRET, now, payload);
    const header = `t=${now},v1=${sig}`;
    const result = await verifyStripeWebhookSignature(payload, header, SECRET, now);
    expect(result.valid).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sig = await signPayload("whsec_a_completely_different_secret", now, payload);
    const header = `t=${now},v1=${sig}`;
    const result = await verifyStripeWebhookSignature(payload, header, SECRET, now);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects a payload that was tampered with after signing", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sig = await signPayload(SECRET, now, payload);
    const header = `t=${now},v1=${sig}`;
    const tamperedPayload = payload.replace("cs_test_1", "cs_test_HACKED");
    const result = await verifyStripeWebhookSignature(tamperedPayload, header, SECRET, now);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects when the signature header is missing", async () => {
    const result = await verifyStripeWebhookSignature(payload, null, SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("missing_signature_header");
  });

  it("rejects when the webhook secret is not configured", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sig = await signPayload(SECRET, now, payload);
    const result = await verifyStripeWebhookSignature(payload, `t=${now},v1=${sig}`, "");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("webhook_secret_not_configured");
  });

  it("rejects a timestamp outside the tolerance window (replay protection)", async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 10 * 60; // 10 minutes old
    const sig = await signPayload(SECRET, staleTimestamp, payload);
    const header = `t=${staleTimestamp},v1=${sig}`;
    const result = await verifyStripeWebhookSignature(payload, header, SECRET, Math.floor(Date.now() / 1000));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("timestamp_outside_tolerance");
  });

  it("accepts when at least one of multiple v1 signatures matches (secret rotation)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const goodSig = await signPayload(SECRET, now, payload);
    const header = `t=${now},v1=deadbeef,v1=${goodSig}`;
    const result = await verifyStripeWebhookSignature(payload, header, SECRET, now);
    expect(result.valid).toBe(true);
  });
});

describe("parseStripeEvent", () => {
  it("parses a well-formed JSON event", () => {
    const event = parseStripeEvent('{"id":"evt_1","type":"checkout.session.completed","data":{"object":{}}}');
    expect(event.id).toBe("evt_1");
    expect(event.type).toBe("checkout.session.completed");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseStripeEvent("not json")).toThrow();
  });
});
