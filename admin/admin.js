/* =====================================================
SENTINEL FORTUNE LLC — admin.js
Owner Admin UI logic for the Digital Shop.

Every request below goes to this page's OWN origin (/api/*),
which is the origin Cloudflare Access protects. The Pages
Function behind /api/* runs server-side, reads the Access
token from the authenticated request, and forwards it to the
Shop Worker, which verifies signature, issuer and audience on
every /shop/admin/* call. This file never sees, stores or
sends the Access JWT itself.

This file does not implement any username/password login —
there is no login form here by design.
===================================================== */
"use strict";

// ---------------------------------------------------------------------------
// Config — single source of truth is admin/admin-config.js (loaded before this
// file), mirroring the storefront's shop/shop-config.js convention. Do not
// hardcode an environment URL in this file.
// ---------------------------------------------------------------------------
function apiBase() {
  var base = (window.SHOP_API_BASE || "").trim();
  if (!base || base.indexOf("REPLACE_WITH") !== -1) return null;
  return base.replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function esc(s) {
  var d = document.createElement("div");
  d.textContent = String(s === undefined || s === null ? "" : s);
  return d.innerHTML;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
}

async function api(path, options) {
  options = options || {};
  var headers = options.headers || {};
  if (!(options.body instanceof FormData) && options.body) {
    headers["Content-Type"] = "application/json";
  }
  var base = apiBase();
  if (base === null) {
    return { ok: false, status: 0, data: { error: "Admin API base is not configured. Set window.SHOP_API_BASE in admin/admin-config.js." } };
  }
  // Same-origin by design — base is "/api", served by this Pages project's
  // own Function. "same-origin" rather than "include": if this is ever
  // repointed at another host, the request loses its credentials instead of
  // silently shipping them somewhere cross-site.
  var res = await fetch(base + path, {
    method: options.method || "GET",
    headers: headers,
    body: options.body,
    credentials: "same-origin",
  });
  var data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON response, e.g. file stream — not expected here */ }
  return { ok: res.ok, status: res.status, data: data };
}

function showMsg(container, text, kind) {
  var el = document.createElement("div");
  el.className = "msg " + (kind === "error" ? "msg-error" : "msg-ok");
  el.textContent = text;
  container.prepend(el);
  setTimeout(function () { el.remove(); }, 6000);
}

function badge(status) {
  var cls = "badge badge-" + String(status || "").toLowerCase();
  return '<span class="' + cls + '">' + esc(status) + "</span>";
}

// ---------------------------------------------------------------------------
// Access gate — every admin page calls this before rendering anything else.
// ---------------------------------------------------------------------------
async function requireAccess() {
  var result = await api("/shop/admin/whoami");
  if (!result.ok) {
    document.querySelector(".admin-app").innerHTML =
      '<div class="access-denied">' +
      "<h1>Access Denied</h1>" +
      "<p>This page requires Cloudflare Access authentication as the Sentinel Fortune LLC Owner. " +
      "If you were expecting access, confirm you reached this page through the Access-protected admin URL " +
      "(not a direct/unprotected copy), that <code>window.SHOP_API_BASE</code> is the same-origin " +
      "<code>/api</code> path rather than a Worker hostname, and that the Shop Worker's " +
      "<code>CF_ACCESS_TEAM_DOMAIN</code> / <code>CF_ACCESS_AUD</code> match your Access application.</p>" +
      "</div>";
    return null;
  }
  var whoEl = document.getElementById("whoami");
  if (whoEl) whoEl.textContent = result.data.email;
  return result.data;
}

// ---------------------------------------------------------------------------
// Dashboard (index.html)
// ---------------------------------------------------------------------------
async function renderDashboard() {
  var healthEl = document.getElementById("healthStat");
  var productsEl = document.getElementById("productsStat");
  var ordersEl = document.getElementById("ordersStat");
  var licensesEl = document.getElementById("licensesStat");
  var auditEl = document.getElementById("auditLog");

  var who = await api("/shop/admin/whoami");
  if (who.ok && who.data.publicShopBaseUrl) PUBLIC_SHOP_BASE = who.data.publicShopBaseUrl;

  var health = await api("/shop/health");
  if (healthEl) healthEl.textContent = health.ok ? "Live" : "Unreachable";
  if (healthEl) healthEl.className = "stat-value " + (health.ok ? "ok" : "err");

  var products = await api("/shop/admin/products");
  if (productsEl && products.ok) {
    var published = products.data.products.filter(function (p) { return p.status === "PUBLISHED"; }).length;
    productsEl.textContent = products.data.products.length + " total (" + published + " published)";
  }

  var orders = await api("/shop/admin/orders");
  if (ordersEl && orders.ok) ordersEl.textContent = String(orders.data.orders.length);

  var licenses = await api("/shop/admin/licenses");
  if (licensesEl && licenses.ok) licensesEl.textContent = String(licenses.data.licenses.length);

  var audit = await api("/shop/admin/audit-log");
  if (auditEl) {
    if (audit.ok && audit.data.entries.length > 0) {
      auditEl.innerHTML = audit.data.entries.slice(0, 25).map(function (e) {
        return '<tr><td>' + esc(fmtDate(e.created_at)) + '</td><td>' + esc(e.actor) + '</td><td>' + esc(e.action) +
          '</td><td>' + esc(e.target_type) + " " + esc(e.target_id).slice(0, 8) + "</td></tr>";
      }).join("");
    } else {
      auditEl.innerHTML = '<tr class="empty-row"><td colspan="4">No admin activity recorded yet.</td></tr>';
    }
  }
}

