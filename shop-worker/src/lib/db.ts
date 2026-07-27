// Typed D1 access layer. Every query the Worker runs lives here — routes
// never construct SQL directly. All functions take a D1Like so the exact
// same code runs against the real D1 binding in production and against the
// node:sqlite-backed test adapter in tests/helpers/d1-sqlite-adapter.ts.

import type {
  CustomerRow,
  D1Like,
  DownloadAuthorizationRow,
  DownloadEventResult,
  LicenseRow,
  OrderRow,
  ProductFileRow,
  ProductImageRow,
  ProductRow,
  ProductStatus,
  StripeEventRow,
} from "../types";

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function listPublishedProducts(db: D1Like): Promise<ProductRow[]> {
  const result = await db
    .prepare(`SELECT * FROM products WHERE status = 'PUBLISHED' ORDER BY published_at DESC`)
    .all<ProductRow>();
  return result.results;
}

export async function listAllProducts(db: D1Like): Promise<ProductRow[]> {
  const result = await db.prepare(`SELECT * FROM products ORDER BY updated_at DESC`).all<ProductRow>();
  return result.results;
}

export async function getProductBySlug(db: D1Like, slug: string): Promise<ProductRow | null> {
  return db.prepare(`SELECT * FROM products WHERE slug = ?`).bind(slug).first<ProductRow>();
}

export async function getProductById(db: D1Like, id: string): Promise<ProductRow | null> {
  return db.prepare(`SELECT * FROM products WHERE id = ?`).bind(id).first<ProductRow>();
}

export async function insertProduct(db: D1Like, row: ProductRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO products (
        id, sku, slug, title, short_description, problem_solved, description, category, audience,
        edition, version, status, price_cents, price_confirmed, currency, license_type,
        publicly_purchasable, supported_formats, deliverables_json, not_included_json, faqs_json,
        responsible_use_text, refund_eligible, refund_policy_summary, terms_acknowledged,
        stripe_product_id, stripe_price_id, download_link_expiry_hours, max_downloads,
        created_at, updated_at, published_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      row.id, row.sku, row.slug, row.title, row.short_description, row.problem_solved, row.description,
      row.category, row.audience, row.edition, row.version, row.status, row.price_cents, row.price_confirmed,
      row.currency, row.license_type, row.publicly_purchasable, row.supported_formats, row.deliverables_json,
      row.not_included_json, row.faqs_json, row.responsible_use_text, row.refund_eligible,
      row.refund_policy_summary, row.terms_acknowledged, row.stripe_product_id, row.stripe_price_id,
      row.download_link_expiry_hours, row.max_downloads, row.created_at, row.updated_at, row.published_at,
    )
    .run();
}

export type ProductPatch = Partial<Omit<ProductRow, "id" | "created_at">>;

const PRODUCT_PATCHABLE_COLUMNS: (keyof ProductRow)[] = [
  "sku", "slug", "title", "short_description", "problem_solved", "description", "category", "audience",
  "edition", "version", "status", "price_cents", "price_confirmed", "currency", "license_type",
  "publicly_purchasable", "supported_formats", "deliverables_json", "not_included_json", "faqs_json",
  "responsible_use_text", "refund_eligible", "refund_policy_summary", "terms_acknowledged",
  "stripe_product_id", "stripe_price_id", "download_link_expiry_hours", "max_downloads",
  "updated_at", "published_at",
];

export async function updateProduct(db: D1Like, id: string, patch: ProductPatch): Promise<void> {
  const keys = Object.keys(patch).filter((k) => PRODUCT_PATCHABLE_COLUMNS.includes(k as keyof ProductRow));
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => (patch as Record<string, unknown>)[k]);
  await db.prepare(`UPDATE products SET ${setClause} WHERE id = ?`).bind(...values, id).run();
}

export async function deleteProduct(db: D1Like, id: string): Promise<void> {
  await db.prepare(`DELETE FROM products WHERE id = ?`).bind(id).run();
}

// ---------------------------------------------------------------------------
// Product images
// ---------------------------------------------------------------------------

export async function listProductImages(db: D1Like, productId: string): Promise<ProductImageRow[]> {
  const result = await db
    .prepare(`SELECT * FROM product_images WHERE product_id = ? ORDER BY kind, position ASC`)
    .bind(productId)
    .all<ProductImageRow>();
  return result.results;
}

