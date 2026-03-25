"""
Governance companion service — SentinelFortune Bot.

PDFs in R2 are canonical and authoritative. The bot never reads PDF bytes.
Instead, each PDF has a safe JSON companion file that exposes:
  - doc_id, title, classification, topic, access_level
  - summary (non-sensitive meta description only)
  - key_points (safe structural highlights)
  - r2_pdf_path (canonical reference, not served directly)
  - tags, source_type

Companion files for _canon/ PDFs live in originus/bot/companions/<path>
  so the _canon/ namespace is never touched.
Non-canon PDFs have companions alongside them (same R2 directory).

Access control is preserved: companions follow the same access_level
  as the document they describe.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Companion registry
# All entries map a logical doc_id → R2 companion key + access level
# ---------------------------------------------------------------------------

COMPANION_REGISTRY: dict[str, dict] = {
    "DOCUMENT_PRECEDENCE_INTERPRETATION_RULE": {
        "companion_key":  "originus/bot/companions/governance/DOCUMENT_PRECEDENCE_INTERPRETATION_RULE.v1.companion.json",
        "r2_pdf_path":    "originus/_canon/governance/DOCUMENT_PRECEDENCE_INTERPRETATION_RULE.v1.pdf",
        "access_level":   "public",
        "topic":          "governance",
    },
    "INSTITUTIONAL_NON_QUALIFICATION_STATEMENT": {
        "companion_key":  "originus/bot/companions/governance/INSTITUTIONAL_NON_QUALIFICATION_STATEMENT.v1.companion.json",
        "r2_pdf_path":    "originus/_canon/governance/INSTITUTIONAL_NON_QUALIFICATION_STATEMENT.v1.pdf",
        "access_level":   "public",
        "topic":          "governance",
    },
    "SILENT_ADAPTATION_PROTOCOL": {
        "companion_key":  "originus/bot/companions/governance/SILENT_ADAPTATION_PROTOCOL.v1.companion.json",
        "r2_pdf_path":    "originus/_canon/governance/SILENT_ADAPTATION_PROTOCOL.v1.pdf",
        "access_level":   "member",
        "topic":          "governance",
    },
    "SENTINEL_FORTUNE_NDA_STANDARD": {
        "companion_key":  "originus/bot/companions/governance/nda/SENTINEL_FORTUNE_NDA_STANDARD.v2.companion.json",
        "r2_pdf_path":    "originus/_canon/governance/nda/SENTINEL_FORTUNE_NDA_STANDARD_v2_STRUCTURED.pdf",
        "access_level":   "member",
        "topic":          "legal",
    },
    "SFL_INSTITUTIONAL_PROFILE": {
        "companion_key":  "originus/bot/companions/institutional/SFL_INSTITUTIONAL_PROFILE_v1.companion.json",
        "r2_pdf_path":    "originus/_canon/institutional/SFL_INSTITUTIONAL_PROFILE_v1.pdf",
        "access_level":   "public",
        "topic":          "institutional",
    },
    "SFL_WHITEPAPER_INSTITUTIONAL": {
        "companion_key":  "originus/bot/companions/whitepapers/SFL_WHITEPAPER_INSTITUTIONAL_V1.companion.json",
        "r2_pdf_path":    "originus/_canon/whitepapers/SFL_WHITEPAPER_INSTITUTIONAL_V1_FINAL.pdf",
        "access_level":   "public",
        "topic":          "institutional",
    },
    "SFL_INSTITUTIONAL_POSITION_PAPER_OEM_IP": {
        "companion_key":  "originus/licensing/institutional/SFL_INSTITUTIONAL_POSITION_PAPER_OEM_IP_v1.companion.json",
        "r2_pdf_path":    "originus/licensing/institutional/SFL_INSTITUTIONAL_POSITION_PAPER_OEM_IP_v1.pdf",
        "access_level":   "member",
        "topic":          "licensing",
    },
    "EOI_RESPONSE_CANON": {
        "companion_key":  "originus/global/sfl/COMMUNICATION/EOI/EOI_RESPONSE_CANON.v1.companion.json",
        "r2_pdf_path":    "originus/global/sfl/COMMUNICATION/EOI/EOI_RESPONSE_CANON.v1.pdf",
        "access_level":   "member",
        "topic":          "communication",
    },
    "INSTITUTIONAL_ACCESS_NOTICE": {
        "companion_key":  "originus/global/sfl/ACCESS/INSTITUTIONAL_ACCESS_NOTICE_v1.companion.json",
        "r2_pdf_path":    "originus/global/sfl/ACCESS/INSTITUTIONAL_ACCESS_NOTICE_v1.pdf",
        "access_level":   "public",
        "topic":          "access",
    },
    "DEAL_004_INSTITUTIONAL_OVERVIEW": {
        "companion_key":  "originus/bot/companions/deals/DEAL_004_Institutional_Overview.companion.json",
        "r2_pdf_path":    "originus/deals/DEAL_004/_canon/DEAL_004_Institutional_Overview.pdf",
        "access_level":   "architect",
        "topic":          "deals",
    },
    "DEAL_PILOTE_001_OEM_TEXTILE": {
        "companion_key":  "originus/deals/DEAL_004/agreements/DEAL_PILOTE_001_OEM_TEXTILE_EN.companion.json",
        "r2_pdf_path":    "originus/deals/DEAL_004/agreements/DEAL_PILOTE_001_OEM_TEXTILE_EN_READY_TO_SIGN.pdf",
        "access_level":   "architect",
        "topic":          "deals",
    },
}

# ---------------------------------------------------------------------------
# Access level hierarchy
# ---------------------------------------------------------------------------

_ACCESS_HIERARCHY = ["public", "member", "architect", "internal"]


def _can_access(required: str, user_level: str) -> bool:
    try:
        return _ACCESS_HIERARCHY.index(user_level) >= _ACCESS_HIERARCHY.index(required)
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Companion resolution
# ---------------------------------------------------------------------------

async def resolve_companion(doc_id: str, access_level: str = "public") -> Optional[dict]:
    """
    Resolve a companion JSON file by doc_id and access level.

    Args:
        doc_id:       Registry key (see COMPANION_REGISTRY)
        access_level: Caller's access level ("public"|"member"|"architect")

    Returns:
        Companion dict if accessible, None if not found or access denied.
    """
    from bot.services.r2_service import get_json

    entry = COMPANION_REGISTRY.get(doc_id)
    if not entry:
        logger.debug("resolve_companion: unknown doc_id=%s", doc_id)
        return None

    required_level = entry.get("access_level", "public")
    if not _can_access(required_level, access_level):
        logger.info(
            "resolve_companion: access denied doc_id=%s required=%s user=%s",
            doc_id, required_level, access_level,
        )
        return None

    companion_key = entry["companion_key"]
    try:
        data = await get_json(companion_key)
        if data:
            logger.info("resolve_companion: OK doc_id=%s key=%s", doc_id, companion_key)
        else:
            logger.warning("resolve_companion: companion file missing or empty: %s", companion_key)
        return data
    except Exception as exc:
        logger.error("resolve_companion: read failed doc_id=%s: %s", doc_id, exc)
        return None


def list_companions(access_level: str = "public", topic: Optional[str] = None) -> list[dict]:
    """
    List all companion registry entries accessible at the given access level.
    Optionally filter by topic.

    Returns:
        List of metadata dicts (no content, no pdf path — safe for any access level).
    """
    result = []
    for doc_id, entry in COMPANION_REGISTRY.items():
        if not _can_access(entry.get("access_level", "public"), access_level):
            continue
        if topic and entry.get("topic") != topic:
            continue
        result.append({
            "doc_id":       doc_id,
            "topic":        entry.get("topic"),
            "access_level": entry.get("access_level"),
        })
    return result
