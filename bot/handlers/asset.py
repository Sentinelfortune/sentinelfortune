import logging
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from bot.services.openai_service import generate_text_factory, FALLBACK_MESSAGE
from bot.services.content_store import save_content, extract_title

logger = logging.getLogger(__name__)
router = Router()


@router.message(Command("asset"))
async def handle_asset(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    seed = parts[1].strip() if len(parts) > 1 else ""

    if not seed:
        await message.answer(
            "Send a seed or idea and I will map it as a Sentinel Fortune strategic asset.\n\n"
            "Example: /asset one idea can become many assets"
        )
        return

    try:
        result = await generate_text_factory("asset", seed)
    except Exception as e:
        logger.error("Error generating asset view: %s", e)
        await message.answer(FALLBACK_MESSAGE)
        return

    title = extract_title(result, seed[:50])
    save_content(message.from_user.id, "Strategic Asset", title, result)
    await message.answer(
        result
        + "\n\n— Export: /pdf (PDF)  |  /docx (DOCX)  |  Audio: /audio  |  Direct: /assetpdf [seed]"
    )
