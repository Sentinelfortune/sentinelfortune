import { describe, expect, it } from "vitest";
import { corsHeaders, isAllowedOrigin, handlePreflight, withCors } from "../src/lib/cors";

const STOREFRONT = "https://sentinelfortune.github.io";
const ADMIN = "https://sentinel-fortune-shop-admin.pages.dev";

function headerMap(h: HeadersInit): Record<string, string> {
  return h as Record<string, string>;
}

describe("CORS origin allow-list", () => {
  it("allows the GitHub Pages storefront origin with no env configured", () => {
    expect(isAllowedOrigin(STOREFRONT)).toBe(true);
  });

  it("rejects an arbitrary third-party origin", () => {
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
    expect(isAllowedOrigin("https://evil.example.com", { ADMIN_ALLOWED_ORIGIN: ADMIN })).toBe(false);
  });

  it("rejects a null/absent Origin", () => {
    expect(isAllowedOrigin(null)).toBe(false);
  });

  it("does NOT allow the admin origin until ADMIN_ALLOWED_ORIGIN is configured", () => {
    expect(isAllowedOrigin(ADMIN)).toBe(false);
  });

  it("allows the admin origin once ADMIN_ALLOWED_ORIGIN is configured", () => {
    expect(isAllowedOrigin(ADMIN, { ADMIN_ALLOWED_ORIGIN: ADMIN })).toBe(true);
  });

  it("ignores the unreplaced placeholder value (fail-safe, does not broaden)", () => {
    expect(isAllowedOrigin(ADMIN, { ADMIN_ALLOWED_ORIGIN: "REPLACE_WITH_ADMIN_PAGES_ORIGIN" })).toBe(false);
    // storefront must keep working regardless
    expect(isAllowedOrigin(STOREFRONT, { ADMIN_ALLOWED_ORIGIN: "REPLACE_WITH_ADMIN_PAGES_ORIGIN" })).toBe(true);
  });

  it("tolerates a trailing slash in the configured admin origin", () => {
    expect(isAllowedOrigin(ADMIN, { ADMIN_ALLOWED_ORIGIN: ADMIN + "/" })).toBe(true);
  });
});

describe("CORS headers", () => {
  it("echoes the exact allowed origin, never a wildcard", () => {
    const h = headerMap(corsHeaders(STOREFRONT));
    expect(h["Access-Control-Allow-Origin"]).toBe(STOREFRONT);
    expect(h["Access-Control-Allow-Origin"]).not.toBe("*");
  });

  it("sends Allow-Credentials for an allowed origin (required by the admin's credentials:'include' fetch)", () => {
    const h = headerMap(corsHeaders(ADMIN, { ADMIN_ALLOWED_ORIGIN: ADMIN }));
    expect(h["Access-Control-Allow-Credentials"]).toBe("true");
  });

  it("omits BOTH Allow-Origin and Allow-Credentials for a disallowed origin", () => {
    const h = headerMap(corsHeaders("https://evil.example.com"));
    expect(h["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(h["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("permits every HTTP method the admin routes actually use", () => {
    const methods = headerMap(corsHeaders(STOREFRONT))["Access-Control-Allow-Methods"];
    for (const m of ["GET", "POST", "PUT", "DELETE", "OPTIONS"]) {
      expect(methods).toContain(m);
    }
  });

  it("always sets Vary: Origin so caches do not mix per-origin responses", () => {
    expect(headerMap(corsHeaders(null))["Vary"]).toBe("Origin");
  });
});

describe("preflight and response wrapping", () => {
  it("answers OPTIONS with 204 and the allow-list headers", async () => {
    const req = new Request("https://worker.example.dev/shop/checkout", {
      method: "OPTIONS",
      headers: { Origin: STOREFRONT },
    });
    const res = handlePreflight(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(204);
    expect(res!.headers.get("Access-Control-Allow-Origin")).toBe(STOREFRONT);
  });

  it("returns null for non-OPTIONS requests", () => {
    expect(handlePreflight(new Request("https://worker.example.dev/shop/products"))).toBeNull();
  });

  it("preserves the original status and body while adding CORS headers", async () => {
    const req = new Request("https://worker.example.dev/shop/admin/products", {
      headers: { Origin: ADMIN },
    });
    const original = new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
    const wrapped = withCors(original, req, { ADMIN_ALLOWED_ORIGIN: ADMIN });

    expect(wrapped.status).toBe(401);
    expect(wrapped.headers.get("Content-Type")).toBe("application/json");
    expect(wrapped.headers.get("Access-Control-Allow-Origin")).toBe(ADMIN);
    expect(wrapped.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(await wrapped.json()).toEqual({ ok: false });
  });
});
