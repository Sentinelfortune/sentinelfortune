// The governed product-package contract.
//
// A product package is a ZIP carrying PRODUCT-MANIFEST.json at its root plus
// the deliverables that manifest declares. Any producer that emits a conforming
// manifest can be imported — the contract is the manifest, not the producer.
// Nothing here is specific to one SKU.
//
// See PRODUCT_MANIFEST_SCHEMA.md at the repository root for the documented
// schema and a worked example.
//
// Validation is deliberately total: every rule is evaluated and all failures
// are reported together, so the Owner sees the full picture in one pass rather
// than fixing one error at a time. Nothing is written to D1 or R2 until every
// rule passes.

import type { LicenseType } from "../types";

export const MANIFEST_ENTRY_NAME = "PRODUCT-MANIFEST.json";
export const SUPPORTED_CONTRACT_VERSIONS = [1] as const;
export const MAX_PACKAGE_BYTES = 500 * 1024 * 1024;

/** Executable and script types that must never appear inside a package. */
const DENIED_EXTENSIONS = new Set([
  "exe", "dll", "so", "dylib", "bat", "cmd", "sh", "bash", "ps1", "msi", "apk",
  "app", "com", "scr", "jar", "vbs", "wsf", "php", "py", "rb", "pl", "ps",
  "deb", "rpm", "dmg", "pkg", "bin", "run", "gadget", "jse", "lnk", "reg",
]);

/** Extensions permitted for a declared cover image. */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

/** Anything that betrays an unfinished manifest. */
const PLACEHOLDER_PATTERNS = [
  "REPLACE_WITH", "TODO", "FIXME", "TBD", "XXX", "LOREM IPSUM",
  "PENDING OWNER FINALIZATION", "PLACEHOLDER", "COMING SOON", "CHANGEME",
];

const VALID_LICENSE_TYPES: LicenseType[] = ["SINGLE_BUSINESS", "MULTI_LOCATION", "CONSULTANT", "WHITE_LABEL"];

export interface ManifestFileEntry {
  path: string;
  title?: string;
  format?: string;
  bytes?: number;
}

export interface ProductManifest {
  contractVersion: number;
  sku: string;
  slug: string;
  title: string;
  version: string;
  edition?: string;
  category?: string;
  audience?: string;
  licenseType: LicenseType;
  licenseName?: string;
  supportedFormats: string;
  shortDescription: string;
  problemSolved: string;
  description: string;
  deliverables: string[];
  notIncluded: string[];
  faqs: { q: string; a: string }[];
  responsibleUseText: string;
  refundEligible?: boolean;
  refundPolicySummary: string;
  recommendedPriceCents?: number | null;
  currency?: string;
  downloadLinkExpiryHours?: number;
  maxDownloads?: number;
  coverImage?: string | null;
  producer?: string;
  builtAt?: string;
  files: ManifestFileEntry[];
}

export interface ManifestValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  manifest: ProductManifest | null;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function containsPlaceholder(value: string): string | null {
  const upper = value.toUpperCase();
  return PLACEHOLDER_PATTERNS.find((pattern) => upper.includes(pattern)) ?? null;
}

