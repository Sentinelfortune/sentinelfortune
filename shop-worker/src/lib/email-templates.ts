// Branded transactional email templates. Every template returns both an
// HTML and a plain-text version — Resend sends both, and mail clients that
// block HTML (or a customer who prefers it) still get a fully readable
// message. Keep copy factual: no fabricated urgency, no claims this system
// can't back up.

interface EmailOutput {
  subject: string;
  html: string;
  text: string;
}

const SUPPORT_EMAIL = "Sentinelfortunellc@proton.me";

function wrapHtml(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#04060f;font-family:Georgia,'Times New Roman',serif;color:#e6e6e6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04060f;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#0a1128;border:1px solid #2a2410;border-radius:8px;">
            <tr>
              <td style="padding:28px 32px 8px 32px;border-bottom:1px solid #1e1e1e;">
                <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#c8a84b;font-weight:700;">Sentinel Fortune LLC</div>
                <div style="font-size:11px;color:#888;margin-top:2px;">Digital Shop</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px 32px;font-size:14px;line-height:1.6;color:#e6e6e6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px 32px;border-top:1px solid #1e1e1e;font-size:11px;color:#666;">
                Questions about an order? Reply to this email or contact ${SUPPORT_EMAIL}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export interface OrderConfirmationInput {
  customerName: string;
  productTitle: string;
  orderNumber: string;
  amountDisplay: string;
  licenseNumber: string;
}

export function orderConfirmationEmail(input: OrderConfirmationInput): EmailOutput {
  const greeting = input.customerName ? `Hello ${input.customerName},` : "Hello,";
  const subject = `Order confirmed — ${input.productTitle} (${input.orderNumber})`;
  const html = wrapHtml(`
    <p>${greeting}</p>
    <p>Your order for <strong>${escapeHtml(input.productTitle)}</strong> has been confirmed.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;font-size:13px;">
      <tr><td style="color:#888;padding:4px 0;">Order number</td><td style="text-align:right;">${escapeHtml(input.orderNumber)}</td></tr>
      <tr><td style="color:#888;padding:4px 0;">License number</td><td style="text-align:right;">${escapeHtml(input.licenseNumber)}</td></tr>
      <tr><td style="color:#888;padding:4px 0;">Amount charged</td><td style="text-align:right;">${escapeHtml(input.amountDisplay)}</td></tr>
    </table>
    <p>Your secure download link is sent in a separate email.</p>
  `);
  const text = `${greeting}\n\nYour order for ${input.productTitle} has been confirmed.\n\nOrder number: ${input.orderNumber}\nLicense number: ${input.licenseNumber}\nAmount charged: ${input.amountDisplay}\n\nYour secure download link is sent in a separate email.\n\nQuestions? Contact ${SUPPORT_EMAIL}.`;
  return { subject, html, text };
}

export interface DownloadDeliveryInput {
  customerName: string;
  productTitle: string;
  downloadUrl: string;
  expiresAtDisplay: string;
  maxDownloads: number;
  licenseNumber: string;
}

export function downloadDeliveryEmail(input: DownloadDeliveryInput): EmailOutput {
  const greeting = input.customerName ? `Hello ${input.customerName},` : "Hello,";
  const subject = `Your download — ${input.productTitle}`;
  const html = wrapHtml(`
    <p>${greeting}</p>
    <p>Your secure download for <strong>${escapeHtml(input.productTitle)}</strong> is ready.</p>
    <p style="margin:20px 0;">
      <a href="${escapeHtml(input.downloadUrl)}" style="display:inline-block;background:#c8a84b;color:#04060f;padding:12px 22px;border-radius:4px;text-decoration:none;font-weight:700;font-size:13px;">Download Now</a>
    </p>
    <p style="font-size:12px;color:#888;">This link expires ${escapeHtml(input.expiresAtDisplay)} and may be used up to ${input.maxDownloads} times. License number: ${escapeHtml(input.licenseNumber)}.</p>
    <p style="font-size:12px;color:#888;">If this link expires, you (or Sentinel Fortune LLC on your behalf) can request a replacement from the license lookup page.</p>
  `);
  const text = `${greeting}\n\nYour secure download for ${input.productTitle} is ready:\n${input.downloadUrl}\n\nThis link expires ${input.expiresAtDisplay} and may be used up to ${input.maxDownloads} times.\nLicense number: ${input.licenseNumber}\n\nIf this link expires, request a replacement from the license lookup page.\n\nQuestions? Contact ${SUPPORT_EMAIL}.`;
  return { subject, html, text };
}

export interface ReplacementLinkInput {
  customerName: string;
  productTitle: string;
  downloadUrl: string;
  expiresAtDisplay: string;
  maxDownloads: number;
}

export function replacementDownloadLinkEmail(input: ReplacementLinkInput): EmailOutput {
  const greeting = input.customerName ? `Hello ${input.customerName},` : "Hello,";
  const subject = `Replacement download link — ${input.productTitle}`;
  const html = wrapHtml(`
    <p>${greeting}</p>
    <p>A new secure download link has been issued for <strong>${escapeHtml(input.productTitle)}</strong>. Your previous link, if still active, remains valid until it separately expires or reaches its download limit.</p>
    <p style="margin:20px 0;">
      <a href="${escapeHtml(input.downloadUrl)}" style="display:inline-block;background:#c8a84b;color:#04060f;padding:12px 22px;border-radius:4px;text-decoration:none;font-weight:700;font-size:13px;">Download Now</a>
    </p>
    <p style="font-size:12px;color:#888;">This link expires ${escapeHtml(input.expiresAtDisplay)} and may be used up to ${input.maxDownloads} times.</p>
  `);
  const text = `${greeting}\n\nA new secure download link has been issued for ${input.productTitle}:\n${input.downloadUrl}\n\nThis link expires ${input.expiresAtDisplay} and may be used up to ${input.maxDownloads} times.\n\nQuestions? Contact ${SUPPORT_EMAIL}.`;
  return { subject, html, text };
}

export interface RefundConfirmationInput {
  customerName: string;
  productTitle: string;
  orderNumber: string;
  amountDisplay: string;
}

export function refundConfirmationEmail(input: RefundConfirmationInput): EmailOutput {
  const greeting = input.customerName ? `Hello ${input.customerName},` : "Hello,";
  const subject = `Refund processed — ${input.productTitle} (${input.orderNumber})`;
  const html = wrapHtml(`
    <p>${greeting}</p>
    <p>Your refund for <strong>${escapeHtml(input.productTitle)}</strong> (order ${escapeHtml(input.orderNumber)}, ${escapeHtml(input.amountDisplay)}) has been processed by Stripe.</p>
    <p>Your license and download access for this order have been revoked.</p>
  `);
  const text = `${greeting}\n\nYour refund for ${input.productTitle} (order ${input.orderNumber}, ${input.amountDisplay}) has been processed by Stripe.\n\nYour license and download access for this order have been revoked.\n\nQuestions? Contact ${SUPPORT_EMAIL}.`;
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
