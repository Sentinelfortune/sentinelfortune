// The `hoa.shop-publication/1.0` contract.
//
// House of Assets produces one publication package per commercial product.
// That package is a *publishing* bundle: it carries the channel artefacts
// (brand package, media suite, the KDP and Payhip and Gumroad builds, an
// all-channels master) alongside exactly one file that is meant for a paying
// customer. Handing any of the others to a buyer would ship internal
// production material, so the contract fixes the customer deliverable at one
// exact path and this module refuses anything else.
//
// Everything here is pure: it parses and checks, and touches neither D1 nor
// R2. The route calls it before it writes anything, and the same function
// decides both whether the publication is well-formed and whether the Owner
// actually authorized it.

import type { LicenseType } from "../types";
import { parsePriceInputToCents } from "./money";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  isValidFaqArray,
  isValidSku,
  isValidSlug,
  isValidStringArray,
} from "./validate";

// --- routing envelope -------------------------------------------------------

export const HOA_PUBLICATION_SCHEMA = "hoa.shop-publication/1.0";
export const HOA_PUBLICATION_DESTINATION = "SENTINEL_FORTUNE_DIGITAL_SHOP";
export const HOA_PUBLICATION_INTENT = "PUBLISH";

// --- authorization ----------------------------------------------------------

export const HOA_PUBLICATION_DECISION = "APPROVE_AND_PUBLISH";
export const HOA_PUBLICATION_AUTHORITY = "OWNER";

// --- the one path a customer may ever receive ------------------------------

/**
 * The single entry inside the publication package that becomes the buyer's
 * download. Not configurable, not derived from the manifest, not guessed from
 * the archive contents — a constant, so a package that reorganises itself
 * cannot quietly promote a different file to "the thing we sell".
 */
export const CUSTOMER_DOWNLOAD_PATH = "delivery/customer-download.zip";

/**
 * Names that must never reach a customer even if some future change lets a
 * path other than CUSTOMER_DOWNLOAD_PATH through. This is the second lock on
 * the same door: the exact-path rule above is the first.
 */
const NEVER_DELIVERABLE = [
  /(^|\/)brand[_-]?package/i,
  /(^|\/)media[_-]?suite/i,
  /(^|\/)kdp[_-]/i,
  /(^|\/)payhip/i,
  /(^|\/)gumroad/i,
  /(^|\/)all[_-]?channels[_-]?master/i,
  /(^|\/)internal(\/|[._-])/i,
  /(^|\/)_?source(\/|[._-])/i,
];

export function isNeverDeliverable(path: string): boolean {
  return NEVER_DELIVERABLE.some((pattern) => pattern.test(path));
}

// --- license mapping --------------------------------------------------------

/**
 * House of Assets license vocabulary -> Shop license vocabulary.
 *
 * Deliberately a one-entry map. An unmapped license type is rejected rather
 * than defaulted: guessing that some unfamiliar HoA license "is probably
 * single-business" would sell rights nobody granted.
 */
export const HOA_LICENSE_MAP: Readonly<Record<string, LicenseType>> = Object.freeze({
  SINGLE_PURCHASER_BUSINESS_USE: "SINGLE_BUSINESS",
});

export function mapLicenseType(sourceLicense: unknown): LicenseType | null {
  if (typeof sourceLicense !== "string") return null;
  return HOA_LICENSE_MAP[sourceLicense] ?? null;
}

// --- currency ---------------------------------------------------------------

/**
 * Currencies the Shop can actually sell in today. The storefront formats
 * prices as USD and Checkout is configured for USD, so accepting anything
 * else would produce a listing whose displayed price is a lie.
 */
const SUPPORTED_CURRENCIES = new Set(["USD"]);

/**
 * Converts a price expressed in major currency units (224 USD) into the
 * integer cents the Shop stores (22400).
 *
 * Goes through the string form on purpose. `Math.round(amount * 100)` is the
 * obvious version and is wrong for values like 1.005, and money that is
 * silently off by a cent is worse than a rejected publication. Anything that
 * is not a clean, non-negative, at-most-two-decimal number — including
 * exponent notation, NaN and Infinity — has no cents representation here and
 * is refused.
 */
export function majorUnitsToCents(amount: unknown): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
  return parsePriceInputToCents(String(amount));
}

