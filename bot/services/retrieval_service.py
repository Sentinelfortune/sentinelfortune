"""
originus-retrieval Python service layer.

Mirrors the originus-retrieval Cloudflare Worker logic locally.
Used as a bot-side fallback when the worker is unavailable, and as
the direct retrieval engine for intents not yet wired through the worker.

Resolution flow:
  1. Load R2_RETRIEVAL_MASTER_INDEX.v1.json from R2
  2. Filter entries by intent + access_level (hierarchy-aware)
  3. For the best matching entry, attempt to read and excerpt canonical file from R2
  4. Return clean Telegram-ready text — never raw file dumps

Access level hierarchy (ascending privilege):
  public < member < architect < internal
"""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

INDEX_KEY = "originus/_canon/R2_RETRIEVAL_MASTER_INDEX.v1.json"
ACCESS_HIERARCHY = ["public", "member", "architect", "internal"]

# ---------------------------------------------------------------------------
# Companion enrichment map — intent → ordered list of companion doc_ids to try
# First accessible companion (by access level) is appended to the response.
# ---------------------------------------------------------------------------

_INTENT_TO_COMPANION: dict[str, list[str]] = {
    "query.governance": [
        "DOCUMENT_PRECEDENCE_INTERPRETATION_RULE",
        "INSTITUTIONAL_NON_QUALIFICATION_STATEMENT",
    ],
    "query.licensing": [
        "SFL_INSTITUTIONAL_POSITION_PAPER_OEM_IP",
    ],
    "query.oem": [
        "SFL_INSTITUTIONAL_POSITION_PAPER_OEM_IP",
    ],
    "query.ip": [
        "SFL_WHITEPAPER_INSTITUTIONAL",
    ],
    "query.deals": [
        "DEAL_004_INSTITUTIONAL_OVERVIEW",
    ],
    "query.contact": [
        "INSTITUTIONAL_ACCESS_NOTICE",
    ],
}

# ---------------------------------------------------------------------------
# Inline fallback responses — used when R2 index is unavailable
# Mirrors FALLBACK_INDEX in the Cloudflare Worker
# ---------------------------------------------------------------------------

