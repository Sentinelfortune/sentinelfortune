"""
Sentinel Fortune — Product Delivery Engine.

Two layers:

1. GENERIC ENGINE  (deliver_product_to_user)
   Reads any product from PRODUCT_REGISTRY and delivers in the standard sequence:
     1. Welcome
     2. PDF  (primary asset, always delivered first)
     3. TTS audio  (optional — only if tts_available and asset exists in R2)
     4. CTA
   Channel access is NOT sent here — handled by deliver_tier_access in user_activation.

2. LEGACY STORE LAYER  (deliver_product, log_sale, log_access_registry)
   Handles PayPal-based single-product sales. Unchanged.

All products must be defined in bot.services.product_registry.
No custom per-product logic in delivery code.
"""

import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Product registry
# ---------------------------------------------------------------------------

PRODUCTS: dict[str, dict] = {
    "reset_v1":             {"price": 9.99,  "label": "RESET",             "type": "channel_access"},
    "quick_access_v1":      {"price": 15,    "label": "Quick Access",       "type": "channel_access"},
    "teachings_vault_v1":   {"price": 19,    "label": "Teachings Vault",    "type": "channel_access"},
    "sentinel_access_v1":   {"price": 29,    "label": "Sentinel Access",    "type": "channel_access"},
    "sentinel_engine_v1":   {"price": 97,    "label": "Sentinel Engine",    "type": "channel_access"},
    "sentinel_architect_v1":{"price": 297,   "label": "Sentinel Architect", "type": "channel_access"},
}

# ---------------------------------------------------------------------------
# PayPal links
# ---------------------------------------------------------------------------

PAYPAL_LINKS: dict[str, str] = {
    "reset_v1":             "https://www.paypal.com/ncp/payment/8MY7TBVHJRKFA",
    "quick_access_v1":      "https://www.paypal.com/ncp/payment/B7ADVVFY4XLR6",
    "teachings_vault_v1":   "https://www.paypal.com/ncp/payment/XC6CL3KNDPKTL",
    "sentinel_access_v1":   "https://www.paypal.com/ncp/payment/56BUAMDBSA8S4",
    "sentinel_engine_v1":   "https://www.paypal.com/ncp/payment/EWCHBZS4YRTUN",
    "sentinel_architect_v1":"https://www.paypal.com/ncp/payment/E77FW9BRX2EZ6",
}

# ---------------------------------------------------------------------------
# Private Telegram channel links
# ---------------------------------------------------------------------------

CHANNEL_LINKS: dict[str, str] = {
    "reset_v1":             "https://t.me/+TxavuR1J1tphOGY5",
    "quick_access_v1":      "https://t.me/+kLqEl4_BUE83NjFh",
    "teachings_vault_v1":   "https://t.me/+WNHBwWxk7ahjOTEx",
    "sentinel_access_v1":   "https://t.me/+21Viedkj9kUyNmMx",
    "sentinel_engine_v1":   "https://t.me/+ECuJPOmfSwplNGIx",
    "sentinel_architect_v1":"https://t.me/+eqKVBpnzrmNmOWYx",
}

# ---------------------------------------------------------------------------
# R2 prefixes
# ---------------------------------------------------------------------------

_SALES_PREFIX  = "originus/sales/"
_ACCESS_PREFIX = "originus/access/"


# ---------------------------------------------------------------------------
# R2 sale logger — originus/sales/{user_id}_{timestamp}.json
# ---------------------------------------------------------------------------

async def log_sale(user_id: int, username: str | None, product_id: str) -> None:
    """Write sale record to R2. Called via asyncio.create_task() — never delays delivery."""
    try:
        from bot.services.r2_service import put_json
        now = datetime.now(timezone.utc)
        channel = CHANNEL_LINKS.get(product_id, "")
        key = f"{_SALES_PREFIX}{user_id}_{now.strftime('%Y%m%dT%H%M%S')}.json"
        record = {
            "user_id":    user_id,
            "username":   username or f"user_{user_id}",
            "product_id": product_id,
            "channel":    channel,
            "status":     "granted",
            "timestamp":  now.isoformat(),
            "source":     "telegram_bot",
        }
        ok = await put_json(key, record)
        if ok:
            logger.info("Sale logged: product=%s user_id=%s key=%s", product_id, user_id, key)
        else:
            logger.warning("Sale log falsy: product=%s key=%s", product_id, key)
    except Exception as exc:
        logger.warning("log_sale failed (non-blocking): product=%s error=%s", product_id, exc)


# ---------------------------------------------------------------------------
# R2 access registry — originus/access/{product_id}/{user_id}.json
# ---------------------------------------------------------------------------

async def log_access_registry(user_id: int, username: str | None, product_id: str) -> None:
    """Write access record to registry. Called via asyncio.create_task()."""
    try:
        from bot.services.r2_service import put_json
        now = datetime.now(timezone.utc)
        key = f"{_ACCESS_PREFIX}{product_id}/{user_id}.json"
        record = {
            "user_id":   user_id,
            "username":  username or f"user_{user_id}",
            "product":   product_id,
            "granted":   True,
            "timestamp": now.isoformat(),
        }
        ok = await put_json(key, record)
        if ok:
            logger.info("Access registry written: product=%s user_id=%s", product_id, user_id)
        else:
            logger.warning("Access registry falsy: product=%s user_id=%s", product_id, user_id)
    except Exception as exc:
        logger.warning("log_access_registry failed: product=%s error=%s", product_id, exc)


