"""
Stripe webhook test command — owner only.

/test_stripe [user_id] [tier]
  Simulates a checkout.session.completed activation for a given uid + tier.
  Runs the real activation + delivery pipeline end-to-end so you can confirm
  the webhook works without triggering an actual Stripe payment.

/stripe_status
  Shows current webhook configuration: keys set, payment links mapped, port.

Both commands are gated behind is_owner().
"""

import logging
import os

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from bot.services.access_control import is_owner
from bot.services.stripe_webhook import (
    AMOUNT_TIER_MAP,
    VALID_TIERS,
    WEBHOOK_PORT,
    _build_link_tier_map,
    _stripe_secret_key,
    _stripe_webhook_secret,
)
from bot.services.user_activation import (
    activate_user,
    deliver_tier_access,
    TIER_LABELS,
)

logger = logging.getLogger(__name__)
router = Router()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_args(message: Message) -> tuple[int | None, str | None]:
    """
    Parse /test_stripe <user_id> [tier] from message text.
    Returns (user_id, tier) — either may be None.
    """
    parts = (message.text or "").strip().split()
    # parts[0] is the command itself
    user_id: int | None = None
    tier: str | None = None

    if len(parts) >= 2:
        try:
            user_id = int(parts[1])
        except ValueError:
            pass

    if len(parts) >= 3:
        t = parts[2].strip().lower()
        tier = t if t in VALID_TIERS else None

    return user_id, tier


# ---------------------------------------------------------------------------
# /test_stripe [user_id] [tier]
# ---------------------------------------------------------------------------

@router.message(Command("test_stripe"))
async def handle_test_stripe(message: Message) -> None:
    if not is_owner(message.from_user.id):
        return

    user_id, tier = _parse_args(message)

    if user_id is None:
        await message.answer(
            "<b>/test_stripe — usage</b>\n\n"
            "<code>/test_stripe &lt;user_id&gt; [tier]</code>\n\n"
            f"Valid tiers: <code>{' | '.join(sorted(VALID_TIERS))}</code>\n\n"
            "Example:\n"
            "<code>/test_stripe 123456789 starter</code>\n\n"
            "If no tier is given, <b>monthly</b> is used.\n\n"
            "This runs the real activation + delivery pipeline — "
            "use your own Telegram ID to test delivery to yourself."
        )
        return

    if tier is None:
        tier = "monthly"

    tier_label = TIER_LABELS.get(tier, tier)

    await message.answer(
        f"Running test activation:\n"
        f"  uid = <code>{user_id}</code>\n"
        f"  tier = <b>{tier_label}</b>\n\n"
        "Calling activate_user + deliver_tier_access..."
    )

    logger.info(
        "stripe_admin: test activation triggered by owner=%s uid=%s tier=%s",
        message.from_user.id, user_id, tier,
    )

    # --- activate_user (R2 writes — awaited so profile init precedes delivery) ---
    await activate_user(user_id, tier, source="stripe_test")

    # --- deliver_tier_access (Telegram message) ---
    try:
        result = await deliver_tier_access(message.bot, user_id, tier)
    except Exception as exc:
        logger.error("stripe_admin: delivery exception uid=%s: %s", user_id, exc)
        await message.answer(
            f"Activation ran but delivery raised an exception:\n"
            f"<code>{exc}</code>\n\n"
            "Check that the user has started the bot at least once."
        )
        return

    if result["ok"]:
        channels = result.get("channels", [])
        await message.answer(
            f"Test activation complete.\n\n"
            f"uid: <code>{user_id}</code>\n"
            f"tier: <b>{tier_label}</b>\n"
            f"channels delivered: {len(channels)}\n"
            f"  {chr(10).join(channels)}\n\n"
            "Profile + delivery state written to R2.\n"
            "The user should have received the channel access message."
        )
    else:
        await message.answer(
            f"Activation ran — delivery FAILED.\n\n"
            f"uid: <code>{user_id}</code>\n"
            f"tier: <b>{tier_label}</b>\n"
            f"error: <code>{result.get('error', 'unknown')}</code>\n\n"
            "The user may not have started the bot yet, or their ID is wrong."
        )

    logger.info(
        "stripe_admin: test complete uid=%s tier=%s ok=%s",
        user_id, tier, result["ok"],
    )


# ---------------------------------------------------------------------------
# /stripe_status
# ---------------------------------------------------------------------------

@router.message(Command("stripe_status"))
async def handle_stripe_status(message: Message) -> None:
    if not is_owner(message.from_user.id):
        return

    sk_set  = bool(_stripe_secret_key())
    whs_set = bool(_stripe_webhook_secret())
    link_map = _build_link_tier_map()

    def tick(v: bool) -> str:
        return "set" if v else "NOT SET"

    amount_lines = "\n".join(
        f"  ${cents // 100:,} → {tier}"
        for cents, tier in sorted(AMOUNT_TIER_MAP.items())
    )

    link_lines = (
        "\n".join(f"  {tier} → link configured" for tier in link_map.values())
        if link_map
        else "  (none — set STRIPE_LINK_MONTHLY, STRIPE_LINK_STARTER, etc.)"
    )

    webhook_url = (
        "https://0d3ff4f9-1063-4c1d-b063-d0d93f898946-00-1mg4q91tmvgl3"
        ".riker.replit.dev/api/stripe/webhook"
    )

    await message.answer(
        "<b>Stripe Webhook Status</b>\n\n"
        f"STRIPE_SECRET_KEY: <b>{tick(sk_set)}</b>\n"
        f"STRIPE_WEBHOOK_SECRET: <b>{tick(whs_set)}</b>\n"
        f"Signature verification: <b>{'ACTIVE' if whs_set else 'DISABLED (dev mode)'}</b>\n\n"
        f"Webhook port: <code>{WEBHOOK_PORT}</code>\n"
        f"Public URL:\n<code>{webhook_url}</code>\n\n"
        f"Amount → tier map:\n{amount_lines}\n\n"
        f"Payment link → tier map:\n{link_lines}\n\n"
        "User resolution order:\n"
        "  1. client_reference_id\n"
        "  2. metadata.telegram_id\n"
        "  3. email → R2 lookup\n\n"
        "Test with: <code>/test_stripe &lt;your_user_id&gt; starter</code>"
    )
