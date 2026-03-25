"""
Qualification scoring service — SentinelFortune Bot.

Computes a deterministic integer score (0–100) for a completed qualification
record and maps it to priority / urgency / review_bucket tiers.

Design rules:
  - Pure function: score_record(record) → dict with 5 new fields
  - No I/O, no async, no side-effects
  - All signal detection is case-insensitive keyword matching on answer values
  - Called by routing_service before the routed record is written
  - Never modifies the intake record
"""

import re
from typing import Any

# ---------------------------------------------------------------------------
# Tier mapping  (applied after per-desk score is computed)
# ---------------------------------------------------------------------------

def _tier(score: int) -> dict[str, str]:
    if score >= 80:
        return {"priority": "critical", "urgency": "immediate",
                "review_bucket": "same_day"}
    if score >= 60:
        return {"priority": "high",     "urgency": "fast",
                "review_bucket": "next_business_day"}
    if score >= 40:
        return {"priority": "medium",   "urgency": "normal",
                "review_bucket": "standard_queue"}
    return     {"priority": "low",      "urgency": "slow",
                "review_bucket": "long_queue"}


# ---------------------------------------------------------------------------
# Signal helpers
# ---------------------------------------------------------------------------

def _text(answers: dict, *keys: str) -> str:
    """Combine selected answer values into one lower-cased string for scanning."""
    parts = [str(answers.get(k, "") or "") for k in keys]
    return " ".join(parts).lower()


def _all_text(answers: dict) -> str:
    return " ".join(str(v or "") for v in answers.values()).lower()


def _has(text: str, *keywords: str) -> bool:
    """Return True if ANY keyword appears as a word/sub-phrase in text."""
    for kw in keywords:
        if re.search(r"\b" + re.escape(kw) + r"\b", text):
            return True
    return False


def _has_capacity(text: str) -> bool:
    """Detect numeric capacity mentions, e.g. '50k units/month', '2000 pcs'."""
    if re.search(r"\d[\d,\.]*\s*(?:k\b|m\b|units?|pcs?|pieces?)", text):
        return True
    return _has(text, "capacity", "production volume", "throughput",
                "units/month", "per month", "monthly output")


def _has_capital_amount(text: str) -> bool:
    """Detect capital figures, e.g. '$1M', '5 million', '500k'."""
    if re.search(r"\$[\d,\.]+\s*(?:k|m|b|million|billion)?", text, re.I):
        return True
    if re.search(r"\d[\d,\.]*\s*(?:k|m|b|million|billion)\b", text, re.I):
        return True
    return False


def _capital_above_1m(text: str) -> bool:
    """Return True if a mentioned capital figure is plausibly >= $1M."""
    for m in re.finditer(
        r"\$?([\d,\.]+)\s*(k|m|b|million|billion)?", text, re.I
    ):
        raw   = m.group(1).replace(",", "")
        mult  = (m.group(2) or "").lower()
        try:
            val = float(raw)
            if mult in ("m", "million"): val *= 1_000_000
            elif mult in ("b", "billion"): val *= 1_000_000_000
            elif mult == "k": val *= 1_000
            if val >= 1_000_000:
                return True
        except ValueError:
            pass
    return False


# ---------------------------------------------------------------------------
# Per-desk scorers
# ---------------------------------------------------------------------------

def _score_oem(answers: dict) -> tuple[int, list[str]]:
    company    = str(answers.get("company", "")   or "").strip()
    capability = str(answers.get("capability", "") or "").strip()
    region     = str(answers.get("region", "")    or "").strip()
    full       = _all_text(answers)
    cap_text   = (capability + " " + full).lower()

    pts: list[str] = []
    score = 0

    if company:
        score += 20; pts.append("company")
    if capability:
        score += 20; pts.append("category")
    if _has_capacity(cap_text):
        score += 30; pts.append("capacity")
    if region:
        score += 10; pts.append("region")
    if _has(full, "factory", "oem", "white label", "manufacturing line",
            "contract manufacturer", "white-label", "private label"):
        score += 20; pts.append("strong manufacturing signal")

    return min(score, 100), pts


