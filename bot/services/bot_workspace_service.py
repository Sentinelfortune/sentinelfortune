"""
Bot Workspace Service — orchestration layer for the Sentinel Fortune bot workspace.

Provides:
- Domain context resolution against BOT_DOMAIN_ROUTER.v1.json
- Structured job creation for app / bot / music / animation / asset generation
- Job reading and status queries
- Request class routing (maps free-text to a request category)

All R2 writes go under originus/bot/ and are non-blocking (errors logged, never raised).
R2 keys:
    originus/bot/_canon/BOT_SYSTEM_INDEX.v1.json
    originus/bot/_canon/BOT_DOMAIN_ROUTER.v1.json
    originus/bot/apps/<job_id>.json
    originus/bot/bots/<job_id>.json
    originus/bot/music/<job_id>.json
    originus/bot/animation/<job_id>.json
    originus/bot/assets/<job_id>.json
    originus/bot/delivery/<job_id>.json
    originus/bot/logs/BOT_JOB_LOG.v1.json
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from bot.services import r2_service

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# R2 key constants
# ---------------------------------------------------------------------------

_SYSTEM_INDEX_KEY        = "originus/bot/_canon/BOT_SYSTEM_INDEX.v1.json"
_DOMAIN_ROUTER_KEY       = "originus/bot/_canon/BOT_DOMAIN_ROUTER.v1.json"
_JOB_LOG_KEY             = "originus/bot/logs/BOT_JOB_LOG.v1.json"
# Canonical domain registry — pre-existing in R2 with business/role/type data
# 8 entries: sentinel_fortune_holding, sentinelfortune_records, lumengame,
#             vibraflow_media, codexworldtv, og_legacy_store,
#             lumenschool_academy, lightnode_systems
_DOMAIN_ENTRY_KEY_TPLT   = "originus/domains/{domain_id}/DOMAIN_ENTRY.v1.json"

_JOB_PREFIXES: dict[str, str] = {
    "app":       "originus/bot/apps/",
    "bot":       "originus/bot/bots/",
    "music":     "originus/bot/music/",
    "animation": "originus/bot/animation/",
    "asset":     "originus/bot/assets/",
    "delivery":  "originus/bot/delivery/",
    "session":   "originus/bot/sessions/",
}

# ---------------------------------------------------------------------------
# Request class keyword classifier
# Maps free-text intent to a structured request category
# ---------------------------------------------------------------------------

_CLASS_MAP: dict[str, frozenset] = {
    "app":       frozenset({"app", "application", "webapp", "tool", "dashboard", "platform"}),
    "bot":       frozenset({"bot", "chatbot", "telegram bot", "agent", "subbot", "assistant"}),
    "music":     frozenset({"music", "song", "track", "album", "lyrics", "audio", "beat", "sound"}),
    "animation": frozenset({"animation", "cartoon", "animated", "episode", "scene", "storyboard",
                            "character", "motion", "render"}),
    "asset":     frozenset({"asset", "copy", "content", "text", "document", "seed", "brief",
                            "script", "ebook", "story", "teach"}),
}


def classify_request(text: str) -> str:
    """
    Map free-text to a request category: app | bot | music | animation | asset | general.
    Returns 'general' if no match.
    """
    lower = text.lower()
    words = set(lower.split())
    for category, keywords in _CLASS_MAP.items():
        if words & keywords or any(k in lower for k in keywords if " " in k):
            return category
    return "general"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _new_job_id(prefix: str = "job") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


# ---------------------------------------------------------------------------
# Domain context resolution
# ---------------------------------------------------------------------------

async def resolve_domain_context(domain: str) -> Optional[dict]:
    """
    Resolve a domain name to its full context dict from BOT_DOMAIN_ROUTER.v1.json.
    Returns None if the domain is not found or R2 is unavailable.
    """
    try:
        router = await r2_service.get_json(_DOMAIN_ROUTER_KEY)
        if not router:
            return _INLINE_DOMAIN_FALLBACK.get(domain.lower())
        domains = router.get("domains", [])
        for d in domains:
            if d.get("domain", "").lower() == domain.lower():
                return d
        return None
    except Exception as exc:
        logger.debug("Domain router read failed: %s", exc)
        return _INLINE_DOMAIN_FALLBACK.get(domain.lower())


async def list_domains() -> list:
    """Return all domain entries from BOT_DOMAIN_ROUTER.v1.json."""
    try:
        router = await r2_service.get_json(_DOMAIN_ROUTER_KEY)
        if router:
            return router.get("domains", [])
    except Exception as exc:
        logger.debug("Domain router list failed: %s", exc)
    return list(_INLINE_DOMAIN_FALLBACK.values())


async def get_domain_entry(domain_id: str) -> Optional[dict]:
    """
    Read the canonical DOMAIN_ENTRY from originus/domains/<domain_id>/DOMAIN_ENTRY.v1.json.
    Returns the business-role/type/engagement record, or None if not found.

    domain_id examples: sentinel_fortune_holding, sentinelfortune_records,
                        lumengame, vibraflow_media, codexworldtv, og_legacy_store,
                        lumenschool_academy, lightnode_systems
    Note: lumengame and lightnode_systems currently have JSONDecodeErrors in R2.
    """
    key = _DOMAIN_ENTRY_KEY_TPLT.format(domain_id=domain_id)
    try:
        return await r2_service.get_json(key)
    except Exception as exc:
        logger.debug("get_domain_entry(%s) failed: %s", domain_id, exc)
        return None


# ---------------------------------------------------------------------------
# Inline fallback domain map (mirrors BOT_DOMAIN_ROUTER.v1.json)
# ---------------------------------------------------------------------------

_INLINE_DOMAIN_FALLBACK: dict[str, dict] = {
    "sentinelfortune.com": {
        "domain": "sentinelfortune.com",
        "role": "headquarters",
        "purpose": "Primary IP holding, licensing, and institutional gateway",
        "bot_functions": ["ip_inquiry", "licensing", "governance", "deals", "catalog"],
        "routing_target": "sfl-access-gateway",
        "r2_output_prefix": "originus/bot/outputs/sentinelfortune/",
        "contact_desk": "contact@sentinelfortune.com",
    },
    "sentinelfortunerecords.one": {
        "domain": "sentinelfortunerecords.one",
        "role": "music_label",
        "purpose": "Music label, distribution, and sonic world assets",
        "bot_functions": ["music_job", "artist_inquiry", "audio_generation", "release_tracking"],
        "routing_target": "originus-factory",
        "r2_output_prefix": "originus/bot/music/",
        "contact_desk": "records@sentinelfortune.com",
    },
    "lumengame.vip": {
        "domain": "lumengame.vip",
        "role": "game_ip",
        "purpose": "Game IP, Lumen universe, interactive world mechanics",
        "bot_functions": ["universe_query", "game_inquiry", "world_request", "ip_inquiry"],
        "routing_target": "originus-retrieval",
        "r2_output_prefix": "originus/bot/outputs/lumengame/",
        "contact_desk": "games@sentinelfortune.com",
    },
    "vibraflowmedia.casa": {
        "domain": "vibraflowmedia.casa",
        "role": "media_production",
        "purpose": "Media production, animation, storytelling, and IP adaptation",
        "bot_functions": ["animation_job", "media_inquiry", "storyboard_request", "script_request"],
        "routing_target": "originus-factory",
        "r2_output_prefix": "originus/bot/animation/",
        "contact_desk": "media@sentinelfortune.com",
    },
    "codexworldtv.homes": {
        "domain": "codexworldtv.homes",
        "role": "content_streaming",
        "purpose": "World-building content, streaming IP, and franchise distribution",
        "bot_functions": ["universe_query", "content_inquiry", "franchise_request"],
        "routing_target": "originus-retrieval",
        "r2_output_prefix": "originus/bot/outputs/codexworldtv/",
        "contact_desk": "content@sentinelfortune.com",
    },
    "oglegacystore.homes": {
        "domain": "oglegacystore.homes",
        "role": "legacy_store",
        "purpose": "Legacy store, OEM product distribution, and structured catalog",
        "bot_functions": ["catalog_inquiry", "oem_inquiry", "product_request"],
        "routing_target": "sfl-access-gateway",
        "r2_output_prefix": "originus/bot/outputs/oglegacystore/",
        "contact_desk": "oem@sentinelfortune.com",
    },
    "lumenschoolacademy.online": {
        "domain": "lumenschoolacademy.online",
        "role": "education",
        "purpose": "Education, courses, SOP frameworks, and knowledge delivery",
        "bot_functions": ["course_inquiry", "sop_request", "teach_generation", "seed_generation"],
        "routing_target": "originus-factory",
        "r2_output_prefix": "originus/bot/outputs/lumenschool/",
        "contact_desk": "education@sentinelfortune.com",
    },
    "lightnodesystems.my": {
        "domain": "lightnodesystems.my",
        "role": "platform_infrastructure",
        "purpose": "Modular platforms, AI-assisted systems, and infrastructure licensing",
        "bot_functions": ["app_job", "platform_inquiry", "system_request", "licensing"],
        "routing_target": "sfl-access-gateway",
        "r2_output_prefix": "originus/bot/apps/",
        "contact_desk": "systems@sentinelfortune.com",
    },
}


# ---------------------------------------------------------------------------
# Job creation — writes structured job JSON to R2
# ---------------------------------------------------------------------------

async def create_job(category: str, data: dict) -> Optional[dict]:
    """
    Create and persist a structured job to R2.

    Args:
        category: one of app | bot | music | animation | asset | delivery | session
        data:     caller-supplied job fields (merged into schema)

    Returns:
        Complete job dict with job_id, status, created_at, or None on failure.
    """
    prefix = _JOB_PREFIXES.get(category)
    if not prefix:
        logger.warning("create_job: unknown category=%s", category)
        return None

    job_id = _new_job_id(category[:3])
    job = {
        "job_id": job_id,
        "category": category,
        "status": "pending",
        "created_at": _now(),
        "updated_at": _now(),
        **data,
    }

    key = f"{prefix}{job_id}.json"
    ok = await r2_service.put_json(key, job)
    if ok:
        logger.info("Job created: category=%s job_id=%s key=%s", category, job_id, key)
        await _log_job_event("job_created", job_id, category, data.get("domain"))
    else:
        logger.warning("Job R2 write failed: category=%s job_id=%s", category, job_id)
    return job


async def get_job(category: str, job_id: str) -> Optional[dict]:
    """Read a job from R2 by category and job_id."""
    prefix = _JOB_PREFIXES.get(category)
    if not prefix:
        return None
    key = f"{prefix}{job_id}.json"
    return await r2_service.get_json(key)


# ---------------------------------------------------------------------------
# Typed job factories — thin wrappers over create_job
# ---------------------------------------------------------------------------

async def create_app_job(
    domain: str,
    app_type: str,
    stack: str,
    objective: str,
    user_id: int = 0,
    username: str = "",
) -> Optional[dict]:
    return await create_job("app", {
        "domain": domain,
        "app_type": app_type,
        "stack": stack,
        "objective": objective,
        "user_id": user_id,
        "username": username,
        "outputs_path": f"originus/bot/apps/outputs/",
    })


async def create_bot_job(
    bot_name: str,
    role: str,
    business_domain: str,
    commands: list,
    user_id: int = 0,
    username: str = "",
) -> Optional[dict]:
    return await create_job("bot", {
        "bot_name": bot_name,
        "role": role,
        "business_domain": business_domain,
        "commands": commands,
        "permissions": "standard",
        "deployment_target": "telegram",
        "user_id": user_id,
        "username": username,
        "outputs_path": "originus/bot/bots/outputs/",
    })


async def create_music_job(
    project_name: str,
    genre: str,
    domain: str = "sentinelfortunerecords.one",
    user_id: int = 0,
    username: str = "",
) -> Optional[dict]:
    return await create_job("music", {
        "project_name": project_name,
        "genre": genre,
        "domain": domain,
        "lyrics_status": "pending",
        "audio_status": "pending",
        "cover_status": "pending",
        "release_status": "pending",
        "user_id": user_id,
        "username": username,
        "outputs_path": "originus/bot/music/outputs/",
    })


async def create_animation_job(
    universe: str,
    project_name: str,
    domain: str = "vibraflowmedia.casa",
    user_id: int = 0,
    username: str = "",
) -> Optional[dict]:
    return await create_job("animation", {
        "universe": universe,
        "project_name": project_name,
        "domain": domain,
        "script_status": "pending",
        "storyboard_status": "pending",
        "voice_status": "pending",
        "render_status": "pending",
        "user_id": user_id,
        "username": username,
        "outputs_path": "originus/bot/animation/outputs/",
    })


async def create_asset_job(
    asset_type: str,
    source_canon: str,
    target_domain: str,
    user_id: int = 0,
    username: str = "",
) -> Optional[dict]:
    return await create_job("asset", {
        "asset_type": asset_type,
        "source_canon": source_canon,
        "target_domain": target_domain,
        "user_id": user_id,
        "username": username,
        "delivery_path": f"originus/bot/assets/outputs/",
    })


# ---------------------------------------------------------------------------
# Job event log
# ---------------------------------------------------------------------------

async def _log_job_event(
    event_type: str,
    job_id: str,
    category: str,
    domain: Optional[str] = None,
) -> None:
    try:
        await r2_service.append_log_entry(_JOB_LOG_KEY, {
            "timestamp": _now(),
            "event_type": event_type,
            "job_id": job_id,
            "category": category,
            "domain": domain or "unspecified",
        })
    except Exception as exc:
        logger.debug("Job log write failed: %s", exc)


# ---------------------------------------------------------------------------
# System index reader
# ---------------------------------------------------------------------------

async def get_system_index() -> Optional[dict]:
    """Read BOT_SYSTEM_INDEX.v1.json. Returns None if unavailable."""
    return await r2_service.get_json(_SYSTEM_INDEX_KEY)