export async function insertProductImage(db: D1Like, row: ProductImageRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO product_images (id, product_id, kind, r2_key, position, alt_text, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .bind(row.id, row.product_id, row.kind, row.r2_key, row.position, row.alt_text, row.created_at)
    .run();
}

export async function deleteProductImage(db: D1Like, id: string): Promise<ProductImageRow | null> {
  const row = await db.prepare(`SELECT * FROM product_images WHERE id = ?`).bind(id).first<ProductImageRow>();
  if (row) await db.prepare(`DELETE FROM product_images WHERE id = ?`).bind(id).run();
  return row;
}

// ---------------------------------------------------------------------------
// Product files
// ---------------------------------------------------------------------------

export async function listProductFiles(db: D1Like, productId: string): Promise<ProductFileRow[]> {
  const result = await db
    .prepare(`SELECT * FROM product_files WHERE product_id = ? ORDER BY position ASC`)
    .bind(productId)
    .all<ProductFileRow>();
  return result.results;
}

export async function getProductFile(db: D1Like, id: string): Promise<ProductFileRow | null> {
  return db.prepare(`SELECT * FROM product_files WHERE id = ?`).bind(id).first<ProductFileRow>();
}

export async function insertProductFile(db: D1Like, row: ProductFileRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO product_files
        (id, product_id, r2_key, original_filename, sanitized_filename, content_type, size_bytes, position, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      row.id, row.product_id, row.r2_key, row.original_filename, row.sanitized_filename,
      row.content_type, row.size_bytes, row.position, row.created_at,
    )
    .run();
}

export async function deleteProductFile(db: D1Like, id: string): Promise<ProductFileRow | null> {
  const row = await db.prepare(`SELECT * FROM product_files WHERE id = ?`).bind(id).first<ProductFileRow>();
  if (row) await db.prepare(`DELETE FROM product_files WHERE id = ?`).bind(id).run();
  return row;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function upsertCustomerByEmail(
  db: D1Like,
  id: string,
  email: string,
  name: string,
  nowIso: string,
): Promise<CustomerRow> {
  const existing = await db
    .prepare(`SELECT * FROM customers WHERE email = ?`)
    .bind(email)
    .first<CustomerRow>();

  if (existing) {
    if (name && name !== existing.name) {
      await db.prepare(`UPDATE customers SET name = ?, updated_at = ? WHERE id = ?`).bind(name, nowIso, existing.id).run();
      return { ...existing, name, updated_at: nowIso };
    }
    return existing;
  }

  await db
    .prepare(`INSERT INTO customers (id, email, name, created_at, updated_at) VALUES (?,?,?,?,?)`)
    .bind(id, email, name, nowIso, nowIso)
    .run();

  return { id, email, name, created_at: nowIso, updated_at: nowIso };
}

export async function getCustomerById(db: D1Like, id: string): Promise<CustomerRow | null> {
  return db.prepare(`SELECT * FROM customers WHERE id = ?`).bind(id).first<CustomerRow>();
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function insertOrder(db: D1Like, row: OrderRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO orders
        (id, order_number, product_id, customer_id, stripe_checkout_session_id, stripe_payment_intent_id,
         status, amount_cents, currency, business_name, created_at, paid_at, refunded_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      row.id, row.order_number, row.product_id, row.customer_id, row.stripe_checkout_session_id,
      row.stripe_payment_intent_id, row.status, row.amount_cents, row.currency, row.business_name,
      row.created_at, row.paid_at, row.refunded_at,
    )
    .run();
}

export async function getOrderBySessionId(db: D1Like, sessionId: string): Promise<OrderRow | null> {
  return db
    .prepare(`SELECT * FROM orders WHERE stripe_checkout_session_id = ?`)
    .bind(sessionId)
    .first<OrderRow>();
}

export async function getOrderByPaymentIntentId(db: D1Like, paymentIntentId: string): Promise<OrderRow | null> {
  return db
    .prepare(`SELECT * FROM orders WHERE stripe_payment_intent_id = ?`)
    .bind(paymentIntentId)
    .first<OrderRow>();
}

export async function getOrderById(db: D1Like, id: string): Promise<OrderRow | null> {
  return db.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first<OrderRow>();
}

export async function listOrders(db: D1Like): Promise<OrderRow[]> {
  const result = await db.prepare(`SELECT * FROM orders ORDER BY created_at DESC`).all<OrderRow>();
  return result.results;
}

export async function markOrderPaid(
  db: D1Like,
  orderId: string,
  paymentIntentId: string | null,
  paidAtIso: string,
): Promise<void> {
  await db
    .prepare(`UPDATE orders SET status = 'PAID', stripe_payment_intent_id = ?, paid_at = ? WHERE id = ?`)
    .bind(paymentIntentId, paidAtIso, orderId)
    .run();
}

export async function markOrderRefunded(db: D1Like, orderId: string, refundedAtIso: string): Promise<void> {
  await db
    .prepare(`UPDATE orders SET status = 'REFUNDED', refunded_at = ? WHERE id = ?`)
    .bind(refundedAtIso, orderId)
    .run();
}

// ---------------------------------------------------------------------------
// Order items
// ---------------------------------------------------------------------------

export async function insertOrderItem(
  db: D1Like,
  row: { id: string; order_id: string; product_id: string; title_snapshot: string; price_cents_snapshot: number; quantity: number },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO order_items (id, order_id, product_id, title_snapshot, price_cents_snapshot, quantity)
       VALUES (?,?,?,?,?,?)`,
    )
    .bind(row.id, row.order_id, row.product_id, row.title_snapshot, row.price_cents_snapshot, row.quantity)
    .run();
}

// ---------------------------------------------------------------------------
// Licenses
// ---------------------------------------------------------------------------

export async function insertLicense(db: D1Like, row: LicenseRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO licenses
        (id, license_number, order_id, product_id, customer_id, license_type, product_version_snapshot,
         purchaser_name, purchaser_email, business_name, status, rights_summary, restrictions_summary,
         issued_at, revoked_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      row.id, row.license_number, row.order_id, row.product_id, row.customer_id, row.license_type,
      row.product_version_snapshot, row.purchaser_name, row.purchaser_email, row.business_name,
      row.status, row.rights_summary, row.restrictions_summary, row.issued_at, row.revoked_at,
    )
    .run();
}

export async function getLicenseById(db: D1Like, id: string): Promise<LicenseRow | null> {
  return db.prepare(`SELECT * FROM licenses WHERE id = ?`).bind(id).first<LicenseRow>();
}

export async function getLicenseByOrderId(db: D1Like, orderId: string): Promise<LicenseRow | null> {
  return db.prepare(`SELECT * FROM licenses WHERE order_id = ?`).bind(orderId).first<LicenseRow>();
}

export async function getLicenseByNumber(db: D1Like, licenseNumber: string): Promise<LicenseRow | null> {
  return db.prepare(`SELECT * FROM licenses WHERE license_number = ?`).bind(licenseNumber).first<LicenseRow>();
}

export async function listLicenses(db: D1Like): Promise<LicenseRow[]> {
  const result = await db.prepare(`SELECT * FROM licenses ORDER BY issued_at DESC`).all<LicenseRow>();
  return result.results;
}

export async function revokeLicense(db: D1Like, id: string, revokedAtIso: string): Promise<void> {
  await db.prepare(`UPDATE licenses SET status = 'REVOKED', revoked_at = ? WHERE id = ?`).bind(revokedAtIso, id).run();
}

// ---------------------------------------------------------------------------
// Download authorizations
// ---------------------------------------------------------------------------

export async function insertDownloadAuthorization(db: D1Like, row: DownloadAuthorizationRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO download_authorizations
        (id, token_hash, license_id, order_id, product_file_id, max_downloads, download_count, expires_at, revoked, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      row.id, row.token_hash, row.license_id, row.order_id, row.product_file_id, row.max_downloads,
      row.download_count, row.expires_at, row.revoked, row.created_at,
    )
    .run();
}

export async function getDownloadAuthorizationByHash(db: D1Like, tokenHash: string): Promise<DownloadAuthorizationRow | null> {
  return db
    .prepare(`SELECT * FROM download_authorizations WHERE token_hash = ?`)
    .bind(tokenHash)
    .first<DownloadAuthorizationRow>();
}

export async function listDownloadAuthorizationsByLicense(db: D1Like, licenseId: string): Promise<DownloadAuthorizationRow[]> {
  const result = await db
    .prepare(`SELECT * FROM download_authorizations WHERE license_id = ? ORDER BY created_at DESC`)
    .bind(licenseId)
    .all<DownloadAuthorizationRow>();
  return result.results;
}

export async function incrementDownloadCount(db: D1Like, id: string): Promise<void> {
  await db.prepare(`UPDATE download_authorizations SET download_count = download_count + 1 WHERE id = ?`).bind(id).run();
}

export async function revokeDownloadAuthorization(db: D1Like, id: string): Promise<void> {
  await db.prepare(`UPDATE download_authorizations SET revoked = 1 WHERE id = ?`).bind(id).run();
}

export async function revokeDownloadAuthorizationsForOrder(db: D1Like, orderId: string): Promise<void> {
  await db.prepare(`UPDATE download_authorizations SET revoked = 1 WHERE order_id = ?`).bind(orderId).run();
}

// ---------------------------------------------------------------------------
// Download events (audit trail)
// ---------------------------------------------------------------------------

export async function insertDownloadEvent(
  db: D1Like,
  row: {
    id: string;
    download_authorization_id: string;
    product_file_id: string | null;
    ip_hash: string;
    user_agent: string;
    result: DownloadEventResult;
    created_at: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO download_events
        (id, download_authorization_id, product_file_id, ip_hash, user_agent, result, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .bind(
      row.id, row.download_authorization_id, row.product_file_id, row.ip_hash, row.user_agent,
      row.result, row.created_at,
    )
    .run();
}

// ---------------------------------------------------------------------------
// Stripe event idempotency ledger
// ---------------------------------------------------------------------------

/** Returns true if this event was newly recorded, false if it's a duplicate. */
export async function recordStripeEventIfNew(
  db: D1Like,
  row: { id: string; stripe_event_id: string; type: string; payload_json: string; received_at: string },
): Promise<boolean> {
  const existing = await db
    .prepare(`SELECT id FROM stripe_events WHERE stripe_event_id = ?`)
    .bind(row.stripe_event_id)
    .first<{ id: string }>();
  if (existing) return false;

  try {
    await db
      .prepare(
        `INSERT INTO stripe_events (id, stripe_event_id, type, processed, payload_json, received_at, processed_at)
         VALUES (?,?,?,0,?,?,NULL)`,
      )
      .bind(row.id, row.stripe_event_id, row.type, row.payload_json, row.received_at)
      .run();
    return true;
  } catch {
    // Unique constraint race — another concurrent delivery won. Treat as duplicate.
    return false;
  }
}

export async function markStripeEventProcessed(db: D1Like, stripeEventId: string, processedAtIso: string): Promise<void> {
  await db
    .prepare(`UPDATE stripe_events SET processed = 1, processed_at = ? WHERE stripe_event_id = ?`)
    .bind(processedAtIso, stripeEventId)
    .run();
}

export async function getStripeEventByStripeId(db: D1Like, stripeEventId: string): Promise<StripeEventRow | null> {
  return db.prepare(`SELECT * FROM stripe_events WHERE stripe_event_id = ?`).bind(stripeEventId).first<StripeEventRow>();
}

// ---------------------------------------------------------------------------
// Admin audit log
// ---------------------------------------------------------------------------

export async function insertAuditLog(
  db: D1Like,
  row: { id: string; actor: string; action: string; target_type: string; target_id: string; details_json: string; created_at: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO admin_audit_log (id, actor, action, target_type, target_id, details_json, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .bind(row.id, row.actor, row.action, row.target_type, row.target_id, row.details_json, row.created_at)
    .run();
}

export async function listAuditLog(db: D1Like, limit = 100): Promise<Record<string, unknown>[]> {
  const result = await db
    .prepare(`SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT ?`)
    .bind(limit)
    .all();
  return result.results as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSetting(db: D1Like, key: string): Promise<string | null> {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = ?`).bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Like, key: string, value: string, updatedAtIso: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(key, value, updatedAtIso)
    .run();
}

export type { ProductStatus };
