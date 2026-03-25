import logging
from typing import Optional
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from bot.services.delivery_service import (
    list_pending_deliveries,
    get_pending_deliveries_r2,
    mark_delivery_validated,
    mark_delivery_completed,
    create_grant_for_delivery,
    mark_as_delivered,
)

logger = logging.getLogger(__name__)
router = Router()

_OFFER_LABELS: dict[str, str] = {
    "access": "Sentinel Access",
    "engine": "Sentinel Engine",
    "architect": "Sentinel Architect",
    "unknown": "Unknown",
}


def _fmt_item(i: int, e: dict) -> str:
    offer = _OFFER_LABELS.get(e.get("detected_offer") or e.get("offer_slug", ""), e.get("offer_slug", "—"))
    uname = f"@{e['username']}" if e.get("username") else str(e.get("user_id", "—"))
    uid = e.get("user_id", "—")
    email = e.get("email") or e.get("contact", {}).get("email") or "—"
    handle = e.get("telegram_handle") or e.get("contact", {}).get("telegram") or "—"
    did = e.get("delivery_id", "—")
    short_id = did[:8] if len(did) > 8 else did
    status = e.get("status", "—")
    ts = e.get("timestamp") or e.get("created_at") or "—"
    return (
        f"\n{i}.\n"
        f"ID: <code>{short_id}</code>\n"
        f"User: {uname} (id: <code>{uid}</code>)\n"
        f"Offer: {offer}\n"
        f"Email: {email}\n"
        f"Handle: {handle}\n"
        f"Status: {status}\n"
        f"Time: {ts}"
    )


# ---------------------------------------------------------------------------
# /deliveries — list pending queue (R2 with in-memory fallback)
# ---------------------------------------------------------------------------

@router.message(Command("deliveries"))
async def handle_deliveries(message: Message) -> None:
    entries = await get_pending_deliveries_r2()
    if not entries:
        await message.answer("No pending deliveries.")
        return

    lines = [f"<b>Pending deliveries ({len(entries)}):</b>"]
    for i, e in enumerate(entries, 1):
        lines.append(_fmt_item(i, e))
    await message.answer("\n".join(lines))


# ---------------------------------------------------------------------------
# /validate <delivery_id_prefix> — move to validated
# ---------------------------------------------------------------------------

