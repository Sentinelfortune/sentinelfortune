// Shared types for the Sentinel Fortune Digital Shop Worker.
//
// D1Like/R2Like/etc. are minimal structural interfaces matching the subset
// of the real Cloudflare bindings this codebase uses. Business logic in
// src/lib and src/routes is written against these interfaces, not against
// @cloudflare/workers-types directly, so the exact same code can run against
// a real D1Database/R2Bucket in production and against lightweight test
// doubles in tests/ (tests/helpers/d1-sqlite-adapter.ts, tests/helpers/fakeR2.ts)
// without needing Miniflare or a live Cloudflare account.

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Like {
  prepare(query: string): D1PreparedStatement;
}

export interface R2ObjectLike {
  key: string;
  size: number;
  httpEtag: string;
  body: ReadableStream | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2PutOptions {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

export interface R2Like {
  put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream | Blob, options?: R2PutOptions): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<R2ObjectLike | null>;
}

/**
 * Environment bindings for the Shop Worker.
 *
 * SHOP_DB / SHOP_DOWNLOADS_BUCKET / SHOP_ASSETS_BUCKET are deliberately
 * prefixed "SHOP_" to make it structurally impossible to confuse them with
 * the existing ORIGINUS_R2 binding used by the tier-access system — this
 * Worker must never bind to that bucket.
 */
export interface Env {
  SHOP_DB: D1Like;
  SHOP_DOWNLOADS_BUCKET: R2Like;   // private — never publicly readable
  SHOP_ASSETS_BUCKET: R2Like;      // public — covers + preview images only

  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;

  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;

  CF_ACCESS_TEAM_DOMAIN: string;   // e.g. "sentinelfortune.cloudflareaccess.com"
  CF_ACCESS_AUD: string;           // Access application Audience (AUD) tag

  /**
   * Browser origin of the Owner Admin UI's Cloudflare Pages deployment,
   * e.g. "https://sentinel-fortune-shop-admin.pages.dev". Added to the CORS
   * allow-list at runtime. Optional: while unset, the storefront still works
   * and admin browser calls are simply not CORS-permitted (fail-safe).
   */
  ADMIN_ALLOWED_ORIGIN?: string;

  SHOP_PUBLIC_BASE_URL: string;    // e.g. "https://sentinelfortune.github.io/sentinelfortune/shop"
  /**
   * OPTIONAL CDN/custom-domain override for product cover/preview images.
   * When unset (the default), images are served by this Worker itself at
   * /shop/asset/:imageId, so the assets R2 bucket needs NO public access.
   */
  SHOP_ASSETS_PUBLIC_BASE_URL?: string;
  SHOP_WORKER_BASE_URL: string;    // this Worker's own public URL

  ENVIRONMENT: "development" | "test" | "production";
}

// ---------------------------------------------------------------------------
// Row shapes (snake_case, matching D1 column names exactly)
// ---------------------------------------------------------------------------

export type ProductStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
export type LicenseType = "SINGLE_BUSINESS" | "MULTI_LOCATION" | "CONSULTANT" | "WHITE_LABEL";
export type OrderStatus = "PENDING" | "PAID" | "REFUNDED" | "FAILED" | "CANCELLED";
export type LicenseStatus = "ACTIVE" | "REVOKED";
export type DownloadEventResult = "SUCCESS" | "EXPIRED" | "REVOKED" | "LIMIT_REACHED" | "NOT_FOUND" | "ERROR";

export interface ProductRow {
  id: string;
  sku: string;
  slug: string;
  title: string;
  short_description: string;
  problem_solved: string;
  description: string;
  category: string;
  audience: string;
  edition: string;
  version: string;
  status: ProductStatus;
  price_cents: number | null;
  price_confirmed: 0 | 1;
  currency: string;
  license_type: LicenseType;
  publicly_purchasable: 0 | 1;
  supported_formats: string;
  deliverables_json: string;
  not_included_json: string;
  faqs_json: string;
  responsible_use_text: string;
  refund_eligible: 0 | 1;
  refund_policy_summary: string;
  terms_acknowledged: 0 | 1;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  download_link_expiry_hours: number;
  max_downloads: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface ProductImageRow {
  id: string;
  product_id: string;
  kind: "COVER" | "PREVIEW";
  r2_key: string;
  position: number;
  alt_text: string;
  created_at: string;
}

export interface ProductFileRow {
  id: string;
  product_id: string;
  r2_key: string;
  original_filename: string;
  sanitized_filename: string;
  content_type: string;
  size_bytes: number;
  position: number;
  created_at: string;
}

export interface CustomerRow {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  order_number: string;
  product_id: string;
  customer_id: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  status: OrderStatus;
  amount_cents: number;
  currency: string;
  business_name: string;
  created_at: string;
  paid_at: string | null;
  refunded_at: string | null;
}

export interface LicenseRow {
  id: string;
  license_number: string;
  order_id: string;
  product_id: string;
  customer_id: string;
  license_type: LicenseType;
  product_version_snapshot: string;
  purchaser_name: string;
  purchaser_email: string;
  business_name: string;
  status: LicenseStatus;
  rights_summary: string;
  restrictions_summary: string;
  issued_at: string;
  revoked_at: string | null;
}

export interface DownloadAuthorizationRow {
  id: string;
  token_hash: string;
  license_id: string;
  order_id: string;
  product_file_id: string | null;
  max_downloads: number;
  download_count: number;
  expires_at: string;
  revoked: 0 | 1;
  created_at: string;
}

export interface StripeEventRow {
  id: string;
  stripe_event_id: string;
  type: string;
  processed: 0 | 1;
  payload_json: string;
  received_at: string;
  processed_at: string | null;
}
