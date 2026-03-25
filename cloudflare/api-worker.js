/**
 * Sentinel Fortune — Cloudflare Workers API
 * v2.0.0 — Portable, migration-ready
 *
 * Routes handled:
 *   GET  /api/health
 *   GET  /api/healthz
 *   POST /api/enter-system
 *   POST /api/buy
 *   GET  /api/status/:id
 *   POST /api/stripe/webhook
 *
 * Bindings required (wrangler.toml):
 *   ORIGINUS_R2   — R2 bucket
 *   STRIPE_SECRET — Secret text
 *   STRIPE_WEBHOOK_SECRET
 *   BOT_TOKEN
 *   [env vars]: STRIPE_BUY_LINK_LITE, _MONTHLY, _STARTER, _PRO, _OEM, _LICENSING
 *
 * R2 Namespace Governance (READ-ONLY Canon rule: never write originus/_canon/):
 *   originus/public/*    — public content
 *   originus/hub/*       — hub content
 *   originus/users/{id}/profile.json
 *   originus/users/{id}/delivery.json
 *   originus/payments/*  — payment records
 *   originus/access/*    — access grants
 *   originus/finance/*   — finance records
 *   originus/private/*   — private ops
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DOMAIN_MAP = {
  "sentinelfortune.com":        { slug: "sentinelfortune",    default_tier: "starter",   label: "Sentinel Fortune" },
  "lumenschoolacademy.online":  { slug: "lumenschoolacademy", default_tier: "starter",   label: "Lumen School Academy" },
  "codexworldtv.homes":         { slug: "codexworldtv",       default_tier: "pro",       label: "Codex World TV" },
  "lumengame.vip":              { slug: "lumengame",          default_tier: "pro",       label: "Lumen Game" },
  "vibraflowmedia.casa":        { slug: "vibraflowmedia",     default_tier: "oem",       label: "VibraFlow Media" },
  "sentinelfortunerecords.one": { slug: "records",            default_tier: "starter",   label: "Sentinel Fortune Records" },
  "oglegacystore.homes":        { slug: "oglegacystore",      default_tier: "starter",   label: "OG Legacy Store" },
  "lightnodesystems.my":        { slug: "lightnodesystems",   default_tier: "licensing", label: "LightNode Systems" },
};

const TIER_ENV_KEYS = {
  lite:      "STRIPE_BUY_LINK_LITE",
  monthly:   "STRIPE_BUY_LINK_MONTHLY",
  starter:   "STRIPE_BUY_LINK_STARTER",
  pro:       "STRIPE_BUY_LINK_PRO",
  oem:       "STRIPE_BUY_LINK_OEM",
  licensing: "STRIPE_BUY_LINK_LICENSING",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function resolveDomain(raw) {
  return DOMAIN_MAP[(raw || "").toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "")] ?? null;
}

async function r2Read(env, key) {
  if (!env.ORIGINUS_R2) return null;
  try {
    const obj = await env.ORIGINUS_R2.get(key);
    if (!obj) return null;
    return JSON.parse(await obj.text());
  } catch { return null; }
}

async function r2Write(env, key, data) {
  if (!env.ORIGINUS_R2) return false;
  // Guard: never write to _canon namespace
  if (key.startsWith("originus/_canon/")) {
    console.error("BLOCKED: attempt to write to _canon namespace:", key);
    return false;
  }
  try {
    await env.ORIGINUS_R2.put(key, JSON.stringify(data), {
      httpMetadata: { contentType: "application/json" },
    });
    return true;
  } catch { return false; }
}

// ── Route handlers ───────────────────────────────────────────────────────────

async function handleHealth(env) {
  const r2ok = env.ORIGINUS_R2 ? "bound" : "unbound";
  return json({
    status: "ok",
    service: "sentinel-fortune-api",
    version: "2.0.0",
    r2: r2ok,
    ts: new Date().toISOString(),
  });
}

async function handleEnterSystem(req, env) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { user_id, domain, tier: reqTier, username, first_name } = body;
  if (!user_id) return json({ error: "user_id required" }, 400);

  const uid = String(user_id);
  const domainEntry = resolveDomain(domain || "sentinelfortune.com");
  const tier = reqTier || domainEntry?.default_tier || "starter";
  const now = new Date().toISOString();

  // R2 canonical key
  const profileKey = `originus/users/${uid}/profile.json`;
  let profile = await r2Read(env, profileKey);

  if (!profile) {
    profile = {
      user_id: uid, username, first_name,
      tier, domain: domain || "sentinelfortune.com",
      created_at: now, updated_at: now,
      status: "entered",
    };
    await r2Write(env, profileKey, profile);
  }

  // Build Stripe checkout URL
  const envKey = TIER_ENV_KEYS[tier];
  const base = envKey ? (env[envKey] || null) : null;
  const checkoutUrl = base
    ? `${base}${base.includes("?") ? "&" : "?"}client_reference_id=${encodeURIComponent(uid)}`
    : null;

  return json({
    ok: true,
    user_id: uid,
    status: profile.status,
    tier,
    domain: domainEntry?.label || "Sentinel Fortune",
    checkout_url: checkoutUrl,
    bot_link: `https://t.me/sentinelfortune_bot?start=${uid}`,
  });
}

async function handleBuy(req, env) {
  const url = new URL(req.url);
  let tier = url.searchParams.get("tier");
  let userId = url.searchParams.get("user_id") || url.searchParams.get("cri");

  if (req.method === "POST") {
    try {
      const body = await req.json();
      tier = tier || body.tier;
      userId = userId || body.user_id;
    } catch { /* use query params */ }
  }

  if (!tier || !TIER_ENV_KEYS[tier]) {
    return json({ error: "Invalid or missing tier", valid_tiers: Object.keys(TIER_ENV_KEYS) }, 400);
  }

  const envKey = TIER_ENV_KEYS[tier];
  const base = env[envKey];
  if (!base) return json({ error: "Checkout not configured for this tier" }, 503);

  const sep = base.includes("?") ? "&" : "?";
  const checkoutUrl = userId ? `${base}${sep}client_reference_id=${encodeURIComponent(userId)}` : base;

  return new Response(null, {
    status: 302,
    headers: { ...CORS, Location: checkoutUrl },
  });
}

