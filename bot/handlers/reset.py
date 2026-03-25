"""
/reset command handler — SentinelFortune Bot.

Flow:
  /reset → offer card (PayPal button + "I have paid" button)
  [I have paid] → send channel link → log to R2 (background)
"""

import logging

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)

from bot.services.product_delivery import deliver_product, PAYPAL_LINKS

logger = logging.getLogger(__name__)
router = Router()

_PRODUCT_ID    = "reset_v1"
_CALLBACK_PAID = "reset_paid"
_PAYPAL_URL    = PAYPAL_LINKS[_PRODUCT_ID]


# ---------------------------------------------------------------------------
# Keyboards
# ---------------------------------------------------------------------------

def _offer_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Pay $9.99 — PayPal", url=_PAYPAL_URL)],
        [InlineKeyboardButton(text="I have paid",        callback_data=_CALLBACK_PAID)],
    ])


def _paid_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✓ Access Granted", callback_data="reset_ack")],
    ])


# ---------------------------------------------------------------------------
# /reset — offer card
# ---------------------------------------------------------------------------

@router.message(Command("reset"))
async def handle_reset(message: Message) -> None:
    text = (
        "<b>RESET — Rebuild Your Inner Foundation</b>\n\n"
        "A digital reset pack that helps you regain clarity, stability, "
        "and inner control.\n\n"
        "<b>Price:</b> $9.99\n\n"
        "Tap <b>Pay $9.99</b> to complete payment via PayPal.\n"
        "Then tap <b>I have paid</b> — access is delivered instantly."
    )
    await message.answer(text, reply_markup=_offer_keyboard())


# ---------------------------------------------------------------------------
# "I have paid" — channel delivery + background R2 log
# ---------------------------------------------------------------------------

@router.callback_query(F.data == _CALLBACK_PAID)
async def handle_reset_paid(callback: CallbackQuery) -> None:
    user = callback.from_user
    await callback.answer("Delivering your RESET access now.")

    try:
        await callback.message.edit_reply_markup(reply_markup=_paid_keyboard())
    except Exception:
        pass

    await deliver_product(callback.message, user.id, user.username, _PRODUCT_ID)
    logger.info("RESET delivered: user_id=%s username=%s", user.id, user.username)


# ---------------------------------------------------------------------------
# Ack tap — silent no-op
# ---------------------------------------------------------------------------

@router.callback_query(F.data == "reset_ack")
async def handle_reset_ack(callback: CallbackQuery) -> None:
    await callback.answer()
