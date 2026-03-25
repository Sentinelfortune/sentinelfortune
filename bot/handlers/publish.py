"""
Channel publishing commands -- owner-only.

v1 commands (4-post bundles):
  /publish_reset /publish_quick /publish_vault
  /publish_access /publish_engine /publish_architect
  /publish_all_channels

v2 commands (10-post premium bundles):
  /publish_reset_v2 /publish_quick_v2 /publish_vault_v2
  /publish_access_v2 /publish_engine_v2 /publish_architect_v2
  /publish_all_channels_v2

drip commands (next post from queue only):
  /drip_reset /drip_quick /drip_vault
  /drip_access /drip_engine /drip_architect

All commands are owner-only. Any other user receives no response.
"""

import logging
import os

from aiogram import Bot, Router
from aiogram.filters import Command
from aiogram.types import Message

from bot.services.channel_content_service import publish_channel_bundle, CHANNEL_IDS
from bot.services.channel_content_v2 import publish_bundle_v2, drip_next_post
from bot.services.access_control import require_owner

logger = logging.getLogger(__name__)
router = Router()

# ---------------------------------------------------------------------------
# Owner allowlist — set OWNER_TELEGRAM_IDS as comma-separated user IDs
# e.g.  OWNER_TELEGRAM_IDS=123456789,987654321
# ---------------------------------------------------------------------------

def _get_owner_ids() -> set[int]:
    raw = os.environ.get("OWNER_TELEGRAM_IDS", "").strip()
    ids: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if part.lstrip("-").isdigit():
            ids.add(int(part))
    return ids


def _is_owner(user_id: int) -> bool:
    owners = _get_owner_ids()
    return user_id in owners if owners else False


# ---------------------------------------------------------------------------
# Shared publish helper
# ---------------------------------------------------------------------------

async def _publish(message: Message, product_id: str) -> None:
    if not _is_owner(message.from_user.id):
        return  # silent — no feedback to non-owners

    channel_id = CHANNEL_IDS.get(product_id)
    if not channel_id:
        await message.answer(
            f"<b>Channel ID not set for <code>{product_id}</code></b>\n\n"
            f"Add the env var:\n"
            f"<code>CHANNEL_ID_{product_id.upper()}</code>\n\n"
            "Set it to the numeric channel ID (e.g. -1001234567890).\n"
            "To find it: add the bot to the channel as admin, "
            "then forward a channel message to @userinfobot."
        )
        return

    await message.answer(f"Publishing to <code>{product_id}</code>…")

    bot: Bot = message.bot
    result = await publish_channel_bundle(bot, product_id, pin_first=True)

    if result["ok"]:
        await message.answer(
            f"<b>Published.</b>\n\n"
            f"Channel: <code>{product_id}</code>\n"
            f"Posts sent: {result['published']}\n"
            "First post pinned.\n"
            "Logged to R2."
        )
    else:
        errors = "\n".join(result.get("errors", []))
        await message.answer(
            f"<b>Publish failed.</b>\n\n"
            f"Channel: <code>{product_id}</code>\n"
            f"Posts sent: {result['published']}\n\n"
            f"Errors:\n{errors}"
        )


# ---------------------------------------------------------------------------
# Per-channel commands
# ---------------------------------------------------------------------------

@router.message(Command("publish_reset"))
async def handle_publish_reset(message: Message) -> None:
    await _publish(message, "reset_v1")


@router.message(Command("publish_quick"))
async def handle_publish_quick(message: Message) -> None:
    await _publish(message, "quick_access_v1")


@router.message(Command("publish_vault"))
async def handle_publish_vault(message: Message) -> None:
    await _publish(message, "teachings_vault_v1")


@router.message(Command("publish_access"))
async def handle_publish_access(message: Message) -> None:
    await _publish(message, "sentinel_access_v1")


@router.message(Command("publish_engine"))
async def handle_publish_engine(message: Message) -> None:
    await _publish(message, "sentinel_engine_v1")


@router.message(Command("publish_architect"))
async def handle_publish_architect(message: Message) -> None:
    await _publish(message, "sentinel_architect_v1")


# ---------------------------------------------------------------------------
# /publish_all_channels
# ---------------------------------------------------------------------------

_ALL_PRODUCTS = [
    "reset_v1",
    "quick_access_v1",
    "teachings_vault_v1",
    "sentinel_access_v1",
    "sentinel_engine_v1",
    "sentinel_architect_v1",
]

@router.message(Command("publish_all_channels"))
async def handle_publish_all(message: Message) -> None:
    if not _is_owner(message.from_user.id):
        return

    await message.answer("Publishing to all six channels…")

    bot: Bot = message.bot
    lines = ["<b>Publish All — Results</b>\n"]

    for pid in _ALL_PRODUCTS:
        channel_id = CHANNEL_IDS.get(pid)
        if not channel_id:
            lines.append(f"⚠ {pid}: channel ID not set — skipped")
            continue

        result = await publish_channel_bundle(bot, pid, pin_first=True)
        if result["ok"]:
            lines.append(f"✓ {pid}: {result['published']} posts published")
        else:
            errs = "; ".join(result.get("errors", []))
            lines.append(f"✗ {pid}: {result['published']} sent — {errs}")

    await message.answer("\n".join(lines))


# ---------------------------------------------------------------------------
# v2 helpers
# ---------------------------------------------------------------------------

