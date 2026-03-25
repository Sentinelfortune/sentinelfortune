"""
Deal-flow operating layer — SentinelFortune Bot.

Implements:
  - Lead registry schema (canonical 17-field record)
  - Qualification engine  (deterministic scoring → 4 tiers)
  - Deal strength scoring (weak / moderate / strong)
  - Deal stage pipeline   (15 controlled states)
  - Next-action policy    (per-desk deterministic assignment)
  - NDA trigger           (escalation_candidate OR deal_strength=strong)
  - Post-NDA flow         (NDA_SIGNED → PACK_SHARED → NEGOTIATION)
  - Pack routing          (desk-specific information packs)
  - R2 persistence        (bot-owned namespaces only)

R2 namespaces used (bot-owned, no canonical paths touched):
  originus/bot/deals/intake/      — one record per lead (lead_id.json)
  originus/bot/deals/stages/      — stage transition logs (lead_id_stages.json)
  originus/bot/deals/logs/        — append-only audit log (DEAL_AUDIT_LOG.v1.json)
  originus/bot/deals/user_index/  — latest lead pointer per user (user_id.json)

Policy constraints (inherited from canonical R2 policy files):
  - posture: SILENT_UNTIL_REQUESTED
  - auto_reply: False
  - human_review: True
  - No document content disclosed
  - No timeline commitments
"""

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# R2 namespace roots (bot-owned only)
# ---------------------------------------------------------------------------

_DEALS_INTAKE_PREFIX    = "originus/bot/deals/intake/"
_DEALS_STAGES_PREFIX    = "originus/bot/deals/stages/"
_DEALS_LOGS_KEY         = "originus/bot/deals/logs/DEAL_AUDIT_LOG.v1.json"
_DEALS_USER_INDEX_PREFIX = "originus/bot/deals/user_index/"

# ---------------------------------------------------------------------------
# Deal stage pipeline — 15 controlled states
# ---------------------------------------------------------------------------

STAGE_NEW               = "NEW"
STAGE_QUALIFYING        = "QUALIFYING"
STAGE_INTAKE_REQUESTED  = "INTAKE_REQUESTED"
STAGE_INTAKE_RECEIVED   = "INTAKE_RECEIVED"
STAGE_UNDER_REVIEW      = "UNDER_REVIEW"
STAGE_NDA_REQUIRED      = "NDA_REQUIRED"
STAGE_NDA_SENT          = "NDA_SENT"
STAGE_NDA_SIGNED        = "NDA_SIGNED"
STAGE_PACK_SHARED       = "PACK_SHARED"
STAGE_NEGOTIATION       = "NEGOTIATION"
STAGE_PILOT             = "PILOT"
STAGE_ACTIVE_DEAL       = "ACTIVE_DEAL"
STAGE_ON_HOLD           = "ON_HOLD"
STAGE_CLOSED_WON        = "CLOSED_WON"
STAGE_CLOSED_LOST       = "CLOSED_LOST"

ALL_STAGES = (
    STAGE_NEW, STAGE_QUALIFYING, STAGE_INTAKE_REQUESTED,
    STAGE_INTAKE_RECEIVED, STAGE_UNDER_REVIEW, STAGE_NDA_REQUIRED,
    STAGE_NDA_SENT, STAGE_NDA_SIGNED, STAGE_PACK_SHARED,
    STAGE_NEGOTIATION, STAGE_PILOT, STAGE_ACTIVE_DEAL,
    STAGE_ON_HOLD, STAGE_CLOSED_WON, STAGE_CLOSED_LOST,
)

# ---------------------------------------------------------------------------
# Qualification tiers
# ---------------------------------------------------------------------------

QUAL_INFORMATIONAL       = "informational"
QUAL_POTENTIAL_LEAD      = "potential_lead"
QUAL_QUALIFIED_LEAD      = "qualified_lead"
QUAL_ESCALATION_CANDIDATE = "escalation_candidate"

