"""
BUSINESS FOUNDATION product service — SentinelFortune Bot.

Handles:
  - Delivery text (static, deterministic)
  - R2 sale logging to originus/sales/

Mirrors reset_service.py structure exactly.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_SALES_PREFIX = "originus/sales/"

PAYPAL_BUSINESS_URL = "https://www.paypal.com/ncp/payment/XC6CL3KNDPKTL"

BUSINESS_CONTENT = """\
<b>BUSINESS FOUNDATION</b>

<b>Step 1 — Choose ONE direction</b> (do not split focus)

<b>Step 2 — Define ONE offer</b> (clear, simple, sellable)

<b>Step 3 — Start small</b> (do not overbuild)

<b>Step 4 — Sell before scaling</b>

<b>Step 5 — Improve based on real users</b>

You now have your base. Execute."""


def get_business_content() -> str:
    """Return the BUSINESS FOUNDATION delivery text. Pure function — no I/O."""
    return BUSINESS_CONTENT


async def log_business_sale(user_id: int, username: str | None) -> None:
    """
    Write a sale record to originus/sales/{user_id}_{timestamp}.json.
    Called as asyncio.create_task() — never blocks delivery.
    """
    try:
        from bot.services.r2_service import put_json
        now = datetime.now(timezone.utc)
        key = f"{_SALES_PREFIX}{user_id}_{now.strftime('%Y%m%dT%H%M%S')}.json"
        record = {
            "user_id":   user_id,
            "username":  username or f"user_{user_id}",
            "product":   "business_foundation_v1",
            "status":    "delivered",
            "timestamp": now.isoformat(),
            "source":    "telegram_bot",
        }
        ok = await put_json(key, record)
        if ok:
            logger.info("BUSINESS FOUNDATION sale logged: user_id=%s key=%s", user_id, key)
        else:
            logger.warning("BUSINESS sale log returned falsy: key=%s", key)
    except Exception as exc:
        logger.warning("log_business_sale failed (non-blocking): %s", exc)
