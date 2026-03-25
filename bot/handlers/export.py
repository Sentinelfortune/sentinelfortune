import logging
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, BufferedInputFile

from bot.services.openai_service import generate_text_factory, FALLBACK_MESSAGE
from bot.services.content_store import save_content, get_content, extract_title
from bot.services.export_service import generate_pdf, generate_docx, safe_filename

logger = logging.getLogger(__name__)
router = Router()

_FORMAT_LABELS = {
    "teach": "Teaching",
    "rhapsody": "Rhapsody",
    "meditation": "Meditation",
    "coach": "Coaching Note",
    "story": "Story",
    "scene": "Narrative Scene",
    "ebook": "Ebook Blueprint",
    "asset": "Strategic Asset",
}

EXPORT_INFO = (
    "<b>Export — Sentinel Fortune Text Factory</b>\n\n"
    "After generating content with any Text Factory command, you can export "
    "the latest result as a file.\n\n"
    "<b>Export commands:</b>\n"
    "/pdf — Export latest generated content as PDF\n"
    "/docx — Export latest generated content as DOCX\n"
    "/ebookpdf — Export latest ebook blueprint as PDF (or /ebookpdf [seed] to generate first)\n"
    "/ebookdocx — Export latest ebook blueprint as DOCX (or /ebookdocx [seed] to generate first)\n\n"
    "<b>Direct generate and export:</b>\n"
    "/teachpdf [seed] — Generate teaching and export to PDF\n"
    "/teachdocx [seed] — Generate teaching and export to DOCX\n"
    "/rhapsodypdf [seed] — Generate rhapsody and export to PDF\n"
    "/meditationpdf [seed] — Generate meditation and export to PDF\n"
    "/coachpdf [problem] — Generate coaching note and export to PDF\n"
    "/storypdf [seed] — Generate story and export to PDF\n"
    "/scenepdf [concept] — Generate scene and export to PDF\n"
    "/assetpdf [seed] — Generate asset analysis and export to PDF\n\n"
    "The export system stores only the most recent generated content per user session. "
    "Content is not persisted between bot restarts."
)


async def _send_pdf(message: Message, title: str, content_type: str, body: str) -> None:
    try:
        pdf_bytes = generate_pdf(title, content_type, body)
        filename = safe_filename(title, "pdf")
        await message.answer_document(
            BufferedInputFile(pdf_bytes, filename=filename),
            caption=f"{title}\nSentinel Fortune — {content_type}",
        )
    except Exception as e:
        logger.error("PDF generation failed: %s", e)
        await message.answer(
            "PDF generation encountered an error. The content was generated correctly "
            "but could not be formatted as a file at this time.\n\nUse /menu to continue."
        )


async def _send_docx(message: Message, title: str, content_type: str, body: str) -> None:
    try:
        docx_bytes = generate_docx(title, content_type, body)
        filename = safe_filename(title, "docx")
        await message.answer_document(
            BufferedInputFile(docx_bytes, filename=filename),
            caption=f"{title}\nSentinel Fortune — {content_type}",
        )
    except Exception as e:
        logger.error("DOCX generation failed: %s", e)
        await message.answer(
            "DOCX generation encountered an error. The content was generated correctly "
            "but could not be formatted as a file at this time.\n\nUse /menu to continue."
        )


async def _generate_and_export_pdf(
    message: Message, format_type: str, seed: str
) -> None:
    try:
        body = await generate_text_factory(format_type, seed)
    except Exception as e:
        logger.error("Generation failed for %s: %s", format_type, e)
        await message.answer(FALLBACK_MESSAGE)
        return

    type_label = _FORMAT_LABELS.get(format_type, format_type.capitalize())
    title = extract_title(body, seed[:50])
    save_content(message.from_user.id, type_label, title, body)
    await _send_pdf(message, title, type_label, body)


async def _generate_and_export_docx(
    message: Message, format_type: str, seed: str
) -> None:
    try:
        body = await generate_text_factory(format_type, seed)
    except Exception as e:
        logger.error("Generation failed for %s: %s", format_type, e)
        await message.answer(FALLBACK_MESSAGE)
        return

    type_label = _FORMAT_LABELS.get(format_type, format_type.capitalize())
    title = extract_title(body, seed[:50])
    save_content(message.from_user.id, type_label, title, body)
    await _send_docx(message, title, type_label, body)


# ---------------------------------------------------------------------------
# /export
# ---------------------------------------------------------------------------

@router.message(Command("export"))
async def handle_export(message: Message) -> None:
    await message.answer(EXPORT_INFO)


# ---------------------------------------------------------------------------
# /pdf — export latest content
# ---------------------------------------------------------------------------

@router.message(Command("pdf"))
async def handle_pdf(message: Message) -> None:
    user_id = message.from_user.id
    stored = get_content(user_id)
    if not stored:
        await message.answer(
            "No generated content found for this session.\n\n"
            "Generate something first using a Text Factory command, then use /pdf.\n"
            "Example: /teach silence builds what noise cannot sustain\nthen: /pdf"
        )
        return
    await _send_pdf(message, stored["title"], stored["type"], stored["body"])


# ---------------------------------------------------------------------------
# /docx — export latest content
# ---------------------------------------------------------------------------

