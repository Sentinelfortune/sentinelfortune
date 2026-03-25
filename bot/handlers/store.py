"""
Sentinel Store — navigation layer.

Callback data map:
  store_main          → main menu (back button)
  store_free          → Free Access content
  store_mind          → Mind / Reset category
  store_business      → Business / Teachings Vault category
  store_creative      → Quick Access category
  store_reset_get     → RESET offer card  (reset_paid handled by reset.py)
  store_business_buy  → Teachings Vault payment screen
  biz_paid            → Teachings Vault delivery
  biz_ack             → no-op ack
  quick_buy           → Quick Access payment screen
  quick_paid          → Quick Access delivery
  quick_ack           → no-op ack
"""

import logging

from aiogram import Router, F
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)

from bot.services.product_delivery import deliver_product, PAYPAL_LINKS

logger = logging.getLogger(__name__)
router = Router()


# ---------------------------------------------------------------------------
# Shared builders — imported by start.py
# ---------------------------------------------------------------------------

def main_menu_text() -> str:
    return "<b>Sentinel Store</b>\n\nChoose your path:"


def main_menu_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Free Access",   callback_data="store_free")],
        [InlineKeyboardButton(text="Mind / Reset",  callback_data="store_mind")],
        [InlineKeyboardButton(text="Business",      callback_data="store_business")],
        [InlineKeyboardButton(text="Quick Access",  callback_data="store_creative")],
    ])


def _back_button() -> list[list[InlineKeyboardButton]]:
    return [[InlineKeyboardButton(text="← Back to Menu", callback_data="store_main")]]


def _ack_keyboard(cb: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✓ Access Granted", callback_data=cb)]
    ])


# ---------------------------------------------------------------------------
# Main menu — back navigation
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "store_main")
async def cb_store_main(callback: CallbackQuery) -> None:
    await callback.answer()
    await callback.message.edit_text(main_menu_text(), reply_markup=main_menu_keyboard())


# ---------------------------------------------------------------------------
# Free Access
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "store_free")
async def cb_store_free(callback: CallbackQuery) -> None:
    await callback.answer()
    text = (
        "<b>Free Access</b>\n\n"
        "Your mind is your most valuable asset.\n\n"
        "Most people spend their entire lives reacting to the world around them "
        "without ever pausing to ask: <i>who is doing the reacting?</i>\n\n"
        "The first step to any change — internal or external — is awareness.\n"
        "That is what you build here.\n\n"
        "<i>Upgrade anytime using the menu.</i>"
    )
    await callback.message.edit_text(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=_back_button()),
    )


# ---------------------------------------------------------------------------
# Mind / Reset
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "store_mind")
async def cb_store_mind(callback: CallbackQuery) -> None:
    await callback.answer()
    text = (
        "<b>SENTINEL RESET — PRIVATE ACCESS</b>\n\n"
        "Private structured access. Unlocked after payment.\n\n"
        "<b>Price:</b> $9.99"
    )
    await callback.message.edit_text(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="BUY", callback_data="store_reset_get")],
            *_back_button(),
        ]),
    )


@router.callback_query(F.data == "store_reset_get")
async def cb_store_reset_get(callback: CallbackQuery) -> None:
    await callback.answer()
    text = (
        "<b>RESET — Rebuild Your Inner Foundation</b>\n\n"
        "A digital reset pack that helps you regain clarity, stability, and inner control.\n\n"
        "<b>Price:</b> $9.99\n\n"
        "Complete payment, then tap <b>I have paid</b> — access delivered instantly."
    )
    await callback.message.edit_text(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="Pay $9.99 — PayPal", url=PAYPAL_LINKS["reset_v1"])],
            [InlineKeyboardButton(text="I have paid",        callback_data="reset_paid")],
            *_back_button(),
        ]),
    )


# ---------------------------------------------------------------------------
# Business / Teachings Vault
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "store_business")
async def cb_store_business(callback: CallbackQuery) -> None:
    await callback.answer()
    text = (
        "<b>SENTINEL TEACHINGS VAULT — PRIVATE ACCESS</b>\n\n"
        "Private structured access. Unlocked after payment.\n\n"
        "<b>Price:</b> $19"
    )
    await callback.message.edit_text(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="BUY", callback_data="store_business_buy")],
            *_back_button(),
        ]),
    )


@router.callback_query(F.data == "store_business_buy")
async def cb_store_business_buy(callback: CallbackQuery) -> None:
    await callback.answer()
    text = (
        "<b>Teachings Vault</b> — $19\n\n"
        "Step 1 — Complete payment below.\n"
        "Step 2 — Tap <b>I have paid</b> to receive access instantly."
    )
    await callback.message.edit_text(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="Pay $19 — PayPal", url=PAYPAL_LINKS["teachings_vault_v1"])],
            [InlineKeyboardButton(text="I have paid",      callback_data="biz_paid")],
            *_back_button(),
        ]),
    )


@router.callback_query(F.data == "biz_paid")
async def cb_biz_paid(callback: CallbackQuery) -> None:
    user = callback.from_user
    await callback.answer("Delivering your Teachings Vault access now.")
    try:
        await callback.message.edit_reply_markup(reply_markup=_ack_keyboard("biz_ack"))
    except Exception:
        pass
    await deliver_product(callback.message, user.id, user.username, "teachings_vault_v1")
    logger.info("Teachings Vault delivered: user_id=%s username=%s", user.id, user.username)


@router.callback_query(F.data == "biz_ack")
async def cb_biz_ack(callback: CallbackQuery) -> None:
    await callback.answer()


# ---------------------------------------------------------------------------
# Quick Access
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "store_creative")
async def cb_store_creative(callback: CallbackQuery) -> None:
    await callback.answer()
    text = (
        "<b>SENTINEL QUICK ACCESS — PRIVATE ACCESS</b>\n\n"
        "Private structured access. Unlocked after payment.\n\n"
        "<b>Price:</b> $15"
    )
    await callback.message.edit_text(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="BUY", callback_data="quick_buy")],
            *_back_button(),
        ]),
    )


@router.callback_query(F.data == "quick_buy")
async def cb_quick_buy(callback: CallbackQuery) -> None:
    await callback.answer()
    text = (
        "<b>Quick Access — Clarity Framework</b> — $15\n\n"
        "Step 1 — Complete payment below.\n"
        "Step 2 — Tap <b>I have paid</b> to receive access instantly."
    )
    await callback.message.edit_text(
        text,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="Pay $15 — PayPal", url=PAYPAL_LINKS["quick_access_v1"])],
            [InlineKeyboardButton(text="I have paid",      callback_data="quick_paid")],
            *_back_button(),
        ]),
    )


@router.callback_query(F.data == "quick_paid")
async def cb_quick_paid(callback: CallbackQuery) -> None:
    user = callback.from_user
    await callback.answer("Delivering your Quick Access now.")
    try:
        await callback.message.edit_reply_markup(reply_markup=_ack_keyboard("quick_ack"))
    except Exception:
        pass
    await deliver_product(callback.message, user.id, user.username, "quick_access_v1")
    logger.info("Quick Access delivered: user_id=%s username=%s", user.id, user.username)


@router.callback_query(F.data == "quick_ack")
async def cb_quick_ack(callback: CallbackQuery) -> None:
    await callback.answer()
