from enum import Enum


class MessageCategory(str, Enum):
    ABOUT = "about"
    BUSINESS = "business"
    TEACHINGS = "teachings"
    CREATIVE = "creative"
    LICENSING = "licensing"
    PLATFORMS = "platforms"
    GENERAL = "general"


KEYWORDS: dict[MessageCategory, list[str]] = {
    MessageCategory.ABOUT: [
        "what is sentinel fortune",
        "tell me about sentinel fortune",
        "about sentinel fortune",
        "sentinel fortune",
        "what do you do",
        "what is this",
        "what is this platform",
        "what is this bot",
        "who are you",
        "overview",
        "about",
        "introduce",
        "introduction",
        "what does this do",
        "what does sentinel",
        "explain sentinel",
    ],
    MessageCategory.BUSINESS: [
        "business", "strategy", "partnership", "oem", "white label", "whitelabel",
        "collaboration", "venture", "market", "advisory", "investment",
        "company", "enterprise", "b2b", "governance", "approvals", "audit",
        "distribution", "manufacturing", "operating model", "asset-light",
        "controlled scale", "reporting",
    ],
    MessageCategory.TEACHINGS: [
        "teach", "teaching", "learn", "principle", "framework", "clarity",
        "guidance", "wisdom", "decision", "mindset", "reflection", "model",
        "thinking", "philosophy", "understand", "explain", "sop", "skills",
        "institutional pathway",
    ],
    MessageCategory.CREATIVE: [
        "game", "games", "media", "story", "narrative", "world", "creative",
        "film", "animation", "character", "universe", "design", "art",
        "fiction", "production", "content",
    ],
    MessageCategory.LICENSING: [
        "license", "licensing", "ip", "intellectual property", "rights",
        "patent", "trademark", "royalty", "copyright", "agreement", "contract",
        "use rights", "nda", "territory", "business rights",
    ],
    MessageCategory.PLATFORMS: [
        "platform", "system", "software", "ai", "tool", "infrastructure",
        "api", "integration", "saas", "app", "application", "technology",
        "automation", "intelligent", "ecosystem",
    ],
}

# Phrases matched exactly before keyword scoring (highest priority)
EXACT_PHRASES: list[tuple[str, MessageCategory]] = [
    ("what is sentinel fortune", MessageCategory.ABOUT),
    ("tell me about sentinel fortune", MessageCategory.ABOUT),
    ("about sentinel fortune", MessageCategory.ABOUT),
    ("what do you do", MessageCategory.ABOUT),
    ("what is this platform", MessageCategory.ABOUT),
    ("what is this bot", MessageCategory.ABOUT),
    ("who are you", MessageCategory.ABOUT),
    ("what is this", MessageCategory.ABOUT),
]


def classify(text: str) -> MessageCategory:
    normalised = text.lower().strip()

    for phrase, category in EXACT_PHRASES:
        if phrase in normalised:
            return category

    scores: dict[MessageCategory, int] = {cat: 0 for cat in MessageCategory}

    for category, keywords in KEYWORDS.items():
        for kw in keywords:
            if kw in normalised:
                scores[category] += 1

    best = max(scores, key=lambda c: scores[c])
    if scores[best] == 0:
        return MessageCategory.GENERAL
    return best
