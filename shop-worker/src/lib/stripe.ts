// Minimal Stripe client implemented with raw `fetch` calls against the
// Stripe REST API — deliberately not using the `stripe` npm package, so the
// Shop Worker has zero third-party runtime dependencies. This keeps the
// Worker small, avoids Node-compatibility questions in the Workers runtime,
// and makes every request/response explicit and easy to audit.
//
// Only the two operations the Shop needs are implemented: creating a
// Checkout Session, and verifying + parsing an incoming webhook event.

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2024-06-20";

export interface CreateCheckoutSessionInput {
  secretKey: string;
  productTitle: string;
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata: Record<string, string>;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
}

function encodeFormBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<StripeCheckoutSession> {
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": input.currency,
    "line_items[0][price_data][unit_amount]": String(input.amountCents),
    "line_items[0][price_data][product_data][name]": input.productTitle,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "payment_intent_data[description]": `${input.productTitle} — Sentinel Fortune LLC Digital Shop`,
  };

  if (input.customerEmail) {
    params.customer_email = input.customerEmail;
  }

  for (const [key, value] of Object.entries(input.metadata)) {
    params[`metadata[${key}]`] = value;
  }

  const res = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
    },
    body: encodeFormBody(params),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Stripe checkout session creation failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { id: string; url: string | null };
  if (!data.url) throw new Error("Stripe returned a checkout session with no URL.");
  return { id: data.id, url: data.url };
}

// ---------------------------------------------------------------------------
// Webhook signature verification
//
// Reimplements Stripe's documented signing scheme:
//   signed_payload = "{timestamp}.{raw_body}"
//   expected_v1    = HMAC-SHA256(webhook_secret, signed_payload) as hex
// The header format is: "t=<timestamp>,v1=<sig>[,v1=<sig>...][,v0=<sig>]"
// Multiple v1 values can appear during secret rotation — any match is valid.
// ---------------------------------------------------------------------------

export interface ParsedStripeSignatureHeader {
  timestamp: number;
  v1Signatures: string[];
}

export function parseStripeSignatureHeader(header: string): ParsedStripeSignatureHeader | null {
  const parts = header.split(",").map((p) => p.trim());
  let timestamp: number | null = null;
  const v1Signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") timestamp = Number(value);
    if (key === "v1" && value) v1Signatures.push(value);
  }

  if (timestamp === null || Number.isNaN(timestamp) || v1Signatures.length === 0) return null;
  return { timestamp, v1Signatures };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export interface VerifyWebhookResult {
  valid: boolean;
  reason?: string;
}

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verifies a raw Stripe webhook request body against the signature header.
 * `nowSeconds` is injected for deterministic testing of the timestamp
 * tolerance window.
 */
export async function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): Promise<VerifyWebhookResult> {
  if (!signatureHeader) return { valid: false, reason: "missing_signature_header" };
  if (!webhookSecret) return { valid: false, reason: "webhook_secret_not_configured" };

  const parsed = parseStripeSignatureHeader(signatureHeader);
  if (!parsed) return { valid: false, reason: "malformed_signature_header" };

  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    return { valid: false, reason: "timestamp_outside_tolerance" };
  }

  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expected = await hmacSha256Hex(webhookSecret, signedPayload);

  const matched = parsed.v1Signatures.some((sig) => constantTimeEqual(sig, expected));
  return matched ? { valid: true } : { valid: false, reason: "signature_mismatch" };
}

// ---------------------------------------------------------------------------
// Minimal shape of the checkout.session.completed event payload we rely on.
// Intentionally not a full Stripe type — only the fields this Worker reads.
// ---------------------------------------------------------------------------

export interface StripeCheckoutSessionCompletedObject {
  id: string;
  payment_intent: string | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number | null;
  currency: string | null;
  customer_details: { email: string | null; name: string | null } | null;
  metadata: Record<string, string> | null;
}

export interface StripeChargeRefundedObject {
  id: string;
  payment_intent: string | null;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export function parseStripeEvent(rawBody: string): StripeWebhookEvent {
  return JSON.parse(rawBody) as StripeWebhookEvent;
}