// ---------------------------------------------------------------------------
// Products list (products.html)
// ---------------------------------------------------------------------------
async function renderProductsList() {
  var tbody = document.getElementById("productsTableBody");
  if (!tbody) return;

  if (!PUBLIC_SHOP_BASE) {
    var w = await api("/shop/admin/whoami");
    if (w.ok && w.data.publicShopBaseUrl) PUBLIC_SHOP_BASE = w.data.publicShopBaseUrl;
  }

  var result = await api("/shop/admin/products");
  if (!result.ok) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Failed to load products.</td></tr>';
    return;
  }

  var products = result.data.products;
  if (products.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No products yet. Click "New Product" to create one.</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(function (p) {
    var readiness = p.readiness.ready ? '<span class="badge badge-published">Ready</span>' : '<span class="badge badge-unpublished">' + p.readiness.errors.length + " issue(s)</span>";
    return (
      "<tr>" +
      '<td><a href="product-editor.html?id=' + esc(p.id) + '" style="color:var(--gold3)">' + esc(p.title) + "</a><br>" +
      '<span style="color:var(--muted2);font-size:.72rem">' + esc(p.slug) + "</span></td>" +
      "<td>" + badge(p.status) + "</td>" +
      "<td>" + (p.priceDisplay || "Not set") + (p.priceConfirmed ? "" : ' <span class="badge badge-draft">unconfirmed</span>') + "</td>" +
      "<td>" + esc(p.licenseType) + "</td>" +
      "<td>" + readiness + "</td>" +
      '<td><div class="btn-row">' +
      '<a class="btn btn-sm" href="product-editor.html?id=' + esc(p.id) + '">Edit</a>' +
      productActionButtons(p) +
      "</div></td>" +
      "</tr>"
    );
  }).join("");

  tbody.querySelectorAll("[data-action]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var action = btn.getAttribute("data-action");
      var id = btn.getAttribute("data-id");
      btn.disabled = true;
      var res = await api("/shop/admin/products/" + id + "/" + action, { method: "POST" });
      if (!res.ok) {
        alert((res.data && (res.data.error || (res.data.errors || []).join("\n"))) || "Action failed.");
      }
      renderProductsList();
    });
  });
}

/* Public shop origin, learned at runtime from /shop/admin/whoami. Never
   hardcoded: the Admin is a separate application and the storefront's address
   is the Worker's to state, not the bundle's to assume. */
var PUBLIC_SHOP_BASE = "";

function publicProductUrl(slug) {
  if (!PUBLIC_SHOP_BASE || !slug) return "";
  return PUBLIC_SHOP_BASE.replace(/\/$/, "") + "/product.html?slug=" + encodeURIComponent(slug);
}

function productActionButtons(p) {
  var buttons = "";
  /* Only a PUBLISHED product has a public page. Offering the link for a draft
     would send the Owner to a 404 and imply the product is live when it is not. */
  if (p.status === "PUBLISHED" && publicProductUrl(p.slug)) {
    buttons += '<a class="btn btn-sm" target="_blank" rel="noopener noreferrer" href="' +
      esc(publicProductUrl(p.slug)) + '">View live</a>';
  }
  if (p.status === "DRAFT" || p.status === "UNPUBLISHED") {
    buttons += '<button class="btn btn-sm btn-primary" data-action="publish" data-id="' + esc(p.id) + '">Publish</button>';
  }
  if (p.status === "PUBLISHED") {
    buttons += '<button class="btn btn-sm" data-action="unpublish" data-id="' + esc(p.id) + '">Unpublish</button>';
  }
  if (p.status !== "ARCHIVED") {
    buttons += '<button class="btn btn-sm btn-danger" data-action="archive" data-id="' + esc(p.id) + '">Archive</button>';
  }
  buttons += '<button class="btn btn-sm" data-action="duplicate" data-id="' + esc(p.id) + '">Duplicate</button>';
  return buttons;
}