// --- shapes -----------------------------------------------------------------

export interface HoaFileRef {
  path: string;
  sha256: string;
  byteSize: number | null;
  contentType: string;
}

export interface HoaPublication {
  schema: string;
  destination: string;
  intent: string;

  commercialProductId: string;
  commercialProductVersion: string;
  generatedAt: string | null;

  decision: string;
  authority: string;
  termsAcknowledgedAt: string;
  priceApprovedAt: string;
  approvedBy: string | null;

  packageId: string;
  packageSha256: string;
  packageByteSize: number | null;
  customerDownload: HoaFileRef;
  coverImage: HoaFileRef;

  sku: string;
  slug: string;
  title: string;
  shortDescription: string;
  problemSolved: string;
  description: string;
  category: string;
  audience: string;
  edition: string;
  version: string;
  supportedFormats: string;
  deliverables: string[];
  notIncluded: string[];
  faqs: { q: string; a: string }[];
  responsibleUseText: string;
  refundEligible: boolean;
  refundPolicySummary: string;

  sourceLicenseType: string;
  licenseType: LicenseType;
  priceCents: number;
  currency: string;
}

export interface HoaPublicationValidation {
  ok: boolean;
  errors: string[];
  publication?: HoaPublication;
}

// --- helpers ----------------------------------------------------------------

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown, maxLen = 20000): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen
    ? value.trim()
    : null;
}

const SHA256_RE = /^[0-9a-f]{64}$/;

function sha256Field(value: unknown): string | null {
  return typeof value === "string" && SHA256_RE.test(value.toLowerCase())
    ? value.toLowerCase()
    : null;
}

