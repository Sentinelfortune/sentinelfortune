from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

router = Router()

DOMAINS_TEXT = (
    "<b>Sentinel Fortune — Aligned Domains</b>\n\n"
    "The following domains represent the primary directions across which "
    "Sentinel Fortune's IP, systems, and assets operate:\n\n"
    "• <b>Business / Strategy</b> — structure, systems, positioning, controlled growth\n"
    "• <b>Education / Knowledge</b> — frameworks, SOPs, institutional pathways, clarity\n"
    "• <b>Media / Creative Worlds</b> — narrative IP, characters, universes, storytelling systems\n"
    "• <b>Gaming / Interactive</b> — game design, interactive systems, world mechanics\n"
    "• <b>Music / Culture</b> — sonic worlds, expression, cultural assets\n"
    "• <b>Licensing / IP</b> — rights structures, OEM pathways, protected asset frameworks\n"
    "• <b>Platforms / Intelligent Systems</b> — modular infrastructure, AI-assisted systems\n"
    "• <b>Spiritual Reflection</b> — meaning, inward clarity, structured reflection\n\n"
    "These domains inform how seeds are classified and how assets are developed.\n\n"
    "Use /seed to understand how a seed maps to these domains.\n"
    "Use /asset to transform a seed into a domain-mapped strategic asset."
)


@router.message(Command("domains"))
async def handle_domains(message: Message) -> None:
    await message.answer(DOMAINS_TEXT)
