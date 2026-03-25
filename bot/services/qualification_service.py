"""
Qualification session engine — SentinelFortune Bot.

Implements a 3-question stateful qualification flow per desk.
Sessions are stored in-memory (per user_id). No database required.

Desks: oem | licensing | investor | legal | contact (unknown)

Flow:
  1. start_session(user_id, desk) → intro + Q1
  2. advance_session(user_id, answer) → next question OR summary
  3. clear_session(user_id) → end session explicitly

Summary on completion includes structured answers + a single next-step line.
Lead enrichment (R2 write) is handled by the caller after completion.
"""

import logging
import random
import string
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Desk intro labels
# ---------------------------------------------------------------------------

_DESK_INTRO: dict[str, str] = {
    "oem":       "OEM Partnership Qualification",
    "licensing": "Licensing Inquiry",
    "investor":  "Investment Inquiry",
    "legal":     "Legal / NDA Request",
    "contact":   "General Inquiry",
}

# ---------------------------------------------------------------------------
# Per-desk questions: list of (answer_key, question_text)
# Max 3 per desk.
# ---------------------------------------------------------------------------

_DESK_QUESTIONS: dict[str, list[tuple[str, str]]] = {
    "oem": [
        ("company",     "Company name and country of registration?"),
        ("capability",  "Manufacturing capability — product category and production capacity?"),
        ("region",      "Target region for partnership?"),
    ],
    "licensing": [
        ("ip_type",   "Type of IP interest — brand, trademark, patent, or content rights?"),
        ("use",       "Intended use — territory and distribution channel?"),
        ("timeline",  "Expected timeline to execute?"),
    ],
    "investor": [
        ("capital",    "Capital range — minimum ticket size in USD?"),
        ("structure",  "Preferred structure — equity, debt, or hybrid?"),
        ("geography",  "Primary investment geography?"),
    ],
    "legal": [
        ("purpose",      "Purpose of the legal or NDA request?"),
        ("entity_type",  "Entity type — individual, company, fund, or institution?"),
        ("urgency",      "Urgency — immediate, within 30 days, or exploratory?"),
    ],
    "contact": [
        ("objective", "State your objective clearly."),
        ("entity",    "Organization or individual name?"),
        ("contact",   "Preferred contact method — email or call?"),
    ],
}

# ---------------------------------------------------------------------------
# Desk reference ID prefixes
# Format: {PREFIX}-{YYYYMMDD}-{4 random uppercase alphanum}
# ---------------------------------------------------------------------------

_DESK_PREFIX: dict[str, str] = {
    "oem":       "OEM",
    "licensing": "LIC",
    "investor":  "INV",
    "legal":     "LEG",
    "contact":   "CON",
}

# ---------------------------------------------------------------------------
# Structured next-step responses on completion
# ---------------------------------------------------------------------------

_NEXT_STEP: dict[str, str] = {
    "oem": (
        "Submission routed to the OEM desk.\n"
        "Retain your reference ID for all follow-up correspondence."
    ),
    "licensing": (
        "Licensing inquiry logged.\n"
        "The Licensing desk will respond within 3–5 business days."
    ),
    "investor": (
        "Investment inquiry received.\n"
        "Investor Relations will follow up pending initial review."
    ),
    "legal": (
        "Legal request registered.\n"
        "Legal desk will respond within 2 business days."
    ),
    "contact": (
        "Inquiry logged and routed.\n"
        "You will be contacted once reviewed."
    ),
}

# Human-readable field labels for the completion summary
_FIELD_LABELS: dict[str, str] = {
    "company":     "Company",
    "capability":  "Capability",
    "region":      "Region",
    "ip_type":     "IP type",
    "use":         "Intended use",
    "timeline":    "Timeline",
    "capital":     "Capital range",
    "structure":   "Structure",
    "geography":   "Geography",
    "purpose":     "Purpose",
    "entity_type": "Entity type",
    "urgency":     "Urgency",
    "objective":   "Objective",
    "entity":      "Entity",
    "contact":     "Contact",
}