/** An ISO-8601 instant that a machine actually produced, not free text. */
function timestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function optionalByteSize(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

// --- the contract check -----------------------------------------------------

/**
 * Validates a decoded publication payload against `hoa.shop-publication/1.0`.
 *
 * Collects every problem rather than stopping at the first, so a failed
 * publication tells House of Assets everything that has to change instead of
 * forcing a round trip per field. Returns no publication object at all unless
 * every check passed — there is no partially-valid publication.
 */
export function validateHoaPublication(raw: unknown): HoaPublicationValidation {
  const errors: string[] = [];
  const root = obj(raw);
  if (!root) {
    return { ok: false, errors: ["The publication payload must be a JSON object."] };
  }

  // --- routing -------------------------------------------------------------
  const schema = str(root.schema, 200);
  if (schema !== HOA_PUBLICATION_SCHEMA) {
    errors.push(`schema must be "${HOA_PUBLICATION_SCHEMA}".`);
  }
  const destination = str(root.destination, 200);
  if (destination !== HOA_PUBLICATION_DESTINATION) {
    errors.push(`destination must be "${HOA_PUBLICATION_DESTINATION}". This receiver accepts no other destination.`);
  }
  const intent = str(root.intent, 200);
  if (intent !== HOA_PUBLICATION_INTENT) {
    errors.push(`intent must be "${HOA_PUBLICATION_INTENT}".`);
  }

  // --- source identity -----------------------------------------------------
  const source = obj(root.source) ?? {};
  const commercialProductId = str(source.commercial_product_id, 200);
  if (!commercialProductId) errors.push("source.commercial_product_id is required.");
  const commercialProductVersion = str(source.commercial_product_version, 60);
  if (!commercialProductVersion) errors.push("source.commercial_product_version is required.");
  const generatedAt = timestamp(source.generated_at);

  // --- Owner authorization -------------------------------------------------
  // Every one of these is required. The whole justification for a route that
  // publishes without a human touching the Admin is that the payload carries
  // the Owner's decision with it; if any part of that evidence is missing,
  // this is an ordinary candidate and belongs in the review queue instead.
  const authorization = obj(root.authorization) ?? {};
  const decision = str(authorization.decision, 100);
  if (decision !== HOA_PUBLICATION_DECISION) {
    errors.push(`authorization.decision must be "${HOA_PUBLICATION_DECISION}". Nothing else publishes.`);
  }
  const authority = str(authorization.authority, 100);
  if (authority !== HOA_PUBLICATION_AUTHORITY) {
    errors.push(`authorization.authority must be "${HOA_PUBLICATION_AUTHORITY}".`);
  }
  if (authorization.terms_acknowledged !== true) {
    errors.push("authorization.terms_acknowledged must be exactly true.");
  }
  if (authorization.price_approved !== true) {
    errors.push("authorization.price_approved must be exactly true.");
  }
  const termsAcknowledgedAt = timestamp(authorization.terms_acknowledged_at);
  if (!termsAcknowledgedAt) {
    errors.push("authorization.terms_acknowledged_at must be an ISO-8601 timestamp.");
  }
  const priceApprovedAt = timestamp(authorization.price_approved_at);
  if (!priceApprovedAt) {
    errors.push("authorization.price_approved_at must be an ISO-8601 timestamp.");
  }
  const approvedBy = str(authorization.approved_by, 254);

  // --- package integrity ---------------------------------------------------
  const pkg = obj(root.package) ?? {};
  const packageId = str(pkg.package_id, 200);
  if (!packageId) errors.push("package.package_id is required.");
  const packageSha256 = sha256Field(pkg.sha256);
  if (!packageSha256) errors.push("package.sha256 must be a 64-character hex SHA-256 digest.");
  const packageByteSize = optionalByteSize(pkg.byte_size);

  const customerDownload = validateFileRef(
    obj(pkg.customer_download),
    "package.customer_download",
    errors,
  );
  if (customerDownload && customerDownload.path !== CUSTOMER_DOWNLOAD_PATH) {
    errors.push(
      `package.customer_download.path must be exactly "${CUSTOMER_DOWNLOAD_PATH}". ` +
      `No other entry in a publication package may be sold to a customer.`,
    );
  }
  if (customerDownload && isNeverDeliverable(customerDownload.path)) {
    errors.push("package.customer_download.path names an internal or channel-publishing artefact.");
  }

  const cover = validateFileRef(obj(pkg.cover_image), "package.cover_image", errors);
  if (cover) {
    const ext = cover.path.toLowerCase().split(".").pop() ?? "";
    const impliedType = IMAGE_EXTENSIONS[ext];
    if (!impliedType) {
      errors.push("package.cover_image.path must end in .png, .jpg, .jpeg or .webp.");
    }
    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(cover.contentType)) {
      errors.push(`package.cover_image.content_type "${cover.contentType}" is not a supported image type.`);
    } else if (impliedType && impliedType !== cover.contentType) {
      errors.push("package.cover_image.content_type does not match its file extension.");
    }
  }

  // --- product metadata ----------------------------------------------------
  const product = obj(root.product) ?? {};
  const sku = str(product.sku, 40);
  if (!sku || !isValidSku(sku)) errors.push("product.sku is required and must be a valid SKU.");
  const slug = str(product.slug, 80);
  if (!slug || !isValidSlug(slug)) errors.push("product.slug is required and must be URL-safe.");
  const title = str(product.title, 300);
  if (!title) errors.push("product.title is required.");
  const shortDescription = str(product.short_description, 500);
  if (!shortDescription) errors.push("product.short_description is required.");
  const description = str(product.description, 20000);
  if (!description) errors.push("product.description is required.");
  const version = str(product.version, 40);
  if (!version) errors.push("product.version is required.");
  const supportedFormats = str(product.supported_formats, 300);
  if (!supportedFormats) errors.push("product.supported_formats is required.");
  const refundPolicySummary = str(product.refund_policy_summary, 2000);
  if (!refundPolicySummary) {
    // Publication readiness requires this, so a publication without it could
    // never become a live listing. Rejecting here says so plainly.
    errors.push("product.refund_policy_summary is required — a published listing cannot omit it.");
  }
  const responsibleUseText = str(product.responsible_use_text, 5000) ?? "";

  const deliverables = product.deliverables ?? [];
  if (!isValidStringArray(deliverables)) errors.push("product.deliverables must be an array of strings.");
  const notIncluded = product.not_included ?? [];
  if (!isValidStringArray(notIncluded)) errors.push("product.not_included must be an array of strings.");
  const faqs = product.faqs ?? [];
  if (!isValidFaqArray(faqs)) errors.push("product.faqs must be an array of {q, a} objects.");

  const refundEligible = product.refund_eligible;
  if (typeof refundEligible !== "boolean") errors.push("product.refund_eligible must be a boolean.");

  // --- license -------------------------------------------------------------
  const sourceLicenseType = str(product.license_type, 100);
  const licenseType = mapLicenseType(sourceLicenseType);
  if (!sourceLicenseType) {
    errors.push("product.license_type is required.");
  } else if (!licenseType) {
    errors.push(
      `product.license_type "${sourceLicenseType}" has no mapping to a Shop license type. ` +
      `Mapped types: ${Object.keys(HOA_LICENSE_MAP).join(", ")}.`,
    );
  }

  // --- price ---------------------------------------------------------------
  const pricing = obj(root.pricing) ?? {};
  const currencyRaw = str(pricing.currency, 10);
  const currency = currencyRaw ? currencyRaw.toUpperCase() : null;
  if (!currency || !SUPPORTED_CURRENCIES.has(currency)) {
    errors.push(`pricing.currency must be one of: ${[...SUPPORTED_CURRENCIES].join(", ")}.`);
  }
  const priceCents = majorUnitsToCents(pricing.amount);
  if (priceCents === null) {
    errors.push(
      "pricing.amount must be a price in major currency units with at most two decimal places, " +
      "within the Shop's accepted range.",
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    publication: {
      schema: schema!,
      destination: destination!,
      intent: intent!,
      commercialProductId: commercialProductId!,
      commercialProductVersion: commercialProductVersion!,
      generatedAt,
      decision: decision!,
      authority: authority!,
      termsAcknowledgedAt: termsAcknowledgedAt!,
      priceApprovedAt: priceApprovedAt!,
      approvedBy,
      packageId: packageId!,
      packageSha256: packageSha256!,
      packageByteSize,
      customerDownload: customerDownload!,
      coverImage: cover!,
      sku: sku!,
      slug: slug!,
      title: title!,
      shortDescription: shortDescription!,
      problemSolved: str(product.problem_solved, 5000) ?? "",
      description: description!,
      category: str(product.category, 200) ?? "",
      audience: str(product.audience, 300) ?? "",
      edition: str(product.edition, 200) ?? "",
      version: version!,
      supportedFormats: supportedFormats!,
      deliverables: deliverables as string[],
      notIncluded: notIncluded as string[],
      faqs: faqs as { q: string; a: string }[],
      responsibleUseText,
      refundEligible: refundEligible as boolean,
      refundPolicySummary: refundPolicySummary!,
      sourceLicenseType: sourceLicenseType!,
      licenseType: licenseType!,
      priceCents: priceCents!,
      currency: currency!,
    },
  };
}

function validateFileRef(
  ref: Record<string, unknown> | null,
  label: string,
  errors: string[],
): HoaFileRef | null {
  if (!ref) {
    errors.push(`${label} is required.`);
    return null;
  }
  const path = str(ref.path, 400);
  if (!path) {
    errors.push(`${label}.path is required.`);
  } else if (path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    errors.push(`${label}.path must be a relative path inside the package, with no traversal.`);
    return null;
  }
  const digest = sha256Field(ref.sha256);
  if (!digest) errors.push(`${label}.sha256 must be a 64-character hex SHA-256 digest.`);

  const contentType = str(ref.content_type, 200) ?? "";
  if (!path || !digest) return null;

  return { path, sha256: digest, byteSize: optionalByteSize(ref.byte_size), contentType };
}

/**
 * The idempotency key.
 *
 * Every element that could make this a *different* publication is in here:
 * where it is going, what it is, which exact bytes it carries, what it costs,
 * what rights it grants, and the approval evidence behind it. Two deliveries
 * agreeing on all of that are the same publication and must collapse onto one
 * product; a delivery differing in any of it is not a retry and must not be
 * silently accepted as one.
 */
export function fingerprintInput(publication: HoaPublication): string {
  return [
    publication.schema,
    publication.destination,
    publication.intent,
    publication.commercialProductId,
    publication.commercialProductVersion,
    publication.packageId,
    publication.packageSha256,
    publication.customerDownload.sha256,
    String(publication.priceCents),
    publication.currency,
    publication.licenseType,
    publication.decision,
    publication.authority,
    publication.termsAcknowledgedAt,
    publication.priceApprovedAt,
  ].join("\n");
}
