"""
Delivery service — in-memory registry + async R2 persistence.

In-memory store is always populated immediately.
R2 writes happen asynchronously and never block the user response.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory registry (session store)
# ---------------------------------------------------------------------------

_registry: list[dict] = []
_buy_context: dict[int, str] = {}


# ---------------------------------------------------------------------------
# Buy context
# ---------------------------------------------------------------------------

def set_buy_context(user_id: int, slug: str) -> None:
    _buy_context[user_id] = slug


def get_buy_context(user_id: int) -> str:
    return _buy_context.get(user_id, "")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _detect_offer(details: str, user_id: int) -> str:
    lower = details.lower()
    if "architect" in lower or "297" in lower:
        return "architect"
    if "engine" in lower or " 97" in lower:
        return "engine"
    if "access" in lower or " 29" in lower:
        return "access"
    ctx = get_buy_context(user_id)
    if ctx in ("access", "engine", "architect"):
        return ctx
    return "unknown"


def _extract_contact(details: str) -> tuple[str, str]:
    email = ""
    handle = ""
    for part in details.replace("/", " ").replace(",", " ").split():
        stripped = part.strip(".,;")
        if not email and "@" in stripped and "." in stripped and not stripped.startswith("@"):
            email = stripped
        elif not handle and stripped.startswith("@"):
            handle = stripped
    return email, handle


# ---------------------------------------------------------------------------
# Core in-memory entry creation
# ---------------------------------------------------------------------------

def create_delivery_entry(
    user_id: int,
    username: str,
    details: str,
) -> dict:
    email, handle = _extract_contact(details)
    if not handle and username:
        handle = f"@{username}"
    offer = _detect_offer(details, user_id)
    ts = _now()
    entry = {
        "delivery_id": str(uuid.uuid4()),
        "id": len(_registry) + 1,
        "timestamp": ts,
        "created_at": ts,
        "updated_at": ts,
        "user_id": user_id,
        "username": username or "",
        "email": email,
        "telegram_handle": handle,
        "detected_offer": offer,
        "offer_slug": offer,
        "status": "pending",
        "raw_details": details,
    }
    _registry.append(entry)
    logger.info(
        "Delivery entry created: delivery_id=%s user_id=%s offer=%s",
        entry["delivery_id"], user_id, offer,
    )
    return entry


# ---------------------------------------------------------------------------
# R2 persistence (async, non-blocking)
# ---------------------------------------------------------------------------

async def persist_delivery_to_r2(entry: dict) -> None:
    """Write delivery entry to R2 queue and log. Errors are logged, never raised."""
    try:
        from bot.services import canon_service
        queue_item = {
            "delivery_id": entry["delivery_id"],
            "user_id": entry["user_id"],
            "username": entry["username"],
            "offer_slug": entry["offer_slug"],
            "contact": {
                "email": entry["email"],
                "telegram": entry["telegram_handle"],
            },
            "status": "pending",
            "created_at": entry["created_at"],
            "updated_at": entry["updated_at"],
        }
        await canon_service.append_delivery_queue_item(queue_item)
        await canon_service.append_delivery_log({
            "timestamp": entry["created_at"],
            "event_type": "delivery_created",
            "delivery_id": entry["delivery_id"],
            "user_id": entry["user_id"],
            "offer_slug": entry["offer_slug"],
            "details": f"contact: {entry['email'] or entry['telegram_handle'] or 'not provided'}",
        })
        logger.info("Delivery persisted to R2: %s", entry["delivery_id"])
    except Exception as e:
        logger.warning("R2 persist failed (in-memory still active): %s", type(e).__name__)


# ---------------------------------------------------------------------------
# In-memory queries
# ---------------------------------------------------------------------------

def list_pending_deliveries() -> list[dict]:
    return [e for e in _registry if e["status"] == "pending"]


def list_all_deliveries() -> list[dict]:
    return list(_registry)


def get_delivery_by_id(delivery_id: str) -> Optional[dict]:
    for e in _registry:
        if e.get("delivery_id") == delivery_id:
            return e
    return None


def mark_as_delivered(user_id: int) -> Optional[dict]:
    for entry in reversed(_registry):
        if entry["user_id"] == user_id and entry["status"] != "completed":
            entry["status"] = "completed"
            entry["updated_at"] = _now()
            logger.info("In-memory delivery completed: user_id=%s", user_id)
            return entry
    return None


def get_user_pending(user_id: int) -> Optional[dict]:
    for entry in reversed(_registry):
        if entry["user_id"] == user_id and entry["status"] == "pending":
            return entry
    return None


# ---------------------------------------------------------------------------
# R2-backed admin operations
# ---------------------------------------------------------------------------

async def get_pending_deliveries_r2() -> list[dict]:
    """Read pending_items from R2 queue. Falls back to in-memory."""
    try:
        from bot.services import canon_service
        queue = await canon_service.get_delivery_queue()
        return queue.get("pending_items", [])
    except Exception:
        pass
    return list_pending_deliveries()


async def mark_delivery_validated(delivery_id: str) -> Optional[dict]:
    """Move delivery from pending to validated in R2. Also update in-memory."""
    try:
        from bot.services import canon_service
        item = await canon_service.move_delivery_item(delivery_id, "validated")
        if item:
            await canon_service.append_delivery_log({
                "timestamp": _now(),
                "event_type": "delivery_validated",
                "delivery_id": delivery_id,
                "user_id": item.get("user_id"),
                "offer_slug": item.get("offer_slug"),
            })
        # Sync in-memory
        mem = get_delivery_by_id(delivery_id)
        if mem:
            mem["status"] = "validated"
            mem["updated_at"] = _now()
        return item
    except Exception as e:
        logger.warning("mark_delivery_validated error: %s", e)
        return None


async def mark_delivery_completed(delivery_id: str) -> Optional[dict]:
    """Move delivery to completed in R2. Also update in-memory."""
    try:
        from bot.services import canon_service
        item = await canon_service.move_delivery_item(delivery_id, "completed")
        if item:
            await canon_service.append_delivery_log({
                "timestamp": _now(),
                "event_type": "delivery_completed",
                "delivery_id": delivery_id,
                "user_id": item.get("user_id"),
                "offer_slug": item.get("offer_slug"),
            })
        mem = get_delivery_by_id(delivery_id)
        if mem:
            mem["status"] = "completed"
            mem["updated_at"] = _now()
        return item
    except Exception as e:
        logger.warning("mark_delivery_completed error: %s", e)
        return None


async def create_grant_for_delivery(delivery_id: str) -> Optional[dict]:
    """Resolve delivery → create grant in R2 grant ledger."""
    try:
        from bot.services import canon_service

        # Try R2 first
        queue = await canon_service.get_delivery_queue()
        item = None
        for array in ("validated_items", "pending_items", "completed_items"):
            for i in queue.get(array, []):
                if i.get("delivery_id") == delivery_id:
                    item = i
                    break
            if item:
                break

        # Fallback to in-memory
        if item is None:
            item = get_delivery_by_id(delivery_id)

        if item is None:
            logger.warning("Grant: delivery_id %s not found", delivery_id)
            return None

        grant = await canon_service.create_grant_entry(
            delivery_id=delivery_id,
            user_id=item.get("user_id", 0),
            username=item.get("username", ""),
            offer_slug=item.get("offer_slug") or item.get("detected_offer", "unknown"),
        )
        return grant
    except Exception as e:
        logger.warning("create_grant_for_delivery error: %s", e)
        return None


async def has_active_grant(user_id: int, offer_slug: Optional[str] = None) -> bool:
    """Check if user has an active grant in R2. Falls back to False."""
    try:
        from bot.services import canon_service
        return await canon_service.has_active_grant(user_id, offer_slug)
    except Exception:
        return False
