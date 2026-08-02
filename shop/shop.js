/* =====================================================
SENTINEL FORTUNE LLC — shop.js

Public catalogue. Fetches PUBLISHED products from the Shop Worker and renders
the grid. No client-side product data is ever trusted for price or
purchasability — everything shown is what the Worker returned.

Filtering, search and sorting all run over that same fetched list. They change
what is DISPLAYED and nothing else; there is no second data source and no
client-side notion of what is for sale.
===================================================== */
"use strict";

/* Must stay in step with _data/universes.yml. `category` is matched
   case-insensitively against the product's category field. */
var UNIVERSES = [
  { slug: "business",     category: "Business & Professional" },
  { slug: "education",    category: "Education & Learning" },
  { slug: "books",        category: "Books & Publishing" },
  { slug: "spirituality", category: "Spirituality & Reflection" },
  { slug: "software",     category: "Software & Digital Tools" }
];

var ALL = [];        // every product the Worker returned
var activeCat = "";  // "" = all universes
var activeQ = "";

function esc(s) {
  var d = document.createElement("div");
  d.textContent = String(s == null ? "" : s);
  return d.innerHTML;
}

function apiBase() {
  return (window.SHOP_API_BASE || "").replace(/\/$/, "");
}

/* Is the storefront actually wired to a Worker?
   shop-config.js ships with an unresolved placeholder until the Owner points
   it at a deployed Worker. Fetching that hostname fails with a network error,
   which the catch below would otherwise report as "temporarily unavailable" —
   language that implies a working shop having a bad moment. It is not
   temporary and it is not a fault: it is simply not connected yet, and the
   visitor deserves to be told which of the two it is. */
function isConfigured() {
  var b = apiBase();
  return !!b && b.indexOf("REPLACE_WITH") === -1;
}

function norm(s) {
  return String(s == null ? "" : s).trim().toLowerCase();
}

function catForSlug(slug) {
  for (var i = 0; i < UNIVERSES.length; i++) {
    if (UNIVERSES[i].slug === slug) return UNIVERSES[i].category;
  }
  return "";
}

function slugForCat(cat) {
  var n = norm(cat);
  for (var i = 0; i < UNIVERSES.length; i++) {
    if (norm(UNIVERSES[i].category) === n) return UNIVERSES[i].slug;
  }
  return "";
}

/* ── rendering ────────────────────────────────────────────────────────── */

function renderCard(p, opts) {
  opts = opts || {};
  var slug = encodeURIComponent(p.slug);
  var cat = p.category || p.audience || "Digital Product";

  var cover = p.coverImageUrl
    ? '<img class="product-card-img" src="' + esc(p.coverImageUrl) + '" alt="' +
      esc(p.title) + ' cover" loading="lazy" decoding="async" width="600" height="450">'
    : '<span class="product-card-nocover" aria-hidden="true">SF</span>';

  var price = p.priceDisplay
    ? '<div class="product-card-price">' + esc(p.priceDisplay) + "</div>"
    : '<div class="product-card-price product-card-price-tbc">Price on request</div>';

  var meta = [];
  if (p.supportedFormats) meta.push(esc(p.supportedFormats));
  if (p.version) meta.push("v" + esc(p.version));

  return (
    '<article class="product-card' + (opts.featured ? " is-featured" : "") + '">' +
      (opts.featured ? '<span class="product-card-flag">Featured</span>' : "") +
      '<a class="product-card-cover" href="product.html?slug=' + slug + '" tabindex="-1" aria-hidden="true">' +
        cover +
      "</a>" +
      '<div class="product-card-body">' +
        '<div class="product-card-cat">' + esc(cat) + "</div>" +
        '<h3 class="product-card-title"><a href="product.html?slug=' + slug + '">' + esc(p.title) + "</a></h3>" +
        '<p class="product-card-desc">' + esc(p.shortDescription) + "</p>" +
        (meta.length ? '<div class="product-card-meta">' + meta.join(" · ") + "</div>" : "") +
        price +
        '<div class="product-card-actions">' +
          '<a class="btn btn-line" href="product.html?slug=' + slug + '">View Product</a>' +
          '<a class="btn btn-gold" href="product.html?slug=' + slug + '#buy">Buy</a>' +
        "</div>" +
      "</div>" +
    "</article>"
  );
}

function matches(p) {
  if (activeCat && norm(p.category) !== norm(activeCat)) return false;
  if (!activeQ) return true;
  var hay = norm(p.title) + " " + norm(p.shortDescription) + " " +
            norm(p.category) + " " + norm(p.audience);
  /* Every term must appear somewhere. Two words should narrow the list,
     not widen it. */
  return activeQ.split(/\s+/).every(function (t) { return hay.indexOf(t) !== -1; });
}