@router.message(Command("docx"))
async def handle_docx(message: Message) -> None:
    user_id = message.from_user.id
    stored = get_content(user_id)
    if not stored:
        await message.answer(
            "No generated content found for this session.\n\n"
            "Generate something first using a Text Factory command, then use /docx.\n"
            "Example: /rhapsody structure before expansion\nthen: /docx"
        )
        return
    await _send_docx(message, stored["title"], stored["type"], stored["body"])


# ---------------------------------------------------------------------------
# /ebookpdf — generate or use stored ebook, export PDF
# ---------------------------------------------------------------------------

@router.message(Command("ebookpdf"))
async def handle_ebookpdf(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    seed = parts[1].strip() if len(parts) > 1 else ""

    if seed:
        await _generate_and_export_pdf(message, "ebook", seed)
        return

    user_id = message.from_user.id
    stored = get_content(user_id)
    if stored and stored["type"] == "Ebook Blueprint":
        await _send_pdf(message, stored["title"], stored["type"], stored["body"])
    elif stored:
        await message.answer(
            "The latest stored content is not an ebook blueprint.\n\n"
            "Use /ebook [title] to generate an ebook first, then /ebookpdf.\n"
            "Or use /ebookpdf [title] to generate and export in one step."
        )
    else:
        await message.answer(
            "No ebook content found.\n\n"
            "Use /ebook [title] to generate a blueprint first, then /ebookpdf.\n"
            "Or: /ebookpdf The Architecture of Silent Power"
        )


# ---------------------------------------------------------------------------
# /ebookdocx — generate or use stored ebook, export DOCX
# ---------------------------------------------------------------------------

@router.message(Command("ebookdocx"))
async def handle_ebookdocx(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    seed = parts[1].strip() if len(parts) > 1 else ""

    if seed:
        await _generate_and_export_docx(message, "ebook", seed)
        return

    user_id = message.from_user.id
    stored = get_content(user_id)
    if stored and stored["type"] == "Ebook Blueprint":
        await _send_docx(message, stored["title"], stored["type"], stored["body"])
    elif stored:
        await message.answer(
            "The latest stored content is not an ebook blueprint.\n\n"
            "Use /ebook [title] to generate an ebook first, then /ebookdocx.\n"
            "Or use /ebookdocx [title] to generate and export in one step."
        )
    else:
        await message.answer(
            "No ebook content found.\n\n"
            "Use /ebook [title] to generate a blueprint first, then /ebookdocx.\n"
            "Or: /ebookdocx The Architecture of Silent Power"
        )


# ---------------------------------------------------------------------------
# PDF shortcut commands — generate and export immediately
# ---------------------------------------------------------------------------

@router.message(Command("teachpdf"))
async def handle_teachpdf(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    seed = parts[1].strip() if len(parts) > 1 else ""
    if not seed:
        await message.answer("Provide a seed after /teachpdf\nExample: /teachpdf silence builds what noise cannot sustain")
        return
    await _generate_and_export_pdf(message, "teach", seed)


@router.message(Command("teachdocx"))
async def handle_teachdocx(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    seed = parts[1].strip() if len(parts) > 1 else ""
    if not seed:
        await message.answer("Provide a seed after /teachdocx\nExample: /teachdocx silence builds what noise cannot sustain")
        return
    await _generate_and_export_docx(message, "teach", seed)


@router.message(Command("rhapsodypdf"))
async def handle_rhapsodypdf(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    seed = parts[1].strip() if len(parts) > 1 else ""
    if not seed:
        await message.answer("Provide a seed after /rhapsodypdf\nExample: /rhapsodypdf structure before expansion")
        return
    await _generate_and_export_pdf(message, "rhapsody", seed)


@router.message(Command("meditationpdf"))
async def handle_meditationpdf(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    seed = parts[1].strip() if len(parts) > 1 else ""
    if not seed:
        await message.answer("Provide a seed after /meditationpdf\nExample: /meditationpdf inner stability before outward movement")
        return
    await _generate_and_export_pdf(message, "meditation", seed)


@router.message(Command("coachpdf"))
async def handle_coachpdf(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    seed = parts[1].strip() if len(parts) > 1 else ""
    if not seed:
        await message.answer("Provide a problem or seed after /coachpdf\nExample: /coachpdf I feel scattered and need direction")
        return
    await _generate_and_export_pdf(message, "coach", seed)


@router.message(Command("storypdf"))
async def handle_storypdf(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    seed = parts[1].strip() if len(parts) > 1 else ""
    if not seed:
        await message.answer("Provide a seed after /storypdf\nExample: /storypdf a founder who builds in silence")
        return
    await _generate_and_export_pdf(message, "story", seed)


@router.message(Command("scenepdf"))
async def handle_scenepdf(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    seed = parts[1].strip() if len(parts) > 1 else ""
    if not seed:
        await message.answer("Provide a concept after /scenepdf\nExample: /scenepdf a midnight room where a strategic idea becomes a world")
        return
    await _generate_and_export_pdf(message, "scene", seed)


@router.message(Command("assetpdf"))
async def handle_assetpdf(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    seed = parts[1].strip() if len(parts) > 1 else ""
    if not seed:
        await message.answer("Provide a seed after /assetpdf\nExample: /assetpdf one idea can become many assets")
        return
    await _generate_and_export_pdf(message, "asset", seed)
