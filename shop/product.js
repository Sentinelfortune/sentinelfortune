/* =====================================================
SENTINEL FORTUNE LLC — product.js
Product detail page: fetches one product by slug and
renders it. "Buy Now" sends ONLY the slug to the Worker's
/shop/checkout endpoint — price and purchasability are
never decided in this file, only displayed from what the
Worker returned.
===================================================== */
"use strict";

function esc(s) {
  var d = document.createElement("div");
  d.textContent = String(s || "");
  return d.innerHTML;
}

function apiBase() {
  return (window.SHOP_API_BASE || "").replace(/\/$/, "");
}

function getSlug() {
  var params = new URLSearchParams(window.location.search);
  return params.get("slug") || "";
}

async function loadProduct() {
  var root = document.getElementById("productRoot");
  var slug = getSlug();

  if (!slug) {
    root.innerHTML = '<div class="state-msg"><strong>No product specified.</strong>' +
      '<a class="btn btn-line" href="index.html" style="margin-top:16px">← Back to Catalog</a></div>';
    return;
  }

  try {
    var res = await fetch(apiBase() + "/shop/products/" + encodeURIComponent(slug));
    if (res.status === 404) {
      root.innerHTML = '<div class="state-msg"><strong>Product not found or not yet published.</strong>' +
        '<a class="btn btn-line" href="index.html" style="margin-top:16px">← Back to Catalog</a></div>';
      return;
    }
    if (!res.ok) throw new Error("HTTP " + res.status);

    var data = await res.json();
    render(data.product);
  } catch (err) {
    console.warn("[shop] failed to load product", err);
    root.innerHTML = '<div class="state-msg"><strong>This product is temporarily unavailable.</strong>' +
      "Please try again shortly, or contact us if this continues.</div>";
  }
}

