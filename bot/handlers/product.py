import logging
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, BufferedInputFile

from bot.services.openai_service import (
    generate_product_framing, generate_bundle_framing, FALLBACK_MESSAGE,
)
from bot.services.content_store import get_content
from bot.services.product_store import (
    save_product, get_product, save_bundle, get_bundle,
)
from bot.services.export_service import generate_pdf, generate_docx, safe_filename

logger = logging.getLogger(__name__)
router = Router()

_EXPORT_HINT = (
    "\n\n— Export: /productpdf (PDF)  |  /productdocx (DOCX)"
)

_BUNDLE_EXPORT_HINT = (
    "\n\n— Export: /bundlepdf (PDF)  |  /bundledocx (DOCX)"
)


async def _build_product(
    message: Message,
    seed: str,
    content_type: str,
    body_excerpt: str,
) -> None:
    try:
        framing = await generate_product_framing(seed, content_type, body_excerpt)
    except Exception as e:
        logger.error("Product framing error: %s", e)
        await message.answer(FALLBACK_MESSAGE)
        return

    title = seed[:80]
    save_product(message.from_user.id, content_type or "Product Framing", title, framing)
    await message.answer(framing + _EXPORT_HINT)


async def _build_bundle(
    message: Message,
    seed: str,
    content_type: str,
    body_excerpt: str,
) -> None:
    try:
        framing = await generate_bundle_framing(seed, content_type, body_excerpt)
    except Exception as e:
        logger.error("Bundle framing error: %s", e)
        await message.answer(FALLBACK_MESSAGE)
        return

    title = seed[:80]
    save_bundle(message.from_user.id, content_type or "Bundle Concept", title, framing)
    await message.answer(framing + _BUNDLE_EXPORT_HINT)


# ---------------------------------------------------------------------------
# /product [optional seed]
# ---------------------------------------------------------------------------

@router.message(Command("product"))
async def handle_product(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    inline_seed = parts[1].strip() if len(parts) > 1 else ""

    if inline_seed:
        await _build_product(message, inline_seed, "", "")
        return

    stored = get_content(message.from_user.id)
    if not stored:
        await message.answer(
            "No generated content found for this session.\n\n"
            "Generate something first, then use /product — or provide a seed directly:\n"
            "/product a premium teaching on silent authority"
        )
        return

    await _build_product(
        message,
        stored["title"],
        stored["type"],
        stored["body"][:600],
    )


# ---------------------------------------------------------------------------
# /bundle [optional seed]
# ---------------------------------------------------------------------------

@router.message(Command("bundle"))
async def handle_bundle(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    inline_seed = parts[1].strip() if len(parts) > 1 else ""

    if inline_seed:
        await _build_bundle(message, inline_seed, "", "")
        return

    stored = get_content(message.from_user.id)
    if not stored:
        await message.answer(
            "No generated content found for this session.\n\n"
            "Generate something first, then use /bundle — or provide a seed directly:\n"
            "/bundle theme: inner silence starter pack"
        )
        return

    await _build_bundle(
        message,
        stored["title"],
        stored["type"],
        stored["body"][:600],
    )


# ---------------------------------------------------------------------------
# /productpdf
# ---------------------------------------------------------------------------

@router.message(Command("productpdf"))
async def handle_productpdf(message: Message) -> None:
    stored = get_product(message.from_user.id)
    if not stored:
        await message.answer(
            "No product framing stored.\n\n"
            "Run /product first to generate one."
        )
        return

    try:
        pdf_bytes = generate_pdf(stored["title"], "Product Framing", stored["body"])
        filename = safe_filename(stored["title"], "pdf")
        await message.answer_document(
            BufferedInputFile(pdf_bytes, filename=filename),
            caption=f"Sentinel Fortune — Product Framing: {stored['title']}",
        )
    except Exception as e:
        logger.error("Product PDF export error: %s", e)
        await message.answer("PDF export encountered an error. Please try again.")


# ---------------------------------------------------------------------------
# /productdocx
# ---------------------------------------------------------------------------

@router.message(Command("productdocx"))
async def handle_productdocx(message: Message) -> None:
    stored = get_product(message.from_user.id)
    if not stored:
        await message.answer(
            "No product framing stored.\n\n"
            "Run /product first to generate one."
        )
        return

    try:
        docx_bytes = generate_docx(stored["title"], "Product Framing", stored["body"])
        filename = safe_filename(stored["title"], "docx")
        await message.answer_document(
            BufferedInputFile(docx_bytes, filename=filename),
            caption=f"Sentinel Fortune — Product Framing: {stored['title']}",
        )
    except Exception as e:
        logger.error("Product DOCX export error: %s", e)
        await message.answer("DOCX export encountered an error. Please try again.")


# ---------------------------------------------------------------------------
# /bundlepdf
# ---------------------------------------------------------------------------

@router.message(Command("bundlepdf"))
async def handle_bundlepdf(message: Message) -> None:
    stored = get_bundle(message.from_user.id)
    if not stored:
        await message.answer(
            "No bundle framing stored.\n\n"
            "Run /bundle first to generate one."
        )
        return

    try:
        pdf_bytes = generate_pdf(stored["title"], "Bundle Concept", stored["body"])
        filename = safe_filename(stored["title"], "pdf")
        await message.answer_document(
            BufferedInputFile(pdf_bytes, filename=filename),
            caption=f"Sentinel Fortune — Bundle: {stored['title']}",
        )
    except Exception as e:
        logger.error("Bundle PDF export error: %s", e)
        await message.answer("PDF export encountered an error. Please try again.")


# ---------------------------------------------------------------------------
# /bundledocx
# ---------------------------------------------------------------------------

@router.message(Command("bundledocx"))
async def handle_bundledocx(message: Message) -> None:
    stored = get_bundle(message.from_user.id)
    if not stored:
        await message.answer(
            "No bundle framing stored.\n\n"
            "Run /bundle first to generate one."
        )
        return

    try:
        docx_bytes = generate_docx(stored["title"], "Bundle Concept", stored["body"])
        filename = safe_filename(stored["title"], "docx")
        await message.answer_document(
            BufferedInputFile(docx_bytes, filename=filename),
            caption=f"Sentinel Fortune — Bundle: {stored['title']}",
        )
    except Exception as e:
        logger.error("Bundle DOCX export error: %s", e)
        await message.answer("DOCX export encountered an error. Please try again.")
