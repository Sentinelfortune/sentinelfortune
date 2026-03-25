"""
/buy [tier] — generate a Stripe payment link with client_reference_id embedded.

Tier slugs: lite | monthly | starter | pro | oem | licensing
Other slugs fall through to the legacy catalog system.
"""

import asyncio
import logging

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

from bot.services.sales_flow import (
    TIER_LABELS,
    VALID_TIERS,
    build_buy_url,
    get_tier_base_url,
    log_click,
)
from bot.services.catalog_service import (
    format_offer_block,
    get_all_offers_live,
    get_offer_live,
)
from bot.services.delivery_service import set_buy_context

logger = logging.getLogger(__name__)
router = Router()


# ---------------------------------------------------------------------------
# Tier-specific pre-purchase copy
# ---------------------------------------------------------------------------

_TIER_COPY: dict[str, str] = {
    "lite": (
        "<b>Starter Lite — $2</b>\n\n"
        "First entry into the execution layer.\n\n"
        "This is not a trial. This is access.\n"
        "Lite opens the same channel as the Starter tier — "
        "the Teachings Vault — at the lowest entry point.\n\n"
        "Access is delivered to this chat automatically after payment."
    ),
    "monthly": (
        "<b>Monthly Reset — $25/mo</b>\n\n"
        "Continuity tier. Built for sustained operation.\n\n"
        "Unlocks the Reset Channel and Quick Access systems.\n"
        "Recurring structure for people who run the engine every month.\n\n"
        "Access is delivered to this chat automatically after payment."
    ),
    "starter": (
        "<b>Starter Pack — $290</b>\n\n"
        "Core access tier. Teachings Vault.\n\n"
        "This is where the structured content lives.\n"
        "One payment. Full Vault access. No expiry.\n\n"
        "Access is delivered to this chat automatically after payment."
    ),
    "pro": (
        "<b>Pro Access — $1,900</b>\n\n"
        "Teachings Vault + Sentinel Engine.\n\n"
        "Layer 2 access. Revenue systems and active execution framework.\n"
        "For operators running structured income models.\n\n"
        "Access is delivered to this chat automatically after payment."
    ),
    "oem": (
        "<b>OEM License — $7,500</b>\n\n"
        "Vault + Engine + Sentinel Architect.\n\n"
        "Full Layer 2 and Layer 3 access.\n"
        "Includes structured onboarding and direct Sentinel Fortune contact.\n\n"
        "Access is delivered to this chat automatically after payment."
    ),
    "licensing": (
        "<b>Institutional License — $15,000</b>\n\n"
        "All tiers. IP licensing rights. Governance-level engagement.\n\n"
        "Full institutional and private framework access.\n"
        "A formal onboarding sequence is initiated separately.\n\n"
        "Access is delivered to this chat automatically after payment."
    ),
}

# Tier menu — short positioning line per tier
_TIER_MENU_LINES: dict[str, str] = {
    "lite":      "Starter Lite ($2) — entry activation",
    "monthly":   "Monthly ($25/mo) — continuity / reset",
    "starter":   "Starter ($290) — Teachings Vault",
    "pro":       "Pro ($1,900) — Vault + Sentinel Engine",
    "oem":       "OEM ($7,500) — Vault + Engine + Architect",
    "licensing": "Licensing ($15,000) — full institutional access",
}


# ---------------------------------------------------------------------------
# /buy [tier]
# ---------------------------------------------------------------------------

@router.message(Command("buy"))
async def handle_buy(message: Message) -> None:
    text  = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    slug  = parts[1].strip().lower() if len(parts) > 1 else ""
    uid   = message.from_user.id

    if slug in VALID_TIERS:
        await _send_tier_link(message, uid, slug)
        return

    if not slug:
        await _send_tier_menu(message, uid)
        return

    await _catalog_fallback(message, slug)


async def _send_tier_link(message: Message, uid: int, tier: str) -> None:
    url = build_buy_url(tier, uid)

    if not url:
        await message.answer(
            f"<b>{TIER_LABELS.get(tier, tier.title())}</b>\n\n"
            "Payment link for this tier is not yet configured.\n"
            "Contact the operator or try again shortly."
        )
        logger.warning("buy: no URL configured for tier=%s", tier)
        return

    asyncio.create_task(log_click(uid, tier))

    copy  = _TIER_COPY.get(tier, (
        f"<b>{TIER_LABELS.get(tier, tier.title())}</b>\n\n"
        "Your personalised purchase link is ready.\n"
        "Tap the button to complete your order.\n\n"
        "<i>Access is delivered automatically to this chat after payment.</i>"
    ))
    label = TIER_LABELS.get(tier, tier.title())

    await message.answer(
        copy,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text=f"Purchase {label} →", url=url)
        ]]),
    )
    logger.info("buy: link sent uid=%s tier=%s", uid, tier)


async def _send_tier_menu(message: Message, uid: int) -> None:
    tier_order = ["lite", "monthly", "starter", "pro", "oem", "licensing"]
    buttons    = []
    for tier in tier_order:
        url = build_buy_url(tier, uid)
        if url:
            buttons.append([InlineKeyboardButton(
                text=_TIER_MENU_LINES.get(tier, TIER_LABELS.get(tier, tier)),
                url=url,
            )])

    if buttons:
        await message.answer(
            "<b>Sentinel Fortune — Access Tiers</b>\n\n"
            "Lite is the first entry point.\n"
            "Each tier above it unlocks a deeper execution layer.\n\n"
            "Select your tier. Access is delivered automatically after payment.",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        )
    else:
        lines = [
            "<b>Sentinel Fortune — Access Tiers</b>\n",
            "Lite — entry activation:    /buy lite",
            "Monthly — continuity:        /buy monthly",
            "Starter — Teachings Vault:   /buy starter",
            "Pro — Vault + Engine:        /buy pro",
            "OEM — Vault + Engine + Arch: /buy oem",
            "Licensing — institutional:   /buy licensing",
        ]
        await message.answer("\n".join(lines))


async def _catalog_fallback(message: Message, slug: str) -> None:
    uid   = message.from_user.id
    offer = await get_offer_live(slug)
    if offer:
        set_buy_context(uid, offer.get("slug", slug))
        await message.answer(
            format_offer_block(offer)
            + f"\n\n{offer.get('delivery_note', 'After payment, send DONE with your email or Telegram handle.')}"
        )
        return

    all_offers  = await get_all_offers_live()
    catalog_slugs = ", ".join(o["slug"] for o in all_offers)
    await message.answer(
        f"Unknown option: <code>{slug}</code>\n\n"
        "Tier options: lite | monthly | starter | pro | oem | licensing\n"
        f"Catalog slugs: {catalog_slugs}\n\n"
        "Examples: /buy lite  /buy starter  /buy pro"
    )
