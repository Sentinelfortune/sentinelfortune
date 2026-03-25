"""
Money Engine — public monetization flow.

/start + /menu → main menu (FREE ACCESS | PREMIUM ACCESS | WHAT IS INCLUDED)
/upgrade       → 5-tier pricing screen with payment URL buttons
p3_*           → all public callback flows

All callback_data prefixed with p3_ — no conflict with existing store_* flows.
Publish, AI content, and scheduler systems are untouched.
"""

import asyncio
import logging
import os

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

logger = logging.getLogger(__name__)
router = Router()

# ---------------------------------------------------------------------------
# Channel invite links
# ---------------------------------------------------------------------------

_FREE_LINKS = {
    "reset_v1":        "https://t.me/+TxavuR1J1tphOGY5",
    "quick_access_v1": "https://t.me/+kLqEl4_BUE83NjFh",
}

_PREMIUM_LINKS = {
    "teachings_vault_v1":    "https://t.me/+WNHBwWxk7ahjOTEx",
    "sentinel_engine_v1":    "https://t.me/+ECuJPOmfSwplNGIx",
    "sentinel_architect_v1": "https://t.me/+eqKVBpnzrmNmOWYx",
}

# ---------------------------------------------------------------------------
# Tier → env var mapping (order matters for display)
# ---------------------------------------------------------------------------

_TIER_BUTTONS: list[tuple[str, str, str]] = [
    ("GET ACCESS $25",    "PREMIUM_PAYMENT_URL",    "monthly"),
    ("STARTER $290",      "PAYMENT_LINK_STARTER",   "starter"),
    ("PRO $1900",         "PAYMENT_LINK_PRO",       "pro"),
    ("OEM $7500",         "PAYMENT_LINK_OEM",       "oem"),
    ("LICENSING $15000",  "PAYMENT_LINK_LICENSING",  "licensing"),
]


# ---------------------------------------------------------------------------
# Keyboard builders
# ---------------------------------------------------------------------------

def _back_kb() -> list[list[InlineKeyboardButton]]:
    return [[InlineKeyboardButton(text="BACK TO MENU", callback_data="p3_main")]]


def _main_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="FREE ACCESS",      callback_data="p3_free")],
        [InlineKeyboardButton(text="PREMIUM ACCESS",   callback_data="p3_premium")],
        [InlineKeyboardButton(text="WHAT IS INCLUDED", callback_data="p3_what_included")],
    ])


def _free_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="ENTER RESET",        url=_FREE_LINKS["reset_v1"])],
        [InlineKeyboardButton(text="ENTER QUICK ACCESS", url=_FREE_LINKS["quick_access_v1"])],
        *_back_kb(),
    ])


def _premium_offer_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="UPGRADE",          callback_data="p3_unlock")],
        [InlineKeyboardButton(text="WHAT IS INCLUDED", callback_data="p3_what_included")],
        *_back_kb(),
    ])


def _premium_what_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="UPGRADE", callback_data="p3_unlock")],
        *_back_kb(),
    ])


def _upgrade_kb() -> InlineKeyboardMarkup:
    """
    Builds the 5-tier pricing keyboard.
    Only includes tier buttons where the env var is set.
    CONFIRM PAYMENT and BACK TO MENU always appear.
    """
    rows: list[list[InlineKeyboardButton]] = []
    for label, env_key, _tier in _TIER_BUTTONS:
        url = os.environ.get(env_key, "").strip()
        if url:
            rows.append([InlineKeyboardButton(text=label, url=url)])
    rows.append([InlineKeyboardButton(text="CONFIRM PAYMENT", callback_data="p3_confirm_pay")])
    rows.extend(_back_kb())
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _institutional_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="CONTACT", callback_data="p3_contact")],
        *_back_kb(),
    ])


def _contact_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=_back_kb())


# ---------------------------------------------------------------------------
# Text helpers — exported to start.py and menu.py
# ---------------------------------------------------------------------------

def main_menu_text() -> str:
    return (
        "<b>Welcome to Sentinel Fortune.</b>\n\n"
        "Choose your path:"
    )


def main_menu_keyboard() -> InlineKeyboardMarkup:
    return _main_kb()


def _upgrade_text() -> str:
    lines = [
        "<b>Choose your access level:</b>\n",
        "  Monthly Access   —  $25",
        "  Starter Pack     —  $290",
        "  Pro Pack         —  $1,900",
        "  OEM Pack         —  $7,500",
        "  Licensing Pack   —  $15,000+",
    ]
    # Flag any missing payment links so owner knows what to configure
    missing = [
        env for _, env, _ in _TIER_BUTTONS
        if not os.environ.get(env, "").strip()
    ]
    text = "\n".join(lines)
    if missing:
        text += (
            "\n\n<i>Note: some payment links are not yet configured "
            f"({len(missing)} of 5). Tap CONFIRM PAYMENT after completing payment "
            "through any channel.</i>"
        )
    return text


# ---------------------------------------------------------------------------
# p3_main — BACK TO MENU target
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "p3_main")
async def cb_p3_main(callback: CallbackQuery) -> None:
    await callback.message.edit_text(main_menu_text(), reply_markup=_main_kb())
    await callback.answer()


