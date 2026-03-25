"""
AI content generator -- owner-only.

/generate_content
  Calls OpenAI to generate one post per channel theme.
  Stores results in module-level memory.

/publish_generated
  Publishes stored generated content to each channel
  using existing publish_channel_post() -- no publish logic modified.
"""

import logging

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from bot.services.channel_content_service import publish_channel_post, CHANNEL_IDS
from bot.handlers.publish import _is_owner
from bot.services.access_control import require_owner

logger = logging.getLogger(__name__)
router = Router()

# ---------------------------------------------------------------------------
# In-memory store -- keyed by product_id
# Populated by /generate_content, consumed by /publish_generated
# ---------------------------------------------------------------------------

_GENERATED: dict[str, str] = {}

# ---------------------------------------------------------------------------
# Generation prompts -- one per channel theme
# ---------------------------------------------------------------------------

_PROMPTS: list[tuple[str, str, str]] = [
    (
        "reset_v1",
        "Reset / Clarity / Realignment",
        (
            "Write a single premium Telegram channel post for a private content channel "
            "focused on mental reset, clarity recovery, and internal realignment. "
            "The post must: be structured and direct, avoid hype or motivational clichés, "
            "address a specific aspect of resetting internal state, "
            "include one actionable practice the reader can apply today. "
            "Tone: calm, precise, authoritative. Length: 150-220 words. "
            "Format: plain text with bold headers using <b>...</b> HTML tags. "
            "Do not use emoji. Do not use hashtags."
        ),
    ),
    (
        "quick_access_v1",
        "Fast Clarity / Structure / Execution",
        (
            "Write a single premium Telegram channel post for a private content channel "
            "focused on fast clarity, structural thinking, and immediate execution. "
            "The post must: be operational and direct, present one clear framework or rule, "
            "include a specific prompt the reader can act on within the hour. "
            "Tone: sharp, no-nonsense, practical. Length: 150-220 words. "
            "Format: plain text with bold headers using <b>...</b> HTML tags. "
            "Do not use emoji. Do not use hashtags."
        ),
    ),
    (
        "teachings_vault_v1",
        "Teachings / Depth / Insight",
        (
            "Write a single premium Telegram channel post for a private teachings vault "
            "focused on deep principles, applied insight, and intellectual depth. "
            "The post must: present one foundational principle in full, "
            "explain why the principle matters operationally, "
            "end with a precise application or reflection question. "
            "Tone: intellectual, structured, authoritative without being academic. "
            "Length: 180-240 words. "
            "Format: plain text with bold headers using <b>...</b> HTML tags. "
            "Do not use emoji. Do not use hashtags."
        ),
    ),
    (
        "sentinel_engine_v1",
        "Execution / Monetization / Operations",
        (
            "Write a single premium Telegram channel post for a private execution and "
            "monetization channel focused on revenue systems, operational discipline, "
            "and offer architecture. "
            "The post must: address one specific monetization or execution principle, "
            "be immediately applicable to someone running an offer or business, "
            "end with one concrete action to take within 24 hours. "
            "Tone: direct, experienced, results-focused. Length: 160-230 words. "
            "Format: plain text with bold headers using <b>...</b> HTML tags. "
            "Do not use emoji. Do not use hashtags."
        ),
    ),
    (
        "sentinel_architect_v1",
        "Strategy / Architecture / Long-Term Positioning",
        (
            "Write a single premium Telegram channel post for a private strategy and "
            "architecture channel focused on long-term systems thinking, IP development, "
            "and strategic positioning. "
            "The post must: present one strategic insight relevant to building durable leverage, "
            "connect the insight to a specific structural or operational implication, "
            "end with one architect-level question the reader should sit with. "
            "Tone: strategic, precise, elevated. Length: 170-230 words. "
            "Format: plain text with bold headers using <b>...</b> HTML tags. "
            "Do not use emoji. Do not use hashtags."
        ),
    ),
]

# ---------------------------------------------------------------------------
# /generate_content
# ---------------------------------------------------------------------------

@router.message(Command("generate_content"))
@require_owner
async def handle_generate_content(message: Message) -> None:
    if not _is_owner(message.from_user.id):
        return

    try:
        from bot.services.openai_service import get_openai_client
        from openai import OpenAIError
    except ImportError as e:
        await message.answer(f"OpenAI import failed: {e}")
        return

    client = get_openai_client()
    if client is None:
        await message.answer(
            "<b>Generation failed.</b>\n\n"
            "OPENAI_API_KEY is not set.\n"
            "Add it to environment secrets and restart the bot."
        )
        return

    await message.answer("Generating content for 5 channels…")

    _GENERATED.clear()
    results: list[str] = []
    errors: list[str] = []

    for product_id, theme, prompt in _PROMPTS:
        try:
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a senior content strategist writing premium, "
                            "private-channel content for a structured methodology brand. "
                            "Your output is always clean, structured, and immediately useful. "
                            "No filler. No hype. No fluff."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                max_tokens=400,
                temperature=0.7,
            )
            text = response.choices[0].message.content.strip()
            _GENERATED[product_id] = text
            preview = text[:120].replace("\n", " ")
            results.append(f"✓ <b>{product_id}</b>\n<i>{preview}…</i>")
            logger.info("Generated content for %s (%d chars)", product_id, len(text))
        except OpenAIError as exc:
            err = f"✗ {product_id}: OpenAI error -- {exc}"
            errors.append(err)
            logger.error("OpenAI error for %s: %s", product_id, exc)
        except Exception as exc:
            err = f"✗ {product_id}: unexpected error -- {exc}"
            errors.append(err)
            logger.error("Unexpected error for %s: %s", product_id, exc)

    summary_lines = [f"<b>Generated {len(_GENERATED)}/5 posts.</b>\n"]
    summary_lines.extend(results)
    if errors:
        summary_lines.append("\n<b>Errors:</b>")
        summary_lines.extend(errors)

    if _GENERATED:
        summary_lines.append(
            f"\n{len(_GENERATED)} post(s) stored in memory.\n"
            "Run /publish_generated to send them to their channels."
        )
    else:
        summary_lines.append("\nNo content stored. Check errors above.")

    await message.answer("\n\n".join(summary_lines))


# ---------------------------------------------------------------------------
# /publish_generated
# ---------------------------------------------------------------------------

@router.message(Command("publish_generated"))
@require_owner
async def handle_publish_generated(message: Message) -> None:
    if not _is_owner(message.from_user.id):
        return

    if not _GENERATED:
        await message.answer(
            "<b>Nothing to publish.</b>\n\n"
            "Run /generate_content first to generate content."
        )
        return

    await message.answer(f"Publishing {len(_GENERATED)} generated post(s)…")

    lines = ["<b>Publish Generated -- Results</b>\n"]

    for product_id, text in _GENERATED.items():
        channel_id = CHANNEL_IDS.get(product_id)
        if not channel_id:
            lines.append(f"⚠ {product_id}: channel ID not set -- skipped")
            continue

        result = await publish_channel_post(message.bot, product_id, text, pin=False)

        if result["ok"]:
            lines.append(f"✓ {product_id}: sent (msg_id={result['message_id']})")
        else:
            lines.append(f"✗ {product_id}: failed -- {result['error']}")

    lines.append("\nGenerated content remains in memory until next /generate_content.")
    await message.answer("\n".join(lines))
