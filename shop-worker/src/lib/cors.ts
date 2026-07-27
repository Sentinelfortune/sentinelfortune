// Restrictive CORS: only the known storefront/admin origins may call this
// Worker's public JSON endpoints from a browser. Server-to-server calls
// (Stripe webhooks) don't go through a browser and are unaffected by CORS.

const ALLOWED_ORIGINS = [
  "https://sentinelfortune.github.io",
  "http://localhost:8788",   // wrangler pages/dev local preview
  "http://127.0.0.1:8788",
];

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

export function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cf-Access-Jwt-Assertion",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin as string;
  }
  return headers;
}

export function handlePreflight(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  const origin = request.headers.get("Origin");
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export function withCors(response: Response, request: Request): Response {
  const origin = request.headers.get("Origin");
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}
