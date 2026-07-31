// End-to-end tests for the Owner Admin authentication corridor:
//
//   admin browser  ->  /api/* (same-origin Pages Function proxy)
//                  ->  Shop Worker /shop/admin/*  (verifies the Access JWT)
//
// The proxy is exercised against the REAL Worker entrypoint (src/index.ts) with
// a real RS256 Access token and a real JWKS, so these tests cover the actual
// signature/issuer/audience path rather than a stub of it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { handleAdminProxy, extractAccessToken, DEFAULT_WORKER_ORIGIN } from "../../functions/_shared/proxy";
import worker from "../src/index";
import { __resetJwksCacheForTests } from "../src/lib/auth";
import { buildTestEnv } from "./helpers/testEnv";
import {
  createTestKeyPair,
  jwksFetchStub,
  signTestAccessJwt,
  TEST_AUD,
  TEST_TEAM_DOMAIN,
  type TestKeyPair,
} from "./helpers/accessJwt";
import type { Env } from "../src/types";

const KID = "test-kid-1";
const PAGES_ORIGIN = "https://sentinel-fortune-shop-admin.pages.dev";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

let keys: TestKeyPair;
let env: Env;
/** Every request the proxy actually sent to the Worker. */
let forwarded: Request[];

/** Wires the proxy's outbound fetch straight into the real Worker. */
function workerFetch(workerEnv: Env) {
  return async (request: Request): Promise<Response> => {
    forwarded.push(request.clone());
    return worker.fetch(request, workerEnv, ctx);
  };
}

function adminRequest(path: string, headers: Record<string, string> = {}, init: RequestInit = {}): Request {
  return new Request(`${PAGES_ORIGIN}${path}`, { headers, ...init });
}

beforeEach(async () => {
  __resetJwksCacheForTests();
  forwarded = [];
  keys = await createTestKeyPair(KID);
  // JWKS is fetched over the network by src/lib/auth.ts — serve it locally.
  vi.stubGlobal("fetch", jwksFetchStub(keys.jwks));
  env = await buildTestEnv({ CF_ACCESS_TEAM_DOMAIN: TEST_TEAM_DOMAIN, CF_ACCESS_AUD: TEST_AUD });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin proxy — authenticated request succeeds", () => {
  it("forwards a valid Access token and returns the Worker's 200", async () => {
    const token = await signTestAccessJwt(keys.privateKey, KID);

    const response = await handleAdminProxy(
      adminRequest("/api/shop/admin/whoami", { "Cf-Access-Jwt-Assertion": token }),
      {},
      workerFetch(env),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; email: string };
    expect(body.ok).toBe(true);
    expect(body.email).toBe("owner@sentinelfortune.com");
  });

  it("maps /api/<path> onto the Worker origin and carries the token in the header", async () => {
    const token = await signTestAccessJwt(keys.privateKey, KID);

    await handleAdminProxy(adminRequest("/api/shop/admin/whoami", { "Cf-Access-Jwt-Assertion": token }), {}, workerFetch(env));

    expect(forwarded).toHaveLength(1);
    expect(forwarded[0].url).toBe(`${DEFAULT_WORKER_ORIGIN}/shop/admin/whoami`);
    expect(forwarded[0].headers.get("Cf-Access-Jwt-Assertion")).toBe(token);
    // The browser's cookie must not be relayed onwards.
    expect(forwarded[0].headers.get("Cookie")).toBeNull();
  });

  it("accepts the token from the CF_Authorization cookie when the header is absent", async () => {
    const token = await signTestAccessJwt(keys.privateKey, KID);

    const response = await handleAdminProxy(
      adminRequest("/api/shop/admin/whoami", { Cookie: `CF_Authorization=${token}; other=1` }),
      {},
      workerFetch(env),
    );

    expect(response.status).toBe(200);
    expect(forwarded[0].headers.get("Cf-Access-Jwt-Assertion")).toBe(token);
  });

  it("honours SHOP_WORKER_ORIGIN when set", async () => {
    const token = await signTestAccessJwt(keys.privateKey, KID);

    await handleAdminProxy(
      adminRequest("/api/shop/admin/whoami", { "Cf-Access-Jwt-Assertion": token }),
      { SHOP_WORKER_ORIGIN: "https://other-worker.example.workers.dev/" },
      workerFetch(env),
    );

    expect(forwarded[0].url).toBe("https://other-worker.example.workers.dev/shop/admin/whoami");
  });
});

describe("admin proxy — fails closed", () => {
  it("returns 401 and never calls the Worker when no Access token is present", async () => {
    const response = await handleAdminProxy(adminRequest("/api/shop/admin/whoami"), {}, workerFetch(env));

    expect(response.status).toBe(401);
    expect(forwarded).toHaveLength(0);
  });

  it("returns 401 for a forged token signed by an untrusted key", async () => {
    const attacker = await createTestKeyPair(KID); // same kid, different key
    const forged = await signTestAccessJwt(attacker.privateKey, KID);

    const response = await handleAdminProxy(
      adminRequest("/api/shop/admin/whoami", { "Cf-Access-Jwt-Assertion": forged }),
      {},
      workerFetch(env),
    );

    // The proxy forwards it; the Worker is the authority and rejects it.
    expect(forwarded).toHaveLength(1);
    expect(response.status).toBe(401);
  });

  it("returns 401 for a correctly signed token with the wrong audience", async () => {
    const token = await signTestAccessJwt(keys.privateKey, KID, { aud: ["a-different-access-application"] });

    const response = await handleAdminProxy(
      adminRequest("/api/shop/admin/whoami", { "Cf-Access-Jwt-Assertion": token }),
      {},
      workerFetch(env),
    );

    expect(response.status).toBe(401);
  });

  it("returns 401 for a correctly signed token issued by a different team domain", async () => {
    const token = await signTestAccessJwt(keys.privateKey, KID, { iss: "https://someone-else.cloudflareaccess.com" });

    const response = await handleAdminProxy(
      adminRequest("/api/shop/admin/whoami", { "Cf-Access-Jwt-Assertion": token }),
      {},
      workerFetch(env),
    );

    expect(response.status).toBe(401);
  });

  it("returns 401 for an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const token = await signTestAccessJwt(keys.privateKey, KID, { exp: past });

    const response = await handleAdminProxy(
      adminRequest("/api/shop/admin/whoami", { "Cf-Access-Jwt-Assertion": token }),
      {},
      workerFetch(env),
    );

    expect(response.status).toBe(401);
  });
});