@router.message(Command("validate"))
async def handle_validate(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    if len(parts) < 2:
        await message.answer(
            "Provide the delivery ID (or first 8 chars).\n\nExample: /validate abc12345"
        )
        return

    delivery_id_prefix = parts[1].strip()
    item = await _resolve_by_prefix(delivery_id_prefix)
    if item is None:
        await message.answer(f"Delivery not found: <code>{delivery_id_prefix}</code>")
        return

    result = await mark_delivery_validated(item["delivery_id"])
    if result:
        offer = _OFFER_LABELS.get(result.get("offer_slug", ""), "—")
        await message.answer(
            "<b>Delivery validated.</b>\n\n"
            f"ID: <code>{result['delivery_id'][:8]}</code>\n"
            f"Offer: {offer}\n"
            f"User: {result.get('username') or result.get('user_id')}\n"
            "Status: Validated — ready for access grant."
        )
    else:
        await message.answer("Validation failed. Check delivery ID and R2 connection.")


# ---------------------------------------------------------------------------
# /grant <delivery_id_prefix> — create access grant
# ---------------------------------------------------------------------------

@router.message(Command("grant"))
async def handle_grant(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    if len(parts) < 2:
        await message.answer(
            "Provide the delivery ID.\n\nExample: /grant abc12345"
        )
        return

    delivery_id_prefix = parts[1].strip()
    item = await _resolve_by_prefix(delivery_id_prefix)
    if item is None:
        await message.answer(f"Delivery not found: <code>{delivery_id_prefix}</code>")
        return

    grant = await create_grant_for_delivery(item["delivery_id"])
    if grant:
        offer = _OFFER_LABELS.get(grant.get("offer_slug", ""), grant.get("grant_level", "—"))
        await message.answer(
            "<b>Grant recorded.</b>\n\n"
            f"Grant ID: <code>{grant['grant_id'][:8]}</code>\n"
            f"Delivery ID: <code>{grant['delivery_id'][:8]}</code>\n"
            f"Offer: {offer}\n"
            f"User: {grant.get('username') or grant.get('user_id')}\n"
            "Status: Active\n\n"
            "Digital access activation recorded in grant ledger."
        )
    else:
        await message.answer(
            "Grant creation failed. "
            "Ensure delivery ID is correct and R2 is connected.\n"
            "In-memory fallback: grant not persisted."
        )


# ---------------------------------------------------------------------------
# /complete <delivery_id_prefix> — mark delivery completed
# ---------------------------------------------------------------------------

@router.message(Command("complete"))
async def handle_complete(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    if len(parts) < 2:
        await message.answer(
            "Provide the delivery ID.\n\nExample: /complete abc12345"
        )
        return

    delivery_id_prefix = parts[1].strip()
    item = await _resolve_by_prefix(delivery_id_prefix)
    if item is None:
        await message.answer(f"Delivery not found: <code>{delivery_id_prefix}</code>")
        return

    result = await mark_delivery_completed(item["delivery_id"])
    if result:
        offer = _OFFER_LABELS.get(result.get("offer_slug", ""), "—")
        await message.answer(
            "<b>Delivery completed.</b>\n\n"
            f"ID: <code>{result['delivery_id'][:8]}</code>\n"
            f"Offer: {offer}\n"
            f"User: {result.get('username') or result.get('user_id')}\n"
            "Status: Access status updated — delivery closed."
        )
    else:
        await message.answer("Completion failed. Check delivery ID.")


# ---------------------------------------------------------------------------
# /grants — list active grants from R2
# ---------------------------------------------------------------------------

@router.message(Command("grants"))
async def handle_grants(message: Message) -> None:
    try:
        from bot.services import canon_service
        grants = await canon_service.list_active_grants()
    except Exception:
        grants = []

    if not grants:
        await message.answer("No active grants on record.")
        return

    lines = [f"<b>Active grants ({len(grants)}):</b>"]
    for i, g in enumerate(grants, 1):
        offer = _OFFER_LABELS.get(g.get("offer_slug", ""), g.get("grant_level", "—"))
        uname = f"@{g['username']}" if g.get("username") else str(g.get("user_id", "—"))
        lines.append(
            f"\n{i}.\n"
            f"Grant ID: <code>{g['grant_id'][:8]}</code>\n"
            f"User: {uname}\n"
            f"Offer: {offer}\n"
            f"Status: {g.get('grant_status', '—')}\n"
            f"Created: {g.get('created_at', '—')}"
        )
    await message.answer("\n".join(lines))


# ---------------------------------------------------------------------------
# /markdone <user_id> — legacy in-memory mark (kept for backward compat)
# ---------------------------------------------------------------------------

@router.message(Command("markdone"))
async def handle_markdone(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    if len(parts) < 2 or not parts[1].strip().lstrip("-").isdigit():
        await message.answer(
            "Provide the user ID.\n\nExample: /markdone 123456789\n\n"
            "For full delivery management, use:\n"
            "/validate <id> | /grant <id> | /complete <id>"
        )
        return

    user_id = int(parts[1].strip())
    entry = mark_as_delivered(user_id)
    if entry:
        offer = _OFFER_LABELS.get(entry.get("detected_offer", ""), "—")
        await message.answer(
            "<b>Access status updated.</b>\n\n"
            f"User: {entry.get('username') or user_id}\n"
            f"Offer: {offer}\n"
            "Status: completed"
        )
    else:
        await message.answer(f"No pending delivery found for user <code>{user_id}</code>.")


# ---------------------------------------------------------------------------
# Internal: resolve delivery by short ID prefix
# ---------------------------------------------------------------------------

async def _resolve_by_prefix(prefix: str) -> Optional[dict]:
    """Find a delivery item by full ID or 8-char prefix, checking R2 then in-memory."""
    from bot.services.delivery_service import list_all_deliveries

    # Try R2 queue first
    try:
        from bot.services import canon_service
        queue = await canon_service.get_delivery_queue()
        for array in ("pending_items", "validated_items", "completed_items"):
            for item in queue.get(array, []):
                did = item.get("delivery_id", "")
                if did == prefix or did.startswith(prefix):
                    return item
    except Exception:
        pass

    # Fallback to in-memory
    for entry in list_all_deliveries():
        did = entry.get("delivery_id", "")
        if did == prefix or did.startswith(prefix):
            return entry

    return None
