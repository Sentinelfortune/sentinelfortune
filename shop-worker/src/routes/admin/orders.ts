import type { AccessIdentity } from "../../lib/auth";
import type { Env } from "../../types";
import {
  getCustomerById,
  getLicenseById,
  getLicenseByOrderId,
  getOrderById,
  getProductById,
  insertDownloadAuthorization,
  listDownloadAuthorizationsByLicense,
  listLicenses,
  listOrders,
  revokeLicense,
} from "../../lib/db";
import { logAdminAction } from "../../lib/audit";
import { expiresAtFromHours, generateDownloadToken } from "../../lib/download-auth";
import { newId } from "../../lib/ids";
import { formatUsdFromCents } from "../../lib/money";
import { orderConfirmationEmail, replacementDownloadLinkEmail } from "../../lib/email-templates";
import { sendEmail } from "../../lib/resend";
import { genericError, jsonResponse, safeServerError } from "../../lib/http";

export async function handleAdminListOrders(_request: Request, env: Env): Promise<Response> {
  try {
    const orders = await listOrders(env.SHOP_DB);
    const enriched = await Promise.all(
      orders.map(async (order) => {
        const [customer, product, license] = await Promise.all([
          getCustomerById(env.SHOP_DB, order.customer_id),
          getProductById(env.SHOP_DB, order.product_id),
          getLicenseByOrderId(env.SHOP_DB, order.id),
        ]);
        return {
          id: order.id,
          orderNumber: order.order_number,
          status: order.status,
          amountDisplay: formatUsdFromCents(order.amount_cents),
          customerEmail: customer?.email ?? "",
          productTitle: product?.title ?? "(deleted product)",
          licenseNumber: license?.license_number ?? null,
          createdAt: order.created_at,
          paidAt: order.paid_at,
          refundedAt: order.refunded_at,
        };
      }),
    );
    return jsonResponse({ ok: true, orders: enriched });
  } catch (err) {
    return safeServerError("handleAdminListOrders", err);
  }
}

export async function handleAdminGetOrder(_request: Request, env: Env, params: Record<string, string>): Promise<Response> {
  try {
    const order = await getOrderById(env.SHOP_DB, params.id);
    if (!order) return genericError(404, "Order not found.");

    const [customer, product, license] = await Promise.all([
      getCustomerById(env.SHOP_DB, order.customer_id),
      getProductById(env.SHOP_DB, order.product_id),
      getLicenseByOrderId(env.SHOP_DB, order.id),
    ]);

    const authorizations = license ? await listDownloadAuthorizationsByLicense(env.SHOP_DB, license.id) : [];

    return jsonResponse({
      ok: true,
      order: {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        amountDisplay: formatUsdFromCents(order.amount_cents),
        currency: order.currency,
        stripeCheckoutSessionId: order.stripe_checkout_session_id,
        stripePaymentIntentId: order.stripe_payment_intent_id,
        createdAt: order.created_at,
        paidAt: order.paid_at,
        refundedAt: order.refunded_at,
        customer: customer ? { email: customer.email, name: customer.name } : null,
        product: product ? { id: product.id, title: product.title, slug: product.slug } : null,
        license: license
          ? {
              id: license.id,
              licenseNumber: license.license_number,
              status: license.status,
              licenseType: license.license_type,
              issuedAt: license.issued_at,
              revokedAt: license.revoked_at,
            }
          : null,
        downloadAuthorizations: authorizations.map((a) => ({
          id: a.id,
          downloadCount: a.download_count,
          maxDownloads: a.max_downloads,
          expiresAt: a.expires_at,
          revoked: a.revoked === 1,
          createdAt: a.created_at,
        })),
      },
    });
  } catch (err) {
    return safeServerError("handleAdminGetOrder", err);
  }
}

