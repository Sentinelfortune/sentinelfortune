// GET /shop/order/status?session_id=cs_...
//
// Post-checkout delivery for the buyer's own browser.
//
// WHY THIS EXISTS
// ---------------
// Before this route, fulfilment was delivered exclusively by email. If Resend
// is unconfigured, rate-limited, or the sender domain is unverified, a paying
// customer received nothing at all and the success page could only say "check
// your inbox". Email stays the primary channel; this is the in-browser fallback
// so a completed purchase is always collectable.
//
// AUTHORIZATION MODEL
// -------------------
// The only key is the Stripe Checkout Session id, which Stripe puts in the
// buyer's own redirect URL and gives to nobody else. It is a high-entropy,
// unguessable identifier, and it is already treated as the buyer's reference on
// the success page. Possession of it is therefore treated as proof that this
// browser completed that checkout — the same pattern Stripe documents for
// post-checkout confirmation pages.
//
// Deliberate limits, so this is narrower than an entitlement lookup:
//   - only PAID orders yield a link; PENDING returns a poll-again status and
//     REFUNDED returns no link at all;
//   - each call mints a fresh single-purpose download authorization rather than
//     exposing a stored one (raw tokens are never stored, only their hashes);
//   - minting is capped per order, so the URL cannot be replayed indefinitely to
//     manufacture unlimited tokens;
//   - the response carries no email address, customer id, or Stripe ids beyond
//     what the caller already supplied.

import type { Env } from "../types";
import {
  getLicenseByOrderId,
  getOrderBySessionId,
  getProductById,
  insertDownloadAuthorization,
  listDownloadAuthorizationsByLicense,
} from "../lib/db";
import { expiresAtFromHours, generateDownloadToken } from "../lib/download-auth";
import { newId } from "../lib/ids";
import { formatUsdFromCents } from "../lib/money";
import { genericError, jsonResponse, safeServerError } from "../lib/http";

/**
 * Ceiling on download authorizations per license. Reloading the success page a
 * few times is normal; scripting it to mint tokens forever is not.
 */
export const MAX_AUTHORIZATIONS_PER_LICENSE = 10;

/** Stripe Checkout Session ids look like cs_test_… / cs_live_… */
export function isValidCheckoutSessionId(value: unknown): value is string {
  return typeof value === "string" && /^cs_[A-Za-z0-9_]{10,255}$/.test(value);
}

export async function handleOrderStatus(request: Request, env: Env, now: Date = new Date()): Promise<Response> {
  try {
    const sessionId = new URL(request.url).searchParams.get("session_id");
    if (!isValidCheckoutSessionId(sessionId)) {
      return genericError(400, "A valid session_id is required.");
    }

    const order = await getOrderBySessionId(env.SHOP_DB, sessionId);
    if (!order) {
      // Either the webhook has not landed yet, or the id is not one of ours.
      // Both answer the same way: nothing to disclose, try again shortly.
      return jsonResponse({ ok: true, status: "PENDING", message: "Payment is still being confirmed." });
    }

    if (order.status !== "PAID") {
      return jsonResponse({
        ok: true,
        status: order.status === "REFUNDED" ? "REFUNDED" : "PENDING",
        orderNumber: order.status === "REFUNDED" ? order.order_number : undefined,
        message:
          order.status === "REFUNDED"
            ? "This order has been refunded. Download access has been withdrawn."
            : "Payment is still being confirmed.",
      });
    }

    const license = await getLicenseByOrderId(env.SHOP_DB, order.id);
    const product = await getProductById(env.SHOP_DB, order.product_id);
    if (!license || !product) {
      return jsonResponse({ ok: true, status: "PENDING", message: "Your order is being prepared." });
    }

    const base = {
      ok: true as const,
      status: "PAID" as const,
      orderNumber: order.order_number,
      productTitle: product.title,
      licenseNumber: license.license_number,
      licenseType: license.license_type,
      amountDisplay: formatUsdFromCents(order.amount_cents),
    };

    if (license.status !== "ACTIVE") {
      return jsonResponse({ ...base, downloadUrl: null, message: "This license is no longer active." });
    }

    const existing = await listDownloadAuthorizationsByLicense(env.SHOP_DB, license.id);
    if (existing.length >= MAX_AUTHORIZATIONS_PER_LICENSE) {
      return jsonResponse({
        ...base,
        downloadUrl: null,
        message: "Download link limit reached for this order. Please contact support.",
      });
    }

    const { rawToken, tokenHash } = await generateDownloadToken();
    const expiresAt = expiresAtFromHours(product.download_link_expiry_hours, now);

    await insertDownloadAuthorization(env.SHOP_DB, {
      id: newId(),
      token_hash: tokenHash,
      license_id: license.id,
      order_id: order.id,
      product_file_id: null,
      max_downloads: product.max_downloads,
      download_count: 0,
      expires_at: expiresAt,
      revoked: 0,
      created_at: now.toISOString(),
    });

    return jsonResponse({
      ...base,
      downloadUrl: `${env.SHOP_WORKER_BASE_URL.replace(/\/$/, "")}/shop/download/${rawToken}`,
      expiresAt,
      maxDownloads: product.max_downloads,
    });
  } catch (err) {
    return safeServerError("handleOrderStatus", err);
  }
}