// ---------------------------------------------------------------------------
// Governed product-package import (products.html)
//
// Two server round trips by design. "Validate package" calls
// /shop/admin/import/validate, which writes nothing and returns a preview.
// Only after the Owner confirms does "Import" call /shop/admin/import/commit,
// which re-runs the identical validation before it touches anything. The
// browser is never the authority on whether a package is acceptable.
// ---------------------------------------------------------------------------
function initImport() {
  var openBtn = document.getElementById("importBtn");
  var panel = document.getElementById("importPanel");
  if (!openBtn || !panel) return;

  var fileInput = document.getElementById("importFile");
  var validateBtn = document.getElementById("importValidateBtn");
  var cancelBtn = document.getElementById("importCancelBtn");
  var result = document.getElementById("importResult");

  function reset() {
    result.innerHTML = "";
    fileInput.value = "";
    validateBtn.disabled = false;
  }

  openBtn.addEventListener("click", function () {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { reset(); panel.scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
  cancelBtn.addEventListener("click", function () { panel.hidden = true; reset(); });

  validateBtn.addEventListener("click", async function () {
    var file = fileInput.files[0];
    if (!file) { renderImportErrors(["Choose a package file first."], []); return; }

    validateBtn.disabled = true;
    result.innerHTML = '<div class="state-msg">Validating ' + esc(file.name) + "…</div>";

    var form = new FormData();
    form.set("file", file);
    var res = await api("/shop/admin/import/validate", { method: "POST", body: form });
    validateBtn.disabled = false;

    var data = res.data || {};
    if (!res.ok || data.valid === false) {
      renderImportErrors(data.errors || ["The package could not be validated."], data.warnings || []);
      return;
    }
    renderImportPreview(data, file);
  });

  function renderImportErrors(errors, warnings) {
    result.innerHTML =
      '<div class="import-verdict is-fail"><strong>Package rejected — nothing was imported.</strong></div>' +
      '<ul class="import-issues">' + errors.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul>" +
      (warnings.length
        ? '<p class="hint" style="margin-top:10px">Also noted: ' + warnings.map(esc).join(" ") + "</p>"
        : "");
  }

  function renderImportPreview(data, file) {
    var p = data.preview || {};
    var rows = [
      ["SKU", p.sku], ["Version", p.version], ["Title", p.title], ["Slug", p.slug],
      ["Edition", p.edition], ["Category", p.category], ["Audience", p.audience],
      ["License", p.licenseType], ["Formats", p.supportedFormats],
      ["Deliverables", (p.deliverables || []).length + " listed"],
      ["Not included", (p.notIncluded || []).length + " listed"],
      ["FAQs", (p.faqs || []).length],
      ["Recommended price", p.recommendedPriceDisplay || "none in manifest"],
      ["Cover image", p.coverImage || "none — you will need to upload one"],
      ["Package", esc(p.packageFilename) + " · " + Math.round((p.packageBytes || 0) / 1024) + " KB · " + p.fileCount + " files"],
      ["Produced by", p.producer || "not stated"],
      ["Built", p.builtAt || "not stated"]
    ];

    var updating = p.existingProduct;
    var html =
      '<div class="import-verdict is-ok"><strong>Package valid.</strong> ' +
      (updating
        ? "This will UPDATE the existing draft &ldquo;" + esc(updating.title) + "&rdquo; (version " + esc(updating.version) + ")."
        : "This will create a new draft product.") +
      "</div>" +
      (data.warnings && data.warnings.length
        ? '<ul class="import-issues is-warn">' + data.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>"
        : "") +
      '<table class="data-table import-preview"><tbody>' +
      rows.map(function (r) {
        return "<tr><th>" + esc(r[0]) + "</th><td>" + esc(r[1] === undefined || r[1] === null || r[1] === "" ? "—" : r[1]) + "</td></tr>";
      }).join("") +
      "</tbody></table>" +
      '<div class="import-governance">' +
      "The import stops at a draft. It will <strong>not</strong> confirm the price, tick the Owner terms " +
      "acknowledgement, make the product purchasable, or publish it. Those remain yours." +
      "</div>" +
      '<div class="btn-row" style="margin-top:16px">' +
      '<button class="btn btn-primary" id="importCommitBtn" type="button">' +
      (updating ? "Update the existing draft" : "Import as draft") + "</button>" +
      '<button class="btn" id="importAbortBtn" type="button">Cancel</button>' +
      "</div>";

    result.innerHTML = html;

    document.getElementById("importAbortBtn").addEventListener("click", function () { reset(); });
    document.getElementById("importCommitBtn").addEventListener("click", async function () {
      var btn = document.getElementById("importCommitBtn");
      btn.disabled = true;
      btn.textContent = "Importing…";

      var form = new FormData();
      form.set("file", file);
      var path = "/shop/admin/import/commit" + (updating ? "?mode=update" : "");
      var res = await api(path, { method: "POST", body: form });

      var d = res.data || {};
      if (!res.ok || !d.imported) {
        renderImportErrors(d.errors || ["The import failed. Nothing was changed."], d.warnings || []);
        return;
      }
      renderImportSuccess(d);
    });
  }

  function renderImportSuccess(d) {
    var remaining = d.remaining || [];
    result.innerHTML =
      '<div class="import-verdict is-ok"><strong>Imported as a draft.</strong> ' +
      esc(d.title) + " (" + esc(d.sku) + " v" + esc(d.version) + ") — " +
      (d.mode === "update" ? "existing draft updated" : "new draft created") + "." +
      "</div>" +
      "<ul class=\"import-issues is-done\">" +
      "<li>Package stored privately and attached (" + Math.round((d.packageBytes || 0) / 1024) + " KB).</li>" +
      "<li>Cover image: " + (d.coverImported ? "imported from the package." : "not in the package.") + "</li>" +
      "<li>Recommended price " + esc(d.recommendedPriceDisplay || "not set") + " — <strong>not confirmed</strong>.</li>" +
      "</ul>" +
      (remaining.length
        ? "<h3 style=\"margin-top:16px\">Before this can be published</h3>" +
          '<ul class="import-issues is-warn">' + remaining.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>"
        : '<p class="hint" style="margin-top:12px">No outstanding readiness issues.</p>') +
      '<div class="btn-row" style="margin-top:16px">' +
      '<a class="btn btn-primary" href="product-editor.html?id=' + esc(d.productId) + '">Open the draft</a>' +
      '<button class="btn" id="importDoneBtn" type="button">Import another</button>' +
      "</div>";

    document.getElementById("importDoneBtn").addEventListener("click", function () { reset(); });
    renderProductsList();
  }
}

// ---------------------------------------------------------------------------
// Product editor (product-editor.html)
// ---------------------------------------------------------------------------
var currentProductId = null;

async function renderProductEditor() {
  var params = new URLSearchParams(window.location.search);
  currentProductId = params.get("id");
  var isNew = !currentProductId || currentProductId === "new";

  document.getElementById("editorTitle").textContent = isNew ? "New Product" : "Edit Product";

  var form = document.getElementById("productForm");
  var assetsPanel = document.getElementById("assetsPanel");
  var readinessPanel = document.getElementById("readinessPanel");
  var priceForm = document.getElementById("priceForm");
  var lifecyclePanel = document.getElementById("lifecyclePanel");

  if (isNew) {
    assetsPanel.style.display = "none";
    readinessPanel.style.display = "none";
    priceForm.style.display = "none";
    lifecyclePanel.style.display = "none";
  } else {
    var result = await api("/shop/admin/products/" + currentProductId);
    if (!result.ok) {
      form.innerHTML = '<div class="msg msg-error">Product not found.</div>';
      return;
    }
    fillForm(result.data.product);
    renderReadiness(result.data.product.readiness);
    renderAssets(result.data.product);
    renderLifecycle(result.data.product);
    document.getElementById("priceInput").value = result.data.product.priceCents ? (result.data.product.priceCents / 100).toFixed(2) : "";
    document.getElementById("priceConfirmCheck").checked = result.data.product.priceConfirmed;
  }

  form.addEventListener("submit", handleProductFormSubmit);
  priceForm.addEventListener("submit", handlePriceFormSubmit);
  document.getElementById("previewBtn").addEventListener("click", showPreview);
}

function fillForm(p) {
  var f = document.getElementById("productForm");
  f.sku.value = p.sku || "";
  f.slug.value = p.slug || "";
  f.title.value = p.title || "";
  f.shortDescription.value = p.shortDescription || "";
  f.problemSolved.value = p.problemSolved || "";
  f.description.value = p.description || "";
  f.category.value = p.category || "";
  f.audience.value = p.audience || "";
  f.edition.value = p.edition || "";
  f.version.value = p.version || "1.0";
  f.licenseType.value = p.licenseType || "SINGLE_BUSINESS";
  f.supportedFormats.value = p.supportedFormats || "";
  f.responsibleUseText.value = p.responsibleUseText || "";
  f.refundEligible.checked = !!p.refundEligible;
  f.refundPolicySummary.value = p.refundPolicySummary || "";
  f.termsAcknowledged.checked = !!p.termsAcknowledged;
  f.downloadLinkExpiryHours.value = p.downloadLinkExpiryHours || 72;
  f.maxDownloads.value = p.maxDownloads || 5;
  setListEditor("deliverablesEditor", p.deliverables || []);
  setListEditor("notIncludedEditor", p.notIncluded || []);
  setFaqEditor(p.faqs || []);
}

function setListEditor(containerId, items) {
  var container = document.getElementById(containerId);
  container.innerHTML = "";
  (items.length ? items : [""]).forEach(function (val) { addListRow(container, val); });
}

function addListRow(container, value) {
  var row = document.createElement("div");
  row.className = "list-editor-row";
  row.innerHTML = '<input type="text" value="' + esc(value || "") + '"><button type="button" class="btn btn-sm btn-danger">✕</button>';
  row.querySelector("button").addEventListener("click", function () { row.remove(); });
  container.appendChild(row);
}

function readListEditor(containerId) {
  return Array.from(document.getElementById(containerId).querySelectorAll("input"))
    .map(function (i) { return i.value.trim(); })
    .filter(function (v) { return v.length > 0; });
}

function setFaqEditor(faqs) {
  var container = document.getElementById("faqsEditor");
  container.innerHTML = "";
  (faqs.length ? faqs : [{ q: "", a: "" }]).forEach(addFaqRow);
}

function addFaqRow(faq) {
  var container = document.getElementById("faqsEditor");
  var row = document.createElement("div");
  row.className = "faq-editor-row";
  row.innerHTML =
    '<input type="text" placeholder="Question" class="faq-q" value="' + esc((faq && faq.q) || "") + '">' +
    '<input type="text" placeholder="Answer" class="faq-a" value="' + esc((faq && faq.a) || "") + '">' +
    '<button type="button" class="btn btn-sm btn-danger">✕</button>';
  row.querySelector("button").addEventListener("click", function () { row.remove(); });
  container.appendChild(row);
}

function readFaqEditor() {
  return Array.from(document.getElementById("faqsEditor").querySelectorAll(".faq-editor-row"))
    .map(function (row) {
      return { q: row.querySelector(".faq-q").value.trim(), a: row.querySelector(".faq-a").value.trim() };
    })
    .filter(function (f) { return f.q.length > 0 || f.a.length > 0; });
}

async function handleProductFormSubmit(evt) {
  evt.preventDefault();
  var f = evt.target;
  var isNew = !currentProductId || currentProductId === "new";

  var body = {
    sku: f.sku.value.trim(),
    slug: f.slug.value.trim(),
    title: f.title.value.trim(),
    shortDescription: f.shortDescription.value.trim(),
    problemSolved: f.problemSolved.value.trim(),
    description: f.description.value.trim(),
    category: f.category.value.trim(),
    audience: f.audience.value.trim(),
    edition: f.edition.value.trim(),
    version: f.version.value.trim(),
    licenseType: f.licenseType.value,
    supportedFormats: f.supportedFormats.value.trim(),
    responsibleUseText: f.responsibleUseText.value.trim(),
    refundEligible: f.refundEligible.checked,
    refundPolicySummary: f.refundPolicySummary.value.trim(),
    termsAcknowledged: f.termsAcknowledged.checked,
    downloadLinkExpiryHours: Number(f.downloadLinkExpiryHours.value),
    maxDownloads: Number(f.maxDownloads.value),
    deliverables: readListEditor("deliverablesEditor"),
    notIncluded: readListEditor("notIncludedEditor"),
    faqs: readFaqEditor(),
  };

  var result = isNew
    ? await api("/shop/admin/products", { method: "POST", body: JSON.stringify(body) })
    : await api("/shop/admin/products/" + currentProductId, { method: "PUT", body: JSON.stringify(body) });

  var msgContainer = document.getElementById("editorMessages");
  if (!result.ok) {
    var errText = (result.data && (result.data.errors ? result.data.errors.join(" ") : result.data.error)) || "Save failed.";
    showMsg(msgContainer, errText, "error");
    return;
  }

  showMsg(msgContainer, "Saved.", "ok");
  if (isNew) {
    window.location.href = "product-editor.html?id=" + result.data.product.id;
  } else {
    renderReadiness(result.data.product.readiness);
  }
}

async function handlePriceFormSubmit(evt) {
  evt.preventDefault();
  if (!currentProductId || currentProductId === "new") {
    alert("Save the product before setting a price.");
    return;
  }
  var priceInput = document.getElementById("priceInput").value;
  var confirmChecked = document.getElementById("priceConfirmCheck").checked;

  var result = await api("/shop/admin/products/" + currentProductId + "/price", {
    method: "POST",
    body: JSON.stringify({ priceInput: priceInput, confirm: confirmChecked }),
  });

  var msgContainer = document.getElementById("editorMessages");
  if (!result.ok) {
    showMsg(msgContainer, (result.data && result.data.error) || "Could not set price.", "error");
    return;
  }
  showMsg(msgContainer, "Price updated.", "ok");
  renderReadiness(result.data.product.readiness);
}

function renderReadiness(readiness) {
  var panel = document.getElementById("readinessPanel");
  if (!panel) return;
  if (readiness.ready) {
    panel.innerHTML = '<div class="readiness-ok">✓ Ready to publish — all requirements met.</div>';
  } else {
    panel.innerHTML = '<ul class="readiness-errors">' + readiness.errors.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul>";
  }
}

function renderLifecycle(p) {
  var panel = document.getElementById("lifecyclePanel");
  if (!panel) return;
  panel.innerHTML =
    '<div class="btn-row">' +
    (p.status !== "PUBLISHED" ? '<button class="btn btn-primary" id="publishBtn">Publish</button>' : '<button class="btn" id="unpublishBtn">Unpublish</button>') +
    '<button class="btn btn-danger" id="archiveBtn">Archive</button>' +
    '<button class="btn" id="duplicateBtn">Duplicate</button>' +
    "</div>" +
    '<p style="margin-top:10px;font-size:.78rem;color:var(--muted2)">Status: ' + badge(p.status) + "</p>";

  var publishBtn = document.getElementById("publishBtn");
  if (publishBtn) publishBtn.addEventListener("click", function () { runLifecycleAction("publish"); });
  var unpublishBtn = document.getElementById("unpublishBtn");
  if (unpublishBtn) unpublishBtn.addEventListener("click", function () { runLifecycleAction("unpublish"); });
  document.getElementById("archiveBtn").addEventListener("click", function () { runLifecycleAction("archive"); });
  document.getElementById("duplicateBtn").addEventListener("click", async function () {
    var result = await api("/shop/admin/products/" + currentProductId + "/duplicate", { method: "POST" });
    if (result.ok) window.location.href = "product-editor.html?id=" + result.data.product.id;
  });
}

async function runLifecycleAction(action) {
  var result = await api("/shop/admin/products/" + currentProductId + "/" + action, { method: "POST" });
  var msgContainer = document.getElementById("editorMessages");
  if (!result.ok) {
    showMsg(msgContainer, (result.data && (result.data.errors || []).join(" ")) || "Action failed.", "error");
    return;
  }
  showMsg(msgContainer, "Product " + action + "ed.", "ok");
  renderReadiness(result.data.product.readiness);
  renderLifecycle(result.data.product);
}

function renderAssets(p) {
  var imageGrid = document.getElementById("imageGrid");
  imageGrid.innerHTML = p.images.map(function (img) {
    return (
      '<div class="image-thumb"><img src="' + esc(img.url) + '" alt=""><button class="thumb-remove" data-image-id="' + esc(img.id) + '" title="Delete">✕</button>' +
      '<div class="thumb-kind">' + esc(img.kind) + "</div></div>"
    );
  }).join("");
  imageGrid.querySelectorAll("[data-image-id]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      if (!confirm("Delete this image?")) return;
      await api("/shop/admin/products/" + currentProductId + "/images/" + btn.getAttribute("data-image-id"), { method: "DELETE" });
      var refreshed = await api("/shop/admin/products/" + currentProductId);
      if (refreshed.ok) { renderAssets(refreshed.data.product); renderReadiness(refreshed.data.product.readiness); }
    });
  });

  var fileList = document.getElementById("fileList");
  fileList.innerHTML = p.files.length
    ? p.files.map(function (f) {
        return (
          '<div class="file-row"><span class="file-name">' + esc(f.filename) + '</span>' +
          '<span class="file-meta">' + Math.round(f.sizeBytes / 1024) + " KB</span>" +
          '<button class="btn btn-sm btn-danger" data-file-id="' + esc(f.id) + '">Delete</button></div>'
        );
      }).join("")
    : '<p style="color:var(--muted2);font-size:.8rem">No downloadable files uploaded yet.</p>';
  fileList.querySelectorAll("[data-file-id]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      if (!confirm("Delete this file? This cannot be undone.")) return;
      await api("/shop/admin/products/" + currentProductId + "/files/" + btn.getAttribute("data-file-id"), { method: "DELETE" });
      var refreshed = await api("/shop/admin/products/" + currentProductId);
      if (refreshed.ok) { renderAssets(refreshed.data.product); renderReadiness(refreshed.data.product.readiness); }
    });
  });
}

