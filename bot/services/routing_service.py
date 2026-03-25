"""
Qualification routing service — SentinelFortune Bot.

Runs after a successful R2 intake write.
Creates a desk-scoped copy at:
  originus/bot/deals/routed/{desk}/{ref_id}.json

Design rules:
  - Non-blocking async — caller must use asyncio.create_task()
  - Duplicate-guarded via key_exists() before write
  - Never raises — all failures are logged and swallowed
  - No external dependencies beyond existing r2_service
  - No schema changes to intake record
"""

import logging
from datetime import datetime, timezone

from bot.services.scoring_service import score_record
from bot.services.action_service import resolve_action

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Desk routing map
# ---------------------------------------------------------------------------

_ROUTE_TARGET: dict[str, str] = {
    "oem":       "OEM_DESK",
    "licensing": "LICENSING_DESK",
    "investor":  "INVESTOR_RELATIONS",
    "legal":     "LEGAL_DESK",
    "contact":   "GENERAL_INTAKE",
}

_ROUTED_PREFIX = "originus/bot/deals/routed/"
_INTAKE_PREFIX = "originus/bot/deals/intake/"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def route_qual_record(record: dict) -> bool:
    """
    Route a completed qualification record to its desk namespace.

    Accepts the same dict that was written to the intake path.
    Writes a routed copy to: originus/bot/deals/routed/{desk}/{ref_id}.json

    Returns True on success, False on failure or duplicate.
    Never raises.
    """
    from bot.services.r2_service import put_json, key_exists

    ref_id = record.get("ref_id", "")
    desk   = record.get("desk", "")

    if not ref_id or not desk:
        logger.error("route_qual_record: missing ref_id or desk in record")
        return False

    route_target = _ROUTE_TARGET.get(desk, "GENERAL_INTAKE")
    routed_key   = f"{_ROUTED_PREFIX}{desk}/{ref_id}.json"
    intake_path  = f"{_INTAKE_PREFIX}{ref_id}.json"

    logger.info("Routing started: %s → %s", ref_id, route_target)

    try:
        if await key_exists(routed_key):
            logger.warning(
                "Routing skipped — duplicate record already exists: %s", routed_key
            )
            return False

        score_fields  = score_record(record)
        action_fields = resolve_action(score_fields["score"], desk)

        routed_record = {
            "ref_id":         ref_id,
            "desk":           desk,
            "route_target":   route_target,
            "routed_at":      datetime.now(timezone.utc).isoformat(),
            "source_path":    intake_path,
            "intake_path":    intake_path,
            "status":         record.get("status", "NEW"),
            "classification": record.get("classification", ""),
            "completed_at":   record.get("completed_at", ""),
            "final_summary":  record.get("final_summary", ""),
            "answers":        record.get("answers", {}),
            "bot_username":   record.get("bot_username", "@sentinelfortune_bot"),
            # Scoring fields
            "score":          score_fields["score"],
            "priority":       score_fields["priority"],
            "urgency":        score_fields["urgency"],
            "score_reason":   score_fields["score_reason"],
            # Action fields (overwrite review_bucket with tier label; add sla/next/owner)
            "review_bucket":  action_fields["review_bucket"],
            "sla_target":     action_fields["sla_target"],
            "next_action":    action_fields["next_action"],
            "owner_queue":    action_fields["owner_queue"],
        }

        ok = await put_json(routed_key, routed_record)
        if ok:
            logger.info("Routing written: %s", routed_key)
            return True
        else:
            logger.error("Routing write failed (non-blocking): %s", routed_key)
            return False

    except Exception as exc:
        logger.error(
            "route_qual_record raised unexpectedly (non-blocking): key=%s exc=%s",
            routed_key, exc,
        )
        return False
