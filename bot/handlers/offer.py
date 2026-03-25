"""
/offer and /session command handlers — SentinelFortune Bot.

/offer  — 3-tier offer card with inline tap-to-pay buttons (Access / Engine / Architect)
          Logs offer impression to R2 as a non-blocking background task.
/session — Strategic Session entry point (unchanged).
"""

import asyncio
import logging
from datetime import datetime, timezone

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton

logger = logging.getLogger(__name__)
router = Router()

# ---------------------------------------------------------------------------
# Live offers — mirrors catalog_service.OFFERS (no import loop)
# ---------------------------------------------------------------------------

_OFFERS = [
    {
        "slug":        "access",
        "title":       "Sentinel Access",
        "price":       29,
        "url":         "https://www.paypal.com/ncp/payment/56BUAMDBSA8S4",
        "positioning": "Entry access to the Sentinel system.",
        "for":         "First-time engagement — structured entry point.",
    },
    {
        "slug":        "engine",
        "title":       "Sentinel Engine",
        "price":       97,
        "url":         "https://www.paypal.com/ncp/payment/EWCHBZS4YRTUN",
        "positioning": "Core operational version of the Sentinel system.",
        "for":         "Operators who need the full working layer.",
    },
    {
        "slug":        "architect",
        "title":       "Sentinel Architect",
        "price":       297,
        "url":         "https://www.paypal.com/ncp/payment/E77FW9BRX2EZ6",
        "positioning": "Premium strategic version for advanced use.",
        "for":         "Builders, deal operators, and advanced principals.",
    },
]

SESSION_LINK = "https://www.paypal.com/instantcommerce/checkout/DKW9ZRA2M4HKN"

# ---------------------------------------------------------------------------
# R2 impression logger — non-blocking, never raises
# ---------------------------------------------------------------------------

_IMPRESSIONS_PREFIX = "originus/bot/deals/offer_impressions/"


async def _log_offer_impression(user_id: int, username: str | None) -> None:
    try:
        from bot.services.r2_service import put_json
        now = datetime.now(timezone.utc)
        key = f"{_IMPRESSIONS_PREFIX}{user_id}_{now.strftime('%Y%m%dT%H%M%S')}.json"
        record = {
            "user_id":    user_id,
            "username":   username or f"user_{user_id}",
            "command":    "/offer",
            "offers_shown": [o["slug"] for o in _OFFERS],
            "viewed_at":  now.isoformat(),
            "source":     "telegram_bot",
        }
        ok = await put_json(key, record)
        if ok:
            logger.info("Offer impression logged: user_id=%s key=%s", user_id, key)
        else:
            logger.warning("Offer impression write returned falsy: key=%s", key)
    except Exception as exc:
        logger.warning("_log_offer_impression failed (non-blocking): %s", exc)


# ---------------------------------------------------------------------------
# Offer card builder
# ---------------------------------------------------------------------------

def _build_offer_card() -> tuple[str, InlineKeyboardMarkup]:
    lines = [
        "<b>Sentinel Fortune — Available Offers</b>",
        "",
    ]
    for o in _OFFERS:
        lines += [
            f"<b>{o['title']}  —  ${o['price']}</b>",
            f"{o['positioning']}",
            f"<i>{o['for']}</i>",
            "",
        ]
    lines += [
        "Tap a button below to go directly to payment.",
        "After payment, send <b>DONE</b> with your email or Telegram handle.",
    ]

    buttons = [
        [InlineKeyboardButton(
            text=f"{o['title']}  —  ${o['price']}",
            url=o["url"],
        )]
        for o in _OFFERS
    ]
    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)
    return "\n".join(lines), keyboard


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

@router.message(Command("offer"))
async def handle_offer(message: Message) -> None:
    text, keyboard = _build_offer_card()
    await message.answer(text, reply_markup=keyboard)

    # Log impression — non-blocking, never delays response
    user = message.from_user
    if user:
        asyncio.create_task(
            _log_offer_impression(user.id, user.username)
        )


@router.message(Command("session"))
async def handle_session(message: Message) -> None:
    text = (
        "<b>Strategic Session — Sentinel Fortune</b>\n\n"
        "The Strategic Session is the first paid entry point into Sentinel Fortune's "
        "structured engagement pathway. It is designed for founders, creators, and "
        "individuals who need clarity, structure, and direction — not general advice, "
        "not motivational content.\n\n"
        "<b>What the session addresses:</b>\n"
        "• Clarifying your current position and core objective\n"
        "• Identifying structural gaps or misalignments\n"
        "• Mapping a directional path forward in business, IP, or personal structure\n"
        "• Understanding whether and how Sentinel Fortune's directions apply\n\n"
        "This is a focused, paid session. It is not a free consultation.\n\n"
        "<b>To begin:</b>\n"
        f"{SESSION_LINK}\n\n"
        "Once payment is complete, reply <b>done</b> and include your name, "
        "your main objective, and a short description of what you need clarity or "
        "structure on. Sentinel Fortune will use that as the basis for the session."
    )
    await message.answer(text)
