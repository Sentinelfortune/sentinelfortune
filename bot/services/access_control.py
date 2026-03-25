"""
Access control layer.

Provides:
  is_owner(user_id)  -- reads OWNER_TELEGRAM_IDS from env, returns bool
  require_owner      -- async decorator; blocks non-owners with a standard reply

Crash-safe: if OWNER_TELEGRAM_IDS is missing or malformed, no user is granted
owner access and the bot does not crash.
"""

import functools
import logging
import os

from aiogram.types import Message

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Deny message shown to non-owners
# ---------------------------------------------------------------------------

_DENY_MESSAGE = (
    "<b>Private access only.</b> Submit a validated request.\n\n"
    "Public information is minimal by design.\n"
    "Sensitive materials are disclosed only on validated request."
)


# ---------------------------------------------------------------------------
# is_owner
# ---------------------------------------------------------------------------

def is_owner(user_id: int) -> bool:
    """
    Return True if user_id is listed in the OWNER_TELEGRAM_IDS env var.

    OWNER_TELEGRAM_IDS format: comma-separated integers, e.g. "123456789,987654321"

    Returns False (never crashes) if:
    - the env var is missing
    - the env var is empty
    - all entries fail int() conversion
    """
    raw = os.environ.get("OWNER_TELEGRAM_IDS", "").strip()
    if not raw:
        return False

    owners: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if part:
            try:
                owners.add(int(part))
            except ValueError:
                logger.warning("access_control: non-integer in OWNER_TELEGRAM_IDS: %r", part)

    return user_id in owners


# ---------------------------------------------------------------------------
# require_owner decorator
# ---------------------------------------------------------------------------

def require_owner(handler):
    """
    Async decorator for aiogram message handlers.

    Usage:
        @router.message(Command("some_command"))
        @require_owner
        async def handle_some_command(message: Message) -> None:
            ...

    If the user is not an owner:
      - Sends the standard deny message
      - Returns immediately (handler body never executes)
    """
    @functools.wraps(handler)
    async def wrapper(message: Message, *args, **kwargs):
        if not is_owner(message.from_user.id):
            logger.info(
                "access_control: denied %s (@%s) access to %s",
                message.from_user.id,
                message.from_user.username or "no_username",
                handler.__name__,
            )
            await message.answer(_DENY_MESSAGE)
            return
        return await handler(message, *args, **kwargs)

    return wrapper
