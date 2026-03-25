"""
sfl-access-gateway integration layer for sentinelfortune_bot.

All free-text Telegram messages are routed through the Cloudflare Worker
(sfl-access-gateway) first. If the worker is unreachable, times out, or
returns an error, the caller falls back to the local OpenAI service.

Payload schema (bot → worker):
{
    "source":        "sentinelfortune_bot",
    "user_id":       int,
    "username":      str | null,
    "chat_id":       int,
    "text":          str,
    "intent":        str,       # see INTENT_* constants below
    "access_level":  str,       # "public" | "member" | "architect"
    "timestamp":     str        # ISO-8601 UTC
}

Response schema (worker → bot):
{
    "status":   "ok" | "error",
    "response": str,            # Telegram-ready text (shown to user)
    "intent":   str,            # echoed or corrected by worker
    "route":    str,            # downstream the worker used
    "meta":     dict            # optional; never shown to user
}

Planned downstream routing (configured in the worker, not the bot):
    originus-retrieval  ← for structured R2 reads        (intent: query.*)
    originus-factory    ← for generation / assembly       (intent: generate.*)
    originus-saas-gateway ← for public catalog/hub replies (intent: query.catalog)
    sfl-ops             ← for logs / validation / admin   (internal only)

Canon key paths are NEVER included in the outbound payload.
Payment flows are not affected by this layer.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from bot.config import BASE_WORKER_URL, BASE_WORKER_INTAKE_PATH

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Intent constants
# ---------------------------------------------------------------------------

INTENT_CATALOG = "query.catalog"
INTENT_LICENSING = "query.licensing"
INTENT_OEM = "query.oem"
INTENT_GOVERNANCE = "query.governance"
INTENT_DELIVERY_STATUS = "query.delivery_status"
INTENT_CONTACT = "query.contact"
INTENT_DOMAIN = "query.domain"
INTENT_IP = "query.ip"
INTENT_DEALS = "query.deals"
INTENT_UNIVERSES = "query.universes"
INTENT_WORLDS = "query.worlds"
INTENT_GENERATE_TEXT = "generate.text"
INTENT_SESSION = "session.request"
INTENT_GENERAL = "query.general"

# ---------------------------------------------------------------------------
# Worker configuration
# ---------------------------------------------------------------------------

_WORKER_ENDPOINT = (
    BASE_WORKER_URL.rstrip("/") + "/" + BASE_WORKER_INTAKE_PATH.lstrip("/")
    if BASE_WORKER_URL else ""
)
_TIMEOUT_SECONDS = 8.0

# ---------------------------------------------------------------------------
# Intent detection (local keyword classifier — zero latency, no API call)
# ---------------------------------------------------------------------------

_CATALOG_KWORDS = {"offer", "price", "pricing", "cost", "buy", "purchase", "tier",
                   "plan", "package", "catalog", "product"}
_LICENSE_KWORDS = {"license", "licenses", "licensing", "rights", "royalty", "royalties",
                   "patent", "trademark", "intellectual property"}
_OEM_KWORDS = {"oem", "manufacturing", "factory", "produce", "supplier",
               "white label", "whitelabel", "supply chain"}
_GOV_KWORDS = {"governance", "compliance", "legal", "nda", "audit", "regulation",
               "approval", "policy", "jurisdiction", "privacy", "gdpr"}
_DELIVERY_KWORDS = {"delivery", "order", "status", "pending", "confirm", "confirmation",
                    "receipt", "sent", "received", "when"}
_CONTACT_KWORDS = {"contact", "email", "reach", "team", "desk", "inquiry", "enquiry"}
_DOMAIN_KWORDS = {"domain", "brand", "url", "website", "site"}
_IP_KWORDS = {"ip", "intellectual", "property", "portfolio", "holding", "holdings",
              "asset", "assets"}
_DEALS_KWORDS = {"deal", "deals", "partnership", "partnerships", "joint", "venture",
                 "agreement", "structure", "acquisition"}
_UNIVERSES_KWORDS = {"universe", "universes", "multiverse", "ratou", "aeon", "codex",
                     "solfyr", "world", "worlds", "franchise", "narrative", "canon"}
_WORLDS_KWORDS = {"worlds", "world", "what remains", "silence breaks", "weight of truth",
                  "when the", "what remains"}
_GENERATE_KWORDS = {"generate", "write", "create", "draft", "compose", "build",
                    "make me", "produce text", "content", "script", "story", "ebook"}
_SESSION_KWORDS = {"session", "strategic session", "consultation", "book",
                   "schedule", "appointment", "advisor", "advise"}

import re as _re

_PUNCT_RE = _re.compile(r"[^\w\s]")


def detect_intent(text: str) -> str:
    """Classify user input into one of the defined intent strings."""
    lower = text.lower()
    clean = _PUNCT_RE.sub(" ", lower)
    words = set(clean.split())

    def _hits(kwords: set) -> bool:
        return bool(words & kwords) or any(k in lower for k in kwords if " " in k)

    if _hits(_SESSION_KWORDS):
        return INTENT_SESSION
    if _hits(_GENERATE_KWORDS):
        return INTENT_GENERATE_TEXT
    if _hits(_OEM_KWORDS):
        return INTENT_OEM
    if _hits(_DEALS_KWORDS):
        return INTENT_DEALS
    if _hits(_WORLDS_KWORDS):
        return INTENT_WORLDS
    if _hits(_UNIVERSES_KWORDS):
        return INTENT_UNIVERSES
    if _hits(_IP_KWORDS):
        return INTENT_IP
    if _hits(_LICENSE_KWORDS):
        return INTENT_LICENSING
    if _hits(_GOV_KWORDS):
        return INTENT_GOVERNANCE
    if _hits(_DELIVERY_KWORDS):
        return INTENT_DELIVERY_STATUS
    if _hits(_CONTACT_KWORDS):
        return INTENT_CONTACT
    if _hits(_DOMAIN_KWORDS):
        return INTENT_DOMAIN
    if _hits(_CATALOG_KWORDS):
        return INTENT_CATALOG
    return INTENT_GENERAL


# ---------------------------------------------------------------------------
# Access level detection (R2 grant ledger, async)
# ---------------------------------------------------------------------------

_TIER_ORDER = ["architect", "engine", "access", "public"]

# Map raw grant slugs → retrieval-compatible access level
_TIER_TO_ACCESS: dict[str, str] = {
    "architect": "architect",
    "engine":    "member",
    "access":    "member",
    "public":    "public",
}


async def detect_access_level(user_id: int) -> str:
    """
    Return the normalized access level for the user.
    Checks R2 grant ledger; always returns one of: 'public' | 'member' | 'architect'.
    """
    try:
        from bot.services.canon_service import has_active_grant as _r2_has_grant
        for tier in ("architect", "engine", "access"):
            if await _r2_has_grant(user_id, tier):
                return _TIER_TO_ACCESS[tier]
    except Exception as exc:
        logger.debug("Access level detection error (defaulting to public): %s", exc)
    return "public"


# ---------------------------------------------------------------------------
# Payload construction
# ---------------------------------------------------------------------------

def _build_payload(
    user_id: int,
    username: Optional[str],
    chat_id: int,
    text: str,
    intent: str,
    access_level: str,
) -> dict:
    return {
        "source": "sentinelfortune_bot",
        "user_id": user_id,
        "username": username or None,
        "chat_id": chat_id,
        "text": text,
        "intent": intent,
        "access_level": access_level,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


# ---------------------------------------------------------------------------
# Worker call
# ---------------------------------------------------------------------------

async def _call_worker(payload: dict) -> Optional[dict]:
    """
    POST structured payload to sfl-access-gateway.
    Returns parsed JSON dict on success, None on any failure.
    """
    if not _WORKER_ENDPOINT:
        logger.debug("BASE_WORKER_URL not configured — skipping worker call")
        return None

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                _WORKER_ENDPOINT,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Source": "sentinelfortune_bot",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info(
                "Worker response: status=%s intent=%s route=%s",
                data.get("status"),
                data.get("intent", "—"),
                data.get("route", "—"),
            )
            return data
    except httpx.TimeoutException:
        logger.warning("Worker timed out after %.1fs — using local fallback", _TIMEOUT_SECONDS)
    except httpx.HTTPStatusError as exc:
        logger.warning("Worker HTTP error %s — using local fallback", exc.response.status_code)
    except Exception as exc:
        logger.warning("Worker call failed (%s: %s) — using local fallback",
                       type(exc).__name__, exc)
    return None


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------

def _parse_worker_response(data: Optional[dict]) -> Optional[str]:
    """
    Extract Telegram-ready text from the worker response dict.
    Returns None if the response is unusable (triggers local fallback).
    """
    if not data:
        return None
    if data.get("status") != "ok":
        logger.debug("Worker returned non-ok status: %s", data.get("status"))
        return None
    text = (data.get("response") or "").strip()
    if not text:
        logger.debug("Worker returned empty response body")
        return None
    return text


# ---------------------------------------------------------------------------
# Main entry point — called from freetext handler
# ---------------------------------------------------------------------------

async def route_through_gateway(
    user_id: int,
    username: Optional[str],
    chat_id: int,
    text: str,
) -> Optional[str]:
    """
    Run the full gateway pipeline for a free-text message.

    Returns:
        str  — worker-provided Telegram-ready response (use this directly)
        None — worker unavailable or unusable; caller should fall back to OpenAI

    Flow:
        1. detect_intent()      — local, instant
        2. detect_access_level()— async R2 grant check (defaults to 'public')
        3. _build_payload()     — assemble structured JSON
        4. _call_worker()       — POST to sfl-access-gateway with timeout guard
        5. _parse_worker_response() — extract clean text or signal fallback
    """
    intent = detect_intent(text)
    access_level = await detect_access_level(user_id)

    logger.info(
        "Gateway routing: user_id=%s intent=%s access_level=%s",
        user_id, intent, access_level,
    )

    payload = _build_payload(user_id, username, chat_id, text, intent, access_level)
    data = await _call_worker(payload)
    return _parse_worker_response(data)
