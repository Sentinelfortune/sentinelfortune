import type { Env } from "../types";
import { parseStripeEvent, verifyStripeWebhookSignature } from "../lib/stripe";
import {
  getCustomerById,
  getLicenseByOrderId,
  getOrderByPaymentIntentId,
  getOrderBySessionId,
  getProductById,
  insertDownloadAuthorization,
  insertLicense,
  insertOrder,
  insertOrderItem,
  markOrderRefunded,
  markStripeEventProcessed,
  recordStripeEventIfNew,
  revokeDownloadAuthorizationsForOrder,
  revokeLicense,
  upsertCustomerByEmail,
} from "../lib/db";
import { generateDownloadToken, expiresAtFromHours } from "../lib/download-auth";
import { newId, newLicenseNumber, newOrderNumber } from "../lib/ids";
import { generateLicenseText } from "../lib/license-text";
import { formatUsdFromCents } from "../lib/money";
import { downloadDeliveryEmail, orderConfirmationEmail, refundConfirmationEmail } from "../lib/email-templates";
import { sendEmail } from "../lib/resend";
import { genericError } from "../lib/http";

interface CheckoutSessionObject {
  id: string;
  payment_intent: string | null;
  payment_status: string;
  amount_total: number | null;
  currency: string | null;
  customer_details: { email: string | null; name: string | null } | null;
  metadata: Record<string, string> | null;
}

interface ChargeRefundedObject {
  payment_intent: string | null;
}

/**
 * POST /shop/stripe/webhook
 *
 * Fully independent from the existing tier-access webhook at
 * /api/stripe/webhook (Express/bot) — separate route, separate secret,
 * separate D1-backed idempotency ledger. A failure here cannot affect the
 * existing Telegram delivery pipeline, and vice versa.
 */
