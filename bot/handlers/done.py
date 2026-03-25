import asyncio
import logging
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from bot.services.catalog_service import parse_done_details
from bot.services.delivery_service import create_delivery_entry, persist_delivery_to_r2

logger = logging.getLogger(__name__)
router = Router()

_OFFER_LABELS: dict[str, str] = {
    "access": "Sentinel Access",
    "engine": "Sentinel Engine",
    "architect": "Sentinel Architect",
    "unknown": "Unknown",
}


def _build_delivery_confirmation(entry: dict) -> str:
    offer_label = _OFFER_LABELS.get(entry["detected_offer"], "Unknown")
    email = entry["email"]
    handle = entry["telegram_handle"]

    contact_lines: list[str] = []
    if email:
        contact_lines.append(f"  • Email: {email}")
    if handle:
        contact_lines.append(f"  • Telegram: {handle}")
    if not contact_lines:
        contact_lines.append("  • Not provided")

    text = (
        "<b>Request received.</b>\n\n"
        f"Offer: {offer_label}\n"
        f"Reference ID: <code>{entry['delivery_id'][:8]}</code>\n"
        f"Contact:\n" + "\n".join(contact_lines) + "\n\n"
        "Status: Entered validation queue\n\n"
        "Your request has been recorded and is now pending validation "
        "and controlled access provisioning."
    )

    missing: list[str] = []
    if not email and not handle:
        missing.append("your email address or Telegram handle")
    if entry["detected_offer"] == "unknown":
        missing.append("the offer you purchased (Access, Engine, or Architect)")

    if missing:
        text += "\n\n<i>Still needed: " + " and ".join(missing) + ".</i>"

    return text


async def process_done(message: Message, raw: str) -> None:
    details = parse_done_details(raw)
    user = message.from_user

    # Create in-memory entry immediately (sync, never fails)
    entry = create_delivery_entry(
        user_id=user.id,
        username=user.username or "",
        details=details,
    )
    logger.info(
        "Done processed: delivery_id=%s user_id=%s offer=%s email=%s",
        entry["delivery_id"], user.id, entry["detected_offer"], entry["email"],
    )

    # Send confirmation immediately
    await message.answer(_build_delivery_confirmation(entry))

    # Persist to R2 in background — never blocks the response
    asyncio.create_task(persist_delivery_to_r2(entry))


@router.message(Command("done"))
async def handle_done_command(message: Message) -> None:
    await process_done(message, message.text or "")
