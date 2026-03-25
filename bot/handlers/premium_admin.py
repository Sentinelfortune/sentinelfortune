"""
Premium access management — owner commands + user /premium check.

Owner-only:
  /grant_premium <user_id> [tier]  — grant + tier-specific delivery
  /revoke_premium <user_id>        — revoke access
  /premium_status <user_id>        — inspect any user's record

User:
  /premium  — current tier, unlocked features, next upgrade

Tiers: monthly | starter | pro | oem | licensing
"""

import asyncio
import logging

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

from bot.services.access_control import is_owner
from bot.services.premium_registry import (
    DEFAULT_TIER,
    VALID_TIERS,
    get_premium_record,
    get_tier,
    grant_premium,
    is_premium,
    revoke_premium,
)
from bot.services.user_activation import (
    activate_user,
    deliver_tier_access,
    get_user_profile,
    get_user_delivery,
    CHANNEL_LABELS,
    TIER_CHANNELS,
    TIER_LABELS,
    TIER_NEXT,
)

logger = logging.getLogger(__name__)
router = Router()

# ---------------------------------------------------------------------------
# Channel links
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
# Tier metadata
# ---------------------------------------------------------------------------

_TIER_META: dict[str, dict] = {
    "monthly": {
        "label":    "Monthly Access ($25/mo)",
        "features": ["Reset Channel", "Quick Access Channel"],
        "next":     "Starter ($290) — unlocks Teachings Vault",
    },
    "starter": {
        "label":    "Starter Pack ($290)",
        "features": ["Teachings Vault"],
        "next":     "Pro ($1,900) — unlocks Sentinel Engine",
    },
    "pro": {
        "label":    "Pro Pack ($1,900)",
        "features": ["Teachings Vault", "Sentinel Engine"],
        "next":     "OEM ($7,500) — unlocks Sentinel Architect + intake flow",
    },
    "oem": {
        "label":    "OEM Pack ($7,500)",
        "features": ["Teachings Vault", "Sentinel Engine", "Sentinel Architect", "OEM Intake Flow"],
        "next":     "Licensing ($15,000+) — full institutional + IP licensing rights",
    },
    "licensing": {
        "label":    "Licensing Pack ($15,000+)",
        "features": [
            "Teachings Vault", "Sentinel Engine", "Sentinel Architect",
            "Full Institutional Access", "IP Licensing Rights", "Governance Engagement",
        ],
        "next":     "You have the highest tier.",
    },
}

# ---------------------------------------------------------------------------
# Delivery keyboards — one per tier
# ---------------------------------------------------------------------------

