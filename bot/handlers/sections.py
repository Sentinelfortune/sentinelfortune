from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

router = Router()


@router.message(Command("business"))
async def handle_business(message: Message) -> None:
    text = (
        "<b>Business &amp; Operating Structure</b>\n\n"
        "Sentinel Fortune operates as an asset-light, OEM-ready institutional structure. "
        "Its model is not built around isolated products. It is built around controlled, "
        "scalable frameworks with defined governance at each layer.\n\n"
        "<b>Core characteristics:</b>\n"
        "• Asset-light operating model\n"
        "• OEM-ready across multiple divisions\n"
        "• Governance-first: approvals, reporting, and auditability are built in\n"
        "• Controlled distribution and partner qualification\n"
        "• Structured scale — not open-ended, not speculative\n\n"
        "Engagement in this area requires a clear statement of who you are, "
        "what you are seeking, and what context you are operating from.\n\n"
        "To begin a structured engagement, use /session.\n"
        "For formal partnership or licensing inquiries, use /contact."
    )
    await message.answer(text)


@router.message(Command("create"))
async def handle_create(message: Message) -> None:
    text = (
        "<b>Creative Worlds, Media &amp; Games</b>\n\n"
        "Sentinel Fortune holds original creative IP spanning narrative universes, "
        "game design, and media systems. These are treated as long-term intellectual assets, "
        "not isolated products.\n\n"
        "<b>What this covers:</b>\n"
        "• Original narrative IP and creative worlds\n"
        "• Game design and interactive systems\n"
        "• Media formats and structured storytelling\n"
        "• Creative frameworks built for long-term expansion\n\n"
        "Specific projects are disclosed selectively and on validated request.\n\n"
        "Use /licensing for IP and rights inquiries related to creative assets."
    )
    await message.answer(text)


@router.message(Command("licensing"))
async def handle_licensing(message: Message) -> None:
    text = (
        "<b>IP Licensing &amp; Business Rights</b>\n\n"
        "Sentinel Fortune is a private IP holding structure. Licensing is a primary "
        "instrument of its operating model — not a secondary activity.\n\n"
        "<b>Licensing directions include:</b>\n"
        "• IP licensing across technology, creative, and platform domains\n"
        "• Business rights frameworks for institutional and commercial use\n"
        "• OEM and white-label configurations under defined terms\n"
        "• Controlled distribution licensing\n\n"
        "<b>Important:</b>\n"
        "No rights are granted by viewing this site or interacting with this gateway. "
        "Access to protected materials, pricing logic, and proprietary specifications "
        "requires validated request and, where applicable, an executed NDA.\n\n"
        "Licensing inquiries must specify intended use, scale, territory, and context. "
        "Incomplete or vague requests will not be advanced.\n\n"
        "Use /contact — specifically licensing@sentinelfortune.com — to initiate."
    )
    await message.answer(text)


@router.message(Command("platforms"))
async def handle_platforms(message: Message) -> None:
    text = (
        "<b>Ecosystem Platforms &amp; Intelligent Systems</b>\n\n"
        "A core direction of Sentinel Fortune is the development of institutional-grade "
        "platforms — modular environments, AI-assisted systems, and structured "
        "operational infrastructure designed for controlled, scalable deployment.\n\n"
        "<b>Platform directions include:</b>\n"
        "• Structured operational and management platforms\n"
        "• AI-assisted knowledge and qualification interfaces\n"
        "• Modular environments with defined governance layers\n"
        "• Ecosystem integration and controlled access frameworks\n\n"
        "Platform capabilities are introduced progressively as they reach "
        "the appropriate level of readiness. This gateway is an early layer "
        "of that infrastructure.\n\n"
        "Use /contact for platform-related partnership or integration inquiries."
    )
    await message.answer(text)


@router.message(Command("contact"))
async def handle_contact(message: Message) -> None:
    text = (
        "<b>Contact &amp; Formal Inquiries</b>\n\n"
        "Sentinel Fortune operates by structured, qualified communication. "
        "All formal engagement begins through the appropriate desk.\n\n"
        "<b>Public contact desks:</b>\n"
        "• General: contact@sentinelfortune.com\n"
        "• OEM inquiries: oem@sentinelfortune.com\n"
        "• Licensing: licensing@sentinelfortune.com\n"
        "• Investor relations: investor@sentinelfortune.com\n"
        "• Legal: legal@sentinelfortune.com\n\n"
        "<b>Before reaching out, ensure you can clearly state:</b>\n"
        "• Who you are and the context of your organisation\n"
        "• What you are seeking and why it is relevant\n"
        "• The nature of the engagement: OEM, licensing, investment, legal, or general\n\n"
        "Sensitive materials are not disclosed on first contact. "
        "Qualified requests may be advanced under NDA where required.\n\n"
        "Strategic work can also begin directly through /session."
    )
    await message.answer(text)
