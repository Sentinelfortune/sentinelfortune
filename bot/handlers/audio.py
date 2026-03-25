import logging
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, BufferedInputFile

from bot.services.openai_service import generate_text_factory, FALLBACK_MESSAGE
from bot.services.content_store import save_content, get_content, extract_title
from bot.services.tts_service import generate_audio, tts_is_available, prepare_for_tts
from bot.services.export_service import safe_filename

logger = logging.getLogger(__name__)
router = Router()

_FORMAT_LABELS: dict[str, str] = {
    "teach": "Teaching",
    "rhapsody": "Rhapsody",
    "meditation": "Meditation",
    "coach": "Coaching Note",
    "story": "Story",
    "scene": "Narrative Scene",
    "ebook": "Ebook Blueprint",
    "asset": "Strategic Asset",
}

_ASSET_FRAMING: dict[str, str] = {
    "Teaching": "This can function as a premium audio teaching asset.",
    "Rhapsody": "This can be packaged as a spoken word micro-product.",
    "Meditation": "This can be packaged as a meditation micro-product.",
    "Coaching Note": "This output can be turned into a downloadable coaching asset.",
    "Story": "This can be packaged as a short story audio asset.",
    "Narrative Scene": "This seed can become a narrative audio product.",
    "Ebook Blueprint": "This outline can serve as the foundation for a premium digital product.",
    "Strategic Asset": "This output can function as a premium session asset.",
}

TTS_INFO = (
    "<b>Audio — Sentinel Fortune Text Factory</b>\n\n"
    "<b>Engine:</b> OpenAI TTS (tts-1 model)\n"
    "<b>Status:</b> {status}\n\n"
    "<b>Voices used by content type:</b>\n"
    "• Teaching, Coaching, Asset → onyx (deep, authoritative)\n"
    "• Rhapsody → nova (expressive)\n"
    "• Meditation → shimmer (calm)\n"
    "• Story, Scene → fable (narrative)\n\n"
    "<b>Commands:</b>\n"
    "/audio — Convert latest generated content to audio\n"
    "/teachaudio [seed] — Generate teaching and send as audio\n"
    "/rhapsodyaudio [seed] — Generate rhapsody and send as audio\n"
    "/meditationaudio [seed] — Generate meditation and send as audio\n"
    "/coachaudio [problem] — Generate coaching note and send as audio\n"
    "/storyaudio [seed] — Generate story and send as audio\n"
    "/sceneaudio [concept] — Generate scene and send as audio\n"
    "/assetaudio [seed] — Generate asset analysis and send as audio\n\n"
    "<b>Limits:</b>\n"
    "• Up to ~4,000 characters per audio generation\n"
    "• Longer content is truncated at a natural sentence boundary\n"
    "• Audio is session-based — content is not stored between bot restarts\n\n"
    "Audio files are delivered as MP3 directly in this chat."
)


async def _send_audio(
    message: Message,
    title: str,
    content_type: str,
    body: str,
) -> None:
    audio_bytes = await generate_audio(body, content_type)
    if audio_bytes is None:
        await message.answer(
            "Audio generation is not available at this time.\n\n"
            "Use /tts to check the audio status and requirements."
        )
        return

    filename = safe_filename(title, "mp3")
    await message.answer_audio(
        BufferedInputFile(audio_bytes, filename=filename),
        title=title,
        performer="Sentinel Fortune",
    )

    framing = _ASSET_FRAMING.get(content_type, "")
    if framing:
        await message.answer(framing)


async def _generate_and_send_audio(
    message: Message,
    format_type: str,
    seed: str,
) -> None:
    try:
        body = await generate_text_factory(format_type, seed)
    except Exception as e:
        logger.error("Generation failed for audio [%s]: %s", format_type, e)
        await message.answer(FALLBACK_MESSAGE)
        return

    content_type = _FORMAT_LABELS.get(format_type, format_type.capitalize())
    title = extract_title(body, seed[:50])
    save_content(message.from_user.id, content_type, title, body)
    await message.answer(body[:4000] + ("..." if len(body) > 4000 else ""))
    await _send_audio(message, title, content_type, body)