async def _publish_v2(message: Message, product_id: str) -> None:
    if not _is_owner(message.from_user.id):
        return

    channel_id = CHANNEL_IDS.get(product_id)
    if not channel_id:
        await message.answer(
            f"<b>Channel ID not set for <code>{product_id}</code></b>\n\n"
            f"Set env var: <code>CHANNEL_ID_{product_id.upper()}</code>"
        )
        return

    await message.answer(f"Publishing v2 bundle to <code>{product_id}</code>…")

    result = await publish_bundle_v2(message.bot, product_id, pin_first=True)

    if result["ok"]:
        await message.answer(
            f"<b>v2 Published.</b>\n\n"
            f"Channel: <code>{product_id}</code>\n"
            f"Posts sent: {result['published']}/10\n"
            "First post pinned.\n"
            "Bundle saved to R2."
        )
    else:
        errors = "\n".join(result.get("errors", []))
        await message.answer(
            f"<b>v2 Publish failed.</b>\n\n"
            f"Channel: <code>{product_id}</code>\n"
            f"Posts sent: {result['published']}\n\n"
            f"Errors:\n{errors}"
        )


# ---------------------------------------------------------------------------
# v2 per-channel commands
# ---------------------------------------------------------------------------

@router.message(Command("publish_reset_v2"))
@require_owner
async def handle_publish_reset_v2(message: Message) -> None:
    await _publish_v2(message, "reset_v1")


@router.message(Command("publish_quick_v2"))
@require_owner
async def handle_publish_quick_v2(message: Message) -> None:
    await _publish_v2(message, "quick_access_v1")


@router.message(Command("publish_vault_v2"))
@require_owner
async def handle_publish_vault_v2(message: Message) -> None:
    await _publish_v2(message, "teachings_vault_v1")


@router.message(Command("publish_access_v2"))
@require_owner
async def handle_publish_access_v2(message: Message) -> None:
    await _publish_v2(message, "sentinel_access_v1")


@router.message(Command("publish_engine_v2"))
@require_owner
async def handle_publish_engine_v2(message: Message) -> None:
    await _publish_v2(message, "sentinel_engine_v1")


@router.message(Command("publish_architect_v2"))
@require_owner
async def handle_publish_architect_v2(message: Message) -> None:
    await _publish_v2(message, "sentinel_architect_v1")


# ---------------------------------------------------------------------------
# /publish_all_channels_v2
# ---------------------------------------------------------------------------

@router.message(Command("publish_all_channels_v2"))
@require_owner
async def handle_publish_all_v2(message: Message) -> None:
    if not _is_owner(message.from_user.id):
        return

    await message.answer("Publishing v2 bundles to all six channels…")

    bot: Bot = message.bot
    lines = ["<b>Publish All v2 — Results</b>\n"]

    for pid in _ALL_PRODUCTS:
        channel_id = CHANNEL_IDS.get(pid)
        if not channel_id:
            lines.append(f"⚠ {pid}: channel ID not set — skipped")
            continue

        result = await publish_bundle_v2(bot, pid, pin_first=True)
        if result["ok"]:
            lines.append(f"✓ {pid}: {result['published']}/10 posts published")
        else:
            errs = "; ".join(result.get("errors", []))
            lines.append(f"✗ {pid}: {result['published']} sent — {errs}")

    await message.answer("\n".join(lines))


# ---------------------------------------------------------------------------
# Drip helpers
# ---------------------------------------------------------------------------

async def _drip(message: Message, product_id: str) -> None:
    if not _is_owner(message.from_user.id):
        return

    channel_id = CHANNEL_IDS.get(product_id)
    if not channel_id:
        await message.answer(
            f"<b>Channel ID not set for <code>{product_id}</code></b>\n\n"
            f"Set env var: <code>CHANNEL_ID_{product_id.upper()}</code>"
        )
        return

    result = await drip_next_post(message.bot, product_id)

    if result.get("exhausted"):
        await message.answer(
            f"<b>Queue exhausted.</b>\n\n"
            f"Channel: <code>{product_id}</code>\n"
            "All 10 posts have been dripped.\n"
            "Use /publish_reset_v2 (or equivalent) to republish the full bundle."
        )
    elif result["ok"]:
        remaining = result["total"] - result["index"] - 1
        await message.answer(
            f"<b>Dripped.</b>\n\n"
            f"Channel: <code>{product_id}</code>\n"
            f"Post {result['index'] + 1}/{result['total']} sent.\n"
            f"Remaining in queue: {remaining}"
        )
    else:
        await message.answer(
            f"<b>Drip failed.</b>\n\n"
            f"Channel: <code>{product_id}</code>\n"
            f"Error: {result.get('error', 'unknown')}"
        )


# ---------------------------------------------------------------------------
# Drip per-channel commands
# ---------------------------------------------------------------------------

@router.message(Command("drip_reset"))
async def handle_drip_reset(message: Message) -> None:
    await _drip(message, "reset_v1")


@router.message(Command("drip_quick"))
async def handle_drip_quick(message: Message) -> None:
    await _drip(message, "quick_access_v1")


@router.message(Command("drip_vault"))
async def handle_drip_vault(message: Message) -> None:
    await _drip(message, "teachings_vault_v1")


@router.message(Command("drip_access"))
async def handle_drip_access(message: Message) -> None:
    await _drip(message, "sentinel_access_v1")


@router.message(Command("drip_engine"))
async def handle_drip_engine(message: Message) -> None:
    await _drip(message, "sentinel_engine_v1")


@router.message(Command("drip_architect"))
async def handle_drip_architect(message: Message) -> None:
    await _drip(message, "sentinel_architect_v1")
