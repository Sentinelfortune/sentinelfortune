"""
RESET product service — SentinelFortune Bot.

Handles:
  - Delivery text (static, deterministic)
  - R2 sale logging to originus/sales/

Design rules:
  - Pure delivery: no I/O in get_reset_content()
  - R2 write: non-blocking, never raises, never delays delivery
  - Isolated from all other services
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_SALES_PREFIX = "originus/sales/"

PAYPAL_RESET_URL = "https://www.paypal.com/ncp/payment/8MY7TBVHJRKFA"

# ---------------------------------------------------------------------------
# Product content — static, delivered instantly on confirmation
# ---------------------------------------------------------------------------

RESET_CONTENT = """\
<b>RESET — Rebuild Your Inner Foundation</b>

Read this slowly.

This is not content.
This is a reset.

—

<b>STEP 1 — STOP</b>

Pause.

Take one deep breath.

Inhale slowly through your nose.
Hold for 3 seconds.
Exhale slowly.

Do it again.

You are not rushing anymore.

—

<b>STEP 2 — UNDERSTAND</b>

You are not tired because life is too heavy.

You are tired because your internal foundation is unstable.

When your inner state is unstable:
— everything feels harder
— decisions feel confusing
— pressure builds faster

Nothing outside needs to change first.

Your state comes first.

—

<b>STEP 3 — RESET</b>

Put your attention inside your body.

Not your thoughts.
Not your problems.

Your body.

Now say (out loud if possible):

<i>"I am stabilizing."</i>
<i>"I am not lost. I am recalibrating."</i>
<i>"I choose clarity over pressure."</i>

Again.

Slower this time.

—

<b>STEP 4 — REBUILD</b>

From this moment:

You don't try to fix everything.

You do one thing at a time.

Clarity comes from calm action.

Not pressure.

—

<b>STEP 5 — ANCHOR</b>

Save this:

Whenever you feel overwhelmed:

1. Stop
2. Breathe
3. Repeat:

<i>"I return to myself."</i>

—

<b>FINAL</b>

You are not behind.

You are rebuilding your foundation.

And that changes everything.

—

END."""


def get_reset_content() -> str:
    """Return the RESET delivery text. Pure function — no I/O."""
    return RESET_CONTENT


# ---------------------------------------------------------------------------
# R2 sale logger — non-blocking, never raises
# ---------------------------------------------------------------------------

async def log_reset_sale(user_id: int, username: str | None) -> None:
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
            "product":   "reset_v1",
            "timestamp": now.isoformat(),
            "status":    "delivered",
            "source":    "telegram_bot",
        }
        ok = await put_json(key, record)
        if ok:
            logger.info("RESET sale logged: user_id=%s key=%s", user_id, key)
        else:
            logger.warning("RESET sale log returned falsy: key=%s", key)
    except Exception as exc:
        logger.warning("log_reset_sale failed (non-blocking): %s", exc)