_FALLBACK: dict[str, dict[str, str]] = {
    "query.governance": {
        "public": (
            "Sentinel Fortune operates under a governance-first, private institutional model.\n\n"
            "• IP ownership is permanently locked to Sentinel Fortune LLC\n"
            "• All external access is subject to formal review and qualification\n"
            "• Disclosure is controlled and minimal by design\n"
            "• NDA is required for any sensitive material access\n\n"
            "For governance inquiries: legal@sentinelfortune.com"
        ),
    },
    "query.licensing": {
        "public": (
            "Sentinel Fortune operates a structured IP licensing framework under the "
            "Civil-First OEM & Government Licensing program.\n\n"
            "Licensing scope covers:\n"
            "• Industrial design language (exterior/interior)\n"
            "• Branding and trade dress rules (non-transferable)\n"
            "• Platform architecture guidelines\n"
            "• SOP and operational frameworks\n\n"
            "Key principles:\n"
            "• Licensing only — no direct product sale\n"
            "• No performance claims or ROI language\n"
            "• All licenses governed by formal signed agreements\n\n"
            "For licensing inquiries: licensing@sentinelfortune.com"
        ),
        "member": (
            "Sentinel Fortune's licensing structure operates across defined tiers under "
            "the Canon Rights Layer (CRL).\n\n"
            "License modes:\n"
            "• OEM licensing — design and platform framework use\n"
            "• Institutional licensing — SOP, governance, operational rights\n"
            "• Content licensing — IP, narrative, franchise, and adaptation rights\n\n"
            "To begin a licensing inquiry: licensing@sentinelfortune.com"
        ),
    },
    "query.oem": {
        "public": (
            "Sentinel Fortune's OEM model supports modular, asset-light deployments "
            "across multiple domains.\n\n"
            "Active OEM framework: Blessing Farms — OEM territorial stack for land, water, "
            "energy, agro-forestry, eco-estates, and wellness.\n\n"
            "All partnerships subject to formal qualification and intake review.\n\n"
            "For OEM inquiries: oem@sentinelfortune.com"
        ),
        "member": (
            "OEM partner evaluation and intake is managed through a structured qualification pipeline.\n\n"
            "Intake process:\n"
            "• Initial inquiry review\n"
            "• Qualification assessment (capability, territory, market fit)\n"
            "• Formal intake form submission\n"
            "• OEM guardrails briefing\n"
            "• Agreement drafting and execution\n\n"
            "To initiate: oem@sentinelfortune.com"
        ),
    },
    "query.deals": {
        "architect": (
            "DEAL_004 — Global Deal Engine: OEM & Framework Licensing\n\n"
            "Status: OPERATIONALLY_READY\n"
            "Model: OEM_LICENSING_ENGINE\n"
            "Activation: ACTIVATION_TRIGGER_REQUIRED\n"
            "Doctrine: RUN_SILENT | OBSERVE | NO_OVERBUILD | SIGNAL_DRIVEN\n\n"
            "Licensing only — no product sale. No performance claims.\n\n"
            "For deal inquiries: contact@sentinelfortune.com"
        ),
    },
    "query.ip": {
        "public": (
            "Sentinel Fortune holds a multi-franchise IP portfolio structured for canon control, "
            "factory execution, and long-term licensing readiness.\n\n"
            "IP is held internally and not available for direct acquisition.\n"
            "Licensing and adaptation inquiries are handled on a qualified basis.\n\n"
            "For IP licensing: licensing@sentinelfortune.com"
        ),
        "architect": (
            "IP Portfolio — Architect Access\n\n"
            "Active properties: Aeon Codex, Solfyr Multiverse, The Weight of Truth, "
            "What Remains of Us, When the Silence Breaks, Ratou (universe), World W1.\n\n"
            "All canon files are R2-canonical. Factory execution routes through originus-factory.\n"
            "For licensing: licensing@sentinelfortune.com"
        ),
    },
    "query.universes": {
        "public": (
            "Sentinel Fortune manages a structured universe portfolio under the Originus IP architecture.\n\n"
            "The portfolio spans narrative, franchise, platform, and game IP.\n"
            "No universe materials are publicly released without a formal licensing agreement.\n\n"
            "For universe licensing: licensing@sentinelfortune.com"
        ),
        "architect": (
            "Originus Universe Portfolio — Architect Access\n\n"
            "• Ratou — originus/ip/universes/ratou/\n"
            "• Aeon Codex — originus/ip/aeon_codex/\n"
            "• Solfyr Multiverse — originus/ip/solfyr_multiverse/\n"
            "• The Weight of Truth — originus/ip/the_weight_of_truth/\n"
            "• What Remains of Us — originus/ip/what_remains_of_us/\n"
            "• When the Silence Breaks — originus/ip/when_the_silence_breaks/\n"
            "• Narrative Universe — originus/ip/narrative_universe/"
        ),
    },
    "query.worlds": {
        "architect": (
            "Originus World Registry — Architect Access\n\n"
            "Active world:\n"
            "• W1 — World anchor established under originus/ip/worlds/W1/\n\n"
            "World materials are not publicly released.\n"
            "For world licensing or adaptation: licensing@sentinelfortune.com"
        ),
    },
    "query.domain": {
        "public": (
            "Sentinel Fortune manages a structured portfolio of brand and domain assets.\n\n"
            "No brand assets, domain names, or marks are available for public acquisition "
            "outside of a formal licensing or partnership agreement.\n\n"
            "All brand use must comply with SFL design doctrine.\n\n"
            "For brand or domain inquiries: licensing@sentinelfortune.com"
        ),
    },
    "query.general": {
        "public": (
            "Sentinel Fortune is a private U.S. IP holding and licensing structure.\n\n"
            "This retrieval layer handles structured queries across governance, licensing, "
            "OEM, deals, IP, universes, and worlds.\n\n"
            "For general inquiries: contact@sentinelfortune.com"
        ),
    },
}

# ---------------------------------------------------------------------------
# Access level utilities
# ---------------------------------------------------------------------------

