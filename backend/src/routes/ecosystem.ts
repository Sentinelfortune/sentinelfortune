/**
 * Sentinel Fortune — Ecosystem API  (backend-v1)
 *
 * Mounted at /api by app.ts — so all handlers here use paths WITHOUT /api prefix.
 *
 * Live routes:
 *   GET  /api/health
 *   POST /api/enter-system
 *   POST /api/buy
 *   GET  /api/status/:id
 *
 * Called by Cloudflare Worker which strips /api prefix before forwarding,
 * then Replit Express re-adds /api via app.use("/api", router).
 * Net result: Worker /status/:id → Express /api/status/:id ✓
 *
 * R2 data source of truth (written by Python bot):
 *   originus/users/{id}/profile.json   — may be absent (not always written)
 *   originus/users/{id}/delivery.json  — always written on activation; has tier too
 *
 * Local filesystem fallback mirrors R2 at:
 *   data/users/{id}/profile.json
 *   data/users/{id}/delivery.json
 */

import { Router, type Request, type Response } from "express";
import fs   from "fs";
import path from "path";
import { logTraffic, logSales, readR2 } from "../lib/r2Writer";

const router = Router();

// ---------------------------------------------------------------------------
// Domain → Telegram entry config (mirrors sales_flow.py DOMAIN_ENTRY_MAP)
// ---------------------------------------------------------------------------

interface DomainEntry {
  slug:         string;
  default_tier: string;
  label:        string;
}

const DOMAIN_MAP: Record<string, DomainEntry> = {
  "sentinelfortune.com":        { slug: "sentinelfortune",    default_tier: "starter",   label: "Sentinel Fortune" },
  "lumenschoolacademy.online":  { slug: "lumenschoolacademy", default_tier: "starter",   label: "Lumen School Academy" },
  "codexworldtv.homes":         { slug: "codexworldtv",       default_tier: "pro",       label: "Codex World TV" },
  "lumengame.vip":              { slug: "lumengame",          default_tier: "pro",       label: "Lumen Game" },
  "vibraflowmedia.casa":        { slug: "vibraflowmedia",     default_tier: "oem",       label: "VibraFlow Media" },
  "sentinelfortunerecords.one": { slug: "records",            default_tier: "starter",   label: "Sentinel Fortune Records" },
  "oglegacystore.homes":        { slug: "oglegacystore",      default_tier: "starter",   label: "OG Legacy Store" },
  "lightnodesystems.my":        { slug: "lightnodesystems",   default_tier: "licensing", label: "LightNode Systems" },
};

const BOT_USERNAME = "sentinelfortune_bot";

// Tier → Stripe env var
const TIER_ENV: Record<string, string> = {
  "lite":      "STRIPE_BUY_LINK_LITE",
  "monthly":   "STRIPE_BUY_LINK_MONTHLY",
  "starter":   "STRIPE_BUY_LINK_STARTER",
  "pro":       "STRIPE_BUY_LINK_PRO",
  "oem":       "STRIPE_BUY_LINK_OEM",
  "licensing": "STRIPE_BUY_LINK_LICENSING",
};

// Tier → primary channel name (first channel in delivery matrix)
const TIER_PRIMARY_CHANNEL: Record<string, string> = {
  "lite":      "teachings_vault_v1",
  "monthly":   "reset_v1",
  "starter":   "teachings_vault_v1",
  "pro":       "sentinel_engine_v1",
  "oem":       "sentinel_architect_v1",
  "licensing": "sentinel_architect_v1",
};

const VALID_TIERS = new Set(Object.keys(TIER_ENV));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveDomain(rawDomain: string): DomainEntry | null {
  const d = rawDomain.toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
  return DOMAIN_MAP[d] ?? null;
}

