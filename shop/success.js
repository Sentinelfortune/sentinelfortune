/* =====================================================
SENTINEL FORTUNE LLC — success.js
Post-checkout confirmation page. Deliberately does NOT call
the Shop Worker or display order/license/download data here —
fulfillment (order, license, download link) is confirmed and
delivered entirely through the Stripe webhook + email, per the
Stripe flow in SHOP_ARCHITECTURE.md. This page only reflects
back the Stripe Checkout Session id from the URL as a support
reference, which avoids adding a second, public,
session-id-keyed lookup endpoint.
===================================================== */
"use strict";

function esc(s) {
  var d = document.createElement("div");
  d.textContent = String(s || "");
  return d.innerHTML;
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
}

document.addEventListener("DOMContentLoaded", init);
