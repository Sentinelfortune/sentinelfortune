import logging
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from bot.services.openai_service import generate_text_factory, FALLBACK_MESSAGE
from bot.services.content_store import save_content, extract_title

logger = logging.getLogger(__name__)
router = Router()


@router.message(Command("ebook"))
async def handle_ebook(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    seed = parts[1].strip() if len(parts) > 1 else ""

    if not seed:
        await message.answer(
            "Send a title or theme and I will generate a structured ebook blueprint.\n\n"
            "Example: /ebook The Architecture of Silent Power"
        )
        return

    try:
        result = await generate_text_factory("ebook", seed)
    except Exception as e:
        logger.error("Error generating ebook blueprint: %s", e)
        await message.answer(FALLBACK_MESSAGE)
        return

    title = extract_title(result, seed[:50])
    save_content(message.from_user.id, "Ebook Blueprint", title, result)
    await message.answer(
        result
        + "\n\n— Export this outline: /ebookpdf (PDF)  |  /ebookdocx (DOCX)  |  Audio: /audio"
    )
