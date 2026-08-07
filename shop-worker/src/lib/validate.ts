import type { LicenseType, ProductImageRow, ProductRow } from "../types";
import { isValidPriceCents } from "./money";

// ---------------------------------------------------------------------------
// Filename sanitization
// ---------------------------------------------------------------------------

/**
 * Reduces an arbitrary, possibly-hostile filename to a safe, storable form:
 *   - strips any path component (no directory traversal)
 *   - strips everything except letters, digits, dot, dash, underscore, space
 *   - collapses whitespace, trims leading/trailing dots and dashes
 *   - caps length, preserving the extension
 *   - guarantees a non-empty result (falls back to "file")
 */
export function sanitizeFilename(rawName: string): string {
  const base = rawName.split(/[/\\]/).pop() ?? "file";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^[.\-]+|[.\-]+$/g, "");

  const safe = cleaned.length > 0 ? cleaned : "file";

  const MAX_LEN = 120;
  if (safe.length <= MAX_LEN) return safe;

  const dot = safe.lastIndexOf(".");
  if (dot > 0 && safe.length - dot <= 12) {
    const ext = safe.slice(dot);
    return safe.slice(0, MAX_LEN - ext.length) + ext;
  }
  return safe.slice(0, MAX_LEN);
}

// ---------------------------------------------------------------------------
// Allowed file types
// ---------------------------------------------------------------------------

export const ALLOWED_DOWNLOAD_EXTENSIONS = [
  "pdf", "docx", "xlsx", "pptx", "zip", "png", "jpg", "jpeg", "webp", "csv", "txt",
] as const;

export const ALLOWED_DOWNLOAD_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/csv",
  "text/plain",
]);

export const ALLOWED_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;

export const ALLOWED_IMAGE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Explicitly dangerous — always rejected regardless of the allow-list above,
// so a future accidental addition to the allow-list can't silently open this
// back up without also removing an explicit deny-list entry.
const DENIED_EXTENSIONS = new Set([
  "exe", "dll", "so", "dylib", "bat", "cmd", "sh", "bash", "ps1",
  "msi", "apk", "app", "com", "scr", "js", "mjs", "cjs", "jar",
  "vbs", "wsf", "html", "htm", "svg", "php", "py", "rb",
]);

function extensionOf(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export interface FileValidationResult {
  ok: boolean;
  error?: string;
}

export function validateDownloadFile(filename: string, contentType: string, sizeBytes: number): FileValidationResult {
  const ext = extensionOf(filename);
  if (DENIED_EXTENSIONS.has(ext)) return { ok: false, error: `File type ".${ext}" is not permitted.` };
  if (!ALLOWED_DOWNLOAD_EXTENSIONS.includes(ext as (typeof ALLOWED_DOWNLOAD_EXTENSIONS)[number])) {
    return { ok: false, error: `File type ".${ext}" is not in the supported list.` };
  }
  if (!ALLOWED_DOWNLOAD_CONTENT_TYPES.has(contentType)) {
    return { ok: false, error: `Content type "${contentType}" is not permitted for downloadable files.` };
  }
  const MAX_BYTES = 500 * 1024 * 1024; // 500 MB per file — generous MVP ceiling
  if (sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    return { ok: false, error: "File size is invalid or exceeds the 500 MB limit." };
  }
  return { ok: true };
}

export function validateImageFile(filename: string, contentType: string, sizeBytes: number): FileValidationResult {
  const ext = extensionOf(filename);
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext as (typeof ALLOWED_IMAGE_EXTENSIONS)[number])) {
    return { ok: false, error: `Image type ".${ext}" is not supported. Use PNG, JPG, or WEBP.` };
  }
  if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
    return { ok: false, error: `Content type "${contentType}" is not a supported image type.` };
  }
  const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per image
  if (sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    return { ok: false, error: "Image size is invalid or exceeds the 15 MB limit." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Basic field validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU_RE = /^[A-Z0-9][A-Z0-9\-]{2,39}$/;

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value);
}

export function isValidSlug(value: unknown): value is string {
  return typeof value === "string" && value.length >= 3 && value.length <= 80 && SLUG_RE.test(value);
}

export function isValidSku(value: unknown): value is string {
  return typeof value === "string" && SKU_RE.test(value);
}

export const VALID_LICENSE_TYPES: LicenseType[] = [
  "SINGLE_BUSINESS",
  "MULTI_LOCATION",
  "CONSULTANT",
  "WHITE_LABEL",
];

// Only SINGLE_BUSINESS is sellable through public Checkout in the MVP,
// per the mission brief. The others exist as prepared license types for
// future manual/negotiated sales, not as public Buy Now options.
export const PUBLICLY_PURCHASABLE_LICENSE_TYPES: LicenseType[] = ["SINGLE_BUSINESS"];

// ---------------------------------------------------------------------------
// Publish readiness gate
// ---------------------------------------------------------------------------

export interface PublishReadiness {
  ready: boolean;
  errors: string[];
}

export function checkPublishReadiness(
  product: Pick<
    ProductRow,
    | "price_cents"
    | "price_confirmed"
    | "license_type"
    | "terms_acknowledged"
    | "refund_eligible"
    | "refund_policy_summary"
    | "title"
    | "slug"
    | "sku"
  >,
  hasCoverImage: boolean,
  downloadableFileCount: number,
): PublishReadiness {
  const errors: string[] = [];

  if (!product.title || product.title.trim().length === 0) errors.push("Title is required.");
  if (!isValidSlug(product.slug)) errors.push("Slug must be set and URL-safe.");
  if (!isValidSku(product.sku)) errors.push("SKU is required.");

  if (!isValidPriceCents(product.price_cents) || product.price_confirmed !== 1) {
    errors.push("Price must be entered and explicitly confirmed by the Owner.");
  }
  if (!hasCoverImage) errors.push("A cover image is required.");
  if (downloadableFileCount < 1) errors.push("At least one downloadable file is required.");
  if (!VALID_LICENSE_TYPES.includes(product.license_type)) errors.push("A valid license type must be selected.");
  if (product.terms_acknowledged !== 1) errors.push("Owner terms acknowledgement is required.");
  if (product.refund_eligible !== 0 && product.refund_eligible !== 1) errors.push("Refund eligibility must be set.");
  if (!product.refund_policy_summary || product.refund_policy_summary.trim().length === 0) {
    errors.push("A refund policy summary must be selected/entered.");
  }

  return { ready: errors.length === 0, errors };
}

export function coverImageOf(images: Pick<ProductImageRow, "kind">[]): boolean {
  return images.some((img) => img.kind === "COVER");
}

// ---------------------------------------------------------------------------
// Small field validators used by the admin product editor
// ---------------------------------------------------------------------------

export function isValidLicenseType(value: unknown): value is LicenseType {
  return typeof value === "string" && (VALID_LICENSE_TYPES as string[]).includes(value);
}

export function isNonEmptyString(value: unknown, maxLen = 20000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

export function isValidDownloadExpiryHours(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 24 * 30;
}

export function isValidMaxDownloads(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100;
}

export interface FaqInput {
  q: string;
  a: string;
}

export function isValidFaqArray(value: unknown): value is FaqInput[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as FaqInput).q === "string" &&
      typeof (item as FaqInput).a === "string" &&
      (item as FaqInput).q.length <= 500 &&
      (item as FaqInput).a.length <= 5000,
  );
}

export function isValidStringArray(value: unknown, maxItems = 50, maxLen = 500): value is string[] {
  if (!Array.isArray(value)) return false;
  if (value.length > maxItems) return false;
  return value.every((item) => typeof item === "string" && item.length <= maxLen);
}
