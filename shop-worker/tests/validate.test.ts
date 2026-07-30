import { describe, expect, it } from "vitest";
import {
  checkPublishReadiness,
  isValidEmail,
  isValidSku,
  isValidSlug,
  sanitizeFilename,
  validateDownloadFile,
  validateImageFile,
} from "../src/lib/validate";
import type { ProductRow } from "../src/types";

describe("sanitizeFilename", () => {
  it("strips path components (no directory traversal)", () => {
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("..");
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFilename("C:\\Windows\\System32\\evil.exe")).toBe("evil.exe");
  });

  it("removes disallowed characters and collapses whitespace", () => {
    expect(sanitizeFilename("my file (final) v2!!.pdf")).toBe("my-file-final-v2.pdf");
  });

  it("preserves a normal, already-safe filename", () => {
    expect(sanitizeFilename("ai-operations-playbook.pdf")).toBe("ai-operations-playbook.pdf");
  });

  it("never returns an empty string", () => {
    expect(sanitizeFilename("///...")).toBe("file");
    expect(sanitizeFilename("")).toBe("file");
  });

  it("caps filename length while preserving the extension", () => {
    const long = "a".repeat(300) + ".pdf";
    const result = sanitizeFilename(long);
    expect(result.length).toBeLessThanOrEqual(120);
    expect(result.endsWith(".pdf")).toBe(true);
  });
});

describe("validateDownloadFile — invalid upload type rejection", () => {
  it("accepts an allow-listed type", () => {
    expect(validateDownloadFile("playbook.pdf", "application/pdf", 1024).ok).toBe(true);
    expect(validateDownloadFile("bundle.zip", "application/zip", 1024).ok).toBe(true);
  });

  it("rejects an executable extension even if content-type is spoofed", () => {
    const result = validateDownloadFile("installer.exe", "application/pdf", 1024);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not permitted/i);
  });

  it("rejects script and markup extensions", () => {
    expect(validateDownloadFile("payload.html", "text/plain", 100).ok).toBe(false);
    expect(validateDownloadFile("script.js", "text/plain", 100).ok).toBe(false);
    expect(validateDownloadFile("image.svg", "image/svg+xml", 100).ok).toBe(false);
  });

  it("rejects a mismatched content-type for an otherwise allowed extension", () => {
    const result = validateDownloadFile("report.pdf", "text/html", 1024);
    expect(result.ok).toBe(false);
  });

  it("rejects oversized files", () => {
    const result = validateDownloadFile("huge.zip", "application/zip", 600 * 1024 * 1024);
    expect(result.ok).toBe(false);
  });

  it("rejects zero-byte files", () => {
    expect(validateDownloadFile("empty.pdf", "application/pdf", 0).ok).toBe(false);
  });
});

describe("validateImageFile", () => {
  it("accepts PNG/JPG/WEBP", () => {
    expect(validateImageFile("cover.png", "image/png", 2048).ok).toBe(true);
    expect(validateImageFile("cover.jpg", "image/jpeg", 2048).ok).toBe(true);
    expect(validateImageFile("cover.webp", "image/webp", 2048).ok).toBe(true);
  });

  it("rejects SVG (script-capable image format)", () => {
    expect(validateImageFile("cover.svg", "image/svg+xml", 2048).ok).toBe(false);
  });

  it("rejects oversized images", () => {
    expect(validateImageFile("cover.png", "image/png", 20 * 1024 * 1024).ok).toBe(false);
  });
});

describe("basic field validators", () => {
  it("validates email format", () => {
    expect(isValidEmail("owner@sentinelfortune.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });

  it("validates slug format", () => {
    expect(isValidSlug("ai-operations-playbook-toolkit")).toBe(true);
    expect(isValidSlug("Not A Slug")).toBe(false);
    expect(isValidSlug("ab")).toBe(false); // too short
  });

  it("validates SKU format", () => {
    expect(isValidSku("SFL-AIOPS-001")).toBe(true);
    expect(isValidSku("bad sku")).toBe(false);
  });
});

function baseProduct(overrides: Partial<ProductRow> = {}): Pick<
  ProductRow,
  "price_cents" | "price_confirmed" | "license_type" | "terms_acknowledged" | "refund_eligible" | "refund_policy_summary" | "title" | "slug" | "sku"
> {
  return {
    price_cents: null,
    price_confirmed: 0,
    license_type: "SINGLE_BUSINESS",
    terms_acknowledged: 0,
    refund_eligible: 1,
    refund_policy_summary: "",
    title: "AI Operations Playbook & Toolkit",
    slug: "ai-operations-playbook-toolkit",
    sku: "SFL-AIOPS-001",
    ...overrides,
  };
}

describe("checkPublishReadiness — publication gating (product validation)", () => {
  it("blocks publication of the freshly-seeded draft product (no price, no cover, no files)", () => {
    const result = checkPublishReadiness(baseProduct(), false, 0);
    expect(result.ready).toBe(false);
    expect(result.errors).toContain("Price must be entered and explicitly confirmed by the Owner.");
    expect(result.errors).toContain("A cover image is required.");
    expect(result.errors).toContain("At least one downloadable file is required.");
    expect(result.errors).toContain("Owner terms acknowledgement is required.");
    expect(result.errors).toContain("A refund policy summary must be selected/entered.");
  });

  it("blocks publication when price is set but not confirmed", () => {
    const result = checkPublishReadiness(
      baseProduct({ price_cents: 4900, price_confirmed: 0, terms_acknowledged: 1, refund_policy_summary: "30-day refund" }),
      true,
      1,
    );
    expect(result.ready).toBe(false);
    expect(result.errors).toContain("Price must be entered and explicitly confirmed by the Owner.");
  });

  it("allows publication once every required field is satisfied", () => {
    const result = checkPublishReadiness(
      baseProduct({
        price_cents: 4900,
        price_confirmed: 1,
        terms_acknowledged: 1,
        refund_policy_summary: "30-day refund, minus processing fee.",
      }),
      true,
      1,
    );
    expect(result.ready).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
