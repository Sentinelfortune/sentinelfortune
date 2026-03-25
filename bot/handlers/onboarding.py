"""
Sentinel Fortune — Telegram Conversion Flow.

3-message entry sequence + Layer 1 free orientation + Lite conversion moment.

Callbacks (ob_ prefix — no conflict with existing p3_ / store_ flows):
  ob_s1        → Message 2 (3 layers)
  ob_s2        → Message 3 (friction)
  ob_s3        → Free orientation start
  ob_f2..ob_f5 → Free orientation pages 2-5
  ob_convert   → Lite conversion CTA
  ob_menu      → Main menu
"""

import asyncio
import logging

from aiogram import F, Router
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

from bot.services.sales_flow import build_buy_url, TIER_LABELS

logger = logging.getLogger(__name__)
router = Router()


# ---------------------------------------------------------------------------
# Keyboard helpers
# ---------------------------------------------------------------------------

def _kb(*buttons: tuple[str, str], url_buttons: list[tuple[str, str]] | None = None) -> InlineKeyboardMarkup:
    """Build an inline keyboard from (label, callback_data) pairs and optional URL buttons."""
    rows = [[InlineKeyboardButton(text=label, callback_data=cb)] for label, cb in buttons]
    if url_buttons:
        for label, url in url_buttons:
            rows.append([InlineKeyboardButton(text=label, url=url)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


# ---------------------------------------------------------------------------
# Message copy — entry sequence
# ---------------------------------------------------------------------------

_MSG1 = (
    "<b>SENTINEL FORTUNE</b>\n\n"
    "This is not a content channel.\n"
    "This is not motivation.\n"
    "This is not another system promising shortcuts.\n\n"
    "Sentinel Fortune is an operating framework built for people "
    "who have stopped waiting and are ready to execute with structure.\n\n"
    "If that is where you are, continue."
)

_MSG2 = (
    "<b>The system has three layers.</b>\n\n"
    "<b>Layer 1 — Reset / Clarity / Structure</b>\n"
    "Clear your operating baseline. Establish posture. "
    "Learn how to think and move inside a structured system.\n\n"
    "<b>Layer 2 — Execution / Revenue / Systems</b>\n"
    "Build active income structures. Run the revenue engine. "
    "Operate with real leverage.\n\n"
    "<b>Layer 3 — Leverage / IP / Architecture</b>\n"
    "Private infrastructure. Licensing frameworks. "
    "Institutional-level access and positioning.\n\n"
    "You enter at Layer 1. You earn access to the next layer by executing, not by paying."
)

_MSG3 = (
    "<b>Most people will read this and keep scrolling.</b>\n\n"
    "They consume information instead of applying it.\n"
    "They wait until conditions are better.\n"
    "They decide to start next week.\n\n"
    "The people who succeed inside this system do one thing differently — "
    "they enter and they execute.\n\n"
    "Not when it is convenient.\n"
    "Now."
)


# ---------------------------------------------------------------------------
# Message copy — Layer 1 free orientation (5 sections)
# ---------------------------------------------------------------------------

_FREE = [
    (
        "<b>PATH ORIENTATION</b>\n\n"
        "Your path through Sentinel Fortune has a defined sequence.\n\n"
        "You begin at Layer 1.\n"
        "Clarity before execution. Structure before action.\n\n"
        "Most people fail not from lack of effort — but from unclear starting conditions. "
        "This sequence fixes that."
    ),
    (
        "<b>OPERATING POSTURE</b>\n\n"
        "Inside this system, you operate as a practitioner — not a consumer.\n\n"
        "That means:\n"
        "— You do not scroll passively\n"
        "— You execute tasks in order\n"
        "— You track results, not intentions\n"
        "— You return when you have something done\n\n"
        "The system does not chase you. You execute or you don't."
    ),
    (
        "<b>PROGRESSION LOGIC</b>\n\n"
        "Sentinel Fortune runs on a 5-tier structure.\n\n"
        "<b>Lite</b> — Entry layer. First execution access.\n"
        "<b>Monthly</b> — Continuity. Ongoing reset and quick-access systems.\n"
        "<b>Starter</b> — Teachings Vault. Core system content.\n"
        "<b>Pro</b> — Teachings Vault + Sentinel Engine.\n"
        "<b>OEM / Licensing</b> — Architecture, IP, and institutional frameworks.\n\n"
        "You move through tiers based on capacity — not urgency."
    ),
    (
        "<b>HOW TO USE SENTINEL</b>\n\n"
        "Sentinel Fortune is an operating system, not a course platform.\n\n"
        "Use it by:\n"
        "1. Entering the channel for your tier\n"
        "2. Reading the content in order\n"
        "3. Executing before moving to the next unit\n"
        "4. Returning when you have a real result\n\n"
        "Do not skip steps. Do not rush the sequence."
    ),
    (
        "<b>WHAT SENTINEL IS NOT</b>\n\n"
        "Sentinel Fortune is not:\n"
        "— A motivation platform\n"
        "— A content subscription\n"
        "— A community for asking questions\n"
        "— A replacement for your own execution\n\n"
        "It is a structured system for people who have already made a decision.\n\n"
        "If you are still deciding, come back when you have decided."
    ),
]

_CONVERT = (
    "<b>Layer 1 orientation is complete.</b>\n\n"
    "What you received here is the foundation layer.\n"
    "The system runs deeper than this.\n\n"
    "Sentinel Lite is the first real entry point.\n"
    "$2. Direct access. No upsell sequence.\n\n"
    "It unlocks the same channel as the Starter tier — the Teachings Vault.\n"
    "This is where execution begins.\n\n"
    "Enter when you are ready."
)


# ---------------------------------------------------------------------------
# Entry point — called from start.py for plain /start
# ---------------------------------------------------------------------------

async def send_welcome(message: Message) -> None:
    """Send onboarding Message 1 (entry point for all fresh /start users)."""
    await message.answer(
        _MSG1,
        reply_markup=_kb(("START →", "ob_s1")),
    )


# ---------------------------------------------------------------------------
# Callback handlers — entry sequence
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "ob_s1")
async def cb_s1(cq: CallbackQuery) -> None:
    await cq.message.edit_text(_MSG2, reply_markup=_kb(("CONTINUE →", "ob_s2")))
    await cq.answer()


@router.callback_query(F.data == "ob_s2")
async def cb_s2(cq: CallbackQuery) -> None:
    await cq.message.edit_text(_MSG3, reply_markup=_kb(("ENTER LAYER 1 →", "ob_s3")))
    await cq.answer()


# ---------------------------------------------------------------------------
# Free orientation — Layer 1 (5 pages)
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "ob_s3")
async def cb_s3(cq: CallbackQuery) -> None:
    await cq.message.edit_text(
        _FREE[0],
        reply_markup=_kb(("CONTINUE →", "ob_f2")),
    )
    await cq.answer()


