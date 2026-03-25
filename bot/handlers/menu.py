from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from bot.handlers.money import main_menu_text, main_menu_keyboard

router = Router()


@router.message(Command("menu"))
async def handle_menu(message: Message) -> None:
    await message.answer(main_menu_text(), reply_markup=main_menu_keyboard())


@router.message(Command("nav"))
async def handle_nav(message: Message) -> None:
    text = (
        "<b>Sentinel Fortune — Navigation</b>\n\n"
        "<b>Gateway</b>\n"
        "/about — Overview of Sentinel Fortune\n"
        "/business — Strategic structure and OEM positioning\n"
        "/licensing — IP licensing and business rights\n"
        "/contact — Formal inquiry desks\n\n"
        "<b>Engagement</b>\n"
        "/session — Strategic Session (paid entry point)\n"
        "/offer — How to begin working with Sentinel Fortune\n\n"
        "<b>Offers &amp; Payments</b>\n"
        "/catalog — View all live offers with payment links\n"
        "/buy — Purchase an offer directly (access / engine / architect)\n"
        "/done — Confirm payment and request delivery\n\n"
        "<b>Text Factory</b>\n"
        "/seed — What a meta seed is and what it can become\n"
        "/domains — Sentinel Fortune-aligned domains\n"
        "/teach [seed] — Structured teaching\n"
        "/rhapsody [seed] — Short reflective piece\n"
        "/meditation [seed] — Guided written meditation\n"
        "/coach [problem] — Focused coaching note\n"
        "/story [seed] — Short story\n"
        "/scene [concept] — Cinematic narrative scene\n"
        "/ebook [title] — Ebook blueprint\n"
        "/asset [seed] — Strategic asset analysis\n\n"
        "<b>Export &amp; Audio</b>\n"
        "/pdf, /docx — Export latest content to file\n"
        "/audio — Generate audio from latest content\n\n"
        "<b>Product &amp; Monetization</b>\n"
        "/product — Generate a product framing from latest content\n"
        "/bundle — Generate a bundle concept\n"
        "/offerproduct — Create a sellable offer from latest product\n"
        "/price — Suggest a USD price for latest product\n\n"
        "<b>Workflow</b>\n"
        "/project [objective] — Start a structured project\n"
        "/plan — Show current project plan\n"
        "/continue — Execute the next workflow step\n"
        "/status — Project status summary\n"
        "/resetproject — Clear current project\n\n"
        "<i>Send a plain message for open inquiry. "
        "Prefix with seed:, idea:, theme:, concept:, or title: to route a seed directly.</i>"
    )
    await message.answer(text)