def _delivery_kb(tier: str) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    if tier == "monthly":
        rows = [
            [InlineKeyboardButton(text="ENTER RESET",        url=_FREE_LINKS["reset_v1"])],
            [InlineKeyboardButton(text="ENTER QUICK ACCESS", url=_FREE_LINKS["quick_access_v1"])],
        ]
    elif tier == "starter":
        rows = [
            [InlineKeyboardButton(text="ENTER VAULT", url=_PREMIUM_LINKS["teachings_vault_v1"])],
        ]
    elif tier == "pro":
        rows = [
            [InlineKeyboardButton(text="ENTER VAULT",  url=_PREMIUM_LINKS["teachings_vault_v1"])],
            [InlineKeyboardButton(text="ENTER ENGINE", url=_PREMIUM_LINKS["sentinel_engine_v1"])],
        ]
    elif tier == "oem":
        rows = [
            [InlineKeyboardButton(text="ENTER VAULT",      url=_PREMIUM_LINKS["teachings_vault_v1"])],
            [InlineKeyboardButton(text="ENTER ENGINE",     url=_PREMIUM_LINKS["sentinel_engine_v1"])],
            [InlineKeyboardButton(text="ENTER ARCHITECT",  url=_PREMIUM_LINKS["sentinel_architect_v1"])],
        ]
    elif tier == "licensing":
        rows = [
            [InlineKeyboardButton(text="ENTER VAULT",      url=_PREMIUM_LINKS["teachings_vault_v1"])],
            [InlineKeyboardButton(text="ENTER ENGINE",     url=_PREMIUM_LINKS["sentinel_engine_v1"])],
            [InlineKeyboardButton(text="ENTER ARCHITECT",  url=_PREMIUM_LINKS["sentinel_architect_v1"])],
        ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _delivery_text(tier: str) -> str:
    if tier == "monthly":
        return (
            "<b>Monthly Access — Active</b>\n\n"
            "Your Reset and Quick Access channels are now unlocked.\n\n"
            "Use the buttons below to enter your channels."
        )
    elif tier == "starter":
        return (
            "<b>Starter Access — Active</b>\n\n"
            "Your Teachings Vault access is now unlocked.\n\n"
            "The Vault contains deep principles, applied insight, "
            "and structured intellectual frameworks.\n\n"
            "Use the button below to enter."
        )
    elif tier == "pro":
        return (
            "<b>Pro Access — Active</b>\n\n"
            "Your Teachings Vault and Sentinel Engine access are now unlocked.\n\n"
            "The Engine contains revenue systems, operational discipline, "
            "and offer architecture.\n\n"
            "Use the buttons below to enter your channels."
        )
    elif tier == "oem":
        return (
            "<b>OEM Access — Active</b>\n\n"
            "Your full channel suite is now unlocked:\n"
            "Teachings Vault, Sentinel Engine, and Sentinel Architect.\n\n"
            "The Architect channel operates at the strategic layer — "
            "long-term systems thinking, IP development, and positioning.\n\n"
            "Your dedicated intake flow has been initiated. "
            "Expect a structured onboarding sequence.\n\n"
            "Use the buttons below to enter your channels."
        )
    elif tier == "licensing":
        return (
            "<b>Institutional Licensing Access — Active</b>\n\n"
            "Full access granted across all Sentinel Fortune channels.\n\n"
            "Your licensing arrangement grants IP rights, governance-level engagement, "
            "and full institutional access.\n\n"
            "A formal onboarding and disclosure sequence will be initiated separately.\n\n"
            "Use the buttons below to access your channels."
        )
    return "<b>Premium access granted.</b>\n\nUse the buttons below."


# ---------------------------------------------------------------------------
# Keyboard for /premium command (user's own access)
# ---------------------------------------------------------------------------

def _premium_user_kb(tier: str) -> InlineKeyboardMarkup:
    return _delivery_kb(tier)


def _upgrade_prompt_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="UPGRADE", callback_data="p3_unlock")],
    ])


# ---------------------------------------------------------------------------
# Argument parsers
# ---------------------------------------------------------------------------

def _parse_uid_arg(message: Message) -> int | None:
    parts = (message.text or "").split()
    if len(parts) < 2:
        return None
    try:
        return int(parts[1])
    except ValueError:
        return None


def _parse_tier_arg(message: Message) -> str:
    parts = (message.text or "").split()
    if len(parts) >= 3:
        candidate = parts[2].lower()
        if candidate in VALID_TIERS:
            return candidate
    return DEFAULT_TIER


# ---------------------------------------------------------------------------
# /grant_premium <user_id> [tier]
# ---------------------------------------------------------------------------

@router.message(Command("grant_premium"))
async def handle_grant_premium(message: Message) -> None:
    if not is_owner(message.from_user.id):
        return

    uid = _parse_uid_arg(message)
    if uid is None:
        await message.answer(
            "<b>Usage:</b> /grant_premium &lt;user_id&gt; [tier]\n\n"
            f"Valid tiers: {', '.join(sorted(VALID_TIERS))}\n"
            "Default tier: monthly\n\n"
            "Example: <code>/grant_premium 123456789 starter</code>"
        )
        return

    tier = _parse_tier_arg(message)
    meta = _TIER_META[tier]

    ok = await grant_premium(uid, username=None, first_name=None, tier=tier)

    status_line = "granted" if ok else "granted locally (R2 write failed)"
    await message.answer(
        f"Premium access (<b>{meta['label']}</b>) {status_line} "
        f"for <code>{uid}</code>."
    )

    # Write user profile + initial delivery state (awaited so profile init precedes delivery)
    await activate_user(uid, tier, username=None, first_name=None)

    # Send tier-specific delivery to user and update delivery state on completion
    result = await deliver_tier_access(message.bot, uid, tier)
    if not result["ok"]:
        logger.warning("premium_admin: delivery failed for %s: %s", uid, result["error"])
        await message.answer(
            f"Note: could not send delivery to <code>{uid}</code>. "
            "They may not have started the bot yet. "
            f"Error: {result['error']}"
        )
    else:
        logger.info("premium_admin: delivery complete uid=%s tier=%s channels=%s",
                    uid, tier, result["channels"])

    logger.info(
        "premium_admin: grant_premium uid=%s tier=%s by owner=%s",
        uid, tier, message.from_user.id,
    )


# ---------------------------------------------------------------------------
# /revoke_premium <user_id>
# ---------------------------------------------------------------------------

