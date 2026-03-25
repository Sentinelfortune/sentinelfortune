"""
Sentinel Fortune LLC — Multi-Entry Sales Flow Service.

Handles:
  - Tier → Stripe payment link mapping (env vars: STRIPE_BUY_LINK_<TIER>)
  - /buy URL generation with client_reference_id embedded
  - Deep-link entry payload parsing (entry_{domain}_{tier})
  - Domain → default tier mapping for all 8 Sentinel Fortune domains
  - R2 logging for leads, clicks, and followup/retargeting states

R2 paths used:
  originus/sales/leads/{uid}_{ts}.json        — entry intent log
  originus/sales/clicks/{uid}_{ts}.json       — /buy click log
  originus/sales/followup/{uid}.json          — retargeting state (mutable)
"""

import logging
import os
import re
from datetime import datetime, timezone

from bot.services.r2_service import get_json, put_json

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tier configuration
# ---------------------------------------------------------------------------

VALID_TIERS = {"lite", "monthly", "starter", "pro", "oem", "licensing"}

TIER_LABELS: dict[str, str] = {
    "lite":      "Starter Lite ($2)",
    "monthly":   "Monthly Reset ($25/mo)",
    "starter":   "Starter Pack ($290)",
    "pro":       "Pro Access ($1,900)",
    "oem":       "OEM License ($7,500)",
    "licensing": "Institutional License ($15,000)",
}

# Env var names that hold full Stripe buy URLs (https://buy.stripe.com/...)
_TIER_BUY_LINK_ENV: dict[str, str] = {
    "lite":      "STRIPE_BUY_LINK_LITE",
    "monthly":   "STRIPE_BUY_LINK_MONTHLY",
    "starter":   "STRIPE_BUY_LINK_STARTER",
    "pro":       "STRIPE_BUY_LINK_PRO",
    "oem":       "STRIPE_BUY_LINK_OEM",
    "licensing": "STRIPE_BUY_LINK_LICENSING",
}


def get_tier_base_url(tier: str) -> str | None:
    """Return the raw Stripe buy URL for a tier, or None if not configured."""
    env_key = _TIER_BUY_LINK_ENV.get(tier)
    if not env_key:
        return None
    url = os.environ.get(env_key, "").strip()
    return url if url else None


def build_buy_url(tier: str, telegram_user_id: int) -> str | None:
    """
    Return the full Stripe payment URL with client_reference_id embedded.
    Returns None if the tier's payment link is not configured.

    Pattern: {base_url}?client_reference_id={telegram_user_id}
    """
    base = get_tier_base_url(tier)
    if not base:
        return None
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}client_reference_id={telegram_user_id}"


# ---------------------------------------------------------------------------
# Domain → entry mapping
# ---------------------------------------------------------------------------

# Canonical entry slugs for each Sentinel Fortune domain.
# Slug is the identifier embedded in deep-link payloads: entry_{slug}_{tier}
DOMAIN_ENTRY_MAP: dict[str, dict] = {
    "sentinelfortune.com": {
        "slug":         "sentinelfortune",
        "default_tier": "starter",
        "label":        "Sentinel Fortune",
    },
    "lumenschoolacademy.online": {
        "slug":         "lumenschoolacademy",
        "default_tier": "starter",
        "label":        "Lumen School Academy",
    },
    "codexworldtv.homes": {
        "slug":         "codexworldtv",
        "default_tier": "pro",
        "label":        "Codex World TV",
    },
    "lumengame.vip": {
        "slug":         "lumengame",
        "default_tier": "pro",
        "label":        "Lumen Game",
    },
    "vibraflowmedia.casa": {
        "slug":         "vibraflowmedia",
        "default_tier": "oem",
        "label":        "VibraFlow Media",
    },
    "sentinelfortunerecords.one": {
        "slug":         "records",
        "default_tier": "starter",
        "label":        "Sentinel Fortune Records",
    },
    "oglegacystore.homes": {
        "slug":         "oglegacystore",
        "default_tier": "starter",
        "label":        "OG Legacy Store",
    },
    "lightnodesystems.my": {
        "slug":         "lightnodesystems",
        "default_tier": "licensing",
        "label":        "LightNode Systems",
    },
}

# Reverse map: domain slug → domain config
_SLUG_TO_DOMAIN: dict[str, dict] = {
    cfg["slug"]: {**cfg, "domain": domain}
    for domain, cfg in DOMAIN_ENTRY_MAP.items()
}

