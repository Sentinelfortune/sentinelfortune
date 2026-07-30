// Owner Admin authentication.
//
// Cloudflare Access sits in front of the /admin/* routes at the edge and is
// the primary control — unauthenticated requests never reach this Worker at
// all when Access is configured correctly (see CLOUDFLARE_SHOP_SETUP.md).
//
// This module is the *defense-in-depth* second check: the Worker itself
// verifies the `Cf-Access-Jwt-Assertion` JWT against Cloudflare's public
// JWKS and checks the audience tag, so that admin routes are never reachable
// by request forgery, a misconfigured Access policy, or direct calls to the
// Worker's own workers.dev URL (which bypasses Access unless Access is
// specifically bound to that hostname too).
//
// No username/password auth is implemented anywhere in this module, per the
// mission brief.

import type { Env } from "../types";

export interface AccessIdentity {
  email: string;
  sub: string;
}

interface Jwk {
  kty: string;
  n: string;
  e: string;
  kid?: string;
  alg?: string;
}

function base64UrlToUint8Array(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeJson<T>(segment: string): T {
  const bytes = base64UrlToUint8Array(segment);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

interface AccessJwtPayload {
  aud: string | string[];
  email?: string;
  sub?: string;
  exp: number;
  iat?: number;
  nbf?: number;
}

const CLOCK_SKEW_SECONDS = 60;

/**
 * Pure verification against an already-fetched JWKS key set. Kept separate
 * from JWKS fetching so it can be unit tested without any network access.
 */
export async function verifyAccessJwtWithJwks(
  token: string,
  jwks: Jwk[],
  expectedAud: string,
  now: Date,
): Promise<AccessIdentity | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerSeg, payloadSeg, sigSeg] = parts;

  let header: { alg?: string; kid?: string };
  let payload: AccessJwtPayload;
  try {
    header = base64UrlDecodeJson(headerSeg);
    payload = base64UrlDecodeJson(payloadSeg);
  } catch {
    return null;
  }

  if (header.alg !== "RS256") return null;

  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return null;
  }

  const signingInput = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);
  const signature = base64UrlToUint8Array(sigSeg);

  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature, signingInput);
  if (!valid) return null;

  const nowSec = Math.floor(now.getTime() / 1000);
  if (payload.exp + CLOCK_SKEW_SECONDS < nowSec) return null;
  if (payload.nbf && payload.nbf - CLOCK_SKEW_SECONDS > nowSec) return null;

  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audList.includes(expectedAud)) return null;

  if (!payload.email || !payload.sub) return null;

  return { email: payload.email, sub: payload.sub };
}

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function fetchJwks(teamDomain: string): Promise<Jwk[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;

  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Failed to fetch Cloudflare Access JWKS (${res.status})`);
  const data = (await res.json()) as { keys: Jwk[] };
  jwksCache = { keys: data.keys, fetchedAt: now };
  return data.keys;
}

export function extractAccessJwt(request: Request): string | null {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;

  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Full request-level check: extracts the Access JWT, fetches the current
 * JWKS (cached per isolate), and verifies it. Returns the authenticated
 * identity, or null if the request must be rejected with 401/403.
 */
export async function requireOwnerAccess(request: Request, env: Env): Promise<AccessIdentity | null> {
  const token = extractAccessJwt(request);
  if (!token) return null;

  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return null;

  try {
    const jwks = await fetchJwks(env.CF_ACCESS_TEAM_DOMAIN);
    return await verifyAccessJwtWithJwks(token, jwks, env.CF_ACCESS_AUD, new Date());
  } catch {
    return null;
  }
}

/** Test/dev-only hook to reset the module-level JWKS cache between test cases. */
export function __resetJwksCacheForTests(): void {
  jwksCache = null;
}