def _parse_seed(message_text: str) -> str:
    parts = (message_text or "").strip().split(maxsplit=1)
    return parts[1].strip() if len(parts) > 1 else ""


# ---------------------------------------------------------------------------
# /tts
# ---------------------------------------------------------------------------

@router.message(Command("tts"))
async def handle_tts(message: Message) -> None:
    status = "Active — OpenAI TTS is configured and ready." if tts_is_available() else (
        "Not configured — OPENAI_API_KEY is required but not detected."
    )
    await message.answer(TTS_INFO.format(status=status))


# ---------------------------------------------------------------------------
# /audio — convert latest content
# ---------------------------------------------------------------------------

@router.message(Command("audio"))
async def handle_audio(message: Message) -> None:
    user_id = message.from_user.id
    stored = get_content(user_id)

    if not stored:
        await message.answer(
            "No generated content found for this session.\n\n"
            "Generate something first using a Text Factory command, then use /audio.\n"
            "Example: /teach silence builds what noise cannot sustain\nthen: /audio\n\n"
            "Or use a direct generate+audio command:\n"
            "/teachaudio silence builds what noise cannot sustain"
        )
        return

    await _send_audio(message, stored["title"], stored["type"], stored["body"])


# ---------------------------------------------------------------------------
# Generate + audio shortcuts
# ---------------------------------------------------------------------------

@router.message(Command("teachaudio"))
async def handle_teachaudio(message: Message) -> None:
    seed = _parse_seed(message.text)
    if not seed:
        await message.answer(
            "Provide a seed after /teachaudio\n"
            "Example: /teachaudio discipline before expansion"
        )
        return
    await _generate_and_send_audio(message, "teach", seed)


@router.message(Command("rhapsodyaudio"))
async def handle_rhapsodyaudio(message: Message) -> None:
    seed = _parse_seed(message.text)
    if not seed:
        await message.answer(
            "Provide a seed after /rhapsodyaudio\n"
            "Example: /rhapsodyaudio silent authority"
        )
        return
    await _generate_and_send_audio(message, "rhapsody", seed)


@router.message(Command("meditationaudio"))
async def handle_meditationaudio(message: Message) -> None:
    seed = _parse_seed(message.text)
    if not seed:
        await message.answer(
            "Provide a seed after /meditationaudio\n"
            "Example: /meditationaudio inner stability before outward movement"
        )
        return
    await _generate_and_send_audio(message, "meditation", seed)


@router.message(Command("coachaudio"))
async def handle_coachaudio(message: Message) -> None:
    seed = _parse_seed(message.text)
    if not seed:
        await message.answer(
            "Provide a problem or seed after /coachaudio\n"
            "Example: /coachaudio I feel scattered and need direction"
        )
        return
    await _generate_and_send_audio(message, "coach", seed)


@router.message(Command("storyaudio"))
async def handle_storyaudio(message: Message) -> None:
    seed = _parse_seed(message.text)
    if not seed:
        await message.answer(
            "Provide a seed after /storyaudio\n"
            "Example: /storyaudio a founder who builds in silence"
        )
        return
    await _generate_and_send_audio(message, "story", seed)


@router.message(Command("sceneaudio"))
async def handle_sceneaudio(message: Message) -> None:
    seed = _parse_seed(message.text)
    if not seed:
        await message.answer(
            "Provide a concept after /sceneaudio\n"
            "Example: /sceneaudio a midnight room where a strategic idea becomes a world"
        )
        return
    await _generate_and_send_audio(message, "scene", seed)


@router.message(Command("assetaudio"))
async def handle_assetaudio(message: Message) -> None:
    seed = _parse_seed(message.text)
    if not seed:
        await message.answer(
            "Provide a seed after /assetaudio\n"
            "Example: /assetaudio one idea can become many assets"
        )
        return
    await _generate_and_send_audio(message, "asset", seed)