async function handleStatus(userId, env) {
  if (!userId) return json({ error: "user_id required" }, 400);
  const uid = String(userId);

  const deliveryKey = `originus/users/${uid}/delivery.json`;
  const profileKey  = `originus/users/${uid}/profile.json`;

  const [delivery, profile] = await Promise.all([
    r2Read(env, deliveryKey),
    r2Read(env, profileKey),
  ]);

  if (!delivery && !profile) {
    return json({ user_id: uid, status: "not_found", message: "No record found. Use /enter or /start to begin." }, 404);
  }

  return json({
    user_id: uid,
    status:  delivery?.status  || profile?.status  || "entered",
    tier:    delivery?.tier    || profile?.tier    || null,
    access:  delivery?.channels || [],
    created_at: profile?.created_at || null,
    updated_at: delivery?.updated_at || profile?.updated_at || null,
  });
}

async function handleStripeWebhook(req, env) {
  // Forward to bot or process locally
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature") || "";
  // TODO: verify sig with env.STRIPE_WEBHOOK_SECRET
  // Log receipt to R2
  const logKey = `originus/payments/webhooks/${Date.now()}.json`;
  await r2Write(env, logKey, { received_at: new Date().toISOString(), sig: sig.slice(0, 32) });
  return json({ received: true });
}

// ── Main fetch handler ───────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Route dispatch
    if (path === "/api/health" || path === "/api/healthz") {
      return handleHealth(env);
    }

    if (path === "/api/enter-system" && method === "POST") {
      return handleEnterSystem(request, env);
    }

    if ((path === "/api/buy" || path === "/buy") && (method === "GET" || method === "POST")) {
      return handleBuy(request, env);
    }

    const statusMatch = path.match(/^\/api\/status\/(.+)$/);
    if (statusMatch && method === "GET") {
      return handleStatus(statusMatch[1], env);
    }

    if (path === "/api/stripe/webhook" && method === "POST") {
      return handleStripeWebhook(request, env);
    }

    return json({ error: "Not found", path }, 404);
  },
};
