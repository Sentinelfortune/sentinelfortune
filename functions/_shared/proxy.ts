// Same-origin admin API proxy — the server half of the Owner Admin.
//
// WHY THIS EXISTS
// ---------------
// Cloudflare Access protects the admin Pages hostname
// (sentinel-fortune-shop-admin.pages.dev). Access authenticates the Owner by
// setting a CF_Authorization cookie *on that hostname* and by adding a
// Cf-Access-Jwt-Assertion header to requests it forwards to that origin.
//
// The Shop Worker lives on a DIFFERENT hostname (*.workers.dev). A browser
// fetch() from the Pages origin to the Worker origin is cross-site, so:
//   - the CF_Authorization cookie is NOT sent (it is scoped to pages.dev, and
//     a cross-site cookie would additionally need SameSite=None), and
//   - Cf-Access-Jwt-Assertion is a header Cloudflare injects at the edge in
//     front of a protected origin; page JavaScript cannot read or set it.
// So the Worker received no token at all and correctly answered 401. The
// admin then rendered its "Access Denied" panel even though the Access login
// itself had succeeded.
//
// The fix is to stop crossing origins. The browser now calls only its own
// Pages origin (/api/*). This module runs server-side inside the Pages
// Function, where the Access-authenticated request actually lands, and
// forwards the token to the Worker over a server-to-server request.
//
// SECURITY PROPERTIES
// -------------------
//   - The JWT is never handed to browser JavaScript. It is read from the
//     inbound request server-side and written only into the outbound request
//     to the Worker; it never appears in a response body or header.
//   - Fail-closed: no token means 401 here, and the Worker is not called.
//   - The proxy is NOT the authority. It forwards the token; the Worker still
//     verifies signature, issuer, audience and expiry against Cloudflare's
//     JWKS. A forged token that reaches the Worker is rejected there.
//   - Not an open relay: only /shop/health and /shop/admin/* may be proxied.
//   - Direct calls to the Worker's own hostname are unaffected and still 401
//     without a valid token — this proxy adds a path, it does not open one.
//
// Written with structural types and an injectable fetch so it can be unit
// tested in the shop-worker vitest suite with no Cloudflare runtime, matching
// how D1Like/R2Like are handled in shop-worker/src/types.ts.

/** The deployed TEST Worker. Public, not a secret — also in shop-worker/wrangler.toml. */
export const DEFAULT_WORKER_ORIGIN = "https://REPLACE_WITH_SHOP_WORKER_URL.workers.dev";

export interface ProxyEnv {
  /** Override for other environments. Falls back to the test Worker. */
  SHOP_WORKER_ORIGIN?: string;
}

export type FetchLike = (request: Request) => Promise<Response>;

/**
 * Paths this proxy will forward, relative to the Worker root.
 * /shop/health backs the admin dashboard's status tile; /shop/admin/* is the
 * admin API. Checkout, the Stripe webhook and download routes are deliberately
 * absent — proxying them would let an Access-authenticated browser session
 * reach public commerce endpoints through a privileged path for no reason.
 */
function isProxyablePath(path: string): boolean {
  return path === "/shop/health" || path.startsWith("/shop/admin/");
}

/**
 * Extract the Access JWT server-side.
 *
 * Prefers the header Cloudflare injects in front of a protected origin, and
 * falls back to the CF_Authorization cookie it sets on the protected hostname.
 * A caller-supplied header is not a bypass: whatever is forwarded is verified
 * cryptographically by the Worker against Cloudflare's JWKS.
 */
export function extractAccessToken(request: Request): string | null {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;

  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Handle one /api/* request from the admin browser.
 *
 * /api/shop/admin/whoami  ->  <worker origin>/shop/admin/whoami
 */
export async function handleAdminProxy(request: Request, env: ProxyEnv, doFetch: FetchLike = (r) => fetch(r)): Promise<Response> {
  const url = new URL(request.url);

  const path = url.pathname.replace(/^\/api/, "");
  if (!isProxyablePath(path)) {
    return jsonError(404, "Not found.");
  }

  const token = extractAccessToken(request);
  if (!token) {
    // Fail closed without touching the Worker. Reaching this means the request
    // did not come through Cloudflare Access.
    return jsonError(401, "Owner authentication required.");
  }

  const workerOrigin = (env.SHOP_WORKER_ORIGIN || DEFAULT_WORKER_ORIGIN).replace(/\/$/, "");

  // Build a clean outbound request rather than forwarding the browser's headers
  // wholesale: no Cookie (the Pages Access cookie has no meaning to the Worker
  // and must not travel further than it has to), no Origin (this is a
  // server-to-server call, not a CORS one), nothing else the page controls.
  const outboundHeaders = new Headers();
  outboundHeaders.set("Cf-Access-Jwt-Assertion", token);
  const contentType = request.headers.get("Content-Type");
  if (contentType) outboundHeaders.set("Content-Type", contentType);
  outboundHeaders.set("Accept", "application/json");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const outbound = new Request(`${workerOrigin}${path}${url.search}`, {
    method: request.method,
    headers: outboundHeaders,
    body: hasBody ? request.body : null,
    redirect: "manual",
  });

  let response: Response;
  try {
    response = await doFetch(outbound);
  } catch {
    return jsonError(502, "Shop Worker unreachable.");
  }

  // Return the Worker's own status and body unchanged — 401 stays 401, so the
  // admin's fail-closed behaviour is preserved end to end. Strip anything that
  // could put credentials or cross-origin permissions in front of the browser.
  const headers = new Headers(response.headers);
  headers.delete("Set-Cookie");
  headers.delete("Cf-Access-Jwt-Assertion");
  headers.delete("Access-Control-Allow-Origin");
  headers.delete("Access-Control-Allow-Credentials");
  headers.set("Cache-Control", "no-store");

  return new Response(response.body, { status: response.status, headers });
}
