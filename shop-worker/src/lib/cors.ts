// Restrictive CORS.
//
// Two distinct browser origins legitimately call this Worker:
//
//   1. The public storefront, served from GitHub Pages
//      (https://sentinelfortune.github.io/sentinelfortune/shop/) — anonymous
//      requests to /shop/products and /shop/checkout.
//
//   2. The Owner Admin UI, served from a SEPARATE Cloudflare Pages project
//      behind Cloudflare Access — credentialed requests to /shop/admin/*.
//      Its origin is deployment-specific, so it is supplied at runtime via the
//      ADMIN_ALLOWED_ORIGIN var rather than hardcoded here.
//
// Server-to-server callers (the Stripe webhook) do not go through a browser
// and are unaffected by any of this.
//
// Fail-safe by design: if ADMIN_ALLOWED_ORIGIN is unset, nothing is broadened
// — the storefront keeps working and admin browser calls are simply not
// permitted, which surfaces as a clear CORS error rather than a silent
// security hole.

const STATIC_ALLOWED_ORIGINS = [
  "https://sentinelfortune.github.io",
  "http://localhost:8788", // wrangler pages dev — local admin/storefront preview
  "http://127.0.0.1:8788",
];

/** Minimal shape needed here; avoids importing the full Env into a leaf module. */
export interface CorsEnv {
  ADMIN_ALLOWED_ORIGIN?: string;
}

export function allowedOrigins(env?: CorsEnv): string[] {
  const adminOrigin = env?.ADMIN_ALLOWED_ORIGIN?.trim();
  return adminOrigin && !adminOrigin.startsWith("REPLACE_WITH")
    ? [...STATIC_ALLOWED_ORIGINS, adminOrigin.replace(/\/$/, "")]
    : STATIC_ALLOWED_ORIGINS;
}

export function isAllowedOrigin(origin: string | null, env?: CorsEnv): boolean {
  if (!origin) return false;
  return allowedOrigins(env).includes(origin);
}

export function corsHeaders(origin: string | null, env?: CorsEnv): HeadersInit {
  const headers: Record<string, string> = {
    // PUT and DELETE are required by the admin product/file/image routes;
    // omitting them here would make their preflight fail.
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cf-Access-Jwt-Assertion",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };

  if (isAllowedOrigin(origin, env)) {
    headers["Access-Control-Allow-Origin"] = origin as string;
    // The admin UI calls this Worker with `credentials: "include"` so the
    // Cloudflare Access cookie is sent. Browsers reject credentialed
    // cross-origin responses unless this header is present — and it may only
    // be used with an exact origin, never with "*", which is why
    // Allow-Origin above echoes the specific allow-listed origin.
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

export function handlePreflight(request: Request, env?: CorsEnv): Response | null {
  if (request.method !== "OPTIONS") return null;
  const origin = request.headers.get("Origin");
  return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
}

export function withCors(response: Response, request: Request, env?: CorsEnv): Response {
  const origin = request.headers.get("Origin");
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin, env))) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}