export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("Stripe-Signature");

  const verification = await verifyStripeWebhookSignature(rawBody, signatureHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!verification.valid) {
    console.warn(`[shop-webhook] signature verification failed: ${verification.reason}`);
    return genericError(400, "Invalid signature.");
  }

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = parseStripeEvent(rawBody);
  } catch {
    return genericError(400, "Invalid payload.");
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const isNewEvent = await recordStripeEventIfNew(env.SHOP_DB, {
    id: newId(),
    stripe_event_id: event.id,
    type: event.type,
    payload_json: rawBody,
    received_at: nowIso,
  });

  if (!isNewEvent) {
    console.info(`[shop-webhook] duplicate event id=${event.id} type=${event.type} — no-op`);
    return new Response("duplicate", { status: 200 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutSessionCompleted(env, event.data.object as unknown as CheckoutSessionObject, now);
    } else if (event.type === "charge.refunded") {
      await handleChargeRefunded(env, event.data.object as unknown as ChargeRefundedObject, now);
    } else {
      console.info(`[shop-webhook] unhandled event type=${event.type} — logged only`);
    }

    await markStripeEventProcessed(env.SHOP_DB, event.id, new Date().toISOString());
    return new Response("ok", { status: 200 });
  } catch (err) {
    // Event row remains processed=0 — a retry from Stripe (or manual replay)
    // will re-enter this handler. Business-object idempotency (order lookup
    // by Stripe session/payment-intent id, below) makes that safe to retry.
    console.error(`[shop-webhook] processing error event=${event.id} type=${event.type}:`, err);
    return genericError(500, "Processing error.");
  }
}

async function handleCheckoutSessionCompleted(env: Env, session: CheckoutSessionObject, now: Date): Promise<void> {
  const nowIso = now.toISOString();

  if (session.payment_status !== "paid") {
    console.info(`[shop-webhook] checkout.session.completed but payment_status=${session.payment_status} — no fulfillment`);
    return;
  }

  const existingOrder = await getOrderBySessionId(env.SHOP_DB, session.id);
  if (existingOrder) {
    console.info(`[shop-webhook] order already exists for session=${session.id} — skipping duplicate fulfillment`);
    return;
  }

  const productId = session.metadata?.product_id;
  if (!productId) {
    console.warn(`[shop-webhook] session=${session.id} has no product_id metadata — cannot fulfill`);
    return;
  }

  const product = await getProductById(env.SHOP_DB, productId);
  if (!product) {
    console.warn(`[shop-webhook] session=${session.id} references unknown product_id=${productId}`);
    return;
  }

  const email = session.customer_details?.email ?? "";
  const name = session.customer_details?.name ?? "";
  const amountCents = session.amount_total ?? product.price_cents ?? 0;
  const currency = session.currency ?? product.currency;

  if (!email) {
    console.warn(`[shop-webhook] session=${session.id} completed with no customer email — order recorded, delivery email skipped`);
  }

  const customer = await upsertCustomerByEmail(env.SHOP_DB, newId(), email || `unknown+${session.id}@no-email.invalid`, name, nowIso);

  const orderId = newId();
  const orderNumber = newOrderNumber(now);

  await insertOrder(env.SHOP_DB, {
    id: orderId,
    order_number: orderNumber,
    product_id: product.id,
    customer_id: customer.id,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent,
    status: "PAID",
    amount_cents: amountCents,
    currency,
    business_name: "",
    created_at: nowIso,
    paid_at: nowIso,
    refunded_at: null,
  });

  await insertOrderItem(env.SHOP_DB, {
    id: newId(),
    order_id: orderId,
    product_id: product.id,
    title_snapshot: product.title,
    price_cents_snapshot: amountCents,
    quantity: 1,
  });

  const licenseId = newId();
  const licenseNumber = newLicenseNumber(now);
  const { rightsSummary, restrictionsSummary } = generateLicenseText(product.license_type, product.title);

  await insertLicense(env.SHOP_DB, {
    id: licenseId,
    license_number: licenseNumber,
    order_id: orderId,
    product_id: product.id,
    customer_id: customer.id,
    license_type: product.license_type,
    product_version_snapshot: product.version,
    purchaser_name: name,
    purchaser_email: email,
    business_name: "",
    status: "ACTIVE",
    rights_summary: rightsSummary,
    restrictions_summary: restrictionsSummary,
    issued_at: nowIso,
    revoked_at: null,
  });

  const { rawToken, tokenHash } = await generateDownloadToken();
  const expiresAt = expiresAtFromHours(product.download_link_expiry_hours, now);

  await insertDownloadAuthorization(env.SHOP_DB, {
    id: newId(),
    token_hash: tokenHash,
    license_id: licenseId,
    order_id: orderId,
    product_file_id: null,
    max_downloads: product.max_downloads,
    download_count: 0,
    expires_at: expiresAt,
    revoked: 0,
    created_at: nowIso,
  });

  if (email) {
    const downloadUrl = `${env.SHOP_WORKER_BASE_URL.replace(/\/$/, "")}/shop/download/${rawToken}`;
    const expiresAtDisplay = new Date(expiresAt).toUTCString();

    const confirmation = orderConfirmationEmail({
      customerName: name,
      productTitle: product.title,
      orderNumber,
      amountDisplay: formatUsdFromCents(amountCents),
      licenseNumber,
    });
    const delivery = downloadDeliveryEmail({
      customerName: name,
      productTitle: product.title,
      downloadUrl,
      expiresAtDisplay,
      maxDownloads: product.max_downloads,
      licenseNumber,
    });

    const confirmResult = await sendEmail({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: confirmation.subject,
      html: confirmation.html,
      text: confirmation.text,
    });
    if (!confirmResult.ok) console.error(`[shop-webhook] order confirmation email failed order=${orderNumber}: ${confirmResult.error}`);

    const deliveryResult = await sendEmail({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: delivery.subject,
      html: delivery.html,
      text: delivery.text,
    });
    if (!deliveryResult.ok) console.error(`[shop-webhook] download delivery email failed order=${orderNumber}: ${deliveryResult.error}`);
  }

  console.info(`[shop-webhook] fulfilled order=${orderNumber} product=${product.slug} license=${licenseNumber}`);
}

async function handleChargeRefunded(env: Env, charge: ChargeRefundedObject, now: Date): Promise<void> {
  const nowIso = now.toISOString();

  if (!charge.payment_intent) {
    console.warn("[shop-webhook] charge.refunded with no payment_intent — cannot locate order");
    return;
  }

  const order = await getOrderByPaymentIntentId(env.SHOP_DB, charge.payment_intent);
  if (!order) {
    console.warn(`[shop-webhook] charge.refunded — no matching order for payment_intent=${charge.payment_intent}`);
    return;
  }

  if (order.status === "REFUNDED") {
    console.info(`[shop-webhook] order=${order.order_number} already marked refunded — skipping`);
    return;
  }

  await markOrderRefunded(env.SHOP_DB, order.id, nowIso);
  await revokeDownloadAuthorizationsForOrder(env.SHOP_DB, order.id);

  const license = await getLicenseByOrderId(env.SHOP_DB, order.id);
  if (license) {
    await revokeLicense(env.SHOP_DB, license.id, nowIso);
  }

  const customer = await getCustomerById(env.SHOP_DB, order.customer_id);
  const product = await getProductById(env.SHOP_DB, order.product_id);

  if (customer?.email && product) {
    const refundEmail = refundConfirmationEmail({
      customerName: customer.name,
      productTitle: product.title,
      orderNumber: order.order_number,
      amountDisplay: formatUsdFromCents(order.amount_cents),
    });
    const result = await sendEmail({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM_EMAIL,
      to: customer.email,
      subject: refundEmail.subject,
      html: refundEmail.html,
      text: refundEmail.text,
    });
    if (!result.ok) console.error(`[shop-webhook] refund confirmation email failed order=${order.order_number}: ${result.error}`);
  }

  console.info(`[shop-webhook] refunded order=${order.order_number} — license revoked, downloads revoked`);
}