def _access_rank(level: str) -> int:
    try:
        return ACCESS_HIERARCHY.index(level)
    except ValueError:
        return 0


def _can_access(required: str, user_level: str) -> bool:
    return _access_rank(user_level) >= _access_rank(required)


# ---------------------------------------------------------------------------
# Master index loader (async, from R2)
# ---------------------------------------------------------------------------

async def _load_index() -> Optional[dict]:
    try:
        from bot.services.r2_service import get_json
        data = await get_json(INDEX_KEY)
        if data and "entries" in data:
            return data
    except Exception as exc:
        logger.debug("Index load from R2 failed: %s", exc)
    return None


# ---------------------------------------------------------------------------
# Entry resolution
# ---------------------------------------------------------------------------

def _find_best_entry(index: dict, intent: str, access_level: str) -> Optional[dict]:
    entries = index.get("entries", [])
    candidates = [
        e for e in entries
        if e.get("intent") == intent and _can_access(e.get("access_level", "public"), access_level)
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda e: _access_rank(e.get("access_level", "public")), reverse=True)
    return candidates[0]


# ---------------------------------------------------------------------------
# Canonical R2 file reader — safe excerpt only, never raw dump
# ---------------------------------------------------------------------------

async def _read_canon_excerpt(path: str, intent: str) -> Optional[str]:
    if not path or path.endswith("/"):
        return None
    if not path.endswith(".json"):
        return None
    try:
        from bot.services.r2_service import get_json
        data = await get_json(path)
        if not data:
            return None
        return _extract_safe_fields(data, intent)
    except Exception as exc:
        logger.debug("Canon excerpt read failed for %s: %s", path, exc)
        return None


def _extract_safe_fields(data: dict, intent: str) -> Optional[str]:
    """Extract safe, non-sensitive summary fields from canonical JSON files."""
    lines: list[str] = []

    # GOVERNANCE_MODE / CANON_SEAL_SUMMARY
    if data.get("governance_standard") or data.get("mode") == "OEM_LICENSING_ONLY":
        if data.get("governance_standard"):
            lines.append(f"Governance standard: {data['governance_standard']}")
        if data.get("jurisdiction"):
            lines.append(f"Jurisdiction: {data['jurisdiction']}")
        if data.get("time_horizon"):
            lines.append(f"Time horizon: {data['time_horizon']}")
        if data.get("mode"):
            lines.append(f"Mode: {data['mode']}")
        if data.get("role"):
            lines.append(f"Role: {data['role']}")

    # LICENSING_FRAMEWORK
    elif data.get("schema") == "SFL_CANON_LICENSING_FRAMEWORK":
        scope = data.get("scope", {})
        if scope.get("program_name"):
            lines.append(f"Program: {scope['program_name']}")
        asset_classes = scope.get("asset_classes", [])[:3]
        if asset_classes:
            lines.append(f"Asset classes: {', '.join(asset_classes)}")
        if data.get("status"):
            lines.append(f"Status: {data['status']}")
        if data.get("effective_date"):
            lines.append(f"Effective: {data['effective_date']}")

    # DEAL_004_CANON_SUMMARY
    elif data.get("deal_id"):
        if data.get("title"):
            lines.append(f"Deal: {data['title']}")
        if data.get("status"):
            lines.append(f"Status: {data['status']}")
        deal_model = data.get("deal_model", {})
        if deal_model.get("type"):
            lines.append(f"Model: {deal_model['type']}")
        activation = data.get("activation_policy", {})
        if activation.get("mode"):
            lines.append(f"Activation: {activation['mode']}")

    # BLESSING_FARMS_CANON (OEM)
    elif data.get("system_type") == "OEM_TERRITORIAL_STACK":
        if data.get("system_name"):
            lines.append(f"System: {data['system_name']}")
        if data.get("status"):
            lines.append(f"Status: {data['status']}")
        one_liner = data.get("positioning", {}).get("one_liner", "")
        if one_liner:
            lines.append(f"Overview: {one_liner[:120]}")

    # UNIVERSE_PORTFOLIO_REGISTRY
    elif data.get("registry_id"):
        if data.get("scope"):
            lines.append(f"Scope: {data['scope']}")
        if data.get("status"):
            lines.append(f"Status: {data['status']}")
        if data.get("mode"):
            lines.append(f"Mode: {data['mode']}")
        portfolio_text = data.get("portfolio", {}).get("positioning", "")
        if portfolio_text:
            lines.append(f"Portfolio: {portfolio_text[:100]}")

    return "\n".join(lines) if lines else None