export async function handleAdminResendEmail(_request: Request, env: Env, params: Record<string, string>, identity: AccessIdentity): Promise<Response> {
  try {
    const order = await getOrderById(env.SHOP_DB, params.id);
    if (!order) return genericError(404, "Order not found.");
    if (order.status !== "PAID") return genericError(400, "Only paid orders can have their confirmation email resent.");

    const [customer, product, license] = await Promise.all([
      getCustomerById(env.SHOP_DB, order.customer_id),
      getProductById(env.SHOP_DB, order.product_id),
      getLicenseByOrderId(env.SHOP_DB, order.id),
    ]);

    if (!customer?.email || !product || !license) {
      return genericError(400, "Order is missing required data for resend (customer email, product, or license).");
    }

    const confirmation = orderConfirmationEmail({
      customerName: customer.name,
      productTitle: product.title,
      orderNumber: order.order_number,
      amountDisplay: formatUsdFromCents(order.amount_cents),
      licenseNumber: license.license_number,
    });

    const result = await sendEmail({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM_EMAIL,
      to: customer.email,
      subject: confirmation.subject,
      html: confirmation.html,
      text: confirmation.text,
    });

    await logAdminAction(env.SHOP_DB, identity.email, "order.resend_confirmation_email", "order", order.id, { emailResult: result.ok });

    if (!result.ok) return genericError(502, "Email delivery failed. Check RESEND configuration.");
    return jsonResponse({ ok: true });
  } catch (err) {
    return safeServerError("handleAdminResendEmail", err);
  }
}

export async function handleAdminReplacementLink(_request: Request, env: Env, params: Record<string, string>, identity: AccessIdentity): Promise<Response> {
  try {
    const order = await getOrderById(env.SHOP_DB, params.id);
    if (!order) return genericError(404, "Order not found.");
    if (order.status !== "PAID") return genericError(400, "Only paid orders can receive a replacement download link.");

    const [customer, product, license] = await Promise.all([
      getCustomerById(env.SHOP_DB, order.customer_id),
      getProductById(env.SHOP_DB, order.product_id),
      getLicenseByOrderId(env.SHOP_DB, order.id),
    ]);

    if (!license || license.status !== "ACTIVE") return genericError(400, "No active license found for this order.");
    if (!product) return genericError(400, "Product no longer exists.");

    const now = new Date();
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

    const downloadUrl = `${env.SHOP_WORKER_BASE_URL.replace(/\/$/, "")}/shop/download/${rawToken}`;

    await logAdminAction(env.SHOP_DB, identity.email, "order.replacement_link", "order", order.id, {});

    if (customer?.email) {
      const email = replacementDownloadLinkEmail({
        customerName: customer.name,
        productTitle: product.title,
        downloadUrl,
        expiresAtDisplay: new Date(expiresAt).toUTCString(),
        maxDownloads: product.max_downloads,
      });
      const result = await sendEmail({
        apiKey: env.RESEND_API_KEY,
        from: env.RESEND_FROM_EMAIL,
        to: customer.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (!result.ok) {
        return jsonResponse({ ok: true, downloadUrl, emailSent: false, emailError: result.error });
      }
    }

    return jsonResponse({ ok: true, downloadUrl, emailSent: Boolean(customer?.email) });
  } catch (err) {
    return safeServerError("handleAdminReplacementLink", err);
  }
}

export async function handleAdminListLicenses(_request: Request, env: Env): Promise<Response> {
  try {
    const licenses = await listLicenses(env.SHOP_DB);
    const enriched = await Promise.all(
      licenses.map(async (license) => {
        const product = await getProductById(env.SHOP_DB, license.product_id);
        return {
          id: license.id,
          licenseNumber: license.license_number,
          status: license.status,
          licenseType: license.license_type,
          productTitle: product?.title ?? "(deleted product)",
          purchaserEmail: license.purchaser_email,
          purchaserName: license.purchaser_name,
          issuedAt: license.issued_at,
          revokedAt: license.revoked_at,
        };
      }),
    );
    return jsonResponse({ ok: true, licenses: enriched });
  } catch (err) {
    return safeServerError("handleAdminListLicenses", err);
  }
}

export async function handleAdminRevokeLicense(_request: Request, env: Env, params: Record<string, string>, identity: AccessIdentity): Promise<Response> {
  try {
    const license = await getLicenseById(env.SHOP_DB, params.id);
    if (!license) return genericError(404, "License not found.");
    if (license.status === "REVOKED") return jsonResponse({ ok: true, alreadyRevoked: true });

    await revokeLicense(env.SHOP_DB, license.id, new Date().toISOString());
    await logAdminAction(env.SHOP_DB, identity.email, "license.revoke", "license", license.id, { licenseNumber: license.license_number });

    return jsonResponse({ ok: true });
  } catch (err) {
    return safeServerError("handleAdminRevokeLicense", err);
  }
}
