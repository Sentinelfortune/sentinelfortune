from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

router = Router()

ABOUT_TEXT = (
    "<b>Sentinel Fortune — Overview</b>\n\n"
    "Sentinel Fortune is a private U.S. IP holding and licensing structure operating "
    "an asset-light, OEM-ready model across multiple divisions.\n\n"
    "Its public layer is intentionally minimal. Sensitive materials, partner packs, "
    "protected specifications, pricing logic, and proprietary systems are disclosed "
    "only on validated request and, where required, under NDA.\n\n"
    "<b>Core directions include:</b>\n"
    "• OEM and manufacturing pathways\n"
    "• IP licensing and business rights\n"
    "• Controlled distribution structures\n"
    "• SOP and skills-based institutional pathways\n"
    "• Governance, approvals, auditability, and protected disclosure\n\n"
    "This gateway is for qualification and structured navigation, not casual browsing.\n"
    "Use /menu to explore the available paths."
)


@router.message(Command("about"))
async def handle_about(message: Message) -> None:
    await message.answer(ABOUT_TEXT)