function render() {
  var grid = document.getElementById("catalogGrid");
  var count = document.getElementById("catalogCount");
  if (!grid) return;

  var shown = ALL.filter(matches);

  if (count) {
    count.textContent = shown.length === ALL.length
      ? ALL.length + (ALL.length === 1 ? " product" : " products")
      : shown.length + " of " + ALL.length + " products";
  }

  if (shown.length === 0) {
    grid.innerHTML =
      '<div class="state-msg"><strong>Nothing matches that yet.</strong>' +
      "<span>No published product fits this filter right now. Try another universe, or " +
      '<a href="index.html">see everything</a>.</span></div>';
    return;
  }

  /* One featured slot, and only when there is a list to feature within.
     Featuring the sole product would be noise. */
  var feature = !activeCat && !activeQ && shown.length > 1;
  grid.innerHTML = shown.map(function (p, i) {
    return renderCard(p, { featured: feature && i === 0 });
  }).join("");
}

/* ── filter chips ─────────────────────────────────────────────────────── */

function buildFilters() {
  var bar = document.getElementById("catalogFilters");
  if (!bar) return;

  /* Only offer a universe that actually has a published product behind it.
     A chip leading to a guaranteed empty result is a dead end. */
  var present = {};
  ALL.forEach(function (p) {
    var s = slugForCat(p.category);
    if (s) present[s] = true;
  });
  var avail = UNIVERSES.filter(function (u) { return present[u.slug]; });

  if (avail.length < 2) { bar.innerHTML = ""; return; }

  bar.innerHTML =
    '<button class="cat-chip" data-cat="" type="button">All products</button>' +
    avail.map(function (u) {
      return '<button class="cat-chip" data-cat="' + u.slug + '" type="button">' +
             esc(u.category) + "</button>";
    }).join("");

  bar.addEventListener("click", function (e) {
    var b = e.target.closest(".cat-chip");
    if (!b) return;
    setCategory(b.getAttribute("data-cat"), true);
  });
  syncChips();
}

function syncChips() {
  var slug = slugForCat(activeCat);
  document.querySelectorAll(".cat-chip").forEach(function (b) {
    var on = b.getAttribute("data-cat") === slug;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
  });
}

function setCategory(slug, pushUrl) {
  activeCat = slug ? catForSlug(slug) : "";
  syncChips();
  render();
  if (pushUrl && window.history && window.history.replaceState) {
    var u = new URL(window.location.href);
    if (slug) u.searchParams.set("category", slug);
    else u.searchParams.delete("category");
    window.history.replaceState({}, "", u);
  }
}

/* ── boot ─────────────────────────────────────────────────────────────── */

async function loadProducts() {
  var grid = document.getElementById("catalogGrid");
  var tools = document.getElementById("catalogTools");
  if (!grid) return;

  if (!isConfigured()) {
    if (tools) tools.hidden = true;
    grid.innerHTML =
      '<div class="state-msg"><strong>The catalogue is not connected yet.</strong>' +
      "<span>Products will appear here once the storefront goes live. In the meantime the " +
      '<a href="../guides/">Guides</a> and <a href="../articles/">Articles</a> are free ' +
      "and need no account.</span></div>";
    return;
  }

  try {
    var res = await fetch(apiBase() + "/shop/products");
    if (!res.ok) throw new Error("HTTP " + res.status);
    var data = await res.json();
    ALL = (data && data.products) || [];

    if (ALL.length === 0) {
      if (tools) tools.hidden = true;
      grid.innerHTML =
        '<div class="state-msg"><strong>No products are published yet.</strong>' +
        "<span>The catalogue opens as products are finished. In the meantime the " +
        '<a href="../guides/">Guides</a> and <a href="../articles/">Articles</a> are free ' +
        "and need no account.</span></div>";
      return;
    }

    if (tools) tools.hidden = false;
    buildFilters();

    var qs = new URLSearchParams(window.location.search);
    var cat = qs.get("category");
    if (cat) activeCat = catForSlug(cat);
    syncChips();

    var box = document.getElementById("catalogSearch");
    if (box) {
      box.addEventListener("input", function () {
        activeQ = norm(box.value);
        render();
      });
    }

    render();
  } catch (err) {
    console.warn("[shop] failed to load products", err);
    if (tools) tools.hidden = true;
    grid.innerHTML =
      '<div class="state-msg"><strong>The catalogue is temporarily unavailable.</strong>' +
      "<span>Please try again shortly, or " +
      '<a href="contact.html">contact us</a> if this continues.</span></div>';
  }
}

document.addEventListener("DOMContentLoaded", loadProducts);
