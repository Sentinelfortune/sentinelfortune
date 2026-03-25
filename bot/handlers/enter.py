"""
/enter — register the user in the system and confirm entry.

Calls POST /api/enter-system (internal API) then responds with confirmation.
"""

import logging
import os

import aiohttp
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

logger = logging.getLogger(__name__)
router = Router()

_API_BASE = os.environ.get("INTERNAL_API_BASE", "http://localhost:8080")


async def _call_enter(user_id: int) -> dict:
    url = f"{_API_BASE}/api/enter-system"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json={"user_id": str(user_id)},
                timeout=aiohttp.ClientTimeout(total=8),
            ) as resp:
                if resp.content_type == "application/json":
                    return await resp.json()
                return {"ok": resp.status < 400, "status": resp.status}
    except Exception as exc:
        logger.warning("enter API call failed uid=%s: %s", user_id, exc)
        return {"ok": False, "error": str(exc)}


@router.message(Command("enter"))
async def handle_enter(message: Message) -> None:
    uid = message.from_user.id

    await message.answer("⏳ Registering you in the system…")

    result = await _call_enter(uid)

    if result.get("ok"):
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="View My Status →",
                callback_data="enter_check_status",
            ),
            InlineKeyboardButton(
                text="Explore Tiers →",
                callback_data="p3_tiers",
            ),
        ]])
        await message.answer(
            "<b>Entry confirmed.</b>\n\n"
            "You are now registered in the Sentinel Fortune system.\n\n"
            "Use /status to check your current tier and delivery state.\n"
            "Use /buy to unlock a tier and receive channel access.",
            reply_markup=keyboard,
        )
    else:
        err = result.get("error", "Unknown error")
        logger.error("enter-system failed uid=%s err=%s", uid, err)
        await message.answer(
            "<b>Entry could not be completed right now.</b>\n\n"
            "The system may be temporarily unavailable.\n"
            "Please try again in a moment, or use /buy to proceed directly."
        )