@router.callback_query(F.data == "ob_f2")
async def cb_f2(cq: CallbackQuery) -> None:
    await cq.message.edit_text(
        _FREE[1],
        reply_markup=_kb(("CONTINUE →", "ob_f3")),
    )
    await cq.answer()


@router.callback_query(F.data == "ob_f3")
async def cb_f3(cq: CallbackQuery) -> None:
    await cq.message.edit_text(
        _FREE[2],
        reply_markup=_kb(("CONTINUE →", "ob_f4")),
    )
    await cq.answer()


@router.callback_query(F.data == "ob_f4")
async def cb_f4(cq: CallbackQuery) -> None:
    await cq.message.edit_text(
        _FREE[3],
        reply_markup=_kb(("CONTINUE →", "ob_f5")),
    )
    await cq.answer()


@router.callback_query(F.data == "ob_f5")
async def cb_f5(cq: CallbackQuery) -> None:
    await cq.message.edit_text(
        _FREE[4],
        reply_markup=_kb(("CONTINUE →", "ob_convert")),
    )
    await cq.answer()


# ---------------------------------------------------------------------------
# Conversion moment — Lite CTA
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "ob_convert")
async def cb_convert(cq: CallbackQuery) -> None:
    uid     = cq.from_user.id
    lite_url = build_buy_url("lite", uid)

    url_btns = [("ACTIVATE — Starter Lite $2 →", lite_url)] if lite_url else []
    extra_cbs = [("/buy menu", "ob_menu")] if not lite_url else [("/buy menu", "ob_menu")]

    rows: list[list[InlineKeyboardButton]] = []
    if lite_url:
        rows.append([InlineKeyboardButton(text="ACTIVATE — Starter Lite $2 →", url=lite_url)])
    rows.append([InlineKeyboardButton(text="VIEW ALL TIERS", callback_data="ob_menu")])

    await cq.message.edit_text(
        _CONVERT,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
    )
    await cq.answer()


@router.callback_query(F.data == "ob_menu")
async def cb_menu(cq: CallbackQuery) -> None:
    from bot.handlers.money import main_menu_text, main_menu_keyboard
    await cq.message.answer(main_menu_text(), reply_markup=main_menu_keyboard())
    await cq.answer()
