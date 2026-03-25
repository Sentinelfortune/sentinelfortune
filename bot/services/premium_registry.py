"""
Premium user registry.

Primary storage: R2 at originus/access/premium_users/{user_id}.json
Fallback: local .data/premium_users/{user_id}.json

All functions are async and crash-safe.

Tiers: monthly | starter | pro | oem | licensing
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

_R2_PREFIX = "originus/access/premium_users"
_LOCAL_DIR = Path(".data/premium_users")

VALID_TIERS = {"monthly", "starter", "pro", "oem", "licensing"}
DEFAULT_TIER = "monthly"


# ---------------------------------------------------------------------------
# Local fallback helpers
# ---------------------------------------------------------------------------

def _local_path(user_id: int) -> Path:
    return _LOCAL_DIR / f"{user_id}.json"


def _local_read(user_id: int) -> dict | None:
    try:
        p = _local_path(user_id)
        if p.exists():
            return json.loads(p.read_text())
    except Exception as exc:
        logger.warning("premium_registry local read failed for %s: %s", user_id, exc)
    return None


def _local_write(user_id: int, record: dict) -> None:
    try:
        _LOCAL_DIR.mkdir(parents=True, exist_ok=True)
        _local_path(user_id).write_text(json.dumps(record, indent=2))
    except Exception as exc:
        logger.warning("premium_registry local write failed for %s: %s", user_id, exc)


def _local_delete(user_id: int) -> None:
    try:
        p = _local_path(user_id)
        if p.exists():
            p.unlink()
    except Exception as exc:
        logger.warning("premium_registry local delete failed for %s: %s", user_id, exc)


# ---------------------------------------------------------------------------
# R2 helpers
# ---------------------------------------------------------------------------

async def _r2_read(user_id: int) -> dict | None:
    try:
        from bot.services.r2_service import get_json
        return await get_json(f"{_R2_PREFIX}/{user_id}.json")
    except Exception as exc:
        logger.warning("premium_registry R2 read failed for %s: %s", user_id, exc)
        return None


async def _r2_write(user_id: int, record: dict) -> bool:
    try:
        from bot.services.r2_service import put_json
        return await put_json(f"{_R2_PREFIX}/{user_id}.json", record)
    except Exception as exc:
        logger.warning("premium_registry R2 write failed for %s: %s", user_id, exc)
        return False


async def _r2_delete(user_id: int) -> bool:
    try:
        from bot.services.r2_service import put_json
        return await put_json(
            f"{_R2_PREFIX}/{user_id}.json",
            {"user_id": user_id, "granted": False, "revoked": True,
             "revoked_at": datetime.now(timezone.utc).isoformat()},
        )
    except Exception as exc:
        logger.warning("premium_registry R2 delete failed for %s: %s", user_id, exc)
        return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_premium_record(user_id: int) -> dict | None:
    """Return the premium record for user_id, or None if not found."""
    record = await _r2_read(user_id)
    if record is None:
        record = _local_read(user_id)
    return record


async def is_premium(user_id: int) -> bool:
    """Return True if user has active (granted=True) premium access."""
    record = await get_premium_record(user_id)
    if record is None:
        return False
    return bool(record.get("granted", False))


async def get_tier(user_id: int) -> str | None:
    """Return the tier string for user_id, or None if not premium."""
    record = await get_premium_record(user_id)
    if record is None or not record.get("granted"):
        return None
    return record.get("tier", DEFAULT_TIER)


async def grant_premium(
    user_id: int,
    username: str | None,
    first_name: str | None,
    tier: str = DEFAULT_TIER,
) -> bool:
    """
    Grant premium access to user_id at the specified tier.
    Writes to R2 (primary) and local (fallback).
    Returns True on success.
    """
    if tier not in VALID_TIERS:
        logger.warning("premium_registry: unknown tier %r for %s, defaulting to %s", tier, user_id, DEFAULT_TIER)
        tier = DEFAULT_TIER

    record = {
        "user_id": user_id,
        "username": username or "",
        "first_name": first_name or "",
        "granted": True,
        "tier": tier,
        "granted_at": datetime.now(timezone.utc).isoformat(),
        "source": "manual_confirmation",
    }
    ok = await _r2_write(user_id, record)
    _local_write(user_id, record)
    logger.info(
        "premium_registry: granted premium tier=%s to %s (@%s) r2=%s",
        tier, user_id, username, ok,
    )
    return ok


async def revoke_premium(user_id: int) -> bool:
    """
    Revoke premium access for user_id.
    Marks granted=False in R2 and deletes local file.
    Returns True on success.
    """
    ok = await _r2_delete(user_id)
    _local_delete(user_id)
    logger.info("premium_registry: revoked premium for %s r2=%s", user_id, ok)
    return ok


async def log_payment_confirmation(
    user_id: int,
    username: str | None,
    first_name: str | None,
    tier_hint: str | None = None,
) -> None:
    """
    Write a payment confirmation request to R2.
    Path: originus/sales/payment_confirmations/{user_id}_{timestamp}.json
    Non-blocking safe -- errors are logged, never raised.
    """
    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y%m%dT%H%M%SZ")
    key = f"originus/sales/payment_confirmations/{user_id}_{timestamp}.json"
    record = {
        "user_id": user_id,
        "username": username or "",
        "first_name": first_name or "",
        "requested_at": now.isoformat(),
        "status": "pending",
        "source": "telegram_bot",
        "tier_hint": tier_hint or "unspecified",
    }
    try:
        from bot.services.r2_service import put_json
        ok = await put_json(key, record)
        logger.info("premium_registry: logged payment confirmation for %s ok=%s", user_id, ok)
    except Exception as exc:
        logger.warning("premium_registry: payment confirmation log failed for %s: %s", user_id, exc)
