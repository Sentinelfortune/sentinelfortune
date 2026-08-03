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
  setMeta(p);
  injectProductSchema(p);

  var root = document.getElementById("productRoot");

  var thumbs = (p.previewImageUrls || [])
    .map(function (url, i) {
      return '<img src="' + esc(url) + '" alt="' + esc(p.title) + ' preview ' + (i + 1) +
        '" loading="lazy" decoding="async" data-full="' + esc(url) + '">';
    })
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
    '<nav class="pd-crumbs" aria-label="Breadcrumb">' +
      '<a href="../index.html">Home</a><span aria-hidden="true">/</span>' +
      '<a href="index.html">Shop</a>' +
      (p.category ? '<span aria-hidden="true">/</span><span>' + esc(p.category) + '</span>' : '') +
    '</nav>' +
    '<div class="product-detail">' +
    '<div>' +
    (p.coverImageUrl
      ? '<img class="gallery-cover-img" src="' + esc(p.coverImageUrl) + '" alt="' + esc(p.title) +
        ' cover" width="800" height="600" decoding="async">'
      : '<div class="gallery-cover" role="img" aria-label="Cover image not yet available"></div>') +
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
    metaItem("Category", p.category) +
    "</div>" +
    (p.updatedAt
      ? '<p class="pd-updated">Last updated ' + esc(fmtDate(p.updatedAt)) + '</p>'
      : "") +
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
    "</div>" +
    '<section class="related-products" id="relatedWrap" hidden>' +
      '<h2>More in ' + esc(p.category || "the catalogue") + '</h2>' +
      '<div class="related-grid" id="relatedGrid"></div>' +
    "</section>";

  if (p.buyable) {
    var btn = document.getElementById("buyBtn");
    if (btn) btn.addEventListener("click", function () { startCheckout(p.slug, btn); });
  }

  wireLightbox();
  loadRelated(p);
}

function fmtDate(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/* Title and description are set from the fetched product so a shared link
   carries the real product name. Note this runs client-side: crawlers that do
   not execute JavaScript see the static fallback in product.html. The
   catalogue page, which IS static, is the crawlable entry point. */
function setMeta(p) {
  function set(sel, attr, val) {
    var el = document.head.querySelector(sel);
    if (el) el.setAttribute(attr, val);
  }
  var desc = p.shortDescription || "";
  set('meta[name="description"]', "content", desc);
  set('meta[property="og:title"]', "content", p.title);
  set('meta[property="og:description"]', "content", desc);
  var canon = document.head.querySelector('link[rel="canonical"]');
  if (canon) canon.setAttribute("href", window.location.href.split("#")[0]);
  if (p.coverImageUrl) set('meta[property="og:image"]', "content", p.coverImageUrl);
}

/* Product schema, built only from fields the page actually displays. `offers`
   is emitted only when the product is genuinely buyable at a confirmed price —
   advertising a price for something that cannot be bought would be false
   markup. No aggregateRating or review: none exist. */
function injectProductSchema(p) {
  var node = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    description: p.shortDescription || p.problemSolved || "",
    sku: p.slug,
    brand: { "@type": "Organization", name: "Sentinel Fortune LLC" },
    url: window.location.href.split("#")[0]
  };
  if (p.category) node.category = p.category;
  if (p.coverImageUrl) node.image = p.coverImageUrl;

  if (p.buyable && p.priceCents !== null && p.priceCents !== undefined) {
    node.offers = {
      "@type": "Offer",
      price: (p.priceCents / 100).toFixed(2),
      priceCurrency: String(p.currency || "usd").toUpperCase(),
      availability: "https://schema.org/InStock",
      url: window.location.href.split("#")[0]
    };
  }

  var s = document.createElement("script");
  s.type = "application/ld+json";
  s.textContent = JSON.stringify(node);
  document.head.appendChild(s);
}

/* Preview lightbox. Keyboard-reachable and Escape-closable. */
function wireLightbox() {
  var thumbs = document.querySelectorAll(".gallery-thumbs img");
  if (!thumbs.length) return;

  var box = document.createElement("div");
  box.className = "pv-lightbox";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Product preview");
  box.innerHTML = '<button class="pv-close" type="button" aria-label="Close preview">\u2715</button><img alt="">';
  document.body.appendChild(box);

  var img = box.querySelector("img");
  var last = null;

  function open(src, alt, origin) {
    img.src = src;
    img.alt = alt;
    last = origin;
    box.classList.add("open");
    box.querySelector(".pv-close").focus();
  }
  function close() {
    box.classList.remove("open");
    img.src = "";
    if (last) last.focus();
  }

  thumbs.forEach(function (t) {
    t.setAttribute("tabindex", "0");
    t.setAttribute("role", "button");
    t.addEventListener("click", function () { open(t.dataset.full || t.src, t.alt, t); });
    t.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(t.dataset.full || t.src, t.alt, t); }
    });
  });
  box.addEventListener("click", function (e) {
    if (e.target === box || e.target.classList.contains("pv-close")) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && box.classList.contains("open")) close();
  });
}

/* Related products: same category, excluding this one. Derived from the real
   catalogue, so a relationship is only shown when one actually exists. */
async function loadRelated(p) {
  if (!p.category) return;
  try {
    var res = await fetch(apiBase() + "/shop/products");
    if (!res.ok) return;
    var data = await res.json();
    var rel = ((data && data.products) || []).filter(function (x) {
      return x.slug !== p.slug &&
             String(x.category || "").toLowerCase() === String(p.category).toLowerCase();
    }).slice(0, 3);
    if (!rel.length) return;

    var wrap = document.getElementById("relatedWrap");
    var grid = document.getElementById("relatedGrid");
    if (!wrap || !grid) return;

    grid.innerHTML = rel.map(function (x) {
      var slug = encodeURIComponent(x.slug);
      return '<article class="product-card">' +
        '<a class="product-card-cover" href="product.html?slug=' + slug + '" tabindex="-1" aria-hidden="true">' +
          (x.coverImageUrl
            ? '<img class="product-card-img" src="' + esc(x.coverImageUrl) + '" alt="" loading="lazy" width="600" height="450">'
            : '<span class="product-card-nocover" aria-hidden="true">SF</span>') +
        "</a>" +
        '<div class="product-card-body">' +
          '<div class="product-card-cat">' + esc(x.category) + "</div>" +
          '<h3 class="product-card-title"><a href="product.html?slug=' + slug + '">' + esc(x.title) + "</a></h3>" +
          '<p class="product-card-desc">' + esc(x.shortDescription) + "</p>" +
          (x.priceDisplay ? '<div class="product-card-price">' + esc(x.priceDisplay) + "</div>" : "") +
        "</div></article>";
    }).join("");
    wrap.hidden = false;
  } catch (err) {
    /* Related products are a bonus. If the catalogue call fails the product
       page itself is unaffected, so this stays silent. */
    console.warn("[shop] related products unavailable", err);
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