function initUploadForms() {
  var coverForm = document.getElementById("coverUploadForm");
  var previewForm = document.getElementById("previewUploadForm");
  var fileForm = document.getElementById("fileUploadForm");

  if (coverForm) coverForm.addEventListener("submit", function (e) { handleUpload(e, "images", { kind: "COVER" }); });
  if (previewForm) previewForm.addEventListener("submit", function (e) { handleUpload(e, "images", { kind: "PREVIEW" }); });
  if (fileForm) fileForm.addEventListener("submit", function (e) { handleUpload(e, "files", {}); });
}

async function handleUpload(evt, endpoint, extraFields) {
  evt.preventDefault();
  if (!currentProductId || currentProductId === "new") {
    alert("Save the product before uploading files.");
    return;
  }
  var input = evt.target.querySelector('input[type="file"]');
  if (!input.files[0]) return;

  var formData = new FormData();
  formData.set("file", input.files[0]);
  Object.keys(extraFields).forEach(function (k) { formData.set(k, extraFields[k]); });

  var submitBtn = evt.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  var result = await api("/shop/admin/products/" + currentProductId + "/" + endpoint, { method: "POST", body: formData });
  submitBtn.disabled = false;

  var msgContainer = document.getElementById("editorMessages");
  if (!result.ok) {
    showMsg(msgContainer, (result.data && result.data.error) || "Upload failed.", "error");
    return;
  }
  input.value = "";
  showMsg(msgContainer, "Uploaded.", "ok");
  var refreshed = await api("/shop/admin/products/" + currentProductId);
  if (refreshed.ok) { renderAssets(refreshed.data.product); renderReadiness(refreshed.data.product.readiness); }
}