# ---------------------------------------------------------------------------
# Qualification scoring signals — per desk
# Strong signals are domain-specific vocabulary indicating real intent
# ---------------------------------------------------------------------------

_QUAL_SIGNALS: dict[str, frozenset] = {
    "oem": frozenset({
        "oem", "manufacturing", "manufacture", "factory", "supplier",
        "white label", "whitelabel", "supply chain", "production",
        "fabricat", "produce", "contract manufacturing", "original equipment",
        "private label", "batch", "minimum order", "moq",
    }),
    "licensing": frozenset({
        "license", "licensing", "rights", "royalty", "royalties",
        "intellectual property", "trademark", "patent", "brand rights",
        "usage rights", "distribution rights", "territory", "scope",
        "exclusiv", "sublicens", "adaptation", "derivative",
    }),
    "investor": frozenset({
        "invest", "investor", "investment", "fund", "funding", "capital",
        "equity", "stake", "shareholder", "venture", "vc",
        "due diligence", "term sheet", "valuation", "round",
        "series", "convertible", "safe", "note", "exit",
    }),
    "legal": frozenset({
        "nda", "contract", "counsel", "lawyer", "attorney",
        "litigation", "dispute", "compliance", "regulation",
        "gdpr", "jurisdiction", "court", "arbitration",
        "non-disclosure", "confidentiality", "legal review",
    }),
    "contact": frozenset({
        "contact", "reach", "email", "speak", "talk", "connect",
        "inquiry", "enquiry", "introduce", "introduction",
    }),
}

# Contact-action signals — needed for non-contact desks to fire intake
_ACTION_SIGNALS = frozenset({
    "interested", "want to", "we want", "we are", "looking to",
    "looking for", "would like", "partner", "partnership",
    "collaborate", "collaboration", "submit", "apply", "request",
    "proposal", "pitch", "engage", "get in touch", "follow up",
    "follow-up", "discuss", "schedule", "meet",
})

# Priority tiers per desk
_DESK_PRIORITY: dict[str, str] = {
    "investor": "high",
    "legal":    "high",
    "oem":      "medium",
    "licensing":"medium",
    "contact":  "low",
}

# Risk tiers per desk
_DESK_RISK: dict[str, str] = {
    "investor": "high",
    "legal":    "high",
    "oem":      "medium",
    "licensing":"medium",
    "contact":  "low",
}

# ---------------------------------------------------------------------------
# Deal strength tiers
# ---------------------------------------------------------------------------

DEAL_STRENGTH_STRONG   = "strong"
DEAL_STRENGTH_MODERATE = "moderate"
DEAL_STRENGTH_WEAK     = "weak"

# Keys in parsed intake_data that indicate entity name, volume, and timeline.
# Matches lowercased / snake_cased field names produced by parse_structured_reply.
_ENTITY_KEYS   = frozenset({
    "company", "organization", "fund", "entity", "name",
    "legal_entity", "registered_entity",
})
_VOLUME_KEYS   = frozenset({
    "moq", "ticket", "volume", "qty", "quantity", "amount",
    "investment", "order", "units", "size", "budget", "min_order",
})
_TIMELINE_KEYS = frozenset({
    "timeline", "quarter", "date", "start", "target", "when",
    "by", "delivery", "deadline", "expected_start",
})

# ---------------------------------------------------------------------------
# Next-action policy — deterministic per desk
# ---------------------------------------------------------------------------

_NEXT_ACTION: dict[str, str] = {
    "oem":      "request_manufacturing_profile",
    "licensing":"request_scope_territory_channels",
    "investor": "request_investor_profile",
    "legal":    "route_legal_review",
    "contact":  "request_contact_details",
}


def _next_action_for(desk: str, qualification: str) -> str:
    """Return the deterministic next action for a desk + qualification tier."""
    if qualification == QUAL_INFORMATIONAL:
        return "no_action_informational"
    return _NEXT_ACTION.get(desk, "request_contact_details")