@router.message(Command("revoke_premium"))
async def handle_revoke_premium(message: Message) -> None:
    if not is_owner(message.from_user.id):
        return

    uid = _parse_uid_arg(message)
    if uid is None:
        await message.answer(
            "<b>Usage:</b> /revoke_premium &lt;user_id&gt;\n\n"
            "Example: <code>/revoke_premium 123456789</code>"
        )
        return

    ok = await revoke_premium(uid)
    status = "revoked" if ok else "revoked locally (R2 write failed)"
    await message.answer(
        f"Premium access <b>{status}</b> for <code>{uid}</code>."
    )
    logger.info("premium_admin: revoke_premium uid=%s by owner=%s", uid, message.from_user.id)


# ---------------------------------------------------------------------------
# /premium_status <user_id>
# ---------------------------------------------------------------------------

@router.message(Command("premium_status"))
async def handle_premium_status(message: Message) -> None:
    if not is_owner(message.from_user.id):
        return

    uid = _parse_uid_arg(message)
    if uid is None:
        await message.answer(
            "<b>Usage:</b> /premium_status &lt;user_id&gt;\n\n"
            "Example: <code>/premium_status 123456789</code>"
        )
        return

    record = await get_premium_record(uid)
    if record is None:
        await message.answer(f"<code>{uid}</code> — <b>no premium record found.</b>")
        return

    granted    = record.get("granted", False)
    tier       = record.get("tier", DEFAULT_TIER)
    granted_at = record.get("granted_at", "unknown")
    username   = record.get("username", "") or "no username"
    first_name = record.get("first_name", "") or "unknown"
    source     = record.get("source", "unknown")

    meta = _TIER_META.get(tier, {})
    tier_label = meta.get("label", tier)
    status_label = "ACTIVE" if granted else "INACTIVE / REVOKED"

    await message.answer(
        f"<b>Premium Status — <code>{uid}</code></b>\n\n"
        f"Status: <b>{status_label}</b>\n"
        f"Tier: {tier_label}\n"
        f"Username: @{username}\n"
        f"Name: {first_name}\n"
        f"Granted at: {granted_at}\n"
        f"Source: {source}"
    )


# ---------------------------------------------------------------------------
# /premium — user's own status + tier + features + next upgrade
# ---------------------------------------------------------------------------

@router.message(Command("premium"))
async def handle_premium(message: Message) -> None:
    user = message.from_user

    # Primary source: user profile from user_activation service
    profile = await get_user_profile(user.id)

    # Fallback: premium_registry record (for users granted before activation layer)
    if profile is None or not profile.get("status") == "active":
        record = await get_premium_record(user.id)
        if record is None or not record.get("granted"):
            await message.answer(
                "Premium access is not active on this account.",
                reply_markup=_upgrade_prompt_kb(),
            )
            return
        # Build a compatible profile from legacy record
        profile = {
            "tier":       record.get("tier", DEFAULT_TIER),
            "status":     "active",
            "created_at": record.get("granted_at", "unknown"),
        }

    tier = profile.get("tier", DEFAULT_TIER)
    status = profile.get("status", "active")
    granted_at = profile.get("created_at", "unknown")
    meta = _TIER_META.get(tier, _TIER_META[DEFAULT_TIER])

    # Delivery state
    delivery = await get_user_delivery(user.id)
    delivered = delivery.get("delivered", False) if delivery else False
    channels_unlocked = delivery.get("channels_unlocked", []) if delivery else []
    ch_labels = [CHANNEL_LABELS.get(c, c) for c in channels_unlocked]
    ch_list = "\n".join(f"  {n}" for n in ch_labels) if ch_labels else "  (none recorded)"

    delivery_status = "Delivered" if delivered else "Pending"
    features_list = "\n".join(f"  {f}" for f in meta["features"])
    next_upgrade = TIER_NEXT.get(tier, meta.get("next", ""))
    tier_label = TIER_LABELS.get(tier, meta.get("label", tier))

    text = (
        f"<b>Premium Access — Active</b>\n\n"
        f"Current tier: <b>{tier_label}</b>\n"
        f"Status: {status.title()}\n"
        f"Granted: {granted_at[:10] if len(granted_at) >= 10 else granted_at}\n\n"
        f"Unlocked features:\n{features_list}\n\n"
        f"Delivered channels:\n{ch_list}\n"
        f"Delivery status: {delivery_status}\n\n"
        f"Next upgrade: {next_upgrade}"
    )
    await message.answer(text, reply_markup=_premium_user_kb(tier))