async function showPreview() {
  var panel = document.getElementById("previewPanel");
  if (!currentProductId || currentProductId === "new") {
    alert("Save the product before previewing.");
    return;
  }
  var result = await api("/shop/admin/products/" + currentProductId + "/preview");
  if (!result.ok) return;
  var p = result.data.product;
  panel.style.display = "block";
  panel.innerHTML =
    '<h2>Public Preview</h2>' +
    '<div style="border:1px solid var(--gold-line);border-radius:8px;padding:20px;background:var(--card)">' +
    (p.coverImageUrl ? '<img src="' + esc(p.coverImageUrl) + '" style="max-width:280px;border-radius:6px;margin-bottom:14px">' : "") +
    '<div style="font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--gold)">' + esc(p.category || p.audience) + "</div>" +
    "<h3 style=\"font-family:var(--ff1);font-size:1.5rem;margin:6px 0\">" + esc(p.title) + "</h3>" +
    "<p style=\"color:var(--muted);font-size:.85rem;margin-bottom:10px\">" + esc(p.shortDescription) + "</p>" +
    '<div style="color:var(--gold3);font-family:var(--ff2);font-size:1.1rem">' + esc(p.priceDisplay) + "</div>" +
    (p.status !== "PUBLISHED" ? '<p style="margin-top:12px;color:var(--warn);font-size:.78rem">Status: ' + esc(p.status) + " — not visible to the public until published.</p>" : "") +
    "</div>";
}