# ---------------------------------------------------------------------------
# Qualification engine
# ---------------------------------------------------------------------------

def _count_signals(text: str, desk: str) -> int:
    """Count how many qualification signals from the desk set appear in text."""
    lower = text.lower()
    words = set(lower.split())
    signals = _QUAL_SIGNALS.get(desk, frozenset())
    word_hits = len(words & signals)
    phrase_hits = sum(1 for s in signals if " " in s and s in lower)
    return word_hits + phrase_hits


def _has_action_signal(text: str) -> bool:
    """True if text contains an action/request/engagement signal."""
    lower = text.lower()
    words = set(lower.split())
    return bool(words & _ACTION_SIGNALS) or any(
        phrase in lower for phrase in _ACTION_SIGNALS if " " in phrase
    )


def qualify(text: str, desk: str, risk_level: str) -> str:
    """
    Deterministic qualification engine.

    Rules:
      - No action signal present                      → informational
      - Action signal + high risk + score >= 1        → escalation_candidate
      - Action signal + score >= 2                    → qualified_lead
      - Action signal + score >= 1                    → potential_lead
      - Action signal + score == 0 (contact desk)     → potential_lead
      - Action signal + score == 0 (non-contact desk) → informational
    """
    has_action = _has_action_signal(text)
    if not has_action:
        return QUAL_INFORMATIONAL

    score = _count_signals(text, desk)

    if risk_level in ("high",) and score >= 1:
        return QUAL_ESCALATION_CANDIDATE

    if score >= 2:
        return QUAL_QUALIFIED_LEAD

    if score >= 1:
        return QUAL_POTENTIAL_LEAD

    # Action signal present but no domain-specific signals scored.
    # Any desk: an action signal (interest/request/engagement language) is
    # sufficient to classify as at least a potential lead — the user is
    # expressing intent, even without explicit domain vocabulary.
    return QUAL_POTENTIAL_LEAD


def assign_stage(qualification: str) -> str:
    """Map qualification tier → initial pipeline stage."""
    return {
        QUAL_INFORMATIONAL:        STAGE_NEW,
        QUAL_POTENTIAL_LEAD:       STAGE_NEW,
        QUAL_QUALIFIED_LEAD:       STAGE_QUALIFYING,
        QUAL_ESCALATION_CANDIDATE: STAGE_INTAKE_REQUESTED,
    }.get(qualification, STAGE_NEW)


def score_deal_strength(intake_data: dict, qualification: str) -> str:
    """
    Score deal strength from parsed intake fields and qualification tier.

    Criteria (each contributes 1 point):
      - has_entity:   intake_data contains a company / organization / fund / entity key
      - has_volume:   intake_data contains a MOQ / ticket / investment / volume key
      - has_timeline: intake_data contains a timeline / quarter / date / target key
      - has_intent:   qualification is qualified_lead or escalation_candidate

    Scoring:
      3–4 criteria → strong
      2   criteria → moderate
      0–1 criteria → weak
    """
    keys = set(intake_data.keys())
    has_entity   = bool(keys & _ENTITY_KEYS)
    has_volume   = bool(keys & _VOLUME_KEYS)
    has_timeline = bool(keys & _TIMELINE_KEYS)
    has_intent   = qualification in (QUAL_QUALIFIED_LEAD, QUAL_ESCALATION_CANDIDATE)
    score = sum([has_entity, has_volume, has_timeline, has_intent])
    if score >= 3:
        return DEAL_STRENGTH_STRONG
    if score >= 2:
        return DEAL_STRENGTH_MODERATE
    return DEAL_STRENGTH_WEAK


# ---------------------------------------------------------------------------
# Lead record schema factory
# ---------------------------------------------------------------------------

