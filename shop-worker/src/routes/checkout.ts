import type { Env } from "../types";
import { getProductBySlug } from "../lib/db";
import { createCheckoutSession } from "../lib/stripe";
import { genericError, jsonResponse, safeServerError } from "../lib/http";
import { checkRateLimit, hashIp } from "../lib/ratelimit";

interface CheckoutRequestBody {
  slug?: unknown;
}

const CHECKOUT_RATE_LIMIT = 10;
const CHECKOUT_RATE_WINDOW_MS = 5 * 60 * 1000;

/**
 * POST /shop/checkout
 *
 * The browser sends only { slug }. Every other value that matters for the
 * charge — price, currency, title, purchasability — is loaded fresh from D1
 * here, server-side. Nothing about price or "already paid" is ever accepted
 * from the client.
 */
export async function handleCreateCheckout(request: Request, env: Env): Promise<Response> {
  try {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const rateKey = `checkout:${await hashIp(ip)}`;
    const rate = checkRateLimit(rateKey, CHECKOUT_RATE_LIMIT, CHECKOUT_RATE_WINDOW_MS);
    if (!rate.allowed) {
      return genericError(429, "Too many checkout attempts. Please try again shortly.");
    }

    let body: CheckoutRequestBody;
    try {
      body = (await request.json()) as CheckoutRequestBody;
    } catch {
      return genericError(400, "Invalid request body.");
    }

    if (typeof body.slug !== "string" || body.slug.length === 0) {
      return genericError(400, "A product slug is required.");
    }

    const product = await getProductBySlug(env.SHOP_DB, body.slug);
    if (!product) return genericError(404, "Product not found.");
    if (product.status !== "PUBLISHED") return genericError(404, "Product not found.");
    if (product.publicly_purchasable !== 1) return genericError(400, "This product is not available for direct purchase.");
    if (product.price_confirmed !== 1 || product.price_cents === null) {
      return genericError(400, "This product's price is not yet confirmed for sale.");
    }

    const baseUrl = env.SHOP_PUBLIC_BASE_URL.replace(/\/$/, "");
    const successUrl = `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/cancelled.html?slug=${encodeURIComponent(product.slug)}`;

    const session = await createCheckoutSession({
      secretKey: env.STRIPE_SECRET_KEY,
      productTitle: product.title,
      amountCents: product.price_cents,
      currency: product.currency,
      successUrl,
      cancelUrl,
      metadata: {
        product_id: product.id,
        product_slug: product.slug,
        source: "sentinel_fortune_digital_shop",
      },
    });

    return jsonResponse({ ok: true, checkoutUrl: session.url });
  } catch (err) {
    return safeServerError("handleCreateCheckout", err);
  }
}
