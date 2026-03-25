"""
Canon service — canonical R2 key access for SFL structures.

All keys map to originus/global/sfl/... as specified.
Every function falls back gracefully when R2 is unavailable.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from bot.services import r2_service

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Canonical R2 keys
# ---------------------------------------------------------------------------

_CATALOG_KEY = "originus/global/sfl/products/catalog/PRODUCT_CATALOG_INDEX.v1.json"

_OFFER_KEYS: dict[str, str] = {
    "access":   "originus/global/sfl/products/offers/OFFER_SENTINEL_ACCESS.v1.json",
    "engine":   "originus/global/sfl/products/offers/OFFER_SENTINEL_ENGINE.v1.json",
    "architect":"originus/global/sfl/products/offers/OFFER_SENTINEL_ARCHITECT.v1.json",
}

_ACCESS_POLICY_KEY = "originus/global/sfl/access/policies/ACCESS_POLICY_INDEX.v1.json"
_GRANT_POLICY_KEY  = "originus/global/sfl/access/policies/GRANT_POLICY_INDEX.v1.json"
_GRANT_LEDGER_KEY  = "originus/global/sfl/access/grants/GRANT_LEDGER_INDEX.v1.json"
_DELIVERY_QUEUE_KEY = "originus/global/sfl/delivery/queues/DELIVERY_QUEUE_INDEX.v1.json"
_DELIVERY_LOG_KEY  = "originus/global/sfl/delivery/logs/DELIVERY_LOG_INDEX.v1.json"

_EMPTY_QUEUE = {"pending_items": [], "validated_items": [], "completed_items": []}
_EMPTY_LEDGER = {"active_grants": [], "pending_grants": [], "revoked_grants": []}
_EMPTY_LOG = {"entries": []}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Product catalog
# ---------------------------------------------------------------------------

async def get_product_catalog() -> Optional[list]:
    data = await r2_service.get_json(_CATALOG_KEY)
    if data and "public_offers" in data:
        return data["public_offers"]
    return None


async def get_offer_by_slug(slug: str) -> Optional[dict]:
    key = _OFFER_KEYS.get(slug.lower())
    if not key:
        return None
    return await r2_service.get_json(key)


# ---------------------------------------------------------------------------
# Access policies
# ---------------------------------------------------------------------------

async def get_access_policy_index() -> Optional[dict]:
    return await r2_service.get_json(_ACCESS_POLICY_KEY)


async def get_grant_policy_index() -> Optional[dict]:
    return await r2_service.get_json(_GRANT_POLICY_KEY)


# ---------------------------------------------------------------------------
# Grant ledger
# ---------------------------------------------------------------------------

async def get_grant_ledger() -> dict:
    data = await r2_service.get_json(_GRANT_LEDGER_KEY)
    return data if data else _EMPTY_LEDGER.copy()


async def save_grant_ledger(data: dict) -> bool:
    return await r2_service.put_json(_GRANT_LEDGER_KEY, data)


async def create_grant_entry(
    delivery_id: str,
    user_id: int,
    username: str,
    offer_slug: str,
) -> Optional[dict]:
    ledger = await get_grant_ledger()
    grant = {
        "grant_id": new_id(),
        "delivery_id": delivery_id,
        "user_id": user_id,
        "username": username,
        "offer_slug": offer_slug,
        "grant_level": offer_slug,
        "grant_status": "active",
        "created_at": _now(),
        "updated_at": _now(),
    }
    ledger.setdefault("active_grants", []).append(grant)
    ok = await save_grant_ledger(ledger)
    if ok:
        logger.info("Grant created: grant_id=%s user=%s offer=%s", grant["grant_id"], user_id, offer_slug)
        await append_delivery_log({
            "timestamp": _now(),
            "event_type": "grant_created",
            "grant_id": grant["grant_id"],
            "delivery_id": delivery_id,
            "user_id": user_id,
            "offer_slug": offer_slug,
        })
        return grant
    return None


async def list_active_grants() -> list:
    ledger = await get_grant_ledger()
    return ledger.get("active_grants", [])


async def has_active_grant(user_id: int, offer_slug: Optional[str] = None) -> bool:
    grants = await list_active_grants()
    for g in grants:
        if g.get("user_id") == user_id and g.get("grant_status") == "active":
            if offer_slug is None or g.get("offer_slug") == offer_slug:
                return True
    return False


# ---------------------------------------------------------------------------
# Delivery queue
# ---------------------------------------------------------------------------

async def get_delivery_queue() -> dict:
    data = await r2_service.get_json(_DELIVERY_QUEUE_KEY)
    return data if data else _EMPTY_QUEUE.copy()


async def save_delivery_queue(data: dict) -> bool:
    return await r2_service.put_json(_DELIVERY_QUEUE_KEY, data)


async def append_delivery_queue_item(item: dict) -> bool:
    return await r2_service.append_to_array(
        _DELIVERY_QUEUE_KEY, item, "pending_items", _EMPTY_QUEUE.copy()
    )


async def move_delivery_item(delivery_id: str, to_status: str) -> Optional[dict]:
    """
    Move a delivery item between queue arrays based on new status.
    Returns the updated item or None if not found.
    """
    queue = await get_delivery_queue()
    found = None
    from_array = None

    for array_name in ("pending_items", "validated_items", "completed_items"):
        for item in queue.get(array_name, []):
            if item.get("delivery_id") == delivery_id:
                found = item
                from_array = array_name
                break
        if found:
            break

    if not found:
        return None

    # Determine target array
    to_array_map = {
        "validated": "validated_items",
        "completed": "completed_items",
    }
    to_array = to_array_map.get(to_status, "pending_items")

    # Remove from source
    queue[from_array] = [i for i in queue[from_array] if i.get("delivery_id") != delivery_id]

    # Update and add to target
    found["status"] = to_status
    found["updated_at"] = _now()
    queue.setdefault(to_array, []).append(found)

    ok = await save_delivery_queue(queue)
    if ok:
        logger.info("Delivery %s moved to %s", delivery_id, to_status)
        return found
    return None


# ---------------------------------------------------------------------------
# Delivery log
# ---------------------------------------------------------------------------

async def get_delivery_log() -> dict:
    data = await r2_service.get_json(_DELIVERY_LOG_KEY)
    return data if data else _EMPTY_LOG.copy()


async def append_delivery_log(entry: dict) -> bool:
    return await r2_service.append_log_entry(_DELIVERY_LOG_KEY, entry)