# Tier slugs present in tier names (used to anchor regex)
_TIER_PATTERN = "|".join(sorted(VALID_TIERS, key=len, reverse=True))
_ENTRY_RE = re.compile(
    rf"^entry_(.+?)_({_TIER_PATTERN})$"
)


def parse_entry_payload(payload: str) -> dict | None:
    """
    Parse a Telegram deep-link start payload.

    Expected format: entry_{domain_slug}_{tier}
    Examples:
      entry_sentinelfortune_starter  → {slug: sentinelfortune, tier: starter, ...}
      entry_lightnodesystems_licensing

    Returns None for unrecognised payloads.
    """
    m = _ENTRY_RE.match((payload or "").strip().lower())
    if not m:
        return None
    slug, tier = m.group(1), m.group(2)
    domain_cfg = _SLUG_TO_DOMAIN.get(slug)
    if not domain_cfg:
        logger.warning("sales_flow: unknown domain slug=%s in payload=%s", slug, payload)
        return None
    return {
        "slug":   slug,
        "tier":   tier,
        "domain": domain_cfg.get("domain", ""),
        "label":  domain_cfg.get("label", slug),
    }


def get_default_tier_for_slug(slug: str) -> str:
    """Return the default tier for a domain slug, or 'starter' if unknown."""
    cfg = _SLUG_TO_DOMAIN.get(slug)
    return cfg["default_tier"] if cfg else "starter"


# ---------------------------------------------------------------------------
# R2 logging helpers
# ---------------------------------------------------------------------------

def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


async def log_lead(user_id: int, source_slug: str, tier: str) -> None:
    """Log a site-to-bot entry intent."""
    ts = _ts()
    key = f"originus/sales/leads/{user_id}_{ts}.json"
    await put_json(key, {
        "user_id":    user_id,
        "source":     source_slug,
        "tier":       tier,
        "event":      "site_entry",
        "logged_at":  datetime.now(timezone.utc).isoformat(),
    })
    logger.info("sales_flow: lead logged uid=%s source=%s tier=%s", user_id, source_slug, tier)


async def log_click(user_id: int, tier: str) -> None:
    """Log a /buy button click (purchase intent)."""
    ts = _ts()
    key = f"originus/sales/clicks/{user_id}_{ts}.json"
    await put_json(key, {
        "user_id":   user_id,
        "tier":      tier,
        "event":     "clicked_buy",
        "logged_at": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("sales_flow: click logged uid=%s tier=%s", user_id, tier)
    await _set_followup_state(user_id, "reminder_1_pending", tier=tier)


async def cancel_followup(user_id: int, tier: str = "") -> None:
    """
    Cancel all pending reminders for a user (call immediately after confirmed payment).
    Writes a terminal 'paid' state so the scheduler knows to skip this user.
    """
    key = f"originus/sales/followup/{user_id}.json"
    existing = await get_json(key) or {}
    await put_json(key, {
        **existing,
        "user_id":    user_id,
        "state":      "paid",
        "tier":       tier or existing.get("tier", ""),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("sales_flow: followup cancelled (paid) uid=%s tier=%s", user_id, tier)


async def _set_followup_state(user_id: int, state: str, tier: str = "") -> None:
    """Write a retargeting state record. Valid states:
    reminder_1_pending | reminder_2_pending | reminder_final_pending | paid | cancelled
    """
    key = f"originus/sales/followup/{user_id}.json"
    existing = await get_json(key) or {}
    # Do not overwrite a 'paid' state
    if existing.get("state") == "paid":
        return
    await put_json(key, {
        **existing,
        "user_id":    user_id,
        "state":      state,
        "tier":       tier or existing.get("tier", ""),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })


# ---------------------------------------------------------------------------
# Entry message copy
# ---------------------------------------------------------------------------

ENTRY_MESSAGE_TEMPLATE = (
    "<b>Welcome from {label}.</b>\n\n"
    "You've been directed here through the Sentinel Fortune network.\n\n"
    "The <b>{tier_label}</b> tier is recommended for your access level.\n\n"
    "Press the button below to review your options and complete purchase."
)


def format_entry_message(label: str, tier: str) -> str:
    return ENTRY_MESSAGE_TEMPLATE.format(
        label=label,
        tier_label=TIER_LABELS.get(tier, tier.title()),
    )
