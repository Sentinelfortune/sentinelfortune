import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Live offer catalog — in-memory fallback (used when R2 is unavailable)
# ---------------------------------------------------------------------------

OFFERS: list[dict] = [
    {
        "slug": "access",
        "title": "Sentinel Access",
        "price_usd": 29,
        "payment_url": "https://www.paypal.com/ncp/payment/56BUAMDBSA8S4",
        "short_positioning": "Entry access to the Sentinel system.",
        "recommended_for": "First-time users who want a simple entry point.",
        "delivery_note": "After payment, send DONE with your email or Telegram handle.",
    },
    {
        "slug": "engine",
        "title": "Sentinel Engine",
        "price_usd": 97,
        "payment_url": "https://www.paypal.com/ncp/payment/EWCHBZS4YRTUN",
        "short_positioning": "Core operational version of the Sentinel system.",
        "recommended_for": "Users who want the main working version.",
        "delivery_note": "After payment, send DONE with your email or Telegram handle.",
    },
    {
        "slug": "architect",
        "title": "Sentinel Architect",
        "price_usd": 297,
        "payment_url": "https://www.paypal.com/ncp/payment/E77FW9BRX2EZ6",
        "short_positioning": "Premium strategic version for advanced use.",
        "recommended_for": "Builders, operators, and advanced users.",
        "delivery_note": "After payment, send DONE with your email or Telegram handle.",
    },
]

_SLUG_INDEX: dict[str, dict] = {o["slug"]: o for o in OFFERS}


def get_all_offers() -> list[dict]:
    return OFFERS


def get_offer_by_slug(slug: str) -> Optional[dict]:
    return _SLUG_INDEX.get(slug.lower())


# ---------------------------------------------------------------------------
# Tier mapping — product framing → best matching offer
# ---------------------------------------------------------------------------

_ARCHITECT_KEYWORDS = {
    "premium", "strategic", "architect", "advanced", "comprehensive",
    "complete", "operator", "builder", "full", "enterprise",
}
_ACCESS_KEYWORDS = {
    "simple", "entry", "light", "short", "compact", "intro",
    "starter", "basic", "micro", "seed", "quick", "mini",
}
_HEAVY_TYPES = {"Bundle", "Bundle Concept", "Strategic Asset"}
_LIGHT_TYPES = {"Rhapsody", "Story", "Narrative Scene"}


def map_to_offer(
    product_type: str,
    content_length: int = 0,
    title: str = "",
    body: str = "",
) -> dict:
    combined = (title + " " + body[:300]).lower()

    if (
        any(kw in combined for kw in _ARCHITECT_KEYWORDS)
        or product_type in _HEAVY_TYPES
        or content_length > 2500
    ):
        return _SLUG_INDEX["architect"]

    if (
        product_type in _LIGHT_TYPES
        or content_length < 400
        or any(kw in combined for kw in _ACCESS_KEYWORDS)
    ):
        return _SLUG_INDEX["access"]

    return _SLUG_INDEX["engine"]


# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------

def format_offer_block(offer: dict) -> str:
    title = offer.get("title", "—")
    price = offer.get("price_usd", "—")
    # payment_url (in-memory schema) or paypal_url (R2 catalog schema)
    url = offer.get("payment_url") or offer.get("paypal_url", "—")
    # short_positioning (in-memory) may be absent in R2 catalog objects
    positioning = offer.get("short_positioning") or offer.get("tier", "").capitalize() + " tier"
    recommended = offer.get("recommended_for", "")
    block = f"<b>{title} — ${price}</b>\n{positioning}"
    if recommended:
        block += f"\nBest for: {recommended}"
    block += f"\nBuy:\n{url}"
    return block


def format_catalog_message(offers: Optional[list] = None) -> str:
    source = offers if offers is not None else OFFERS
    blocks = ["<b>Sentinel System — Offers</b>\n"]
    for i, offer in enumerate(source, 1):
        blocks.append(f"{i}. {format_offer_block(offer)}")
    blocks.append(
        "\nAfter payment, send <b>DONE</b> with your email or Telegram handle."
    )
    return "\n\n".join(blocks)


# ---------------------------------------------------------------------------
# Async R2-backed offer resolution (with in-memory fallback)
# ---------------------------------------------------------------------------

async def get_all_offers_live() -> list[dict]:
    """Return offer list from R2 catalog if available, else in-memory OFFERS."""
    try:
        from bot.services import canon_service
        catalog = await canon_service.get_product_catalog()
        if catalog and isinstance(catalog, list) and len(catalog) > 0:
            logger.debug("Catalog loaded from R2 (%d offers)", len(catalog))
            return catalog
    except Exception as e:
        logger.warning("R2 catalog fetch failed, using in-memory: %s", type(e).__name__)
    return OFFERS


async def get_offer_live(slug: str) -> Optional[dict]:
    """Resolve offer from R2 first, fallback to in-memory."""
    try:
        from bot.services import canon_service
        offer = await canon_service.get_offer_by_slug(slug)
        if offer:
            logger.debug("Offer '%s' loaded from R2", slug)
            return offer
    except Exception as e:
        logger.warning("R2 offer fetch failed for '%s', using in-memory: %s", slug, type(e).__name__)
    return _SLUG_INDEX.get(slug.lower())


# ---------------------------------------------------------------------------
# DONE response builder
# ---------------------------------------------------------------------------

def build_done_response(details: str) -> str:
    if details:
        return (
            "<b>Payment follow-up received.</b>\n\n"
            f"Contact on file: <code>{details}</code>\n\n"
            "Your request has been logged. Delivery will follow manually "
            "based on the purchased offer.\n\n"
            "If you have not yet specified the offer purchased "
            "(Access / Engine / Architect), please include that in your next message."
        )
    return (
        "<b>Payment follow-up received.</b>\n\n"
        "To complete your delivery request, please send:\n"
        "• Your payment email address\n"
        "• Or your Telegram handle\n"
        "• And the offer purchased: Access, Engine, or Architect\n\n"
        "Delivery is confirmed manually.\n\n"
        "<i>Example: done myemail@example.com Sentinel Engine</i>"
    )


def parse_done_details(text: str) -> str:
    cleaned = text.strip()
    lower = cleaned.lower()
    if lower.startswith("/done"):
        cleaned = cleaned[5:].strip()
    elif lower.startswith("done"):
        cleaned = cleaned[4:].strip()
    return cleaned
