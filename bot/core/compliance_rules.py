"""
Sentinel Fortune LLC — Institutional Compliance Rules

Applies to all AI-generated text outputs.
Does NOT apply to static bot responses (menus, confirmations, catalog).
"""

import re
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Risky phrase → neutral replacement
# Each tuple: (regex pattern, replacement string)
# Ordered most-specific to least-specific.
# ---------------------------------------------------------------------------

_REPLACEMENTS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"you(?:'ll| will) make money", re.IGNORECASE),
     "you can generate structured value"),

    (re.compile(r"you(?:'ll| will) earn", re.IGNORECASE),
     "you can build positioned value"),

    (re.compile(r"\bguaranteed returns?\b", re.IGNORECASE),
     "structured positioning"),

    (re.compile(r"\bguaranteed results?\b", re.IGNORECASE),
     "structured application"),

    (re.compile(r"\bguaranteed income\b", re.IGNORECASE),
     "structured income model"),

    (re.compile(r"\bguaranteed\b", re.IGNORECASE),
     "designed for"),

    (re.compile(r"\bno[- ]risk\b", re.IGNORECASE),
     "controlled and structured"),

    (re.compile(r"\bsafe returns?\b", re.IGNORECASE),
     "structured positioning"),

    (re.compile(r"\bmake money\b", re.IGNORECASE),
     "generate structured value"),

    (re.compile(r"\bearn money\b", re.IGNORECASE),
     "build structured value"),

    (re.compile(r"\bfinancial advice\b", re.IGNORECASE),
     "financial information"),

    (re.compile(r"\blegal advice\b", re.IGNORECASE),
     "legal information"),

    (re.compile(r"\bmedical advice\b", re.IGNORECASE),
     "general guidance"),
]

# ---------------------------------------------------------------------------
# Auto-disclaimer
# Appended when output is substantive AND mentions relevant topics.
# ---------------------------------------------------------------------------

_DISCLAIMER = (
    "\n\n<i>This system provides structured tools and does not guarantee outcomes or results.</i>"
)

_DISCLAIMER_MIN_LENGTH = 280

_DISCLAIMER_TRIGGERS: frozenset[str] = frozenset({
    "monetiz", "business", "strateg", "product", "offer",
    "revenue", "sell", "income", "asset", "market",
    "commercial", "launch", "pric", "invest", "fund",
})


def needs_disclaimer(text: str) -> bool:
    """Return True when the text is long enough and touches a relevant topic."""
    if len(text) < _DISCLAIMER_MIN_LENGTH:
        return False
    lower = text.lower()
    return any(trigger in lower for trigger in _DISCLAIMER_TRIGGERS)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def sanitize_output(text: str) -> str:
    """
    Apply all compliance replacements to AI-generated text.
    Appends a light disclaimer when the content is monetization / strategy related.
    Returns the cleaned text.
    """
    if not text:
        return text

    changed = False
    result = text
    for pattern, replacement in _REPLACEMENTS:
        new = pattern.sub(replacement, result)
        if new != result:
            changed = True
            result = new

    if changed:
        logger.debug("Compliance filter applied changes to output.")

    if needs_disclaimer(result) and _DISCLAIMER not in result:
        result += _DISCLAIMER

    return result
