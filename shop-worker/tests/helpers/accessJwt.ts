// Test-only helpers for minting Cloudflare Access-shaped JWTs and the matching
// JWKS. Lets tests exercise the real verification path (RS256 + JWKS + issuer +
// audience) instead of stubbing it out.

export const TEST_TEAM_DOMAIN = "sentinelfortune-test.cloudflareaccess.com";
export const TEST_ISSUER = `https://${TEST_TEAM_DOMAIN}`;
export const TEST_AUD = "test-aud-tag";
export const TEST_JWKS_URL = `https://${TEST_TEAM_DOMAIN}/cdn-cgi/access/certs`;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeJson(obj: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

export interface TestKeyPair {
  privateKey: CryptoKey;
  jwks: { kid: string; kty: string; alg: string; use: string; n: string; e: string }[];
}

export async function createTestKeyPair(kid = "test-kid-1"): Promise<TestKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as { n: string; e: string };
  return {
    privateKey: pair.privateKey,
    jwks: [{ kid, kty: "RSA", alg: "RS256", use: "sig", n: jwk.n, e: jwk.e }],
  };
}

export async function signTestAccessJwt(
  privateKey: CryptoKey,
  kid: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: [TEST_AUD],
    iss: TEST_ISSUER,
    email: "owner@sentinelfortune.com",
    sub: "owner-sub-1",
    iat: now - 10,
    exp: now + 3600,
    ...overrides,
  };
  const headerSeg = base64UrlEncodeJson({ alg: "RS256", typ: "JWT", kid });
  const payloadSeg = base64UrlEncodeJson(payload);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(`${headerSeg}.${payloadSeg}`),
  );
  return `${headerSeg}.${payloadSeg}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** A fetch stub that serves only the Access JWKS endpoint. */
export function jwksFetchStub(jwks: unknown[]): (input: Request | string | URL) => Promise<Response> {
  return async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === TEST_JWKS_URL) {
      return new Response(JSON.stringify({ keys: jwks }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected network call in test: ${url}`);
  };
}