# ---------------------------------------------------------------------------
# Deliver product — sends channel link + fires both R2 background writes
# ---------------------------------------------------------------------------

async def deliver_product(message, user_id: int, username: str | None, product_id: str) -> None:
    """
    Send private channel access to the user and write both R2 records.

    message   — aiogram Message object (callback.message)
    Delivery is immediate. Both R2 writes are background tasks, never block.
    """
    from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

    channel_url = CHANNEL_LINKS.get(product_id, "")
    label = PRODUCTS.get(product_id, {}).get("label", product_id)

    if channel_url:
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="ENTER CHANNEL", url=channel_url)]
        ])
        await message.answer(
            "Access granted. Enter your private channel.",
            reply_markup=kb,
        )
    else:
        await message.answer("Access granted. Your access has been recorded.")
        logger.warning("deliver_product: no channel link for product_id=%s", product_id)

    asyncio.create_task(log_sale(user_id, username, product_id))
    asyncio.create_task(log_access_registry(user_id, username, product_id))
    logger.info("Product delivered: product=%s user_id=%s", product_id, user_id)


# ---------------------------------------------------------------------------
# Generic product delivery engine
# ---------------------------------------------------------------------------
# Uses PRODUCT_REGISTRY — no custom logic per product.
#
# Delivery sequence:
#   1. Welcome message
#   2. PDF  (primary asset, always first)
#   3. TTS audio  (only if product.tts_available AND asset exists in R2)
#   4. CTA message
#
# Channel access is sent separately by deliver_tier_access in user_activation.
# ---------------------------------------------------------------------------

async def deliver_product_to_user(bot, user_id: int, product_id: str) -> dict:
    """
    Generic product delivery engine.

    Reads the product model from PRODUCT_REGISTRY and delivers in standard order:
      1. Welcome
      2. PDF  (primary — always attempted first)
      3. TTS  (optional — skipped when not available or asset missing)
      4. CTA

    Returns {"ok": bool, "product_id": str, "steps": list[str], "error": str|None}
    """
    from aiogram.types import BufferedInputFile
    from bot.services.r2_service import get_bytes
    from bot.services.product_registry import get_product

    product = get_product(product_id)
    if not product:
        logger.error("deliver_product_to_user: unknown product_id=%s uid=%s", product_id, user_id)
        return {"ok": False, "product_id": product_id, "steps": [], "error": f"unknown product: {product_id}"}

    msgs   = product["messages"]
    paths  = product["r2_paths"]
    fnames = product["filenames"]
    label  = product["label"]
    steps: list[str] = []

    try:
        # ── 1. Welcome ────────────────────────────────────────────────────
        await bot.send_message(chat_id=user_id, text=msgs["welcome"])
        steps.append("welcome")
        logger.info("product_delivery: welcome product=%s uid=%s", product_id, user_id)

        # ── 2. PDF (primary asset) ────────────────────────────────────────
        pdf_bytes = await get_bytes(paths["pdf"])
        if pdf_bytes:
            pdf_file = BufferedInputFile(pdf_bytes, filename=fnames["pdf"])
            await bot.send_document(
                chat_id=user_id,
                document=pdf_file,
                caption=msgs["pdf_caption"],
            )
            steps.append("pdf_file")
            logger.info(
                "product_delivery: PDF sent product=%s uid=%s bytes=%d",
                product_id, user_id, len(pdf_bytes),
            )
        else:
            await bot.send_message(chat_id=user_id, text=msgs["pdf_missing"])
            steps.append("pdf_unavailable")
            logger.warning(
                "product_delivery: PDF missing in R2 product=%s uid=%s key=%s",
                product_id, user_id, paths["pdf"],
            )

        # ── 3. TTS audio (optional) ───────────────────────────────────────
        if product.get("tts_available"):
            audio_bytes = await get_bytes(paths["audio"])
            if audio_bytes:
                audio_file = BufferedInputFile(audio_bytes, filename=fnames["audio"])
                await bot.send_audio(
                    chat_id=user_id,
                    audio=audio_file,
                    title=label,
                    performer="Sentinel Fortune",
                    caption=msgs["tts_caption"],
                )
                steps.append("tts_file")
                logger.info(
                    "product_delivery: TTS sent product=%s uid=%s bytes=%d",
                    product_id, user_id, len(audio_bytes),
                )
            else:
                steps.append("tts_unavailable")
                logger.warning(
                    "product_delivery: TTS flagged available but missing in R2 product=%s uid=%s",
                    product_id, user_id,
                )
        else:
            steps.append("tts_skipped")

        # ── 4. CTA ────────────────────────────────────────────────────────
        await bot.send_message(chat_id=user_id, text=msgs["cta"])
        steps.append("cta")
        logger.info("product_delivery: CTA sent product=%s uid=%s", product_id, user_id)

        return {"ok": True, "product_id": product_id, "steps": steps, "error": None}

    except Exception as exc:
        logger.error(
            "product_delivery: failed product=%s uid=%s steps=%s: %s",
            product_id, user_id, steps, exc,
        )
        return {"ok": False, "product_id": product_id, "steps": steps, "error": str(exc)}


# ---------------------------------------------------------------------------
# Backward-compatibility shim — do not remove while user_activation references it
# ---------------------------------------------------------------------------

async def deliver_execution_v1(bot, user_id: int) -> dict:
    """Deprecated shim — routes to deliver_product_to_user("execution_v1")."""
    return await deliver_product_to_user(bot, user_id, "execution_v1")