function render(p) {
  document.title = p.title + " — Sentinel Fortune LLC Digital Shop";

  var root = document.getElementById("productRoot");

  var thumbs = (p.previewImageUrls || [])
    .map(function (url) { return '<img src="' + esc(url) + '" alt="Preview" loading="lazy">'; })
    .join("");

  var deliverables = (p.deliverables || [])
    .map(function (item) { return "<li>" + esc(item) + "</li>"; })
    .join("") || "<li>Full contents confirmed at checkout confirmation.</li>";

  var notIncluded = (p.notIncluded || [])
    .map(function (item) { return "<li>" + esc(item) + "</li>"; })
    .join("");

  var faqs = (p.faqs || [])
    .map(function (f) {
      return '<div class="faq-item"><div class="faq-q">' + esc(f.q) + '</div><div class="faq-a">' + esc(f.a) + "</div></div>";
    })
    .join("") || '<div class="faq-item"><div class="faq-a">No FAQs published yet for this product.</div></div>';

  var priceBlock = p.priceDisplay
    ? '<div class="pd-price">' + esc(p.priceDisplay) + "</div>"
    : '<div class="pd-price">Price on request</div>';

  var ctaBlock;
  if (p.buyable) {
    ctaBlock =
      '<button class="btn btn-gold btn-block" id="buyBtn">Buy Now — ' + esc(p.priceDisplay) + "</button>" +
      '<div class="pd-price-note" id="buyStatus"></div>';
  } else {
    ctaBlock =
      '<a class="btn btn-line btn-block" href="contact.html?product=' + encodeURIComponent(p.slug) + '">Request Purchase / Custom Licensing</a>' +
      '<div class="pd-price-note">This product is not available for immediate self-checkout. Contact us to arrange purchase or licensing.</div>';
  }

  root.innerHTML =
    '<div class="product-detail">' +
    '<div>' +
    '<div class="gallery-cover" style="' + (p.coverImageUrl ? "background-image:url('" + esc(p.coverImageUrl) + "')" : "") + '"></div>' +
    (thumbs ? '<div class="gallery-thumbs">' + thumbs + "</div>" : "") +
    "</div>" +
    "<div>" +
    '<div class="pd-category">' + esc(p.category || p.audience || "Digital Product") + "</div>" +
    '<h1 class="pd-title">' + esc(p.title) + "</h1>" +
    '<p class="pd-short">' + esc(p.shortDescription) + "</p>" +
    priceBlock +
    '<div class="pd-meta">' +
    metaItem("Audience", p.audience) +
    metaItem("Edition", p.edition) +
    metaItem("Version", p.version) +
    metaItem("License", licenseLabel(p.licenseType)) +
    metaItem("Formats", p.supportedFormats) +
    "</div>" +
    '<div class="pd-cta-box" id="buy">' + ctaBlock + "</div>" +
    "</div>" +
    "</div>" +

    '<div class="product-detail" style="margin-top:12px">' +
    "<div>" +
    (p.problemSolved ? sectionBlock("The Problem This Solves", p.problemSolved) : "") +
    (p.description ? sectionBlock("Full Description", p.description) : "") +
    '<div class="pd-section"><h2>What\'s Included</h2><ul class="pd-list included">' + deliverables + "</ul></div>" +
    (notIncluded ? '<div class="pd-section"><h2>Not Included</h2><ul class="pd-list excluded">' + notIncluded + "</ul></div>" : "") +
    "</div>" +
    "<div>" +
    (p.responsibleUseText ? sectionBlock("Responsible Use", p.responsibleUseText) : "") +
    '<div class="pd-section"><h2>Refund Summary</h2><div class="pd-callout">' + esc(p.refundPolicySummary || "See our Refund Policy for full terms.") +
    ' <a href="refund-policy.html" style="color:var(--gold3)">Full Refund Policy →</a></div></div>' +
    '<div class="pd-section"><h2>Questions</h2><div id="faqList">' + faqs + "</div></div>" +
    '<div class="pd-callout"><strong>Need something customized?</strong> If you need a tailored version of this product for your ' +
    'organization, <a href="contact.html?product=' + encodeURIComponent(p.slug) + '" style="color:var(--gold3)">reach out about a custom-service engagement →</a></div>' +
    "</div>" +
    "</div>";

  if (p.buyable) {
    var btn = document.getElementById("buyBtn");
    if (btn) btn.addEventListener("click", function () { startCheckout(p.slug, btn); });
  }
}

function metaItem(label, value) {
  if (!value) return "";
  return '<div class="pd-meta-item"><div class="pd-meta-label">' + esc(label) + '</div><div class="pd-meta-value">' + esc(value) + "</div></div>";
}

function sectionBlock(title, body) {
  return '<div class="pd-section"><h2>' + esc(title) + "</h2><p>" + esc(body) + "</p></div>";
}

function licenseLabel(type) {
  var labels = {
    SINGLE_BUSINESS: "Single Business",
    MULTI_LOCATION: "Multi-Location",
    CONSULTANT: "Consultant",
    WHITE_LABEL: "White Label",
  };
  return labels[type] || type;
}

async function startCheckout(slug, btn) {
  var statusEl = document.getElementById("buyStatus");
  btn.disabled = true;
  btn.textContent = "Redirecting to secure checkout…";
  if (statusEl) statusEl.textContent = "";

  try {
    var res = await fetch(apiBase() + "/shop/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: slug }),
    });
    var data = await res.json();

    if (!res.ok || !data.ok || !data.checkoutUrl) {
      throw new Error((data && data.error) || "Checkout could not be started.");
    }

    window.location.href = data.checkoutUrl;
  } catch (err) {
    console.warn("[shop] checkout failed", err);
    btn.disabled = false;
    btn.textContent = "Buy Now";
    if (statusEl) statusEl.textContent = "Checkout could not be started. Please try again or contact support.";
  }
}

document.addEventListener("DOMContentLoaded", loadProduct);
