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
        checkout_url = result.get("checkout_url")
        tier         = result.get("tier")
        tier_labels  = {
            "lite": "Starter Lite ($2)", "monthly": "Monthly Reset ($25/mo)",
            "starter": "Starter Pack ($290)", "pro": "Pro Access ($1,900)",
            "oem": "OEM License ($7,500)", "licensing": "Institutional License ($15,000)",
        }
        tier_label = tier_labels.get(tier, (tier or "").title()) if tier else None

        inline_rows = []
        if checkout_url:
            label = f"Buy {tier_label} →" if tier_label else "Complete Purchase →"
            inline_rows.append([InlineKeyboardButton(text=label, url=checkout_url)])

        inline_rows.append([
            InlineKeyboardButton(text="My Status →", callback_data="enter_check_status"),
            InlineKeyboardButton(text="All Tiers →", callback_data="p3_tiers"),
        ])

        keyboard = InlineKeyboardMarkup(inline_keyboard=inline_rows)

        body = (
            "<b>Entry confirmed.</b>\n\n"
            "You are registered in the Sentinel Fortune system.\n\n"
        )
        if checkout_url and tier_label:
            body += f"Your recommended tier: <b>{tier_label}</b>\n"
            body += "Tap the button below to complete your purchase and receive channel access.\n"
        else:
            body += "Use /buy [tier] to generate your personalised payment link.\n"
        body += "\nUse /status at any time to check your tier and delivery state."

        await message.answer(body, reply_markup=keyboard)
    else:
        err = result.get("error", "Unknown error")
        logger.error("enter-system failed uid=%s err=%s", uid, err)
        await message.answer(
            "<b>Entry could not be completed right now.</b>\n\n"
            "The system may be temporarily unavailable.\n"
            "Please try again in a moment, or use /buy to proceed directly."
        )
