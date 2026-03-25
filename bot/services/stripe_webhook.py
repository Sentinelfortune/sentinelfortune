"""
Stripe Webhook Auto-Activation Service.

Runs an aiohttp HTTP server alongside the aiogram polling bot.
Handles POST /stripe/webhook — verifies Stripe signatures, resolves
Telegram users, activates them, and delivers tier access immediately.

Port: STRIPE_WEBHOOK_PORT env var (default 8082).
Public URL (via API server proxy): /api/stripe/webhook

R2 paths used:
  originus/sales/stripe_events/{ts}_{event_id}.json       — full event log
  originus/sales/stripe_events/processed/{event_id}.json  — idempotency lock
  originus/users/email_map/{encoded}.json                  — email → user_id

User resolution order (first match wins):
  1. session.client_reference_id   ← primary (set this on Stripe payment links)
  2. session.metadata.telegram_id  ← fallback metadata field
  3. email → R2 email_map lookup   ← last resort

Tier resolution order (first match wins):
  1. session.payment_link → STRIPE_LINK_* env vars
  2. session.metadata.tier (must be a valid tier slug)
  3. session.amount_total → AMOUNT_TIER_MAP (cents)

Safety:
  - Duplicate event     → 200 (idempotent no-op)
  - Signature bad       → 400 (strict when STRIPE_WEBHOOK_SECRET is set)
  - User not found      → log only, 200 (safe skip)
  - Tier not found      → log only, 200 (safe skip)
  - Delivery exception  → logged, event still marked processed, 200
"""

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone

import stripe
from aiohttp import web