describe("admin proxy — not an open relay", () => {
  it("refuses to proxy anything outside /shop/health and /shop/admin/*", async () => {
    const token = await signTestAccessJwt(keys.privateKey, KID);

    for (const path of ["/api/shop/checkout", "/api/shop/stripe/webhook", "/api/shop/download/abc", "/api/shop/products"]) {
      const response = await handleAdminProxy(adminRequest(path, { "Cf-Access-Jwt-Assertion": token }), {}, workerFetch(env));
      expect(response.status).toBe(404);
    }
    expect(forwarded).toHaveLength(0);
  });

  it("proxies /shop/health, which the dashboard status tile needs", async () => {
    const token = await signTestAccessJwt(keys.privateKey, KID);

    const response = await handleAdminProxy(adminRequest("/api/shop/health", { "Cf-Access-Jwt-Assertion": token }), {}, workerFetch(env));

    expect(response.status).toBe(200);
  });
});

describe("direct Worker access is unchanged", () => {
  it("returns 401 for an unauthenticated admin request straight to the Worker", async () => {
    const response = await worker.fetch(
      new Request(`${DEFAULT_WORKER_ORIGIN}/shop/admin/whoami`),
      env,
      ctx,
    );

    expect(response.status).toBe(401);
  });

  it("keeps the public routes working without any token", async () => {
    const health = await worker.fetch(new Request(`${DEFAULT_WORKER_ORIGIN}/shop/health`), env, ctx);
    const products = await worker.fetch(new Request(`${DEFAULT_WORKER_ORIGIN}/shop/products`), env, ctx);

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, service: "sentinel-fortune-shop-worker" });
    expect(products.status).toBe(200);
    expect(await products.json()).toEqual({ ok: true, products: [] });
  });
});

describe("the Access JWT is never exposed to browser JavaScript", () => {
  it("returns no credential-bearing headers and no token in the body", async () => {
    const token = await signTestAccessJwt(keys.privateKey, KID);

    const response = await handleAdminProxy(
      adminRequest("/api/shop/admin/whoami", { "Cf-Access-Jwt-Assertion": token }),
      {},
      workerFetch(env),
    );
    const text = await response.text();

    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Cf-Access-Jwt-Assertion")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(text).not.toContain(token);
    // Not even a fragment of it.
    expect(text).not.toContain(token.split(".")[2].slice(0, 16));
  });

  it("strips a Set-Cookie the upstream might have sent", async () => {
    const token = await signTestAccessJwt(keys.privateKey, KID);
    const upstream = async () => new Response('{"ok":true}', { status: 200, headers: { "Set-Cookie": "leak=1" } });

    const response = await handleAdminProxy(adminRequest("/api/shop/admin/whoami", { "Cf-Access-Jwt-Assertion": token }), {}, upstream);

    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("has no client-side code that reads the Access cookie or JWT header", () => {
    const adminJs = readFileSync(new URL("../../admin/admin.js", import.meta.url), "utf8");
    const adminConfig = readFileSync(new URL("../../admin/admin-config.js", import.meta.url), "utf8");

    // Comments legitimately name these; executable references must not exist.
    const code = (src: string) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");

    for (const src of [code(adminJs), code(adminConfig)]) {
      expect(src).not.toContain("CF_Authorization");
      expect(src).not.toContain("Cf-Access-Jwt-Assertion");
      expect(src).not.toContain("document.cookie");
    }
  });

  it("calls only its own origin — the admin never names a Worker hostname", () => {
    const adminConfig = readFileSync(new URL("../../admin/admin-config.js", import.meta.url), "utf8");
    const assignment = adminConfig.match(/window\.SHOP_API_BASE\s*=\s*(.+);/);

    expect(assignment).not.toBeNull();
    expect(assignment![1]).toBe('"/api"');
    expect(assignment![1]).not.toContain("workers.dev");
  });
});

describe("extractAccessToken", () => {
  it("prefers the Access header over the cookie", () => {
    const request = new Request(PAGES_ORIGIN, {
      headers: { "Cf-Access-Jwt-Assertion": "from-header", Cookie: "CF_Authorization=from-cookie" },
    });
    expect(extractAccessToken(request)).toBe("from-header");
  });

  it("returns null when neither is present", () => {
    expect(extractAccessToken(new Request(PAGES_ORIGIN))).toBeNull();
  });

  it("ignores unrelated cookies", () => {
    const request = new Request(PAGES_ORIGIN, { headers: { Cookie: "session=abc; theme=dark" } });
    expect(extractAccessToken(request)).toBeNull();
  });
});