# ---------------------------------------------------------------------------
# Free access flow
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "p3_free")
async def cb_p3_free(callback: CallbackQuery) -> None:
    text = (
        "<b>Free Access</b>\n\n"
        "Free access includes:\n"
        "  Reset\n"
        "  Quick Access\n\n"
        "Use the channels below."
    )
    await callback.message.edit_text(text, reply_markup=_free_kb())
    await callback.answer()


# ---------------------------------------------------------------------------
# Premium offer screen
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "p3_premium")
async def cb_p3_premium(callback: CallbackQuery) -> None:
    text = (
        "<b>Premium Access</b>\n\n"
        "Premium Access unlocks:\n"
        "  Teachings Vault\n"
        "  Sentinel Engine\n"
        "  Sentinel Architect\n\n"
        "Includes deeper frameworks, structured execution, "
        "and private strategic layers."
    )
    await callback.message.edit_text(text, reply_markup=_premium_offer_kb())
    await callback.answer()


@router.callback_query(F.data == "p3_what_included")
async def cb_p3_what_included(callback: CallbackQuery) -> None:
    text = (
        "<b>What Is Included</b>\n\n"
        "<b>Free Tier</b>\n"
        "  Reset Channel — mental reset, clarity recovery, realignment\n"
        "  Quick Access Channel — fast clarity, structure, execution\n\n"
        "<b>Starter ($290)</b>\n"
        "  Teachings Vault — deep principles, applied insight, intellectual depth\n\n"
        "<b>Pro ($1,900)</b>\n"
        "  Sentinel Engine — revenue systems, operational discipline, offer architecture\n\n"
        "<b>OEM ($7,500)</b>\n"
        "  Sentinel Architect — long-term strategy, IP development, positioning\n"
        "  Dedicated intake and onboarding flow\n\n"
        "<b>Licensing ($15,000+)</b>\n"
        "  Full institutional access\n"
        "  IP licensing rights\n"
        "  Governance-level engagement\n\n"
        "Private channels. Structured delivery. No public access."
    )
    await callback.message.edit_text(text, reply_markup=_premium_what_kb())
    await callback.answer()


# ---------------------------------------------------------------------------
# Upgrade screen — callback entry point (from UPGRADE button)
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "p3_unlock")
async def cb_p3_unlock(callback: CallbackQuery) -> None:
    await callback.message.edit_text(_upgrade_text(), reply_markup=_upgrade_kb())
    await callback.answer()


# ---------------------------------------------------------------------------
# /upgrade command — same pricing screen
# ---------------------------------------------------------------------------

@router.message(Command("upgrade"))
async def handle_upgrade(message: Message) -> None:
    await message.answer(_upgrade_text(), reply_markup=_upgrade_kb())


# ---------------------------------------------------------------------------
# CONFIRM PAYMENT
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "p3_confirm_pay")
async def cb_p3_confirm_pay(callback: CallbackQuery) -> None:
    user = callback.from_user
    from bot.services.premium_registry import log_payment_confirmation
    asyncio.create_task(
        log_payment_confirmation(user.id, user.username, user.first_name)
    )
    text = (
        "<b>Payment received.</b>\n\n"
        "Access will be validated shortly.\n\n"
        "You will be notified once your access has been approved."
    )
    await callback.message.edit_text(text, reply_markup=_main_kb())
    await callback.answer("Confirmation logged.")
    logger.info("money: payment confirmation from %s (@%s)", user.id, user.username)


# ---------------------------------------------------------------------------
# Institutional inquiry (still reachable from WHAT IS INCLUDED / direct)
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "p3_institutional")
async def cb_p3_institutional(callback: CallbackQuery) -> None:
    text = (
        "<b>Institutional Inquiries</b>\n\n"
        "Institutional inquiries cover OEM, licensing, IP, governance, "
        "and strategic partnerships."
    )
    await callback.message.edit_text(text, reply_markup=_institutional_kb())
    await callback.answer()


@router.callback_query(F.data == "p3_contact")
async def cb_p3_contact(callback: CallbackQuery) -> None:
    text = (
        "<b>Sentinel Fortune — Institutional Contact</b>\n\n"
        "Sentinel Fortune LLC operates as a structured methodology and IP development entity.\n\n"
        "Inquiries are accepted across four formal channels:\n\n"
        "<b>OEM Integration</b>\n"
        "Embedding Sentinel frameworks within existing operational systems.\n\n"
        "<b>IP Licensing</b>\n"
        "Licensing core methodology for institutional deployment.\n\n"
        "<b>Strategic Partnership</b>\n"
        "Governance-level alignment and joint positioning arrangements.\n\n"
        "<b>Custom Engagement</b>\n"
        "Structured consulting engagements for institutional clients.\n\n"
        "Submit your inquiry through a validated request. "
        "All materials are disclosed on a need-to-know basis."
    )
    await callback.message.edit_text(text, reply_markup=_contact_kb())
    await callback.answer()
