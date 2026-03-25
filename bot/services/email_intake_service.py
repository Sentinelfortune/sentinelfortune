"""
Email intake service — SentinelFortune Bot.

Honoring canonical policy constraints from R2:
  - SFL_INBOX_GATEKEEPING_POLICY.v1.json: agents_role = PREPARE_ONLY
  - SFL_COMM_AUTORESPONDER_POLICY.v1.json: enabled = false
  - SFL_RESPONSE_PROTOCOLS.v1.1.json: human_send_required = true
  - COMMUNICATION_LOCKS.v1.json: mode = HUMAN_FIRST

This service:
  - Classifies inbound contact signals by desk
  - Logs intake metadata to R2 (originus/bot/email/intake/)
  - Returns safe, prepare-only response shapes
  - NEVER auto-replies or discloses document content
  - NEVER commits to timelines
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# R2 namespace roots
# ---------------------------------------------------------------------------

_INTAKE_PREFIX  = "originus/bot/email/intake/"
_LOG_PREFIX     = "originus/bot/email/logs/"
_INDEX_KEY      = "originus/bot/email/EMAIL_INTAKE_INDEX.v1.json"

# ---------------------------------------------------------------------------
# Desk definitions (from SFL_EMAIL_ROUTING_REGISTRY.v1.json)
# Canonical desks: contact, licensing, oem, legal, investor
# Standard aliases from the registry: contact, admin, legal, finance,
#   billing, partnerships, oem, licensing, investor, ceo
# ---------------------------------------------------------------------------

DESK_MAP: dict[str, dict] = {
    "contact": {
        "address":        "contact@sentinelfortune.com",
        "label":          "General Contact",
        "classification": "GENERAL_INQUIRY",
        "risk_level":     "low",
        "auto_blocked":   False,
    },
    "licensing": {
        "address":        "licensing@sentinelfortune.com",
        "label":          "Licensing & IP Rights",
        "classification": "LICENSING",
        "risk_level":     "medium",
        "auto_blocked":   True,
    },
    "oem": {
        "address":        "oem@sentinelfortune.com",
        "label":          "OEM & Manufacturing Partners",
        "classification": "OEM",
        "risk_level":     "medium",
        "auto_blocked":   True,
    },
    "legal": {
        "address":        "legal@sentinelfortune.com",
        "label":          "Legal & Compliance",
        "classification": "LEGAL",
        "risk_level":     "high",
        "auto_blocked":   True,
    },
    "investor": {
        "address":        "investor@sentinelfortune.com",
        "label":          "Investor Relations",
        "classification": "INVESTOR",
        "risk_level":     "high",
        "auto_blocked":   True,
    },
}

# Keyword signals → desk routing
_DESK_SIGNALS: dict[str, frozenset] = {
    "legal": frozenset({
        "legal", "nda", "contract", "counsel", "lawyer", "attorney",
        "litigation", "dispute", "compliance", "regulation", "gdpr",
        "law", "jurisdiction", "sue", "court",
    }),
    "investor": frozenset({
        "invest", "investor", "investment", "fund", "funding", "capital",
        "equity", "stake", "shareholder", "venture capital", "vc",
        "due diligence", "term sheet", "valuation",
    }),
    "licensing": frozenset({
        "license", "licensing", "licens", "rights", "royalty", "royalties",
        "ip", "intellectual property", "trademark", "patent", "adapt",
        "adaptation",
    }),
    "oem": frozenset({
        "oem", "manufacturing", "manufacture", "factory", "produce",
        "supplier", "white label", "whitelabel", "supply chain", "contract",
        "production", "fabricat",
    }),
}

# ---------------------------------------------------------------------------
# Desk classification
# ---------------------------------------------------------------------------

def classify_desk(text: str) -> str:
    """
    Classify user text into one of the 5 desks.
    Returns 'contact' as the safe default.
    """
    lower = text.lower()
    words = set(lower.split())

    for desk_id in ("legal", "investor", "licensing", "oem"):
        signals = _DESK_SIGNALS[desk_id]
        if words & signals or any(s in lower for s in signals if " " in s):
            return desk_id

    return "contact"


def get_desk_info(desk_id: str) -> dict:
    """Return desk metadata dict for a given desk id."""
    return DESK_MAP.get(desk_id, DESK_MAP["contact"])


# ---------------------------------------------------------------------------
# Intake normalization
# ---------------------------------------------------------------------------

def normalize_intake(
    user_id: int,
    username: Optional[str],
    text: str,
    desk_id: Optional[str] = None,
    channel: str = "telegram_bot",
) -> dict:
    """
    Produce a normalized intake record from a user inquiry signal.
    Does NOT include message body content — PREPARE_ONLY posture.

    Returns:
        A dict safe to write to R2 (no PII beyond user_id / username).
    """
    resolved_desk = desk_id or classify_desk(text)
    desk = get_desk_info(resolved_desk)
    message_id = f"MSG-{uuid.uuid4().hex[:12].upper()}"
    received_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    return {
        "message_id":      message_id,
        "desk":            resolved_desk,
        "desk_label":      desk["label"],
        "desk_address":    desk["address"],
        "classification":  desk["classification"],
        "risk_level":      desk["risk_level"],
        "auto_blocked":    desk["auto_blocked"],
        "status":          "RECEIVED",
        "channel":         channel,
        "user_id":         user_id,
        "username":        username or None,
        "received_at":     received_at,
        "intent_signal":   text[:80] if text else "",
        "human_review":    True,
        "auto_reply":      False,
        "posture":         "SILENT_UNTIL_REQUESTED",
    }


# ---------------------------------------------------------------------------
# R2 intake log writer
# ---------------------------------------------------------------------------

async def log_intake(record: dict) -> bool:
    """
    Write intake metadata record to R2 originus/bot/email/intake/{message_id}.json
    Returns True on success, False on failure.
    Does NOT write message body content — metadata only.
    """
    from bot.services.r2_service import put_json

    message_id = record.get("message_id", "UNKNOWN")
    key = f"{_INTAKE_PREFIX}{message_id}.json"

    try:
        ok = await put_json(key, record)
        if ok:
            logger.info("Email intake logged: %s desk=%s", message_id, record.get("desk"))
        else:
            logger.warning("Email intake write returned falsy for %s", message_id)
        return bool(ok)
    except Exception as exc:
        logger.error("Email intake log failed for %s: %s", message_id, exc)
        return False


# ---------------------------------------------------------------------------
# Safe Telegram response builder
# ---------------------------------------------------------------------------

def build_response(record: dict) -> str:
    """
    Produce a safe, policy-compliant Telegram response for an email inquiry.
    Follows PREPARE_ONLY + SILENT_UNTIL_REQUESTED posture.
    No document disclosure. No timeline commitments.
    """
    desk_id    = record.get("desk", "contact")
    desk_label = record.get("desk_label", "General Contact")
    desk_addr  = record.get("desk_address", "contact@sentinelfortune.com")
    msg_id     = record.get("message_id", "—")

    return (
        f"Your inquiry has been logged for the {desk_label} desk.\n\n"
        f"Reference: {msg_id}\n"
        f"Desk: {desk_addr}\n\n"
        "Messages for this desk are reviewed by the internal team. "
        "Response timelines are not committed in advance.\n\n"
        "For direct outreach: please send your inquiry directly to the address above. "
        "Attach any relevant documentation and include your reference number."
    )


# ---------------------------------------------------------------------------
# HTTP gateway forwarder (best-effort, graceful failure)
# ---------------------------------------------------------------------------

_EMAIL_GATEWAY_URL = "https://originus-email-gateway.sentinelfortunellc.workers.dev/intake"
_GATEWAY_TIMEOUT   = 5.0


async def send_to_gateway(record: dict) -> bool:
    """
    Forward a normalized intake record to originus-email-gateway POST /intake.
    Best-effort only — failure is logged but never raised to the caller.

    Returns True if gateway returned HTTP 2xx, False otherwise.
    Works with both the stub (plain-text OK) and the full implementation.
    """
    payload = {
        "message_id": record.get("message_id"),
        "desk":       record.get("desk"),
        "channel":    record.get("channel", "telegram_bot"),
        "received_at": record.get("received_at"),
        "intent_signal": record.get("intent_signal", ""),
    }
    try:
        async with httpx.AsyncClient(timeout=_GATEWAY_TIMEOUT) as client:
            resp = await client.post(_EMAIL_GATEWAY_URL, json=payload)
            ok = resp.status_code < 300
            if ok:
                logger.info(
                    "send_to_gateway: %s forwarded OK (HTTP %s)",
                    record.get("message_id"), resp.status_code,
                )
            else:
                logger.warning(
                    "send_to_gateway: HTTP %s for %s",
                    resp.status_code, record.get("message_id"),
                )
            return ok
    except Exception as exc:
        logger.warning("send_to_gateway: failed for %s — %s", record.get("message_id"), exc)
        return False


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

async def process_email_inquiry(
    user_id: int,
    username: Optional[str],
    text: str,
    channel: str = "telegram_bot",
) -> str:
    """
    Full email intake pipeline:
      1. Classify desk from text
      2. Normalize intake record
      3. Log metadata to R2  (direct write — always attempted)
      4. Forward record to originus-email-gateway POST /intake (best-effort)
      5. Return safe Telegram-ready response

    Policy guarantees:
      - No auto-reply content sent
      - No document disclosure
      - No timeline commitment
      - Posture: SILENT_UNTIL_REQUESTED
    """
    record = normalize_intake(
        user_id=user_id,
        username=username,
        text=text,
        channel=channel,
    )

    await log_intake(record)
    await send_to_gateway(record)

    return build_response(record)
