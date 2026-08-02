/* =====================================================
SENTINEL FORTUNE LLC — success.js
Post-checkout confirmation and in-browser delivery.

Email remains the primary delivery channel. This page is the
fallback so a completed purchase is always collectable even if
email is delayed, filtered, or blocked by sender-domain
verification: it polls /shop/order/status with the Stripe
Checkout Session id from this page's own URL — an identifier
Stripe gives only to the buyer — and renders the order, the
license number, and a secure download link once the webhook has
been processed.

No secret is embedded here. The session id comes from the URL,
and the Worker decides what, if anything, to release.
===================================================== */
"use strict";

var POLL_INTERVAL_MS = 3000;
var MAX_POLLS = 20; // ~1 minute — webhooks normally land in seconds

var pollCount = 0;

function esc(s) {
  var d = document.createElement("div");
  d.textContent = String(s === undefined || s === null ? "" : s);
  return d.innerHTML;
}

function apiBase() {
  var base = (window.SHOP_API_BASE || "").trim();
  if (!base || base.indexOf("REPLACE_WITH") !== -1) return null;
  return base.replace(/\/$/, "");
}

function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
}

function panel() {
  return document.getElementById("deliveryPanel");
}

function renderWaiting(message) {
  var el = panel();
  if (!el) return;
  el.innerHTML =
    '<div class="delivery-card is-pending">' +
    '<p class="delivery-status">' + esc(message || "Confirming your payment…") + "</p>" +
    "</div>";
}

function renderPaid(data) {
  var el = panel();
  if (!el) return;

  var rows =
    '<dl class="delivery-meta">' +
    "<dt>Product</dt><dd>" + esc(data.productTitle) + "</dd>" +
    "<dt>Order</dt><dd><code>" + esc(data.orderNumber) + "</code></dd>" +
    "<dt>License</dt><dd><code>" + esc(data.licenseNumber) + "</code></dd>" +
    "<dt>Amount</dt><dd>" + esc(data.amountDisplay) + "</dd>" +
    "</dl>";

  var action = data.downloadUrl
    ? '<a class="btn btn-primary btn-download" href="' + esc(data.downloadUrl) + '">Download your files</a>' +
      '<p class="delivery-note">This link expires ' + esc(fmtDate(data.expiresAt)) +
      " and allows up to " + esc(data.maxDownloads) + " downloads. " +
      "Your confirmation email contains the same link.</p>"
    : '<p class="delivery-note">' + esc(data.message || "Download access is not available for this order.") + "</p>";

  el.innerHTML = '<div class="delivery-card is-ready">' + rows + action + "</div>";
}

function renderRefunded(data) {
  var el = panel();
  if (!el) return;
  el.innerHTML =
    '<div class="delivery-card is-refunded">' +
    (data.orderNumber ? "<p><strong>Order</strong> <code>" + esc(data.orderNumber) + "</code></p>" : "") +
    "<p>" + esc(data.message || "This order has been refunded.") + "</p>" +
    "</div>";
}

function renderUnavailable(text) {
  var el = panel();
  if (!el) return;
  el.innerHTML = '<div class="delivery-card is-pending"><p class="delivery-status">' + esc(text) + "</p></div>";
}

async function poll(sessionId) {
  var base = apiBase();
  if (base === null) {
    renderUnavailable("Your purchase is complete. Your download link will arrive by email.");
    return;
  }

  try {
    var res = await fetch(base + "/shop/order/status?session_id=" + encodeURIComponent(sessionId));
    var data = await res.json();

    if (!res.ok || !data || data.ok !== true) {
      renderUnavailable("Your purchase is complete. Your download link will arrive by email.");
      return;
    }

    if (data.status === "PAID") { renderPaid(data); return; }
    if (data.status === "REFUNDED") { renderRefunded(data); return; }

    pollCount++;
    if (pollCount >= MAX_POLLS) {
      renderUnavailable(
        "Your payment went through. Confirmation is taking longer than usual — your download link will arrive by email shortly."
      );
      return;
    }
    renderWaiting(data.message);
    setTimeout(function () { poll(sessionId); }, POLL_INTERVAL_MS);
  } catch (e) {
    renderUnavailable("Your purchase is complete. Your download link will arrive by email.");
  }
}

function init() {
  var params = new URLSearchParams(window.location.search);
  var sessionId = params.get("session_id");
  var refEl = document.getElementById("sessionRef");

  if (sessionId && refEl) {
    refEl.innerHTML = 'Reference: <code>' + esc(sessionId) + "</code>";
  } else if (refEl) {
    refEl.textContent = "";
  }

  if (!sessionId) {
    renderUnavailable("No checkout reference found. If you have just paid, your download link will arrive by email.");
    return;
  }

  renderWaiting("Confirming your payment…");
  poll(sessionId);
}

document.addEventListener("DOMContentLoaded", init);
