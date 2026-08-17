// Tests the COMMITTED admin/_worker.js bundle — the exact artifact Cloudflare
// Pages serves for the Owner Admin project.
//
// tests/admin-proxy.test.ts covers the proxy's source. This file covers the
// build: a bundle that is missing, stale in a breaking way, or corrupt (the
// deprecated `wrangler pages functions build --outfile` writes a multipart
// upload envelope rather than JavaScript, which parses as a syntax error at
// the edge) would leave /api/* dead exactly as it was before this fix, with
// Pages quietly falling back to serving admin HTML for /api/shop/health.
//
// Regenerate with ./scripts/build-admin-pages.sh after changing functions/.

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const BUNDLE_URL = new URL("../../admin/_worker.js", import.meta.url);
const ROUTES_URL = new URL("../../admin/_routes.json", import.meta.url);
const ADMIN_ORIGIN = "https://sentinel-fortune-shop-admin.pages.dev";

const ADMIN_HTML = "<!doctype html><html>STATIC ADMIN HTML</html>";
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

/** Stands in for Cloudflare's static asset server. */
const ASSETS = {
  fetch: async () => new Response(ADMIN_HTML, { headers: { "Content-Type": "text/html" } }),
};

interface BundledWorker {
  fetch(request: Request, env: { ASSETS: typeof ASSETS }, ctx: ExecutionContext): Promise<Response>;
}

async function loadBundle(): Promise<BundledWorker> {
  const mod = (await import(/* @vite-ignore */ BUNDLE_URL.href)) as { default: BundledWorker };
  return mod.default;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin/_worker.js — the deployed artifact", () => {
  it("is JavaScript, not a multipart upload envelope", () => {
    const source = readFileSync(BUNDLE_URL, "utf8");
    expect(source.startsWith("--")).toBe(false);
    expect(source).not.toContain("Content-Disposition: form-data");
    expect(source).toContain("export {");
  });

  it("routes /api/* only, so static admin assets are served directly", () => {
    const routes = JSON.parse(readFileSync(ROUTES_URL, "utf8")) as { include: string[]; exclude: string[] };
    expect(routes.include).toEqual(["/api/*"]);
    expect(routes.exclude).toEqual([]);
  });

  it("answers /api/shop/health with JSON, never with admin HTML", async () => {
    const worker = await loadBundle();

    const response = await worker.fetch(new Request(`${ADMIN_ORIGIN}/api/shop/health`), { ASSETS }, ctx);
    const text = await response.text();

    // The bug this fixes: Pages served the static index.html for this path.
    expect(text).not.toContain("STATIC ADMIN HTML");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    // No Access token on this request, so the proxy fails closed.
    expect(response.status).toBe(401);
  });

  it("forwards an authenticated request to the Shop Worker", async () => {
    const worker = await loadBundle();
    const seen: Request[] = [];
    vi.stubGlobal("fetch", async (request: Request) => {
      seen.push(request);
      return new Response('{"ok":true,"service":"sentinel-fortune-shop-worker"}', {
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await worker.fetch(
      new Request(`${ADMIN_ORIGIN}/api/shop/health`, { headers: { "Cf-Access-Jwt-Assertion": "test-token" } }),
      { ASSETS },
      ctx,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "sentinel-fortune-shop-worker" });
    expect(seen).toHaveLength(1);
    // Asserted against the bundle's own default rather than a hard-coded
    // hostname, so pointing the Worker origin somewhere else never silently
    // turns this into a test of a stale address. Parsed through Request on
    // both sides because URL parsing lower-cases the host.
    const bundleDefault = /DEFAULT_WORKER_ORIGIN = "([^"]+)"/.exec(readFileSync(BUNDLE_URL, "utf8"))![1];
    expect(seen[0].url).toBe(new Request(`${bundleDefault}/shop/health`).url);
    expect(seen[0].headers.get("Cf-Access-Jwt-Assertion")).toBe("test-token");
  });

  it("falls back to the static assets for non-API paths", async () => {
    const worker = await loadBundle();

    for (const path of ["/", "/index.html", "/admin.css", "/products.html"]) {
      const response = await worker.fetch(new Request(`${ADMIN_ORIGIN}${path}`), { ASSETS }, ctx);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(ADMIN_HTML);
    }
  });

  it("still refuses to relay non-admin Worker routes", async () => {
    const worker = await loadBundle();
    const seen: Request[] = [];
    vi.stubGlobal("fetch", async (request: Request) => {
      seen.push(request);
      return new Response("{}");
    });

    const response = await worker.fetch(
      new Request(`${ADMIN_ORIGIN}/api/shop/checkout`, { headers: { "Cf-Access-Jwt-Assertion": "test-token" } }),
      { ASSETS },
      ctx,
    );

    expect(response.status).toBe(404);
    expect(seen).toHaveLength(0);
  });
});