// ---------------------------------------------------------------------------
// Orders (orders.html)
// ---------------------------------------------------------------------------
async function renderOrdersList() {
  var tbody = document.getElementById("ordersTableBody");
  if (!tbody) return;
  var result = await api("/shop/admin/orders");
  if (!result.ok) { tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Failed to load orders.</td></tr>'; return; }

  var orders = result.data.orders;
  if (orders.length === 0) { tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No orders yet.</td></tr>'; return; }

  tbody.innerHTML = orders.map(function (o) {
    return (
      "<tr>" +
      "<td>" + esc(o.orderNumber) + "</td>" +
      "<td>" + esc(o.productTitle) + "</td>" +
      "<td>" + esc(o.customerEmail) + "</td>" +
      "<td>" + esc(o.amountDisplay) + "</td>" +
      "<td>" + badge(o.status) + "</td>" +
      '<td><button class="btn btn-sm" data-order-id="' + esc(o.id) + '">Details</button></td>' +
      "</tr>" +
      '<tr class="order-detail-row" id="detail-' + esc(o.id) + '" style="display:none"><td colspan="6"></td></tr>'
    );
  }).join("");

  tbody.querySelectorAll("[data-order-id]").forEach(function (btn) {
    btn.addEventListener("click", function () { toggleOrderDetail(btn.getAttribute("data-order-id")); });
  });
}

async function toggleOrderDetail(orderId) {
  var row = document.getElementById("detail-" + orderId);
  if (row.style.display === "table-row") { row.style.display = "none"; return; }

  var result = await api("/shop/admin/orders/" + orderId);
  if (!result.ok) return;
  var o = result.data.order;

  var authRows = o.downloadAuthorizations.map(function (a) {
    return "<li>" + esc(a.downloadCount) + "/" + esc(a.maxDownloads) + " downloads used · expires " + esc(fmtDate(a.expiresAt)) +
      (a.revoked ? " · <span style=\"color:var(--danger)\">revoked</span>" : "") + "</li>";
  }).join("") || "<li>No download authorizations found.</li>";

  row.querySelector("td").innerHTML =
    '<div class="panel" style="margin:0">' +
    "<p><strong>License:</strong> " + (o.license ? esc(o.license.licenseNumber) + " (" + badge(o.license.status) + ")" : "none") + "</p>" +
    "<p><strong>Stripe session:</strong> " + esc(o.stripeCheckoutSessionId || "—") + "</p>" +
    "<p><strong>Paid at:</strong> " + esc(fmtDate(o.paidAt)) + "</p>" +
    "<p style=\"margin-top:10px\"><strong>Download authorizations:</strong></p><ul>" + authRows + "</ul>" +
    '<div class="btn-row" style="margin-top:14px">' +
    '<button class="btn btn-sm" data-resend="' + esc(o.id) + '">Resend Confirmation Email</button>' +
    '<button class="btn btn-sm btn-primary" data-replacement="' + esc(o.id) + '">Generate Replacement Download Link</button>' +
    (o.license && o.license.status === "ACTIVE" ? '<button class="btn btn-sm btn-danger" data-revoke-license="' + esc(o.license.id) + '">Revoke License</button>' : "") +
    "</div></div>";

  row.style.display = "table-row";

  var resendBtn = row.querySelector("[data-resend]");
  if (resendBtn) resendBtn.addEventListener("click", async function () {
    resendBtn.disabled = true;
    var r = await api("/shop/admin/orders/" + orderId + "/resend-email", { method: "POST" });
    alert(r.ok ? "Confirmation email resent." : ((r.data && r.data.error) || "Failed to resend."));
    resendBtn.disabled = false;
  });
  var replacementBtn = row.querySelector("[data-replacement]");
  if (replacementBtn) replacementBtn.addEventListener("click", async function () {
    replacementBtn.disabled = true;
    var r = await api("/shop/admin/orders/" + orderId + "/replacement-link", { method: "POST" });
    if (r.ok) {
      alert("Replacement link generated" + (r.data.emailSent ? " and emailed to the customer." : " (email delivery failed — link: " + r.data.downloadUrl + ")"));
    } else {
      alert((r.data && r.data.error) || "Failed to generate replacement link.");
    }
    replacementBtn.disabled = false;
  });
  var revokeBtn = row.querySelector("[data-revoke-license]");
  if (revokeBtn) revokeBtn.addEventListener("click", async function () {
    if (!confirm("Revoke this license? The customer will lose download access immediately.")) return;
    await api("/shop/admin/licenses/" + revokeBtn.getAttribute("data-revoke-license") + "/revoke", { method: "POST" });
    toggleOrderDetail(orderId);
    toggleOrderDetail(orderId);
  });
}

// ---------------------------------------------------------------------------
// Licenses (licenses.html)
// ---------------------------------------------------------------------------
async function renderLicensesList() {
  var tbody = document.getElementById("licensesTableBody");
  if (!tbody) return;
  var result = await api("/shop/admin/licenses");
  if (!result.ok) { tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Failed to load licenses.</td></tr>'; return; }

  var licenses = result.data.licenses;
  if (licenses.length === 0) { tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No licenses issued yet.</td></tr>'; return; }

  tbody.innerHTML = licenses.map(function (l) {
    return (
      "<tr>" +
      "<td>" + esc(l.licenseNumber) + "</td>" +
      "<td>" + esc(l.productTitle) + "</td>" +
      "<td>" + esc(l.purchaserEmail) + "</td>" +
      "<td>" + esc(l.licenseType) + "</td>" +
      "<td>" + badge(l.status) + "</td>" +
      '<td>' + (l.status === "ACTIVE" ? '<button class="btn btn-sm btn-danger" data-license-id="' + esc(l.id) + '">Revoke</button>' : "—") + "</td>" +
      "</tr>"
    );
  }).join("");

  tbody.querySelectorAll("[data-license-id]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      if (!confirm("Revoke this license?")) return;
      await api("/shop/admin/licenses/" + btn.getAttribute("data-license-id") + "/revoke", { method: "POST" });
      renderLicensesList();
    });
  });
}

// ---------------------------------------------------------------------------
// Files — aggregated view across all products (files.html)
// ---------------------------------------------------------------------------
async function renderFilesList() {
  var tbody = document.getElementById("filesTableBody");
  if (!tbody) return;
  var result = await api("/shop/admin/products");
  if (!result.ok) { tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Failed to load files.</td></tr>'; return; }

  var rows = [];
  result.data.products.forEach(function (p) {
    p.images.forEach(function (img) {
      rows.push({ productId: p.id, productTitle: p.title, kind: img.kind, name: img.kind + " image", url: img.url, deleteUrl: "/shop/admin/products/" + p.id + "/images/" + img.id });
    });
    p.files.forEach(function (f) {
      rows.push({ productId: p.id, productTitle: p.title, kind: "DOWNLOAD", name: f.filename, sizeBytes: f.sizeBytes, deleteUrl: "/shop/admin/products/" + p.id + "/files/" + f.id });
    });
  });

  if (rows.length === 0) { tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No files uploaded yet. Upload covers, previews, and downloadable files from each product\'s editor page.</td></tr>'; return; }

  tbody.innerHTML = rows.map(function (r, i) {
    return (
      "<tr>" +
      '<td><a href="product-editor.html?id=' + esc(r.productId) + '" style="color:var(--gold3)">' + esc(r.productTitle) + "</a></td>" +
      "<td>" + esc(r.kind) + "</td>" +
      "<td>" + esc(r.name) + "</td>" +
      "<td>" + (r.sizeBytes ? Math.round(r.sizeBytes / 1024) + " KB" : "—") + "</td>" +
      '<td><button class="btn btn-sm btn-danger" data-row="' + i + '">Delete</button></td>' +
      "</tr>"
    );
  }).join("");

  tbody.querySelectorAll("[data-row]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var r = rows[Number(btn.getAttribute("data-row"))];
      if (!confirm("Delete " + r.name + " from " + r.productTitle + "?")) return;
      await api(r.deleteUrl, { method: "DELETE" });
      renderFilesList();
    });
  });
}

