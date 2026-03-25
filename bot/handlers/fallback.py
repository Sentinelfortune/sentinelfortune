from aiogram import Router
from aiogram.types import Message

router = Router()


@router.message()
async def handle_fallback(message: Message) -> None:
    text = (
        "Your message was received, but it does not yet map clearly to a specific "
        "Sentinel Fortune path.\n\n"
        "Use /menu to explore the available sections, or ask directly about:\n"
        "• OEM\n"
        "• Licensing\n"
        "• IP\n"
        "• Distribution\n"
        "• Governance\n"
        "• Contact"
    )
    await message.answer(text)