def _score_licensing(answers: dict) -> tuple[int, list[str]]:
    ip_type  = str(answers.get("ip_type", "")  or "").strip()
    use      = str(answers.get("use", "")      or "").strip()
    timeline = str(answers.get("timeline", "") or "").strip()
    full     = _all_text(answers)

    pts: list[str] = []
    score = 0

    if ip_type:
        score += 25; pts.append("IP type")
    if use:
        score += 25; pts.append("intended use")
    if _has(full, "territory", "region", "country", "europe", "asia",
            "americas", "global", "worldwide", "emea", "apac", "latam",
            "north america", "southeast asia"):
        score += 20; pts.append("region/territory")
    if timeline:
        score += 15; pts.append("timeline")
    if _has(full, "exclusive", "distribution rights", "retail rights",
            "franchise", "sublicense", "master license", "territory rights"):
        score += 15; pts.append("strong licensing signal")

    return min(score, 100), pts


def _score_investor(answers: dict) -> tuple[int, list[str]]:
    capital   = str(answers.get("capital", "")   or "").strip()
    structure = str(answers.get("structure", "") or "").strip()
    geography = str(answers.get("geography", "") or "").strip()
    full      = _all_text(answers)

    pts: list[str] = []
    score = 0

    if capital and _has_capital_amount(capital.lower()):
        score += 35; pts.append("capital")
    elif capital:
        score += 15; pts.append("capital (no clear figure)")
    if structure:
        score += 20; pts.append("structure")
    if geography:
        score += 15; pts.append("geography")
    if _has(full, "fund", "vc", "venture capital", "family office",
            "institutional", "capital deployment", "lp", "gp",
            "private equity", "endowment"):
        score += 20; pts.append("institutional signal")
    if _capital_above_1m(full):
        score += 10; pts.append("ticket ≥ $1M")

    return min(score, 100), pts


def _score_legal(answers: dict) -> tuple[int, list[str]]:
    purpose     = str(answers.get("purpose", "")     or "").strip()
    entity_type = str(answers.get("entity_type", "") or "").strip()
    urgency_ans = str(answers.get("urgency", "")     or "").strip()
    full        = _all_text(answers)

    pts: list[str] = []
    score = 0

    if purpose:
        score += 30; pts.append("purpose")
    if entity_type:
        score += 20; pts.append("entity type")
    if urgency_ans:
        score += 20; pts.append("urgency")
    if _has(full, "nda", "m&a", "merger", "acquisition", "compliance",
            "dispute", "counsel", "litigation", "ip assignment",
            "term sheet", "due diligence", "regulatory"):
        score += 30; pts.append("legal-sensitive signal")

    return min(score, 100), pts


def _score_contact(answers: dict) -> tuple[int, list[str]]:
    objective = str(answers.get("objective", "") or "").strip()
    entity    = str(answers.get("entity", "")    or "").strip()
    contact   = str(answers.get("contact", "")   or "").strip()
    full      = _all_text(answers)

    pts: list[str] = []
    score = 0

    if objective:
        score += 30; pts.append("objective")
    if entity:
        score += 20; pts.append("entity")
    if contact:
        score += 15; pts.append("contact mode")
    if _has(full, "fund", "vc", "institutional", "corporation", "enterprise",
            "holding", "group", "partners", "capital", "management"):
        score += 15; pts.append("institutional signal")

    return min(score, 100), pts


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

_DESK_SCORERS = {
    "oem":       _score_oem,
    "licensing": _score_licensing,
    "investor":  _score_investor,
    "legal":     _score_legal,
    "contact":   _score_contact,
}


def score_record(record: dict[str, Any]) -> dict[str, Any]:
    """
    Compute score fields for a completed qualification record.

    Returns a dict with exactly 5 new fields (never raises):
      score          int   0–100
      priority       str   critical | high | medium | low
      urgency        str   immediate | fast | normal | slow
      review_bucket  str   same_day | next_business_day | standard_queue | long_queue
      score_reason   str   short human-readable explanation
    """
    try:
        desk    = str(record.get("desk", "") or "")
        answers = record.get("answers", {}) or {}

        scorer  = _DESK_SCORERS.get(desk, _score_contact)
        raw_score, pts = scorer(answers)
        score   = max(0, min(100, int(raw_score)))

        desk_label = {
            "oem": "OEM", "licensing": "Licensing", "investor": "Investor",
            "legal": "Legal", "contact": "Contact",
        }.get(desk, desk.capitalize())

        reason = (
            f"{desk_label}: " + " + ".join(pts)
            if pts else f"{desk_label}: no strong signals"
        )

        return {
            "score":         score,
            "score_reason":  reason,
            **_tier(score),
        }

    except Exception:
        return {
            "score":         0,
            "score_reason":  "scoring error",
            "priority":      "low",
            "urgency":       "slow",
            "review_bucket": "long_queue",
        }