def build_lead_record(
    user_id: int,
    username: Optional[str],
    text: str,
    desk: str,
    intent: str,
    access_level: str,
    message_id: Optional[str] = None,
    channel: str = "telegram_bot",
) -> dict:
    """
    Build a canonical 17-field lead record.
    No message body content stored — signal summary only (first 80 chars).
    Posture: SILENT_UNTIL_REQUESTED, auto_reply: False, human_review: True.
    """
    lead_id    = f"LEAD-{uuid.uuid4().hex[:12].upper()}"
    now        = datetime.now(timezone.utc).isoformat(timespec="seconds")
    risk_level = _DESK_RISK.get(desk, "low")
    priority   = _DESK_PRIORITY.get(desk, "low")
    message_id = message_id or f"MSG-{uuid.uuid4().hex[:12].upper()}"
    qualification = qualify(text, desk, risk_level)
    stage      = assign_stage(qualification)
    next_action = _next_action_for(desk, qualification)

    return {
        "lead_id":          lead_id,
        "source":           "telegram_bot",
        "channel":          channel,
        "message_id":       message_id,
        "desk":             desk,
        "intent":           intent,
        "classification":   qualification,
        "priority":         priority,
        "risk_level":       risk_level,
        "access_level":     access_level,
        "contact_identity": username or f"user_{user_id}",
        "signal_summary":   (text or "")[:80],
        "status":           stage,
        "next_action":      next_action,
        "human_review":     True,
        "created_at":       now,
        "updated_at":       now,
    }


# ---------------------------------------------------------------------------
# R2 persistence
# ---------------------------------------------------------------------------

async def write_lead(record: dict) -> bool:
    """
    Write lead record to originus/bot/deals/intake/{lead_id}.json
    Append a slim entry to the audit log.
    Returns True on success.
    """
    from bot.services.r2_service import put_json, append_log_entry

    lead_id = record.get("lead_id", "UNKNOWN")
    key = f"{_DEALS_INTAKE_PREFIX}{lead_id}.json"

    try:
        ok = await put_json(key, record)
        if ok:
            logger.info(
                "Deal lead written: %s desk=%s stage=%s qualification=%s",
                lead_id, record.get("desk"), record.get("status"),
                record.get("classification"),
            )
            # Append slim entry to audit log (best-effort)
            audit_entry = {
                "lead_id":        lead_id,
                "desk":           record.get("desk"),
                "classification": record.get("classification"),
                "status":         record.get("status"),
                "next_action":    record.get("next_action"),
                "created_at":     record.get("created_at"),
            }
            await append_log_entry(_DEALS_LOGS_KEY, audit_entry)
        else:
            logger.warning("Deal lead write returned falsy for %s", lead_id)
        return bool(ok)
    except Exception as exc:
        logger.error("Deal lead write failed for %s: %s", lead_id, exc)
        return False


async def read_lead(lead_id: str) -> Optional[dict]:
    """Read a lead record from R2. Returns None if not found."""
    from bot.services.r2_service import get_json
    return await get_json(f"{_DEALS_INTAKE_PREFIX}{lead_id}.json")


