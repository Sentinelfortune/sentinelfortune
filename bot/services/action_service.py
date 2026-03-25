"""
Action layer — SentinelFortune Bot.

Maps a completed, scored qualification record to internal review fields.
Runs after scoring_service; before the routed record is written to R2.

Design rules:
  - Pure function: resolve_action(score, desk) → dict (5 fields)
  - No I/O, no async, no side-effects
  - Never raises
  - Does not modify scoring logic
"""

from typing import Any

# ---------------------------------------------------------------------------
# Score → action tier
# ---------------------------------------------------------------------------

def _action_tier(score: int) -> dict[str, str]:
    if score >= 80:
        return {
            "review_bucket": "critical",
            "sla_target":    "same_day",
            "next_action":   "immediate_review",
        }
    if score >= 60:
        return {
            "review_bucket": "high",
            "sla_target":    "next_business_day",
            "next_action":   "priority_review",
        }
    if score >= 40:
        return {
            "review_bucket": "medium",
            "sla_target":    "standard_queue",
            "next_action":   "normal_review",
        }
    return {
        "review_bucket": "low",
        "sla_target":    "long_queue",
        "next_action":   "deferred_review",
    }


# ---------------------------------------------------------------------------
# Desk → owner queue
# ---------------------------------------------------------------------------

_OWNER_QUEUE: dict[str, str] = {
    "oem":       "OEM_DESK",
    "licensing": "LIC_DESK",
    "investor":  "INV_DESK",
    "legal":     "LEG_DESK",
    "contact":   "CON_DESK",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def resolve_action(score: int, desk: str) -> dict[str, Any]:
    """
    Return the 4 action fields for a routed record.

    Args:
        score: integer 0–100 from scoring_service
        desk:  desk key (oem | licensing | investor | legal | contact)

    Returns dict with exactly 4 keys:
        review_bucket  str  critical | high | medium | low
        sla_target     str  same_day | next_business_day | standard_queue | long_queue
        next_action    str  immediate_review | priority_review | normal_review | deferred_review
        owner_queue    str  OEM_DESK | LIC_DESK | INV_DESK | LEG_DESK | CON_DESK
    """
    try:
        tier = _action_tier(max(0, min(100, int(score))))
        return {
            **tier,
            "owner_queue": _OWNER_QUEUE.get(str(desk), "CON_DESK"),
        }
    except Exception:
        return {
            "review_bucket": "low",
            "sla_target":    "long_queue",
            "next_action":   "deferred_review",
            "owner_queue":   "CON_DESK",
        }
