/* =====================================================
SENTINEL FORTUNE LLC — shop.js
Public catalog: fetches PUBLISHED products from the Shop
Worker and renders the grid. No client-side product data
is ever trusted for price or purchasability — everything
shown here is what the Worker returned.
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

async function loadProducts() {
  var grid = document.getElementById("catalogGrid");
  if (!grid) return;

  try {
    var res = await fetch(apiBase() + "/shop/products");
    if (!res.ok) throw new Error("HTTP " + res.status);
    var data = await res.json();
    var products = (data && data.products) || [];

    if (products.length === 0) {
      grid.innerHTML =
        '<div class="state-msg"><strong>No products are published yet.</strong>' +
        "Check back soon — new digital products are added regularly.</div>";
      return;
    }

    grid.innerHTML = products.map(renderCard).join("");
  } catch (err) {
    console.warn("[shop] failed to load products", err);
    grid.innerHTML =
      '<div class="state-msg"><strong>The catalog is temporarily unavailable.</strong>' +
      "Please try again shortly, or contact us if this continues.</div>";
  }
}

function renderCard(p) {
  var coverStyle = p.coverImageUrl ? ' style="background-image:url(\'' + esc(p.coverImageUrl) + "')\"" : "";
  var priceHtml = p.priceDisplay
    ? '<div class="product-card-price">' + esc(p.priceDisplay) + "</div>"
    : '<div class="product-card-price">Price on request</div>';
  var slug = esc(p.slug);

  return (
    '<article class="product-card">' +
    '<div class="product-card-cover"' + coverStyle + ">" +
    (p.coverImageUrl ? "" : "Cover pending") +
    "</div>" +
    '<div class="product-card-body">' +
    '<div class="product-card-cat">' + esc(p.category || p.audience || "Digital Product") + "</div>" +
    '<div class="product-card-title">' + esc(p.title) + "</div>" +
    '<div class="product-card-desc">' + esc(p.shortDescription) + "</div>" +
    priceHtml +
    '<div class="product-card-actions">' +
    '<a class="btn btn-line" href="product.html?slug=' + encodeURIComponent(slug) + '">View Product</a>' +
    '<a class="btn btn-gold" href="product.html?slug=' + encodeURIComponent(slug) + '#buy">Buy Now</a>' +
    "</div>" +
    "</div>" +
    "</article>"
  );
}

document.addEventListener("DOMContentLoaded", loadProducts);
