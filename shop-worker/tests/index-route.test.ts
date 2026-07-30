import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { buildTestEnv } from "./helpers/testEnv";

function fakeCtx(): ExecutionContext {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
}

describe("Worker fetch() entrypoint — unauthorized admin access", () => {
  it("returns 401 for /shop/admin/* with no Cloudflare Access JWT at all", async () => {
    const env = await buildTestEnv();
    const request = new Request("https://shop-worker.example.workers.dev/shop/admin/products");
    const response = await worker.fetch(request, env, fakeCtx());
    expect(response.status).toBe(401);
  });

  it("returns 401 for /shop/admin/* with a garbage Access JWT", async () => {
    const env = await buildTestEnv();
    const request = new Request("https://shop-worker.example.workers.dev/shop/admin/products", {
      headers: { "Cf-Access-Jwt-Assertion": "not-a-real-jwt" },
    });
    const response = await worker.fetch(request, env, fakeCtx());
    expect(response.status).toBe(401);
  });

  it("public routes remain reachable without any Access JWT", async () => {
    const env = await buildTestEnv();
    const request = new Request("https://shop-worker.example.workers.dev/shop/products");
    const response = await worker.fetch(request, env, fakeCtx());
    expect(response.status).toBe(200);
  });

  it("returns 404 for an unknown path", async () => {
    const env = await buildTestEnv();
    const request = new Request("https://shop-worker.example.workers.dev/nonexistent");
    const response = await worker.fetch(request, env, fakeCtx());
    expect(response.status).toBe(404);
  });

  it("responds to CORS preflight with allowed methods", async () => {
    const env = await buildTestEnv();
    const request = new Request("https://shop-worker.example.workers.dev/shop/checkout", {
      method: "OPTIONS",
      headers: { Origin: "https://sentinelfortune.github.io" },
    });
    const response = await worker.fetch(request, env, fakeCtx());
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://sentinelfortune.github.io");
  });
});
