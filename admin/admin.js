/* =====================================================
SENTINEL FORTUNE LLC — admin.js
Owner Admin UI logic for the Digital Shop. Every request
below is sent with credentials so the Cloudflare Access
cookie (CF_Authorization) is included; the Shop Worker
verifies that JWT server-side on every /shop/admin/* call
regardless of how this page was reached. This file does
not implement any username/password login — there is no
login form here by design.
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
    return { ok: false, status: 0, data: { error: "Shop Worker URL is not configured. Set window.SHOP_API_BASE in admin/admin-config.js." } };
  }
  var res = await fetch(base + path, {
    method: options.method || "GET",
    headers: headers,
    body: options.body,
    credentials: "include",
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
      "(not a direct/unprotected copy), and that the Shop Worker's <code>CF_ACCESS_TEAM_DOMAIN</code> / " +
      "<code>CF_ACCESS_AUD</code> configuration matches your Access application.</p>" +
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

function productActionButtons(p) {
  var buttons = "";
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
  if (page === "products") renderProductsList();
  if (page === "product-editor") { await renderProductEditor(); initUploadForms(); }
  if (page === "orders") renderOrdersList();
  if (page === "licenses") renderLicensesList();
  if (page === "files") renderFilesList();
  if (page === "settings") renderSettings();
});
