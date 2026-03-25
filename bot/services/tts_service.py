import re
import logging
from typing import Optional

from bot.config import OPENAI_API_KEY

logger = logging.getLogger(__name__)

_TTS_MODEL = "tts-1"
_CHAR_LIMIT = 4000

_VOICE_MAP: dict[str, str] = {
    "Teaching": "onyx",
    "Rhapsody": "nova",
    "Meditation": "shimmer",
    "Coaching Note": "onyx",
    "Story": "fable",
    "Narrative Scene": "fable",
    "Ebook Blueprint": "onyx",
    "Strategic Asset": "onyx",
}
_DEFAULT_VOICE = "onyx"


def _voice_for(content_type: str) -> str:
    return _VOICE_MAP.get(content_type, _DEFAULT_VOICE)


def prepare_for_tts(text: str, max_chars: int = _CHAR_LIMIT) -> str:
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"\*(.*?)\*", r"\1", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\nNext Step:.*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n\n—.*$", "", text, flags=re.DOTALL)
    text = re.sub(r"^[•]\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()

    if len(text) > max_chars:
        truncated = text[:max_chars]
        last_stop = max(
            truncated.rfind("."),
            truncated.rfind("!"),
            truncated.rfind("?"),
        )
        if last_stop > max_chars - 600:
            text = truncated[: last_stop + 1] + " This excerpt has been shortened for audio."
        else:
            text = truncated[: max_chars - 50] + "... This excerpt has been shortened for audio."

    return text


async def generate_audio(text: str, content_type: str = "") -> Optional[bytes]:
    if not OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not set — TTS unavailable")
        return None

    cleaned = prepare_for_tts(text)
    if not cleaned:
        logger.warning("TTS: text is empty after cleaning")
        return None

    voice = _voice_for(content_type)

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        response = await client.audio.speech.create(
            model=_TTS_MODEL,
            voice=voice,
            input=cleaned,
            response_format="mp3",
        )
        audio_bytes = response.content
        logger.info(
            "TTS generated: model=%s voice=%s chars=%d bytes=%d",
            _TTS_MODEL, voice, len(cleaned), len(audio_bytes),
        )
        return audio_bytes
    except Exception as e:
        logger.error("TTS generation failed: %s", e)
        return None


def tts_is_available() -> bool:
    return bool(OPENAI_API_KEY)
