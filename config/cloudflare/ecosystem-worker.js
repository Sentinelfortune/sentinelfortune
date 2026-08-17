// =============================================================================
// Sentinel Fortune Ecosystem Worker — v1.4.0
// Architecture: API routes handled first, hub/static resolver runs last.
// Status data:  originus/system/users/<userId>/status.json  (ORIGINUS_R2)
// Hub pages:    originus/hub/<domain><pathname>/index.html  (ORIGINUS_R2)
// =============================================================================

const DOMAIN_MAP = {
  "sentinelfortune.com":        { slug: "sentinelfortune",    tier: "starter"   },
  "oglegacystore.homes":        { slug: "oglegacystore",      tier: "starter"   },
  "codexworldtv.homes":         { slug: "codexworldtv",       tier: "pro"       },
  "lumengame.vip":              { slug: "lumengame",          tier: "pro"       },
  "sentinelfortunerecords.one": { slug: "records",            tier: "starter"   },
  "lumenschoolacademy.online":  { slug: "lumenschoolacademy", tier: "starter"   },
  "vibraflowmedia.casa":        { slug: "vibraflowmedia",     tier: "oem"       },
  "lightnodesystems.my":        { slug: "lightnodesystems",   tier: "licensing" },
};

const BOT_USERNAME   = "sentinelfortune_bot";
const WORKER_VERSION = "v1.4.0";

const SUPPORTED_ROUTES = ["health", "enter", "enter-system", "buy", "status"];

// Paths the hub/static resolver must NEVER handle.
// Checked against the raw url.pathname (lowercased) before any normalization.
const HUB_BLOCKED_PREFIXES = [
  "/api/",
  "/status/",
  "/health",
  "/enter",
  "/buy",
  "/success",
];

// =============================================================================
// Guard — returns true when a path must NOT reach the hub/static resolver
// =============================================================================

