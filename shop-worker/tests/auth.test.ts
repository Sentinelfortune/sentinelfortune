import { describe, expect, it, beforeEach } from "vitest";
import { extractAccessJwt, requireOwnerAccess, verifyAccessJwtWithJwks, __resetJwksCacheForTests } from "../src/lib/auth";
import { buildTestEnv } from "./helpers/testEnv";

const AUD = "test-aud-tag";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeJson(obj: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

async function generateTestKeyPair() {
  return crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, [
    "sign",
    "verify",
  ]);
}

async function signAccessJwt(
  privateKey: CryptoKey,
  kid: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT", kid };
  const headerSeg = base64UrlEncodeJson(header);
  const payloadSeg = base64UrlEncodeJson(payload);
  const signingInput = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, signingInput);
  const sigSeg = base64UrlEncode(new Uint8Array(signature));
  return `${headerSeg}.${payloadSeg}.${sigSeg}`;
}

describe("Cloudflare Access JWT verification", () => {
  beforeEach(() => {
    __resetJwksCacheForTests();
  });

  it("verifies a validly signed, unexpired, correct-audience token", async () => {
    const { publicKey, privateKey } = await generateTestKeyPair();
    const jwk = await crypto.subtle.exportKey("jwk", publicKey);
    const kid = "test-key-1";
    const now = Math.floor(Date.now() / 1000);

    const token = await signAccessJwt(privateKey, kid, {
      aud: [AUD],
      email: "owner@sentinelfortune.com",
      sub: "user-123",
      exp: now + 3600,
      iat: now,
    });

    const identity = await verifyAccessJwtWithJwks(token, [{ kty: "RSA", n: jwk.n!, e: jwk.e!, kid }], AUD, new Date(now * 1000));
    expect(identity).toEqual({ email: "owner@sentinelfortune.com", sub: "user-123" });
  });

  it("rejects a token signed by a different (untrusted) key", async () => {
    const legit = await generateTestKeyPair();
    const attacker = await generateTestKeyPair();
    const legitJwk = await crypto.subtle.exportKey("jwk", legit.publicKey);
    const kid = "test-key-1";
    const now = Math.floor(Date.now() / 1000);

    // Signed with the attacker's private key, but claims the legitimate kid.
    const token = await signAccessJwt(attacker.privateKey, kid, { aud: [AUD], email: "x@x.com", sub: "u", exp: now + 3600 });

    const identity = await verifyAccessJwtWithJwks(token, [{ kty: "RSA", n: legitJwk.n!, e: legitJwk.e!, kid }], AUD, new Date(now * 1000));
    expect(identity).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { publicKey, privateKey } = await generateTestKeyPair();
    const jwk = await crypto.subtle.exportKey("jwk", publicKey);
    const kid = "test-key-1";
    const now = Math.floor(Date.now() / 1000);

    const token = await signAccessJwt(privateKey, kid, { aud: [AUD], email: "owner@sentinelfortune.com", sub: "u", exp: now - 7200 });

    const identity = await verifyAccessJwtWithJwks(token, [{ kty: "RSA", n: jwk.n!, e: jwk.e!, kid }], AUD, new Date(now * 1000));
    expect(identity).toBeNull();
  });

  it("rejects a token with the wrong audience", async () => {
    const { publicKey, privateKey } = await generateTestKeyPair();
    const jwk = await crypto.subtle.exportKey("jwk", publicKey);
    const kid = "test-key-1";
    const now = Math.floor(Date.now() / 1000);

    const token = await signAccessJwt(privateKey, kid, { aud: ["some-other-application"], email: "owner@sentinelfortune.com", sub: "u", exp: now + 3600 });

    const identity = await verifyAccessJwtWithJwks(token, [{ kty: "RSA", n: jwk.n!, e: jwk.e!, kid }], AUD, new Date(now * 1000));
    expect(identity).toBeNull();
  });

  it("rejects a malformed token", async () => {
    const identity = await verifyAccessJwtWithJwks("not.a.validtoken", [], AUD, new Date());
    expect(identity).toBeNull();
  });
});

describe("extractAccessJwt", () => {
  it("reads the Cf-Access-Jwt-Assertion header", () => {
    const request = new Request("https://shop.example.com/shop/admin/products", {
      headers: { "Cf-Access-Jwt-Assertion": "abc.def.ghi" },
    });
    expect(extractAccessJwt(request)).toBe("abc.def.ghi");
  });

  it("falls back to the CF_Authorization cookie", () => {
    const request = new Request("https://shop.example.com/shop/admin/products", {
      headers: { Cookie: "other=1; CF_Authorization=abc.def.ghi; more=2" },
    });
    expect(extractAccessJwt(request)).toBe("abc.def.ghi");
  });

  it("returns null when neither is present — unauthorized admin access", () => {
    const request = new Request("https://shop.example.com/shop/admin/products");
    expect(extractAccessJwt(request)).toBeNull();
  });
});

describe("requireOwnerAccess — unauthorized admin access rejection", () => {
  it("returns null when no Access JWT is present on the request", async () => {
    const env = await buildTestEnv();
    const request = new Request("https://shop.example.com/shop/admin/products");
    const identity = await requireOwnerAccess(request, env);
    expect(identity).toBeNull();
  });

  it("returns null when Access team domain / AUD are not configured", async () => {
    const env = await buildTestEnv({ CF_ACCESS_TEAM_DOMAIN: "", CF_ACCESS_AUD: "" });
    const request = new Request("https://shop.example.com/shop/admin/products", {
      headers: { "Cf-Access-Jwt-Assertion": "abc.def.ghi" },
    });
    const identity = await requireOwnerAccess(request, env);
    expect(identity).toBeNull();
  });
});
