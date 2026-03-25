import logging
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, BufferedInputFile

from bot.services.product_store import (
    get_product, get_bundle,
    update_product_price, update_bundle_price,
)
from bot.services.pricing_service import suggest_price
from bot.services.offer_service import (
    generate_offer_text, set_paypal_link, get_paypal_link,
)
from bot.services.content_store import get_content
from bot.services.export_service import generate_pdf, generate_docx, safe_filename
from bot.services.tts_service import generate_audio, prepare_for_tts

logger = logging.getLogger(__name__)
router = Router()


def _get_latest_product_or_bundle(user_id: int) -> tuple[dict | None, bool]:
    product = get_product(user_id)
    bundle = get_bundle(user_id)
    if product and bundle:
        return (product, False) if product["timestamp"] >= bundle["timestamp"] else (bundle, True)
    if product:
        return product, False
    if bundle:
        return bundle, True
    return None, False


# ---------------------------------------------------------------------------
# /setpaypal
# ---------------------------------------------------------------------------

@router.message(Command("setpaypal"))
async def handle_setpaypal(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    link = parts[1].strip() if len(parts) > 1 else ""

    if not link:
        current = get_paypal_link()
        if current:
            await message.answer(
                f"Current PayPal link: {current}\n\n"
                "To update it, send:\n/setpaypal https://paypal.me/yourname"
            )
        else:
            await message.answer(
                "No PayPal link configured.\n\n"
                "Set it with:\n/setpaypal https://paypal.me/yourname"
            )
        return

    if not (link.startswith("https://paypal.me/") or link.startswith("http://paypal.me/")):
        await message.answer(
            "That does not look like a PayPal.Me link.\n\n"
            "Expected format:\n/setpaypal https://paypal.me/yourname"
        )
        return

    set_paypal_link(link)
    await message.answer(
        f"PayPal link saved: {link}\n\n"
        "Run /offerproduct to generate a full offer message with this payment link."
    )


# ---------------------------------------------------------------------------
# /price
# ---------------------------------------------------------------------------

@router.message(Command("price"))
async def handle_price(message: Message) -> None:
    user_id = message.from_user.id
    entry, is_bundle = _get_latest_product_or_bundle(user_id)

    if not entry:
        await message.answer(
            "No product or bundle found for this session.\n\n"
            "Run /product or /bundle first."
        )
        return

    from bot.services.catalog_service import map_to_offer

    stored_price = entry.get("price")
    matched_offer = map_to_offer(
        entry["product_type"],
        content_length=len(entry["body"]),
        title=entry["title"],
        body=entry["body"][:300],
    )
    real_price = matched_offer["price_usd"]
    currency = "USD"

    if stored_price is not None:
        await message.answer(
            f"<b>{entry['title']}</b>\n\n"
            f"Suggested price: ${stored_price} USD\n"
            f"Matched offer: <b>{matched_offer['title']}</b>\n\n"
            "Run /offerproduct to generate the full offer message."
        )
        return

    if is_bundle:
        update_bundle_price(user_id, real_price, currency)
    else:
        update_product_price(user_id, real_price, currency)

    _, justification = suggest_price(
        entry["product_type"],
        content_length=len(entry["body"]),
        bundle=is_bundle,
    )

    await message.answer(
        f"<b>{entry['title']}</b>\n\n"
        f"Suggested price: ${real_price} USD\n"
        f"Matched offer: <b>{matched_offer['title']}</b>\n"
        f"<i>{justification}</i>\n\n"
        "Run /offerproduct to generate the full offer message."
    )


# ---------------------------------------------------------------------------
# /offerproduct
# ---------------------------------------------------------------------------

@router.message(Command("offerproduct"))
async def handle_offerproduct(message: Message) -> None:
    user_id = message.from_user.id
    entry, is_bundle = _get_latest_product_or_bundle(user_id)

    if not entry:
        await message.answer(
            "No product or bundle found for this session.\n\n"
            "Run /product or /bundle to create one first."
        )
        return

    from bot.services.catalog_service import map_to_offer

    matched_offer = map_to_offer(
        entry["product_type"],
        content_length=len(entry["body"]),
        title=entry["title"],
        body=entry["body"][:300],
    )
    real_price = matched_offer["price_usd"]
    real_url = matched_offer.get("payment_url") or matched_offer.get("paypal_url", "—")
    currency = "USD"

    if entry.get("price") is None:
        if is_bundle:
            update_bundle_price(user_id, real_price, currency)
        else:
            update_product_price(user_id, real_price, currency)

    offer_text = generate_offer_text(
        title=entry["title"],
        product_type=entry["product_type"],
        body=entry["body"],
        price=real_price,
        currency=currency,
        payment_url=real_url,
    )
    await message.answer(offer_text)


# ---------------------------------------------------------------------------
# /deliver
# ---------------------------------------------------------------------------

@router.message(Command("deliver"))
async def handle_deliver(message: Message) -> None:
    user_id = message.from_user.id

    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    target_note = parts[1].strip() if len(parts) > 1 else ""

    entry, is_bundle = _get_latest_product_or_bundle(user_id)

    if not entry:
        await message.answer(
            "No product or bundle found for this session.\n\n"
            "Run /product or /bundle first, then use /deliver."
        )
        return

    prefix = "Bundle" if is_bundle else "Product"
    label = "Bundle Concept" if is_bundle else "Product Framing"

    header = f"<b>Delivering: {entry['title']}</b>"
    if target_note:
        header += f"\n<i>Note: {target_note}</i>"
    await message.answer(header)

    files_sent = 0

    try:
        pdf_bytes = generate_pdf(entry["title"], label, entry["body"])
        filename = safe_filename(entry["title"], "pdf")
        await message.answer_document(
            BufferedInputFile(pdf_bytes, filename=filename),
            caption=f"Sentinel Fortune — {prefix}: {entry['title']}",
        )
        files_sent += 1
    except Exception as e:
        logger.error("Deliver PDF error: %s", e)

    try:
        docx_bytes = generate_docx(entry["title"], label, entry["body"])
        filename = safe_filename(entry["title"], "docx")
        await message.answer_document(
            BufferedInputFile(docx_bytes, filename=filename),
            caption=f"Sentinel Fortune — {prefix} (DOCX): {entry['title']}",
        )
        files_sent += 1
    except Exception as e:
        logger.error("Deliver DOCX error: %s", e)

    stored_content = get_content(user_id)
    if stored_content:
        try:
            tts_text = prepare_for_tts(stored_content["body"])
            audio_bytes = await generate_audio(tts_text, stored_content["type"])
            if audio_bytes:
                audio_filename = safe_filename(stored_content["title"], "mp3")
                await message.answer_audio(
                    BufferedInputFile(audio_bytes, filename=audio_filename),
                    title=stored_content["title"],
                    performer="Sentinel Fortune",
                )
                files_sent += 1
        except Exception as e:
            logger.error("Deliver audio error: %s", e)

    if files_sent > 0:
        await message.answer(
            f"<b>Delivery complete.</b> {files_sent} file(s) sent.\n\n"
            "Manual delivery confirmed. Mark this transaction as fulfilled."
        )
    else:
        await message.answer("Delivery encountered an error. Please try again.")