function isApiPath(pathname) {
  const lower = pathname.toLowerCase();
  return HUB_BLOCKED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

// =============================================================================
// Rate limiter — in-memory, per isolate
// =============================================================================

const _rateLimitMap = new Map();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_MS  = 60_000;

function isRateLimited(ip) {
  const now   = Date.now();
  const entry = _rateLimitMap.get(ip) ?? { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_LIMIT_MS) {
    entry.count       = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  _rateLimitMap.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

function getIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

// =============================================================================
// Response helpers
// =============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function redirect(url, status = 302) {
  return Response.redirect(url, status);
}

// =============================================================================
// Domain resolution
// =============================================================================

function resolveDomain(request) {
  const host = request.headers.get("host") ?? "";
  const bare = host.toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
  return DOMAIN_MAP[bare] ?? null;
}

function getHostname(request) {
  return (request.headers.get("host") ?? "")
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/:\d+$/, "");
}

// Strip /api prefix so /api/health and /health both normalise to /health.
function normalizePath(raw) {
  return raw.toLowerCase().replace(/^\/api\//, "/").replace(/\/+$/, "") || "/";
}

// =============================================================================
// R2 helpers
// Bucket binding:  env.ORIGINUS_R2
//
// Status key:  originus/system/users/<userId>/status.json
// Hub key:     originus/hub/<domain><pathname>/index.html
// =============================================================================

function r2StatusKey(userId) {
  return `originus/system/users/${userId}/status.json`;
}

function r2HubKey(hostname, pathname) {
  const p = pathname.replace(/\/+$/, "") || "/index";
  return `originus/hub/${hostname}${p}/index.html`;
}

async function r2GetStatus(r2, userId) {
  if (!r2) return null;
  try {
    const obj = await r2.get(r2StatusKey(userId));
    if (!obj) return null;
    return await obj.json();
  } catch {
    return null;
  }
}

async function r2PutStatus(r2, userId, data) {
  if (!r2) return;
  try {
    await r2.put(r2StatusKey(userId), JSON.stringify(data), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch {}
}

async function r2GetHubPage(r2, hostname, pathname) {
  if (!r2) return null;
  try {
    const obj = await r2.get(r2HubKey(hostname, pathname));
    if (!obj) return null;
    return await obj.text();
  } catch {
    return null;
  }
}

// =============================================================================
// Fire-and-forget logger to Replit API
// =============================================================================

function fireLog(ctx, apiBase, endpoint, body) {
  if (!apiBase) return;
  ctx.waitUntil(
    fetch(`${apiBase}${endpoint}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    }).catch(() => {})
  );
}

// =============================================================================
// Route handlers
// =============================================================================

// GET /
function handleRoot() {
  return json({
    ok:      true,
    service: "sentinel-fortune-ecosystem",
    version: WORKER_VERSION,
    routes:  SUPPORTED_ROUTES,
  });
}

// GET /health  |  GET /api/health
function handleHealth(env) {
  return json({
    ok:              true,
    service:         "sentinel-fortune-ecosystem",
    version:         WORKER_VERSION,
    worker:          true,
    replit_api_base: Boolean(env.REPLIT_API_BASE),
    r2:              Boolean(env.ORIGINUS_R2),
    domains:         Object.keys(DOMAIN_MAP).length,
    timestamp:       new Date().toISOString(),
  });
}

// GET /enter
function handleEnter(request, url, domain, ctx, apiBase) {
  const slug      = domain?.slug ?? "sentinelfortune";
  const tier      = url.searchParams.get("tier") || domain?.tier || "starter";
  const ref       = url.searchParams.get("ref") ?? "";
  const deep_link = `entry_${slug}_${tier}`;
  const bot_url   = `https://t.me/${BOT_USERNAME}?start=${deep_link}`;

  fireLog(ctx, apiBase, "/enter-system", {
    domain: request.headers.get("host") ?? "",
    slug, tier, ref,
    source: "cloudflare_worker",
  });

  return redirect(bot_url);
}

// POST /enter-system  |  POST /api/enter-system
// Creates the initial status.json record in R2 if one does not yet exist.
async function handleEnterSystem(request, domain, ctx, apiBase, r2) {
  let body = {};
  try { body = await request.json(); } catch {}

  const slug   = domain?.slug ?? body.slug ?? "sentinelfortune";
  const tier   = body.tier || domain?.tier || "starter";
  const ref    = body.ref ?? "";
  const userId = String(body.user_id ?? "").replace(/[^0-9]/g, "");

  fireLog(ctx, apiBase, "/enter-system", {
    domain: request.headers.get("host") ?? body.domain ?? "",
    slug, tier, ref,
    source: "cloudflare_worker",
  });

  if (userId && r2) {
    const existing = await r2GetStatus(r2, userId);
    if (!existing) {
      const now = new Date().toISOString();
      await r2PutStatus(r2, userId, {
        ok:         true,
        user_id:    userId,
        tier,
        slug,
        delivered:  false,
        channel:    null,
        entered_at: now,
        updated_at: now,
        source:     "cloudflare_worker",
      });
    }
  }

  const deep_link    = `entry_${slug}_${tier}`;
  const telegram_url = `https://t.me/${BOT_USERNAME}?start=${deep_link}`;

  return json({ ok: true, telegram_url, deep_link, slug, tier });
}

// GET /buy
function handleBuyGet(request, url, domain, ctx, apiBase) {
  const tier      = url.searchParams.get("tier") || "lite";
  const slug      = domain?.slug ?? "sentinelfortune";
  const deep_link = `entry_${slug}_${tier}`;
  const bot_url   = `https://t.me/${BOT_USERNAME}?start=${deep_link}`;

  fireLog(ctx, apiBase, "/buy", {
    domain: request.headers.get("host") ?? "",
    tier,
    source: "cloudflare_worker",
  });

  return redirect(bot_url);
}

// POST /buy  |  POST /api/buy
// Forwards to Replit, then updates the R2 status.json record.
async function handleBuyPost(request, domain, ctx, apiBase, r2) {
  let body = {};
  try { body = await request.json(); } catch {}

  const tier   = body.tier || "lite";
  const userId = String(body.user_id ?? "").replace(/[^0-9]/g, "");
  const slug   = domain?.slug ?? "sentinelfortune";

  if (apiBase) {
    try {
      const upstream = await fetch(`${apiBase}/buy`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          tier,
          user_id: userId,
          domain:  request.headers.get("host") ?? "",
        }),
      });
      const data = await upstream.json();

      if (data.ok && userId && r2) {
        const existing = await r2GetStatus(r2, userId);
        const now = new Date().toISOString();
        await r2PutStatus(r2, userId, {
          ...(existing ?? {}),
          ok:                 true,
          user_id:            userId,
          tier,
          delivered:          false,
          checkout_initiated: true,
          updated_at:         now,
          source:             "cloudflare_worker",
        });
      }

      return json(data, upstream.status);
    } catch {
      return json({ ok: false, error: "Buy service unavailable" }, 503);
    }
  }

  // No REPLIT_API_BASE — fall back to Telegram deep-link
  const deep_link = `entry_${slug}_${tier}`;
  const bot_url   = `https://t.me/${BOT_USERNAME}?start=${deep_link}`;
  fireLog(ctx, apiBase, "/buy", {
    domain: request.headers.get("host") ?? "",
    tier,
    source: "cloudflare_worker",
  });
  return json({ ok: true, tier, telegram_url: bot_url, deep_link });
}

// GET /status/:id  |  GET /api/status/:id
//
// Resolution order:
//   1. R2 — originus/system/users/<userId>/status.json
//   2. Replit backend — ${REPLIT_API_BASE}/api/status/<userId>
//      (result written back to R2 on success)
//   3. JSON 404 — never falls through to hub resolver
//
// This handler is matched against url.pathname (raw) BEFORE normalization
// so that isApiPath() blocking in the hub section is redundant but kept as
// an explicit belt-and-suspenders guard.
async function handleStatus(rawPathname, apiBase, r2) {
  const userId = rawPathname
    .replace(/^\/api\/status\//, "")
    .replace(/^\/status\//, "")
    .replace(/[^0-9]/g, "");

  if (!userId) {
    return json({ ok: false, error: "Invalid user ID" }, 400);
  }

  // Step 1 — R2 cache
  const cached = await r2GetStatus(r2, userId);
  if (cached) {
    return json({ ...cached, source_cache: "r2" });
  }

  // Step 2 — Replit backend
  if (apiBase) {
    try {
      const upstream = await fetch(`${apiBase}/api/status/${userId}`, {
        headers: { "Content-Type": "application/json" },
      });
      const data = await upstream.json();
      if (data.ok && r2) {
        await r2PutStatus(r2, userId, data);
      }
      return json(data, upstream.status);
    } catch {}
  }

  // Step 3 — Not found (JSON only, never hub)
  return json({
    ok:        false,
    user_id:   userId,
    tier:      null,
    delivered: false,
    channel:   null,
    error:     "User not found",
  }, 404);
}

// GET <any non-API path>
// Serves the public mirror page from R2.
// Key: originus/hub/<domain><pathname>/index.html
// Returns null when the page does not exist (caller will return 404).
async function handleHubPage(hostname, pathname, r2) {
  const html = await r2GetHubPage(r2, hostname, pathname);
  if (!html) return null;
  return new Response(html, {
    status:  200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...CORS_HEADERS },
  });
}

// =============================================================================
// Main fetch handler
// Routing order:
//   OPTIONS
//   rate limit
//   GET /
//   GET /health  |  GET /api/health
//   GET /enter
//   POST /enter-system  |  POST /api/enter-system
//   GET /buy
//   POST /buy  |  POST /api/buy
//   GET /status/:id
//   GET /api/status/:id
//   non-API GET only → hub/static resolver (guarded by isApiPath)
//   else → 404
// =============================================================================

export default {
  async fetch(request, env, ctx) {
    const apiBase = (env.REPLIT_API_BASE ?? "").trim();
    const r2      = env.ORIGINUS_R2 ?? null;
    const url     = new URL(request.url);
    const method  = request.method.toUpperCase();
    const ip      = getIp(request);
    const domain  = resolveDomain(request);
    const hostname = getHostname(request);

    // Normalize path: strips leading /api/ so both /health and /api/health work
    const path = normalizePath(url.pathname);

    // ------------------------------------------------------------------
    // OPTIONS — CORS preflight
    // ------------------------------------------------------------------
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ------------------------------------------------------------------
    // Rate limit
    // ------------------------------------------------------------------
    if (isRateLimited(ip)) {
      return json({ ok: false, error: "Rate limit exceeded. Try again shortly." }, 429);
    }

    // ------------------------------------------------------------------
    // GET /
    // ------------------------------------------------------------------
    if (method === "GET" && path === "/") {
      return handleRoot();
    }

    // ------------------------------------------------------------------
    // GET /health  |  GET /api/health
    // ------------------------------------------------------------------
    if (method === "GET" && path === "/health") {
      return handleHealth(env);
    }

    // ------------------------------------------------------------------
    // GET /enter  |  GET /api/enter
    // ------------------------------------------------------------------
    if (method === "GET" && path === "/enter") {
      return handleEnter(request, url, domain, ctx, apiBase);
    }

    // ------------------------------------------------------------------
    // POST /enter-system  |  POST /api/enter-system
    // ------------------------------------------------------------------
    if (method === "POST" && path === "/enter-system") {
      return handleEnterSystem(request, domain, ctx, apiBase, r2);
    }

    // ------------------------------------------------------------------
    // GET /buy  |  GET /api/buy
    // ------------------------------------------------------------------
    if (method === "GET" && path === "/buy") {
      return handleBuyGet(request, url, domain, ctx, apiBase);
    }

    // ------------------------------------------------------------------
    // POST /buy  |  POST /api/buy
    // ------------------------------------------------------------------
    if (method === "POST" && path === "/buy") {
      return handleBuyPost(request, domain, ctx, apiBase, r2);
    }

    // ------------------------------------------------------------------
    // GET /status/:id
    // Matched against RAW pathname before normalization.
    // ------------------------------------------------------------------
    if (method === "GET" && url.pathname.startsWith("/status/")) {
      return handleStatus(url.pathname, apiBase, r2);
    }

    // ------------------------------------------------------------------
    // GET /api/status/:id
    // Matched against RAW pathname before normalization.
    // ------------------------------------------------------------------
    if (method === "GET" && url.pathname.startsWith("/api/status/")) {
      return handleStatus(url.pathname, apiBase, r2);
    }

    // ------------------------------------------------------------------
    // GET /success
    // Stripe post-payment redirect — send users to the Telegram bot,
    // which is the real post-payment access point (channel delivery).
    // ------------------------------------------------------------------
    if (method === "GET" && path === "/success") {
      return redirect(`https://t.me/${BOT_USERNAME}`);
    }

    // ------------------------------------------------------------------
    // Hub / static page resolver
    // Runs ONLY for GET requests that are NOT API or status paths.
    // isApiPath() is the explicit guard — it checks the raw pathname.
    // A path like /api/status/:id can NEVER reach this block.
    // ------------------------------------------------------------------
    if (method === "GET" && !isApiPath(url.pathname)) {
      const hubResp = await handleHubPage(hostname, url.pathname, r2);
      if (hubResp) return hubResp;
    }

    // ------------------------------------------------------------------
    // 404
    // ------------------------------------------------------------------
    return json({
      ok:               false,
      error:            "Not found",
      path,
      supported_routes: SUPPORTED_ROUTES,
    }, 404);
  },
};
