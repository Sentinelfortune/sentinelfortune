"""
/status — query the user's current tier and delivery state via the API.

Calls GET /api/status/:id and formats the result for Telegram.
"""

import logging
import os

import aiohttp
from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

logger = logging.getLogger(__name__)
router = Router()

_API_BASE = os.environ.get("INTERNAL_API_BASE", "http://localhost:8080")

_TIER_LABELS = {
    "lite":      "Starter Lite — $2",
    "monthly":   "Monthly Reset — $25/mo",
    "starter":   "Starter Pack — $290",
    "pro":       "Pro Access — $1,900",
    "oem":       "OEM License — $7,500",
    "licensing": "Institutional License — $15,000",
}

_CHANNEL_LABELS = {
    "reset_v1":              "Reset Channel",
    "quick_access_v1":       "Quick Access",
    "teachings_vault_v1":    "Teachings Vault",
    "sentinel_engine_v1":    "Sentinel Engine",
    "sentinel_architect_v1": "Sentinel Architect",
}


async def _fetch_status(user_id: int) -> dict:
    url = f"{_API_BASE}/api/status/{user_id}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=8),
            ) as resp:
                if resp.content_type == "application/json":
                    return await resp.json()
                return {"ok": False, "status": resp.status}
    except Exception as exc:
        logger.warning("status API call failed uid=%s: %s", user_id, exc)
        return {"ok": False, "error": str(exc)}


def _format_status(data: dict) -> str:
    if not data.get("ok"):
        err = data.get("error", "")
        if "not found" in err.lower() or data.get("status") == 404:
            return (
                "<b>No record found.</b>\n\n"
                "You have not yet entered the system.\n"
                "Use /enter to register, or /buy to unlock a tier directly."
            )
        return (
            "<b>Status unavailable.</b>\n\n"
            "The system could not retrieve your record right now.\n"
            "Please try again in a moment."
        )

    tier         = data.get("tier", "—")
    delivered    = data.get("delivered", False)
    channel      = data.get("channel", "")
    updated_at   = (data.get("updated_at") or "")[:10]

    tier_label    = _TIER_LABELS.get(tier, tier.title() if tier else "None")
    channel_label = _CHANNEL_LABELS.get(channel, channel or "—")
    status_icon   = "✅" if delivered else "⏳"

    lines = [
        "<b>Sentinel Fortune — Account Status</b>\n",
        f"<b>Tier:</b>      {tier_label}",
        f"<b>Channel:</b>   {channel_label}",
        f"<b>Delivered:</b> {status_icon} {'Active' if delivered else 'Pending'}",
    ]
    if updated_at:
        lines.append(f"<b>Updated:</b>   {updated_at}")

    if not delivered and tier:
        lines.append(
            "\n<i>Your channel invite will be delivered here once payment is confirmed.</i>"
        )

    return "\n".join(lines)


def _status_keyboard(data: dict) -> InlineKeyboardMarkup | None:
    if not data.get("ok"):
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="Enter the System →", callback_data="enter_check_status"),
            InlineKeyboardButton(text="Buy a Tier →", callback_data="p3_tiers"),
        ]])
    delivered = data.get("delivered", False)
    if not delivered:
        return InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="Buy / Upgrade →", callback_data="p3_tiers"),
        ]])
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="Upgrade Tier →", callback_data="p3_tiers"),
        InlineKeyboardButton(text="Main Menu →", callback_data="p3_menu"),
    ]])


@router.message(Command("status"))
async def handle_status(message: Message) -> None:
    uid = message.from_user.id
    data = await _fetch_status(uid)
    text = _format_status(data)
    kb   = _status_keyboard(data)
    if kb:
        await message.answer(text, reply_markup=kb)
    else:
        await message.answer(text)


@router.callback_query(F.data == "enter_check_status")
async def cb_check_status(query: CallbackQuery) -> None:
    await query.answer()
    uid  = query.from_user.id
    data = await _fetch_status(uid)
    text = _format_status(data)
    kb   = _status_keyboard(data)
    if kb:
        await query.message.answer(text, reply_markup=kb)
    else:
        await query.message.answer(text)