# ---------------------------------------------------------------------------
# Fallback resolution (no R2 index available)
# ---------------------------------------------------------------------------

def _resolve_fallback(intent: str, access_level: str) -> str:
    intent_map = _FALLBACK.get(intent) or _FALLBACK["query.general"]
    best_text: Optional[str] = None
    best_rank = -1
    for level, text in intent_map.items():
        if _can_access(level, access_level) and _access_rank(level) > best_rank:
            best_rank = _access_rank(level)
            best_text = text
    return best_text or _FALLBACK["query.general"]["public"]


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def _resolve_companion_excerpt(intent: str, access_level: str) -> Optional[str]:
    """
    Look up the first accessible companion for this intent and return a
    safe 2-line summary (title + first key point). Never dumps full content.
    Returns None if no companion is found or accessible.
    """
    doc_ids = _INTENT_TO_COMPANION.get(intent, [])
    if not doc_ids:
        return None
    try:
        from bot.services.governance_companion_service import resolve_companion
        for doc_id in doc_ids:
            companion = await resolve_companion(doc_id, access_level)
            if companion:
                title = companion.get("title", "")
                summary = companion.get("summary", "")
                key_points = companion.get("key_points") or []
                parts: list[str] = []
                if title:
                    parts.append(f"Reference: {title}")
                if summary:
                    parts.append(summary[:200])
                if key_points:
                    parts.append(f"• {key_points[0]}")
                if len(key_points) > 1:
                    parts.append(f"• {key_points[1]}")
                logger.info(
                    "Companion excerpt appended: doc_id=%s intent=%s access=%s",
                    doc_id, intent, access_level,
                )
                return "\n".join(parts)
    except Exception as exc:
        logger.debug("Companion enrichment failed for intent=%s: %s", intent, exc)
    return None


async def retrieve(
    intent: str,
    access_level: str = "public",
    enrich_from_canon: bool = True,
) -> str:
    """
    Resolve an intent + access_level to a clean Telegram-ready response.

    Args:
        intent:           e.g. "query.governance", "query.licensing"
        access_level:     "public" | "member" | "architect" | "internal"
        enrich_from_canon: attempt to read canonical R2 files and companion
                           summaries for richer detail

    Returns:
        Telegram-ready text string, never a raw file dump.
    """
    logger.info("Retrieval: intent=%s access_level=%s", intent, access_level)

    index = await _load_index()

    if index:
        entry = _find_best_entry(index, intent, access_level)
        if entry:
            response = entry.get("response_template", "")
            logger.info("Entry resolved: id=%s resolved_from=index", entry.get("id"))

            if enrich_from_canon:
                canon_path = (entry.get("canonical_paths") or [None])[0]
                if canon_path:
                    excerpt = await _read_canon_excerpt(canon_path, intent)
                    if excerpt:
                        response = response + "\n\n—\nCanon detail:\n" + excerpt
                        logger.info("Canon excerpt appended from %s", canon_path)

            if enrich_from_canon:
                companion_excerpt = await _resolve_companion_excerpt(intent, access_level)
                if companion_excerpt:
                    response = response + "\n\n—\nDocument reference:\n" + companion_excerpt

            return response

        logger.debug("No matching entry for intent=%s access=%s — using fallback", intent, access_level)
    else:
        logger.debug("Master index unavailable — using inline fallback")

    base = _resolve_fallback(intent, access_level)

    if enrich_from_canon:
        companion_excerpt = await _resolve_companion_excerpt(intent, access_level)
        if companion_excerpt:
            base = base + "\n\n—\nDocument reference:\n" + companion_excerpt

    return base