function extensionOf(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/**
 * Validate a parsed manifest against the ZIP's actual contents.
 *
 * `zipFileNames` is every non-directory entry in the archive.
 */
export function validateManifest(
  raw: unknown,
  zipFileNames: string[],
  packageBytes: number,
): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["PRODUCT-MANIFEST.json is not a JSON object."], warnings, manifest: null };
  }
  const m = raw as Record<string, unknown>;

  // --- contract version -----------------------------------------------------
  const contractVersion = m.contractVersion;
  if (typeof contractVersion !== "number") {
    errors.push("Manifest is missing a numeric \"contractVersion\".");
  } else if (!SUPPORTED_CONTRACT_VERSIONS.includes(contractVersion as 1)) {
    errors.push(
      `Manifest contract version ${contractVersion} is not supported. This Shop accepts version ` +
      `${SUPPORTED_CONTRACT_VERSIONS.join(", ")}.`,
    );
  }

  // --- identity -------------------------------------------------------------
  for (const field of ["sku", "slug", "title", "version"] as const) {
    if (!isNonEmpty(m[field])) errors.push(`Manifest is missing "${field}".`);
  }
  if (isNonEmpty(m.sku) && !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(m.sku)) {
    errors.push("Manifest \"sku\" must be 3-64 characters of letters, digits, dot, underscore or hyphen.");
  }
  if (isNonEmpty(m.slug) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.slug)) {
    errors.push("Manifest \"slug\" must be lowercase words separated by single hyphens.");
  }

  // --- licence and formats --------------------------------------------------
  if (!isNonEmpty(m.licenseType)) {
    errors.push("Manifest is missing \"licenseType\".");
  } else if (!VALID_LICENSE_TYPES.includes(m.licenseType as LicenseType)) {
    errors.push(`Manifest "licenseType" must be one of: ${VALID_LICENSE_TYPES.join(", ")}.`);
  }
  if (!isNonEmpty(m.supportedFormats)) errors.push("Manifest is missing \"supportedFormats\".");

  // --- customer-facing copy -------------------------------------------------
  const copyFields: [keyof ProductManifest, string][] = [
    ["shortDescription", "short description"],
    ["problemSolved", "problem solved"],
    ["description", "full description"],
    ["responsibleUseText", "responsible-use statement"],
    ["refundPolicySummary", "refund policy summary"],
  ];
  for (const [field, label] of copyFields) {
    if (!isNonEmpty(m[field])) errors.push(`Manifest is missing the ${label} ("${field}").`);
  }

  for (const field of ["deliverables", "notIncluded"] as const) {
    const value = m[field];
    if (!Array.isArray(value)) {
      errors.push(`Manifest "${field}" must be an array of strings.`);
    } else if (value.some((item) => !isNonEmpty(item))) {
      errors.push(`Manifest "${field}" contains an empty entry.`);
    }
  }
  if (Array.isArray(m.deliverables) && m.deliverables.length === 0) {
    errors.push("Manifest \"deliverables\" is empty — a product must state what the customer receives.");
  }

  if (!Array.isArray(m.faqs)) {
    errors.push("Manifest \"faqs\" must be an array.");
  } else if (
    m.faqs.some((f) => typeof f !== "object" || f === null ||
      !isNonEmpty((f as Record<string, unknown>).q) || !isNonEmpty((f as Record<string, unknown>).a))
  ) {
    errors.push("Every manifest FAQ must have a non-empty \"q\" and \"a\".");
  }

  // --- placeholders ---------------------------------------------------------
  for (const [key, value] of Object.entries(m)) {
    if (typeof value === "string") {
      const found = containsPlaceholder(value);
      if (found) errors.push(`Manifest field "${key}" still contains placeholder text (${found}).`);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          const found = containsPlaceholder(item);
          if (found) errors.push(`Manifest field "${key}" still contains placeholder text (${found}).`);
        }
      }
    }
  }

  // --- no public URL dependency --------------------------------------------
  // Deliverables must be inside the package. A manifest pointing at an external
  // URL would mean the product is not self-contained and the Shop would be
  // serving something it does not hold.
  const urlPattern = /https?:\/\//i;
  if (Array.isArray(m.files)) {
    for (const entry of m.files as ManifestFileEntry[]) {
      if (typeof entry?.path === "string" && urlPattern.test(entry.path)) {
        errors.push(`Manifest file "${entry.path}" is a URL. Deliverables must be inside the package.`);
      }
    }
  }
  if (typeof m.coverImage === "string" && urlPattern.test(m.coverImage)) {
    errors.push("Manifest \"coverImage\" is a URL. The cover image must be inside the package.");
  }

  // --- price ----------------------------------------------------------------
  if (m.recommendedPriceCents !== undefined && m.recommendedPriceCents !== null) {
    const price = m.recommendedPriceCents;
    if (typeof price !== "number" || !Number.isInteger(price) || price <= 0 || price > 100_000_00) {
      errors.push("Manifest \"recommendedPriceCents\" must be a positive whole number of cents under 100000000.");
    }
  }

  // --- deliverable inventory vs archive contents ----------------------------
  const actual = new Set(zipFileNames);
  if (!Array.isArray(m.files)) {
    errors.push("Manifest \"files\" must be an array describing the package contents.");
  } else {
    const declared = new Set<string>();
    for (const entry of m.files as ManifestFileEntry[]) {
      if (!entry || !isNonEmpty(entry.path)) {
        errors.push("Manifest \"files\" contains an entry with no \"path\".");
        continue;
      }
      if (entry.path.includes("..") || entry.path.startsWith("/")) {
        errors.push(`Manifest file path "${entry.path}" is not a safe relative path.`);
        continue;
      }
      declared.add(entry.path);
      if (!actual.has(entry.path)) {
        errors.push(`Manifest declares "${entry.path}", which is not in the package.`);
      }
    }
    for (const name of zipFileNames) {
      if (name === MANIFEST_ENTRY_NAME) continue;
      if (!declared.has(name)) {
        errors.push(`Package contains "${name}", which the manifest does not declare.`);
      }
    }
  }

  // --- executable content ---------------------------------------------------
  for (const name of zipFileNames) {
    const ext = extensionOf(name);
    if (DENIED_EXTENSIONS.has(ext)) {
      errors.push(`Package contains a prohibited executable or script file: "${name}".`);
    }
  }

  // --- cover image ----------------------------------------------------------
  if (m.coverImage !== undefined && m.coverImage !== null) {
    if (!isNonEmpty(m.coverImage)) {
      errors.push("Manifest \"coverImage\" must be a path inside the package, or null.");
    } else if (!actual.has(m.coverImage)) {
      errors.push(`Manifest declares cover image "${m.coverImage}", which is not in the package.`);
    } else if (!IMAGE_EXTENSIONS.has(extensionOf(m.coverImage))) {
      errors.push("Manifest \"coverImage\" must be a PNG, JPG or WEBP file.");
    }
  } else {
    warnings.push("No cover image in the package. The product cannot be published until one is uploaded.");
  }

  // --- size -----------------------------------------------------------------
  if (packageBytes <= 0) {
    errors.push("Package is empty.");
  } else if (packageBytes > MAX_PACKAGE_BYTES) {
    errors.push(`Package is ${(packageBytes / 1_048_576).toFixed(1)} MB, over the ${MAX_PACKAGE_BYTES / 1_048_576} MB limit.`);
  }

  // --- advisory -------------------------------------------------------------
  if (m.recommendedPriceCents === undefined || m.recommendedPriceCents === null) {
    warnings.push("No recommended price in the manifest. The Owner must set and confirm a price before publishing.");
  }
  if (!isNonEmpty(m.category)) warnings.push("Manifest has no \"category\".");
  if (!isNonEmpty(m.audience)) warnings.push("Manifest has no \"audience\".");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    manifest: errors.length === 0 ? (m as unknown as ProductManifest) : null,
  };
}
