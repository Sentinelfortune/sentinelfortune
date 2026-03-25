"""
User Activation + Auto Delivery Service.

Handles the full user lifecycle after /grant_premium:
  1. Write profile.json  (R2 primary, local fallback)
  2. Write delivery.json (R2 primary, local fallback)
  3. Append activation event to events/{timestamp}.json
  4. Send tier-specific Telegram delivery via deliver_tier_access()

R2 paths:
  originus/users/{user_id}/profile.json
  originus/users/{user_id}/delivery.json
  originus/users/{user_id}/events/{timestamp}.json

Local fallback:
  data/users/{user_id}/profile.json
  data/users/{user_id}/delivery.json

Existing paths are NOT touched:
  originus/access/premium_users/
  originus/sales/payment_confirmations/

All R2 writes are non-blocking (backed by asyncio.to_thread inside r2_service).
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# R2 key builders
# ---------------------------------------------------------------------------

_R2_USER_PREFIX = "originus/users"


def _r2_profile_key(user_id: int) -> str:
    return f"{_R2_USER_PREFIX}/{user_id}/profile.json"


def _r2_delivery_key(user_id: int) -> str:
    return f"{_R2_USER_PREFIX}/{user_id}/delivery.json"


def _r2_event_key(user_id: int, timestamp: str) -> str:
    return f"{_R2_USER_PREFIX}/{user_id}/events/{timestamp}.json"


# ---------------------------------------------------------------------------
# Local fallback paths
# ---------------------------------------------------------------------------

_LOCAL_USER_DIR = Path("data/users")


def _local_profile_path(user_id: int) -> Path:
    return _LOCAL_USER_DIR / str(user_id) / "profile.json"


def _local_delivery_path(user_id: int) -> Path:
    return _LOCAL_USER_DIR / str(user_id) / "delivery.json"


def _local_write(path: Path, data: dict) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2))
    except Exception as exc:
        logger.warning("user_activation local write failed [%s]: %s", path, exc)


def _local_read(path: Path) -> dict | None:
    try:
        if path.exists():
            return json.loads(path.read_text())
    except Exception as exc:
        logger.warning("user_activation local read failed [%s]: %s", path, exc)
    return None


# ---------------------------------------------------------------------------
# R2 helpers
# ---------------------------------------------------------------------------

async def _r2_write(key: str, data: dict) -> bool:
    try:
        from bot.services.r2_service import put_json
        return await put_json(key, data)
    except Exception as exc:
        logger.warning("user_activation R2 write failed [%s]: %s", key, exc)
        return False


async def _r2_read(key: str) -> dict | None:
    try:
        from bot.services.r2_service import get_json
        return await get_json(key)
    except Exception as exc:
        logger.warning("user_activation R2 read failed [%s]: %s", key, exc)
        return None


# ---------------------------------------------------------------------------
# Channel links (canonical single source)
# ---------------------------------------------------------------------------

CHANNEL_LINKS: dict[str, str] = {
    "reset_v1":              "https://t.me/+TxavuR1J1tphOGY5",
    "quick_access_v1":       "https://t.me/+kLqEl4_BUE83NjFh",
    "teachings_vault_v1":    "https://t.me/+WNHBwWxk7ahjOTEx",
    "sentinel_engine_v1":    "https://t.me/+ECuJPOmfSwplNGIx",
    "sentinel_architect_v1": "https://t.me/+eqKVBpnzrmNmOWYx",
}

CHANNEL_LABELS: dict[str, str] = {
    "reset_v1":              "Reset Channel",
    "quick_access_v1":       "Quick Access Channel",
    "teachings_vault_v1":    "Teachings Vault",
    "sentinel_engine_v1":    "Sentinel Engine",
    "sentinel_architect_v1": "Sentinel Architect",
}

# ---------------------------------------------------------------------------
# Tier delivery matrix
# ---------------------------------------------------------------------------

TIER_CHANNELS: dict[str, list[str]] = {
    "lite":      ["teachings_vault_v1"],
    "monthly":   ["reset_v1", "quick_access_v1"],
    "starter":   ["teachings_vault_v1"],
    "pro":       ["teachings_vault_v1", "sentinel_engine_v1"],
    "oem":       ["teachings_vault_v1", "sentinel_engine_v1", "sentinel_architect_v1"],
    "licensing": ["teachings_vault_v1", "sentinel_engine_v1", "sentinel_architect_v1"],
}

TIER_EXTRA_MESSAGES: dict[str, str] = {
    "oem": (
        "<b>OEM Intake</b>\n\n"
        "Your OEM access has been activated. A structured onboarding sequence "
        "will be initiated. Sentinel Fortune LLC will contact you through a "
        "validated channel to establish your operational framework."
    ),
    "licensing": (
        "<b>Institutional Licensing Access</b>\n\n"
        "Your licensing arrangement is now active. This grants IP licensing rights, "
        "governance-level engagement, and full institutional access.\n\n"
        "A formal disclosure and onboarding sequence will be initiated separately."
    ),
}

TIER_NEXT: dict[str, str] = {
    "monthly":   "Starter ($290) — unlocks Teachings Vault",
    "starter":   "Pro ($1,900) — unlocks Sentinel Engine",
    "pro":       "OEM ($7,500) — unlocks Sentinel Architect + intake flow",
    "oem":       "Licensing ($15,000+) — full institutional + IP rights",
    "licensing": "You have the highest tier.",
}

TIER_LABELS: dict[str, str] = {
    "monthly":   "Monthly Access ($25/mo)",
    "starter":   "Starter Pack ($290)",
    "pro":       "Pro Pack ($1,900)",
    "oem":       "OEM Pack ($7,500)",
    "licensing": "Licensing Pack ($15,000+)",
}


# ---------------------------------------------------------------------------
# A. write_user_profile
# ---------------------------------------------------------------------------

async def write_user_profile(
    user_id: int,
    tier: str,
    username: str | None = None,
    first_name: str | None = None,
    source: str = "telegram_bot",
) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    profile = {
        "user_id":    user_id,
        "username":   username or "",
        "first_name": first_name or "",
        "tier":       tier,
        "status":     "active",
        "source":     source,
        "created_at": now,
        "updated_at": now,
    }
    key = _r2_profile_key(user_id)
    ok = await _r2_write(key, profile)
    _local_write(_local_profile_path(user_id), profile)
    if ok:
        logger.info("user_activation: profile created user=%s tier=%s", user_id, tier)
    else:
        logger.warning("user_activation: profile R2 write failed user=%s, using local fallback", user_id)
    return ok


# ---------------------------------------------------------------------------
# B. write_delivery_state
# ---------------------------------------------------------------------------

async def write_delivery_state(
    user_id: int,
    tier: str,
    channels_unlocked: list[str],
    messages_sent: list[str],
    delivered: bool = True,
) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    state = {
        "user_id":          user_id,
        "tier":             tier,
        "delivered":        delivered,
        "channels_unlocked": channels_unlocked,
        "messages_sent":    messages_sent,
        "delivered_at":     now,
        "updated_at":       now,
    }
    key = _r2_delivery_key(user_id)
    ok = await _r2_write(key, state)
    _local_write(_local_delivery_path(user_id), state)
    if ok:
        logger.info(
            "user_activation: delivery state written user=%s tier=%s channels=%s",
            user_id, tier, channels_unlocked,
        )
    else:
        logger.warning("user_activation: delivery R2 write failed user=%s, local fallback used", user_id)
    return ok


# ---------------------------------------------------------------------------
# C. append_user_event
# ---------------------------------------------------------------------------

async def append_user_event(
    user_id: int,
    event_type: str,
    payload: dict,
) -> None:
    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y%m%dT%H%M%SZ")
    event = {
        "user_id":    user_id,
        "event_type": event_type,
        "timestamp":  now.isoformat(),
        **payload,
    }
    key = _r2_event_key(user_id, timestamp)
    ok = await _r2_write(key, event)
    logger.info(
        "user_activation: event appended user=%s type=%s r2=%s", user_id, event_type, ok
    )


# ---------------------------------------------------------------------------
# D. get_user_profile / get_user_delivery
# ---------------------------------------------------------------------------

async def get_user_profile(user_id: int) -> dict | None:
    record = await _r2_read(_r2_profile_key(user_id))
    if record is None:
        record = _local_read(_local_profile_path(user_id))
    return record


async def get_user_delivery(user_id: int) -> dict | None:
    record = await _r2_read(_r2_delivery_key(user_id))
    if record is None:
        record = _local_read(_local_delivery_path(user_id))
    return record


# ---------------------------------------------------------------------------
# E. activate_user  — orchestrates writes (no Telegram I/O)
# ---------------------------------------------------------------------------

async def activate_user(
    user_id: int,
    tier: str,
    username: str | None = None,
    first_name: str | None = None,
    source: str = "telegram_bot",
) -> None:
    """
    Write profile.json + delivery.json (pending) + activation event.
    Called as asyncio.create_task() — never blocks the handler response.
    """
    await write_user_profile(user_id, tier, username, first_name, source)
    channels = TIER_CHANNELS.get(tier, [])
    await write_delivery_state(
        user_id, tier,
        channels_unlocked=channels,
        messages_sent=[],
        delivered=False,
    )
    await append_user_event(
        user_id,
        event_type="activation",
        payload={"tier": tier, "source": source},
    )


# ---------------------------------------------------------------------------
# F. deliver_tier_access — sends Telegram message + updates delivery state
# ---------------------------------------------------------------------------

async def deliver_tier_access(
    bot,
    user_id: int,
    tier: str,
) -> dict:
    """
    Send the tier-appropriate Telegram delivery message to user_id.
    Updates delivery.json to delivered=True after successful send.

    Returns {"ok": bool, "channels": list, "error": str|None}
    """
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

    channels = TIER_CHANNELS.get(tier, [])
    messages_sent: list[str] = []

    # Build channel access keyboard
    rows: list[list[InlineKeyboardButton]] = []
    for ch_id in channels:
        url = CHANNEL_LINKS.get(ch_id)
        label = CHANNEL_LABELS.get(ch_id, ch_id)
        if url:
            btn_label = f"ENTER {label.upper().replace(' CHANNEL', '').replace(' ', ' ')}"
            rows.append([InlineKeyboardButton(text=btn_label, url=url)])

    kb = InlineKeyboardMarkup(inline_keyboard=rows) if rows else None

    # Build delivery text — tier-specific copy where defined, generic fallback
    tier_label    = TIER_LABELS.get(tier, tier.title())
    channel_names = [CHANNEL_LABELS.get(c, c) for c in channels]
    ch_list       = "\n".join(f"  — {n}" for n in channel_names)

    _DELIVERY_COPY: dict[str, str] = {
        "lite": (
            "<b>Access Granted — Starter Lite</b>\n\n"
            "Your entry layer is now active.\n\n"
            "Unlocked:\n  — Teachings Vault\n\n"
            "Use the button below to enter. Execute the content in order."
        ),
        "monthly": (
            "<b>Access Granted — Monthly Reset</b>\n\n"
            "Continuity access is now active.\n\n"
            f"Unlocked:\n{ch_list}\n\n"
            "Use the buttons below to enter."
        ),
        "starter": (
            "<b>Access Granted — Starter Pack</b>\n\n"
            "Core access is now active. No expiry.\n\n"
            "Unlocked:\n  — Teachings Vault\n\n"
            "Use the button below to enter. Execute the content in sequence."
        ),
        "pro": (
            "<b>Access Granted — Pro Access</b>\n\n"
            "Layer 2 access is now active.\n\n"
            f"Unlocked:\n{ch_list}\n\n"
            "Use the buttons below to enter."
        ),
    }
    text = _DELIVERY_COPY.get(tier, (
        f"<b>{tier_label} — Access Granted</b>\n\n"
        f"The following channels are now unlocked:\n{ch_list}\n\n"
        "Use the buttons below to enter."
    ))

    # Extra institutional message for oem / licensing
    extra = TIER_EXTRA_MESSAGES.get(tier)

    try:
        # --- Product delivery (generic — registry-driven, no per-tier custom logic) ---
        from bot.services.product_registry import get_product_for_tier
        from bot.services.product_delivery import deliver_product_to_user
        product = get_product_for_tier(tier)
        if product:
            prod_result = await deliver_product_to_user(bot, user_id, product["product_id"])
            messages_sent.extend(prod_result.get("steps", []))
            logger.info(
                "user_activation: product delivery product=%s steps=%s uid=%s",
                product["product_id"], prod_result.get("steps"), user_id,
            )

        await bot.send_message(chat_id=user_id, text=text, reply_markup=kb)
        messages_sent.append("channel_access")
        logger.info(
            "user_activation: channel access delivered user=%s tier=%s channels=%s",
            user_id, tier, channels,
        )

        if extra:
            await bot.send_message(chat_id=user_id, text=extra)
            messages_sent.append("institutional_message")
            logger.info("user_activation: extra message delivered user=%s tier=%s", user_id, tier)

        # Mark delivery state as complete (background — don't await in caller)
        asyncio.create_task(
            write_delivery_state(
                user_id, tier,
                channels_unlocked=channels,
                messages_sent=messages_sent,
                delivered=True,
            )
        )
        asyncio.create_task(
            append_user_event(
                user_id,
                event_type="delivery_complete",
                payload={"tier": tier, "channels": channels, "messages_sent": messages_sent},
            )
        )

        logger.info("user_activation: tier delivery complete user=%s tier=%s", user_id, tier)
        return {"ok": True, "channels": channels, "error": None}

    except Exception as exc:
        logger.error("user_activation: delivery failed user=%s tier=%s: %s", user_id, tier, exc)
        return {"ok": False, "channels": [], "error": str(exc)}