// ---------------------------------------------------------------------------
// Settings (settings.html)
// ---------------------------------------------------------------------------
async function renderSettings() {
  var form = document.getElementById("settingsForm");
  if (!form) return;

  var result = await api("/shop/admin/settings");
  if (result.ok) {
    form.defaultDownloadExpiryHours.value = result.data.settings.default_download_expiry_hours || 72;
    form.defaultMaxDownloads.value = result.data.settings.default_max_downloads || 5;
    form.supportEmail.value = result.data.settings.support_email || "";
  }

  form.addEventListener("submit", async function (evt) {
    evt.preventDefault();
    var body = {
      defaultDownloadExpiryHours: Number(form.defaultDownloadExpiryHours.value),
      defaultMaxDownloads: Number(form.defaultMaxDownloads.value),
      supportEmail: form.supportEmail.value.trim(),
    };
    var res = await api("/shop/admin/settings", { method: "POST", body: JSON.stringify(body) });
    var msgContainer = document.getElementById("settingsMessages");
    showMsg(msgContainer, res.ok ? "Settings saved." : ((res.data && res.data.error) || "Save failed."), res.ok ? "ok" : "error");
  });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async function () {
  var identity = await requireAccess();
  if (!identity) return;

  var page = document.body.getAttribute("data-page");
  if (page === "dashboard") renderDashboard();
  if (page === "products") { renderProductsList(); initImport(); }
  if (page === "product-editor") { await renderProductEditor(); initUploadForms(); }
  if (page === "orders") renderOrdersList();
  if (page === "licenses") renderLicensesList();
  if (page === "files") renderFilesList();
  if (page === "settings") renderSettings();
});