from bot.services.user_activation import (
    activate_user,
    deliver_tier_access,
    TIER_CHANNELS,
)
from bot.services.r2_service import get_json, put_json
from bot.services.sales_flow import cancel_followup

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Runtime configuration (read once at import; re-read per-request for secrets
# that may be injected after startup).
# ---------------------------------------------------------------------------

WEBHOOK_PORT: int = int(os.environ.get("STRIPE_WEBHOOK_PORT", "8082"))
VALID_TIERS = set(TIER_CHANNELS.keys())

# Amount in cents → tier (canonical fallback)
AMOUNT_TIER_MAP: dict[int, str] = {
    200:     "lite",
    2500:    "monthly",
    29000:   "starter",
    190000:  "pro",
    750000:  "oem",
    1500000: "licensing",
}

# Stripe Payment Link IDs read from environment (set STRIPE_LINK_<TIER>).
# Example: STRIPE_LINK_MONTHLY=plink_1abc...
_STRIPE_LINK_ENV_KEYS: dict[str, str] = {
    "monthly":   "STRIPE_LINK_MONTHLY",
    "starter":   "STRIPE_LINK_STARTER",
    "pro":       "STRIPE_LINK_PRO",
    "oem":       "STRIPE_LINK_OEM",
    "licensing": "STRIPE_LINK_LICENSING",
}

# R2 namespaces
_R2_STRIPE_EVENTS    = "originus/sales/stripe_events"
_R2_EMAIL_MAP_PREFIX = "originus/users/email_map"


# ---------------------------------------------------------------------------
# Secret accessors (always re-read from env so secrets injected after
# startup are picked up without a restart).
# ---------------------------------------------------------------------------

def _stripe_secret_key() -> str:
    return os.environ.get("STRIPE_SECRET_KEY", "")


def _stripe_webhook_secret() -> str:
    return os.environ.get("STRIPE_WEBHOOK_SECRET", "")


def _build_link_tier_map() -> dict[str, str]:
    """Return {payment_link_id: tier} for all configured STRIPE_LINK_* vars."""
    mapping: dict[str, str] = {}
    for tier, env_key in _STRIPE_LINK_ENV_KEYS.items():
        link_id = os.environ.get(env_key, "").strip()
        if link_id:
            mapping[link_id] = tier
    return mapping


# ---------------------------------------------------------------------------
# Tier resolution
# ---------------------------------------------------------------------------

def _resolve_tier_from_payment_link(payment_link_id: str | None) -> str | None:
    if not payment_link_id:
        return None
    link_map = _build_link_tier_map()
    return link_map.get(payment_link_id)


def _resolve_tier_from_meta(metadata: dict) -> str | None:
    tier = (metadata.get("tier") or "").strip().lower()
    return tier if tier in VALID_TIERS else None


def _resolve_tier_from_amount(amount_cents: int | None) -> str | None:
    if amount_cents is None:
        return None
    return AMOUNT_TIER_MAP.get(amount_cents)


def resolve_tier(session: dict) -> str | None:
    """
    Resolve tier using three-step priority:
      1. payment_link → STRIPE_LINK_* env var match
      2. metadata.tier (explicit slug)
      3. amount_total → AMOUNT_TIER_MAP
    """
    metadata = session.get("metadata") or {}
    payment_link = session.get("payment_link")
    amount_cents = session.get("amount_total")

    return (
        _resolve_tier_from_payment_link(payment_link)
        or _resolve_tier_from_meta(metadata)
        or _resolve_tier_from_amount(amount_cents)
    )


# ---------------------------------------------------------------------------
# User resolution
# ---------------------------------------------------------------------------

def _parse_uid(raw: object) -> int | None:
    try:
        v = str(raw).strip()
        return int(v) if v else None
    except (ValueError, TypeError):
        return None


def _email_key(email: str) -> str:
    safe = re.sub(r"[^a-z0-9._+\-]", "_", email.lower())
    return f"{_R2_EMAIL_MAP_PREFIX}/{safe}.json"


async def _resolve_uid_from_email(email: str | None) -> int | None:
    if not email:
        return None
    try:
        record = await get_json(_email_key(email))
        if record and "user_id" in record:
            return int(record["user_id"])
    except Exception as exc:
        logger.warning("stripe_webhook: email→uid R2 lookup failed: %s", exc)
    return None


async def resolve_user_id(session: dict) -> int | None:
    """
    Resolve Telegram user_id using three-step priority:
      1. session.client_reference_id  (primary — set this on payment links)
      2. session.metadata.telegram_id (fallback metadata)
      3. email → R2 email_map lookup  (last resort)
    """
    # 1. client_reference_id
    cri = session.get("client_reference_id")
    uid = _parse_uid(cri)
    if uid:
        logger.debug("stripe_webhook: resolved uid=%s via client_reference_id", uid)
        return uid

    # 2. metadata.telegram_id
    metadata = session.get("metadata") or {}
    uid = _parse_uid(metadata.get("telegram_id") or metadata.get("user_id"))
    if uid:
        logger.debug("stripe_webhook: resolved uid=%s via metadata", uid)
        return uid

    # 3. email → R2 lookup
    email = session.get("customer_email") or (
        session.get("customer_details") or {}
    ).get("email")
    uid = await _resolve_uid_from_email(email)
    if uid:
        logger.debug("stripe_webhook: resolved uid=%s via email=%s", uid, email)
        return uid

    return None


# ---------------------------------------------------------------------------
# Register email mapping (called by bot when user provides email)
# ---------------------------------------------------------------------------

async def register_email_mapping(user_id: int, email: str) -> bool:
    record = {
        "user_id":    user_id,
        "email":      email,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        ok = await put_json(_email_key(email), record)
        logger.info(
            "stripe_webhook: email mapping saved uid=%s email=%s ok=%s",
            user_id, email, ok,
        )
        return ok
    except Exception as exc:
        logger.warning("stripe_webhook: email mapping write failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# R2 event logging + idempotency
# ---------------------------------------------------------------------------

def _event_key(event_id: str) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{_R2_STRIPE_EVENTS}/{ts}_{event_id}.json"


def _event_lock_key(event_id: str) -> str:
    return f"{_R2_STRIPE_EVENTS}/processed/{event_id}.json"


async def _is_duplicate(event_id: str) -> bool:
    try:
        record = await get_json(_event_lock_key(event_id))
        return record is not None
    except Exception:
        return False


async def _mark_processed(event_id: str, payload: dict) -> None:
    try:
        await put_json(
            _event_lock_key(event_id),
            {"processed": True, "processed_at": datetime.now(timezone.utc).isoformat(), **payload},
        )
    except Exception as exc:
        logger.warning("stripe_webhook: could not mark processed event=%s: %s", event_id, exc)


async def _log_event(event_id: str, event_type: str, data: dict) -> None:
    record = {
        "event_id":   event_id,
        "event_type": event_type,
        "logged_at":  datetime.now(timezone.utc).isoformat(),
        **data,
    }
    try:
        key = _event_key(event_id)
        await put_json(key, record)
        logger.info("stripe_webhook: event logged → %s", key)
    except Exception as exc:
        logger.warning("stripe_webhook: R2 log failed: %s", exc)


# ---------------------------------------------------------------------------
# Core handler — checkout.session.completed
# ---------------------------------------------------------------------------

async def _handle_checkout_completed(session: dict, bot) -> dict:
    """
    Full activation pipeline for a checkout.session.completed event.
    Returns a result dict describing the action taken.
    """
    session_id   = session.get("id", "unknown")
    payment_link = session.get("payment_link")
    amount_cents = session.get("amount_total")
    email        = session.get("customer_email") or (
        session.get("customer_details") or {}
    ).get("email")
    cri = session.get("client_reference_id")
    metadata = session.get("metadata") or {}

    logger.info(
        "stripe_webhook: checkout completed session=%s cri=%s email=%s "
        "amount=%s payment_link=%s meta=%s",
        session_id, cri, email, amount_cents, payment_link, metadata,
    )

    # --- Resolve tier ---
    tier = resolve_tier(session)
    if tier is None:
        logger.warning(
            "stripe_webhook: no tier resolved for session=%s amount=%s link=%s",
            session_id, amount_cents, payment_link,
        )
        return {
            "action":       "no_tier",
            "session_id":   session_id,
            "amount_cents": amount_cents,
            "payment_link": payment_link,
        }

    # --- Resolve user ---
    user_id = await resolve_user_id(session)
    if user_id is None:
        logger.warning(
            "stripe_webhook: no Telegram user resolved for session=%s cri=%s email=%s — log only",
            session_id, cri, email,
        )
        return {
            "action":     "no_user",
            "session_id": session_id,
            "email":      email,
            "tier":       tier,
            "cri":        cri,
        }

    logger.info(
        "stripe_webhook: activating uid=%s tier=%s session=%s",
        user_id, tier, session_id,
    )

    # Write profile + initial delivery state (awaited so R2 init always
    # completes before deliver_tier_access writes delivered=True)
    await activate_user(user_id, tier, source="stripe")

    # Deliver tier access (sends Telegram message + updates delivery state)
    delivery_result = await deliver_tier_access(bot, user_id, tier)

    if delivery_result["ok"]:
        logger.info(
            "stripe_webhook: activation complete uid=%s tier=%s delivery_ok=True session=%s",
            user_id, tier, session_id,
        )
        # Cancel any pending retargeting reminders — payment confirmed
        asyncio.create_task(cancel_followup(user_id, tier))
    else:
        # Activation R2 write succeeded but Telegram delivery failed.
        # Event will still be locked (idempotency) to prevent double-activation.
        # Operator must re-deliver manually via /grant_premium <uid> <tier>.
        logger.error(
            "stripe_webhook: DELIVERY FAILED uid=%s tier=%s session=%s error=%s — "
            "profile written to R2, manual re-delivery required via /grant_premium",
            user_id, tier, session_id, delivery_result.get("error"),
        )
        # Write a failed-delivery record for operator inspection
        asyncio.create_task(put_json(
            f"originus/sales/failed_deliveries/{user_id}_{session_id}.json",
            {
                "user_id":    user_id,
                "tier":       tier,
                "session_id": session_id,
                "error":      delivery_result.get("error"),
                "logged_at":  datetime.now(timezone.utc).isoformat(),
                "action":     "re-deliver via /grant_premium",
            },
        ))

    return {
        "action":         "activated",
        "user_id":        user_id,
        "tier":           tier,
        "email":          email,
        "cri":            cri,
        "session_id":     session_id,
        "payment_link":   payment_link,
        "delivery_ok":    delivery_result["ok"],
        "delivery_error": delivery_result.get("error"),
    }


# ---------------------------------------------------------------------------
# aiohttp request handler
# ---------------------------------------------------------------------------

async def _stripe_webhook_handler(request: web.Request) -> web.Response:
    """POST /stripe/webhook"""
    bot = request.app["bot"]
    payload = await request.read()
    sig_header = request.headers.get("Stripe-Signature", "")

    webhook_secret = _stripe_webhook_secret()
    secret_key     = _stripe_secret_key()

    # Ensure the Stripe client uses the current secret key
    if secret_key:
        stripe.api_key = secret_key

    # --- Strict signature verification ---
    if webhook_secret:
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, webhook_secret
            )
        except stripe.SignatureVerificationError as exc:
            logger.warning("stripe_webhook: signature verification FAILED: %s", exc)
            return web.Response(status=400, text="invalid signature")
        except Exception as exc:
            logger.error("stripe_webhook: construct_event error: %s", exc)
            return web.Response(status=400, text="bad payload")
    else:
        # Dev mode — no secret set, parse without verification
        logger.warning(
            "stripe_webhook: STRIPE_WEBHOOK_SECRET not set — "
            "signature verification SKIPPED (dev/test mode only)"
        )
        try:
            event = stripe.Event.construct_from(
                json.loads(payload), stripe.api_key or ""
            )
        except Exception as exc:
            logger.error("stripe_webhook: JSON parse failed: %s", exc)
            return web.Response(status=400, text="invalid json")

    event_id   = event.get("id", "unknown")
    event_type = event.get("type", "unknown")

    logger.info(
        "stripe_webhook: received event=%s type=%s sig_verified=%s",
        event_id, event_type, bool(webhook_secret),
    )

    # --- Idempotency check ---
    if await _is_duplicate(event_id):
        logger.info("stripe_webhook: duplicate event=%s — 200 no-op", event_id)
        return web.Response(status=200, text="duplicate")

    # --- Route ---
    result: dict = {"action": "unhandled", "event_type": event_type}
    try:
        if event_type == "checkout.session.completed":
            session = event["data"]["object"]
            result = await _handle_checkout_completed(session, bot)
        else:
            logger.info("stripe_webhook: ignoring event type=%s (not handled)", event_type)

        await _log_event(event_id, event_type, result)
        await _mark_processed(event_id, {"event_type": event_type, **result})

    except Exception as exc:
        logger.error(
            "stripe_webhook: unhandled exception event=%s: %s",
            event_id, exc, exc_info=True,
        )
        await _log_event(event_id, event_type, {"error": str(exc)})

    # Always 200 to Stripe
    return web.Response(status=200, text="ok")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

async def _health_handler(request: web.Request) -> web.Response:
    webhook_secret = _stripe_webhook_secret()
    secret_key     = _stripe_secret_key()
    link_map       = _build_link_tier_map()
    body = json.dumps({
        "status":               "ok",
        "service":              "stripe_webhook",
        "stripe_key_set":       bool(secret_key),
        "webhook_secret_set":   bool(webhook_secret),
        "payment_links_mapped": len(link_map),
        "tiers_configured":     list(link_map.values()),
    })
    return web.Response(status=200, text=body, content_type="application/json")


# ---------------------------------------------------------------------------
# App factory + server launcher
# ---------------------------------------------------------------------------

def create_webhook_app(bot) -> web.Application:
    sk = _stripe_secret_key()
    if sk:
        stripe.api_key = sk
    else:
        logger.warning("stripe_webhook: STRIPE_SECRET_KEY not set")

    if not _stripe_webhook_secret():
        logger.warning(
            "stripe_webhook: STRIPE_WEBHOOK_SECRET not set — "
            "running in dev mode (no signature verification)"
        )

    app = web.Application()
    app["bot"] = bot
    app.router.add_post("/stripe/webhook", _stripe_webhook_handler)
    app.router.add_get("/health", _health_handler)
    return app


async def start_webhook_server(bot) -> None:
    """
    Launch the aiohttp webhook server on STRIPE_WEBHOOK_PORT.
    Called as asyncio.create_task() from bot/main.py.
    """
    app = create_webhook_app(bot)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", WEBHOOK_PORT)
    await site.start()
    logger.info(
        "stripe_webhook: listening on :%d — POST /stripe/webhook",
        WEBHOOK_PORT,
    )
