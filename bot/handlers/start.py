"""
/start — main entry point.

Routes:
  /start                     → onboarding sequence (Message 1)
  /start entry_{domain}_{tier} → deep-link from public site
  /start {other}             → main menu
"""

import asyncio
import logging

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

from bot.services.qualification_service import clear_session
from bot.handlers.money import main_menu_text, main_menu_keyboard
from bot.services.sales_flow import (
    build_buy_url,
    format_entry_message,
    log_lead,
    parse_entry_payload,
)

logger = logging.getLogger(__name__)
router = Router()


@router.message(CommandStart())
async def handle_start(message: Message) -> None:
    clear_session(message.from_user.id)

    raw_text = (message.text or "").strip()
    parts    = raw_text.split(maxsplit=1)
    payload  = parts[1].strip() if len(parts) > 1 else ""

    if payload.startswith("entry_"):
        await _handle_entry(message, payload)
        return

    if payload:
        # Any other deep-link payload → main menu
        await message.answer(main_menu_text(), reply_markup=main_menu_keyboard())
        return

    # Plain /start → onboarding sequence
    from bot.handlers.onboarding import send_welcome
    await send_welcome(message)


async def _handle_entry(message: Message, payload: str) -> None:
    uid    = message.from_user.id
    parsed = parse_entry_payload(payload)

    if not parsed:
        logger.warning("start: unrecognised entry payload=%s uid=%s", payload, uid)
        await message.answer(main_menu_text(), reply_markup=main_menu_keyboard())
        return

    slug  = parsed["slug"]
    tier  = parsed["tier"]
    label = parsed["label"]

    logger.info("start: site entry uid=%s source=%s tier=%s", uid, slug, tier)
    asyncio.create_task(log_lead(uid, slug, tier))

    buy_url = build_buy_url(tier, uid)

    if buy_url:
        from bot.services.sales_flow import TIER_LABELS
        tier_label = TIER_LABELS.get(tier, tier.title())
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text=f"Purchase {tier_label} →", url=buy_url)
        ]])
        await message.answer(format_entry_message(label, tier), reply_markup=keyboard)
    else:
        await message.answer(
            format_entry_message(label, tier)
            + f"\n\nUse <code>/buy {tier}</code> to get your purchase link."
        )