async def write_stage_log(lead_id: str, from_stage: str, to_stage: str,
                          actor: str = "bot") -> bool:
    """Append a stage transition event to originus/bot/deals/stages/{lead_id}_stages.json"""
    from bot.services.r2_service import append_log_entry
    key = f"{_DEALS_STAGES_PREFIX}{lead_id}_stages.json"
    entry = {
        "lead_id":    lead_id,
        "from_stage": from_stage,
        "to_stage":   to_stage,
        "actor":      actor,
        "timestamp":  datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    try:
        return await append_log_entry(key, entry)
    except Exception as exc:
        logger.warning("Stage log write failed for %s: %s", lead_id, exc)
        return False


# ---------------------------------------------------------------------------
# Main entry point — called from freetext handler as non-blocking task
# ---------------------------------------------------------------------------

async def _write_user_index(user_id: int, lead_id: str, desk: str) -> None:
    """Write/update user index for quick lead lookup by user_id (best-effort)."""
    from bot.services.r2_service import put_json
    key = f"{_DEALS_USER_INDEX_PREFIX}{user_id}.json"
    entry = {
        "user_id":        user_id,
        "latest_lead_id": lead_id,
        "desk":           desk,
        "updated_at":     datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    try:
        await put_json(key, entry)
    except Exception as exc:
        logger.warning("User index write failed for user_id=%s: %s", user_id, exc)


async def get_latest_lead_for_user(user_id: int) -> Optional[dict]:
    """Look up user's most recent lead via user index, then read the lead record."""
    from bot.services.r2_service import get_json
    try:
        index = await get_json(f"{_DEALS_USER_INDEX_PREFIX}{user_id}.json")
        if not index:
            return None
        lead_id = index.get("latest_lead_id")
        if not lead_id:
            return None
        return await read_lead(lead_id)
    except Exception as exc:
        logger.warning("get_latest_lead_for_user failed for user_id=%s: %s", user_id, exc)
        return None


async def create_lead(
    user_id: int,
    username: Optional[str],
    text: str,
    desk: str,
    intent: str,
    access_level: str,
    message_id: Optional[str] = None,
    channel: str = "telegram_bot",
) -> Optional[dict]:
    """
    Full deal-flow pipeline for a single inbound message:
      1. Build canonical 17-field lead record
      2. Qualify (deterministic scoring)
      3. Assign stage
      4. Write to R2 originus/bot/deals/intake/
      5. Append to audit log
      6. Update user index for future intake-reply lookup
      7. Return lead record dict (or None on failure)

    Never raises. Never modifies response to user.
    Posture: SILENT_UNTIL_REQUESTED.
    """
    try:
        record = build_lead_record(
            user_id=user_id,
            username=username,
            text=text,
            desk=desk,
            intent=intent,
            access_level=access_level,
            message_id=message_id,
            channel=channel,
        )
        ok = await write_lead(record)
        if not ok:
            logger.warning("create_lead: write_lead returned False for user_id=%s", user_id)
            return None
        await _write_user_index(user_id, record["lead_id"], record["desk"])
        return record
    except Exception as exc:
        logger.error("create_lead: unhandled error for user_id=%s: %s", user_id, exc)
        return None


# ---------------------------------------------------------------------------
# Response templates — active conversion (desk-specific)
# ---------------------------------------------------------------------------

DESK_INTAKE_TEMPLATES: dict[str, str] = {
    "oem": (
        "To assess OEM partnership fit, submit the following:\n\n"
        "Company: [legal entity name]\n"
        "Country: [country of registration]\n"
        "Sector: [product category]\n"
        "MOQ: [minimum order quantity]\n"
        "Timeline: [expected start quarter]\n\n"
        "Reply with all fields in this format. "
        "Your submission will be reviewed by the OEM desk."
    ),
    "licensing": (
        "To assess licensing scope, submit the following:\n\n"
        "Organization: [legal entity name]\n"
        "Territory: [region or country]\n"
        "Channels: [retail / wholesale / digital / other]\n"
        "Type: [exclusive / non-exclusive]\n"
        "Use: [intended application of the rights]\n\n"
        "Reply with all fields in this format. "
        "Your submission will be reviewed by the Licensing desk."
    ),
    "investor": (
        "To advance investor qualification, submit the following:\n\n"
        "Fund: [fund or entity name]\n"
        "Type: [VC / PE / family office / angel / other]\n"
        "Stage: [pre-seed / seed / series A / growth / other]\n"
        "Ticket: [minimum investment range]\n"
        "Geography: [primary investment geography]\n\n"
        "Reply with all fields in this format. "
        "Your submission will be reviewed by the Investor Relations desk."
    ),
    "legal": (
        "For legal and compliance matters, submit the following:\n\n"
        "Organization: [requesting entity]\n"
        "Matter: [NDA / contract review / compliance / dispute / other]\n"
        "Jurisdiction: [applicable jurisdiction]\n"
        "Contact: [authorized signatory name]\n\n"
        "Reply with all fields in this format. "
        "Your request will be routed to the Legal desk."
    ),
}

_DESK_SOFT_PROMPTS: dict[str, str] = {
    "oem": (
        "If you are exploring an OEM arrangement, you may submit basic details "
        "— company name, sector, and approximate order volumes — "
        "and the OEM desk will follow up accordingly."
    ),
    "licensing": (
        "If you have a specific licensing inquiry, providing your organization "
        "name and the territory of interest will help route your inquiry correctly."
    ),
    "investor": (
        "If you would like to explore investment opportunities, "
        "a brief note on your fund type and focus area will help us respond appropriately."
    ),
    "legal": (
        "If you have a specific legal or compliance matter to raise, "
        "please indicate your organization and the nature of the matter "
        "so it can be routed to the appropriate desk."
    ),
    "contact": (
        "To direct your inquiry, please share your name and the matter you wish to discuss."
    ),
}

NDA_MESSAGE = (
    "This inquiry requires a Non-Disclosure Agreement before further disclosure.\n\n"
    "To proceed:\n"
    "1. Confirm your legal entity name and jurisdiction.\n"
    "2. A draft NDA will be prepared for your review.\n"
    "3. No materials will be shared prior to execution.\n\n"
    "Submit your entity details to: legal@sentinelfortune.com\n"
    "Reference your inquiry in the subject line."
)

# ---------------------------------------------------------------------------
# NDA trigger
# ---------------------------------------------------------------------------

_NDA_DESKS = frozenset({"oem", "licensing", "investor"})


def check_nda_required(lead: dict) -> bool:
    """
    Return True if NDA should be triggered for this lead.

    Conditions (any one is sufficient):
      1. classification = escalation_candidate (always → NDA)
      2. deal_strength = strong (high-quality, committed lead → NDA)
      3. status = INTAKE_RECEIVED and desk in (oem, licensing, investor)
         (any structured intake from a commercial desk → NDA)
    """
    if lead.get("classification") == QUAL_ESCALATION_CANDIDATE:
        return True
    if lead.get("deal_strength") == DEAL_STRENGTH_STRONG:
        return True
    if lead.get("status") == STAGE_INTAKE_RECEIVED and lead.get("desk") in _NDA_DESKS:
        return True
    return False


# ---------------------------------------------------------------------------
# Response policy — maps qualification tier to outbound message
# ---------------------------------------------------------------------------

def deal_response_for_message(text: str, desk: str, risk_level: str) -> Optional[str]:
    """
    Pure function — no I/O.
    Returns the deal-flow addon message for a given message, or None if
    qualification = informational (no active conversion action needed).

    Policy:
      informational        → None (no action)
      potential_lead       → soft prompt (desk-specific)
      qualified_lead       → structured intake template (desk-specific)
      escalation_candidate → NDA request message
    """
    qualification = qualify(text, desk, risk_level)
    if qualification == QUAL_INFORMATIONAL:
        return None
    if qualification == QUAL_POTENTIAL_LEAD:
        return _DESK_SOFT_PROMPTS.get(desk)
    if qualification == QUAL_QUALIFIED_LEAD:
        return DESK_INTAKE_TEMPLATES.get(desk)
    if qualification == QUAL_ESCALATION_CANDIDATE:
        return NDA_MESSAGE
    return None


# ---------------------------------------------------------------------------
# Structured intake reply parser
# ---------------------------------------------------------------------------

_STRUCTURED_FIELD_RE = re.compile(r"^[\w][\w\s]{0,30}:\s*.+", re.MULTILINE)


def parse_structured_reply(text: str) -> Optional[dict]:
    """
    Detect and parse a structured intake reply (Key: Value format).
    Returns a dict of extracted fields if ≥2 field lines are detected,
    otherwise None (plain message — not a structured reply).

    Example structured reply:
        Company: Acme Corp
        Country: France
        Sector: apparel
        MOQ: 2000 units
        Timeline: Q4 2026
    """
    if not text or len(_STRUCTURED_FIELD_RE.findall(text)) < 2:
        return None
    fields: dict = {}
    for line in text.splitlines():
        m = re.match(r"^([\w][\w\s]{0,30}):\s*(.+)", line.strip())
        if m:
            key = m.group(1).strip().lower().replace(" ", "_")
            fields[key] = m.group(2).strip()
    return fields if len(fields) >= 2 else None


# ---------------------------------------------------------------------------
# Lead enrichment — intake reply → R2 update
# ---------------------------------------------------------------------------

async def enrich_lead_from_reply(lead_id: str, parsed_fields: dict) -> Optional[dict]:
    """
    Enrich an existing lead record with structured intake fields.

    Transitions:
      1. Stores intake_data (parsed key/value dict)
      2. Scores deal_strength (weak / moderate / strong) from intake fields
         and classification tier.
      3. Advances status → INTAKE_RECEIVED, then runs NDA check.
         NDA triggers when:
           - classification = escalation_candidate, OR
           - deal_strength = strong, OR
           - desk in (oem, licensing, investor)
         If NDA required: status → NDA_REQUIRED, next_action → request_nda_details
         Otherwise:       status → UNDER_REVIEW,  next_action → route_to_review

    Returns updated lead dict, or None on failure.
    """
    from bot.services.r2_service import put_json

    try:
        lead = await read_lead(lead_id)
        if not lead:
            logger.warning("enrich_lead_from_reply: lead not found: %s", lead_id)
            return None

        from_stage    = lead.get("status", "UNKNOWN")
        qualification = lead.get("classification", QUAL_INFORMATIONAL)
        now           = datetime.now(timezone.utc).isoformat(timespec="seconds")

        lead["intake_data"]   = parsed_fields
        lead["deal_strength"] = score_deal_strength(parsed_fields, qualification)
        lead["status"]        = STAGE_INTAKE_RECEIVED
        lead["updated_at"]    = now

        if check_nda_required(lead):
            lead["status"]      = STAGE_NDA_REQUIRED
            lead["next_action"] = "request_nda_details"
        else:
            lead["status"]      = STAGE_UNDER_REVIEW
            lead["next_action"] = "route_to_review"

        key = f"{_DEALS_INTAKE_PREFIX}{lead_id}.json"
        ok = await put_json(key, lead)
        if ok:
            await write_stage_log(lead_id, from_stage, lead["status"], actor="intake_parser")
            logger.info(
                "Lead enriched: %s strength=%s status=%s next_action=%s",
                lead_id, lead["deal_strength"], lead["status"], lead["next_action"],
            )
            await append_audit_entry(lead_id, lead)
        return lead if ok else None
    except Exception as exc:
        logger.error("enrich_lead_from_reply failed for %s: %s", lead_id, exc)
        return None


async def append_audit_entry(lead_id: str, lead: dict) -> None:
    """Append a slim audit entry after lead enrichment (best-effort)."""
    from bot.services.r2_service import append_log_entry
    try:
        audit_entry = {
            "lead_id":      lead_id,
            "event":        "intake_received",
            "deal_strength": lead.get("deal_strength"),
            "status":       lead.get("status"),
            "next_action":  lead.get("next_action"),
            "timestamp":    datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        await append_log_entry(_DEALS_LOGS_KEY, audit_entry)
    except Exception as exc:
        logger.warning("append_audit_entry failed: %s", exc)


# ---------------------------------------------------------------------------
# NDA detail request template
# ---------------------------------------------------------------------------

NDA_DETAIL_REQUEST = (
    "To proceed with drafting your Non-Disclosure Agreement, "
    "please submit the following:\n\n"
    "Entity: [full legal entity name]\n"
    "Address: [registered address]\n"
    "Email: [authorized signatory email]\n\n"
    "Reply with all fields in this format. "
    "The NDA will be prepared and sent to the email address provided."
)

# ---------------------------------------------------------------------------
# Negotiation step template
# ---------------------------------------------------------------------------

NEGOTIATION_MESSAGE = (
    "Your documentation has been reviewed.\n\n"
    "Sentinel Fortune LLC is prepared to advance to the next stage.\n\n"
    "To proceed:\n"
    "1. A call or formal written proposal can be arranged.\n"
    "2. Indicate your preferred format: call or proposal.\n"
    "3. If selecting a call, provide a preferred time window.\n\n"
    "Respond to this message or reach us at: contact@sentinelfortune.com"
)

# ---------------------------------------------------------------------------
# Pack routing — desk-specific information packs
# ---------------------------------------------------------------------------

_DESK_PACKS: dict[str, str] = {
    "oem":       "OEM Partnership Pack",
    "licensing": "Licensing Scope Pack",
    "investor":  "Investor Information Memorandum",
    "legal":     "Legal & Compliance Reference Pack",
    "contact":   "General Information Pack",
}


def get_pack_for_desk(desk: str) -> str:
    """Return the information pack label for a given desk."""
    return _DESK_PACKS.get(desk, "Information Pack")


# ---------------------------------------------------------------------------
# Post-NDA flow — NDA_SIGNED → PACK_SHARED → NEGOTIATION
# ---------------------------------------------------------------------------

async def advance_nda_signed(lead_id: str) -> Optional[dict]:
    """
    Advance a lead from NDA_SIGNED → PACK_SHARED.

    Sets:
      - status       → PACK_SHARED
      - next_action  → send_relevant_pack
      - pack_assigned → desk-specific pack label

    Called when NDA execution is confirmed by human reviewer.
    Returns updated lead dict, or None on failure.
    """
    from bot.services.r2_service import put_json

    try:
        lead = await read_lead(lead_id)
        if not lead:
            logger.warning("advance_nda_signed: lead not found: %s", lead_id)
            return None

        from_stage = lead.get("status", "UNKNOWN")
        desk       = lead.get("desk", "contact")
        pack       = get_pack_for_desk(desk)
        now        = datetime.now(timezone.utc).isoformat(timespec="seconds")

        lead["status"]        = STAGE_PACK_SHARED
        lead["next_action"]   = "send_relevant_pack"
        lead["pack_assigned"] = pack
        lead["updated_at"]    = now

        key = f"{_DEALS_INTAKE_PREFIX}{lead_id}.json"
        ok = await put_json(key, lead)
        if ok:
            await write_stage_log(lead_id, from_stage, STAGE_PACK_SHARED, actor="nda_signed")
            logger.info("NDA signed → PACK_SHARED: %s pack=%s", lead_id, pack)
        return lead if ok else None
    except Exception as exc:
        logger.error("advance_nda_signed failed for %s: %s", lead_id, exc)
        return None


async def advance_pack_shared(lead_id: str) -> Optional[dict]:
    """
    Advance a lead from PACK_SHARED → NEGOTIATION.

    Sets:
      - status      → NEGOTIATION
      - next_action → propose_call_or_proposal

    Called after the information pack has been acknowledged / sent.
    Returns updated lead dict, or None on failure.
    """
    from bot.services.r2_service import put_json

    try:
        lead = await read_lead(lead_id)
        if not lead:
            logger.warning("advance_pack_shared: lead not found: %s", lead_id)
            return None

        from_stage = lead.get("status", "UNKNOWN")
        now        = datetime.now(timezone.utc).isoformat(timespec="seconds")

        lead["status"]      = STAGE_NEGOTIATION
        lead["next_action"] = "propose_call_or_proposal"
        lead["updated_at"]  = now

        key = f"{_DEALS_INTAKE_PREFIX}{lead_id}.json"
        ok = await put_json(key, lead)
        if ok:
            await write_stage_log(lead_id, from_stage, STAGE_NEGOTIATION, actor="pack_acknowledged")
            logger.info("Pack acknowledged → NEGOTIATION: %s", lead_id)
        return lead if ok else None
    except Exception as exc:
        logger.error("advance_pack_shared failed for %s: %s", lead_id, exc)
        return None