function ipFromReq(req: Request): string {
  const fw = req.headers["x-forwarded-for"];
  if (typeof fw === "string") return fw.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

/** Build Stripe URL, optionally embedding client_reference_id */
function getTierCheckout(tier: string, userId?: string): {
  url: string | null;
  client_reference_id: string | null;
} {
  const envKey = TIER_ENV[tier];
  if (!envKey) return { url: null, client_reference_id: null };
  const base = process.env[envKey]?.trim();
  if (!base) return { url: null, client_reference_id: null };
  const cri  = userId || null;
  const sep  = base.includes("?") ? "&" : "?";
  const url  = cri ? `${base}${sep}client_reference_id=${encodeURIComponent(cri)}` : base;
  return { url, client_reference_id: cri };
}

// ---------------------------------------------------------------------------
// Local file fallback (mirrors Python bot's data/users/{id}/*.json)
// ---------------------------------------------------------------------------

function localRead<T>(filePath: string): T | null {
  try {
    const abs = path.resolve(filePath);
    if (fs.existsSync(abs)) {
      return JSON.parse(fs.readFileSync(abs, "utf8")) as T;
    }
  } catch { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------------------
// Status data loader — delivery.json is primary source of truth.
// profile.json is supplemental (not always written by the bot).
// Falls back to local filesystem if R2 is unavailable.
// ---------------------------------------------------------------------------

interface UserDelivery {
  user_id?:          number;
  tier?:             string;
  delivered?:        boolean;
  channels_unlocked?: string[];
  messages_sent?:    string[];
  delivered_at?:     string;
  updated_at?:       string;
}

interface UserProfile {
  user_id?:     number;
  tier?:        string;
  status?:      string;
  created_at?:  string;
  updated_at?:  string;
  activated?:   boolean;
  activated_at?: string;
}

async function loadUserStatus(userId: string): Promise<{
  found:      boolean;
  tier:       string | null;
  delivered:  boolean;
  channel:    string | null;
  updated_at: string | null;
} | null> {
  // Try R2 first (both files in parallel)
  const [delivery, profile] = await Promise.all([
    readR2<UserDelivery>(`originus/users/${userId}/delivery.json`),
    readR2<UserProfile>(`originus/users/${userId}/profile.json`),
  ]);

  // Local fallback if R2 returned nothing at all
  const localDelivery = delivery ?? localRead<UserDelivery>(`data/users/${userId}/delivery.json`);
  const localProfile  = profile  ?? localRead<UserProfile>(`data/users/${userId}/profile.json`);

  // Neither source has data — user genuinely not found
  if (!localDelivery && !localProfile) return null;

  const tier      = localDelivery?.tier ?? localProfile?.tier ?? null;
  const delivered = localDelivery?.delivered ?? false;
  const channels  = localDelivery?.channels_unlocked ?? [];
  const primary   = channels[0] ?? (tier ? TIER_PRIMARY_CHANNEL[tier] : null) ?? null;
  const updatedAt = localDelivery?.updated_at
                 ?? localDelivery?.delivered_at
                 ?? localProfile?.updated_at
                 ?? localProfile?.activated_at
                 ?? null;

  return { found: true, tier, delivered, channel: primary, updated_at: updatedAt };
}

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

router.get("/health", (_req: Request, res: Response) => {
  const telegramOk = Boolean(process.env["TELEGRAM_BOT_TOKEN"]?.trim());
  const stripeOk   = Boolean(process.env["STRIPE_BUY_LINK_LITE"]?.trim()
                          || process.env["STRIPE_SECRET_KEY"]?.trim());
  const r2Ok       = Boolean(process.env["CF_ACCOUNT_ID"]?.trim()
                          && process.env["CF_R2_ACCESS_KEY_ID"]?.trim());

  res.json({
    ok:       true,
    service:  "sentinel-agent",
    telegram: telegramOk,
    stripe:   stripeOk,
    r2:       r2Ok,
    version:  "backend-v1",
  });
});


// ---------------------------------------------------------------------------
// POST /api/enter-system
// Body: { domain, slug?, tier?, ref?, source? }
// ---------------------------------------------------------------------------

router.post("/enter-system", async (req: Request, res: Response) => {
  const {
    domain = "",
    slug: bodySlug = "",
    tier: bodyTier = "",
    ref  = "",
    source = "direct_api",
  } = req.body as {
    domain?:  string;
    slug?:    string;
    tier?:    string;
    ref?:     string;
    source?:  string;
  };

  const entry      = resolveDomain(domain);
  const slug       = bodySlug || entry?.slug || "sentinelfortune";
  const tier       = (VALID_TIERS.has(bodyTier) ? bodyTier : null)
                  ?? entry?.default_tier
                  ?? "starter";

  const deep_link    = `entry_${slug}_${tier}`;
  const telegram_url = `https://t.me/${BOT_USERNAME}?start=${deep_link}`;

  void logTraffic({
    domain:    domain || "unknown",
    slug,
    action:    "enter",
    tier,
    ip:        ipFromReq(req),
    ref,
    timestamp: new Date().toISOString(),
    source:    source as "direct_api",
  });

  res.json({ ok: true, telegram_url, deep_link, slug, tier });
});


// ---------------------------------------------------------------------------
// POST /api/buy
// Body: { tier?, user_id?, domain? }
// ---------------------------------------------------------------------------

router.post("/buy", async (req: Request, res: Response) => {
  const {
    tier     = "lite",
    user_id  = "",
    domain   = "",
  } = req.body as {
    tier?:    string;
    user_id?: string;
    domain?:  string;
  };

  const safeTier = VALID_TIERS.has(tier) ? tier : "lite";
  const { url, client_reference_id } = getTierCheckout(safeTier, user_id || undefined);

  if (!url) {
    res.status(404).json({
      ok:    false,
      error: `Payment link for tier '${safeTier}' is not yet configured.`,
      tier:  safeTier,
    });
    return;
  }

  void logSales({
    domain:     domain || "unknown",
    tier:       safeTier,
    user_id:    user_id || undefined,
    stripe_url: url,
    timestamp:  new Date().toISOString(),
    source:     "direct_api",
  });

  res.json({
    ok:                   true,
    tier:                 safeTier,
    checkout_url:         url,
    client_reference_id:  client_reference_id,
    source:               "stripe",
  });
});


// ---------------------------------------------------------------------------
// GET /api/status/:id
// ---------------------------------------------------------------------------

router.get("/status/:id", async (req: Request, res: Response) => {
  const rawId  = req.params["id"] ?? "";
  // Telegram user IDs are always numeric — reject anything that isn't
  const userId = rawId.replace(/[^0-9]/g, "");

  if (!userId || userId !== rawId.trim()) {
    res.status(400).json({ ok: false, error: "Invalid user ID — must be numeric" });
    return;
  }

  try {
    const data = await loadUserStatus(userId);

    if (!data) {
      res.status(404).json({ ok: false, error: "User not found", user_id: userId });
      return;
    }

    res.json({
      ok:         true,
      user_id:    userId,
      tier:       data.tier,
      delivered:  data.delivered,
      channel:    data.channel,
      updated_at: data.updated_at,
    });

  } catch (err) {
    console.error("[ecosystem] /status error:", (err as Error).message);
    res.status(500).json({ ok: false, error: "Status lookup failed", user_id: userId });
  }
});


export default router;
