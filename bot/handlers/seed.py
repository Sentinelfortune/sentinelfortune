import re
import logging
from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message

from bot.services.openai_service import generate_text_factory, FALLBACK_MESSAGE

logger = logging.getLogger(__name__)
router = Router()

_SEED_PREFIX = re.compile(r'^(seed|idea|theme|concept|title)\s*:', re.IGNORECASE)

SEED_INFO = (
    "<b>Meta Seed — What It Is and What It Can Become</b>\n\n"
    "A seed is a compressed idea — a phrase, image, tension, or principle "
    "that carries enough internal energy to expand into multiple forms.\n\n"
    "<b>A single seed can be transformed into:</b>\n"
    "• /teach — a structured teaching with sections and principles\n"
    "• /rhapsody — a short elevated reflection\n"
    "• /meditation — a guided written meditation\n"
    "• /coach — a focused coaching note for clarity or direction\n"
    "• /story — a short story with a beginning, turn, and ending\n"
    "• /scene — a cinematic narrative scene\n"
    "• /ebook — a full ebook blueprint with chapters\n"
    "• /asset — a Sentinel Fortune strategic asset analysis\n\n"
    "<b>To route a seed automatically, prefix your message:</b>\n"
    "seed: your idea here\n"
    "idea: your idea here\n"
    "theme: your idea here\n"
    "concept: your idea here\n"
    "title: your idea here\n\n"
    "The system will identify likely domains and suggest the best transformation paths.\n\n"
    "Use /domains to see the full list of Sentinel Fortune-aligned domains."
)


@router.message(Command("seed"))
async def handle_seed(message: Message) -> None:
    await message.answer(SEED_INFO)


@router.message(F.text.regexp(_SEED_PREFIX))
async def handle_seed_prefix(message: Message) -> None:
    raw = (message.text or "").strip()
    logger.info("Seed-prefix message received: %r", raw[:80])

    match = _SEED_PREFIX.match(raw)
    seed = raw[match.end():].strip() if match else raw

    if not seed:
        await message.answer(
            "A seed prefix was detected but no seed was provided.\n\n"
            "Example: seed: discipline is invisible before it becomes undeniable"
        )
        return

    try:
        result = await generate_text_factory("seed_route", seed)
    except Exception as e:
        logger.error("Error in seed routing: %s", e)
        result = FALLBACK_MESSAGE

    await message.answer(result)