# ---------------------------------------------------------------------------
# Session dataclass
# ---------------------------------------------------------------------------

@dataclass
class QualSession:
    user_id:  int
    desk:     str
    step:     int            = 0
    answers:  dict           = field(default_factory=dict)
    lead_id:  Optional[str]  = None

    @property
    def questions(self) -> list[tuple[str, str]]:
        return _DESK_QUESTIONS.get(self.desk, _DESK_QUESTIONS["contact"])

    @property
    def total(self) -> int:
        return len(self.questions)

    @property
    def is_complete(self) -> bool:
        return self.step >= self.total

    @property
    def current_question_text(self) -> Optional[str]:
        if self.is_complete:
            return None
        _, q = self.questions[self.step]
        return f"Q{self.step + 1}/{self.total} — {q}"


# ---------------------------------------------------------------------------
# In-memory session store
# ---------------------------------------------------------------------------

_sessions: dict[int, QualSession] = {}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_session(user_id: int) -> Optional[QualSession]:
    """Return the active session for this user, or None."""
    return _sessions.get(user_id)


def start_session(user_id: int, desk: str, lead_id: Optional[str] = None) -> str:
    """
    Start a new qualification session for user_id.
    Overwrites any existing session.
    Returns the intro header + first question text.
    """
    session = QualSession(user_id=user_id, desk=desk, lead_id=lead_id)
    _sessions[user_id] = session
    intro = _DESK_INTRO.get(desk, "Qualification")
    q = session.current_question_text
    logger.info("Qual session started: user_id=%s desk=%s", user_id, desk)
    return f"— {intro} —\n\n{q}"


def advance_session(
    user_id: int,
    answer: str,
) -> tuple[str, bool, Optional[dict]]:
    """
    Record the user's answer to the current question and advance.

    Returns:
        (message, is_complete, answers)
        - message: next question text, or completion summary
        - is_complete: True when all questions answered
        - answers: full answers dict when complete, else None
    """
    session = _sessions.get(user_id)
    if not session:
        return ("No active qualification.", False, None)

    key, _ = session.questions[session.step]
    session.answers[key] = answer.strip()
    session.step += 1

    if session.is_complete:
        ref_id  = _generate_ref_id(session.desk)
        summary = _build_summary(session, ref_id)
        answers = dict(session.answers)
        # Private keys for caller use only — stripped before lead enrichment
        answers["_ref_id"] = ref_id
        answers["_desk"]   = session.desk
        desk    = session.desk
        lead_id = session.lead_id
        _sessions.pop(user_id, None)
        logger.info(
            "Qual session complete: user_id=%s desk=%s ref_id=%s lead_id=%s",
            user_id, desk, ref_id, lead_id,
        )
        return (summary, True, answers)

    return (session.current_question_text, False, None)


def clear_session(user_id: int) -> None:
    """Explicitly terminate a session (e.g. user sends /start or /cancel)."""
    _sessions.pop(user_id, None)


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------

def _generate_ref_id(desk: str) -> str:
    """
    Generate a short reference ID for a completed qualification session.
    Format: {PREFIX}-{YYYYMMDD}-{4 random uppercase alphanum}
    Example: OEM-20260320-AB12
    """
    prefix   = _DESK_PREFIX.get(desk, "CON")
    datestamp = date.today().strftime("%Y%m%d")
    suffix   = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"{prefix}-{datestamp}-{suffix}"


def _build_summary(session: QualSession, ref_id: str) -> str:
    lines = [f"— {_DESK_INTRO.get(session.desk, 'Summary')} — Complete\n"]
    for key, val in session.answers.items():
        label = _FIELD_LABELS.get(key, key.replace("_", " ").capitalize())
        lines.append(f"{label}: {val}")
    lines.append("")
    lines.append(_NEXT_STEP.get(session.desk, _NEXT_STEP["contact"]))
    lines.append(f"\nRef: {ref_id}")
    return "\n".join(lines)
