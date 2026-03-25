"""
Auto-publish background scheduler.

Runs every 24 hours:
  1. Generates fresh AI content for all 5 channel themes
  2. Publishes each generated post to its channel

Retry policy: one automatic retry (60s delay) if the cycle fails.
Never interrupts the bot polling loop -- runs as a detached asyncio task.
"""

import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_INTERVAL_SECONDS = 24 * 60 * 60   # 24 hours
_RETRY_DELAY_SECONDS = 60           # wait before single retry

# ---------------------------------------------------------------------------
# Generation prompts (same definitions as ai_content.py -- single source below)
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
# Internal generate step
# ---------------------------------------------------------------------------

async def _generate(bot) -> dict:
    """
    Call OpenAI for each channel theme.
    Returns {product_id: generated_text} for successful generations.
    """
    from bot.services.openai_service import get_openai_client
    from openai import OpenAIError

    client = get_openai_client()
    if client is None:
        raise RuntimeError("OPENAI_API_KEY is not set -- cannot generate content.")

    generated: dict[str, str] = {}

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
            generated[product_id] = text
            logger.info("[auto-publish] Generated %s (%d chars)", product_id, len(text))
        except OpenAIError as exc:
            logger.error("[auto-publish] OpenAI error for %s: %s", product_id, exc)
        except Exception as exc:
            logger.error("[auto-publish] Unexpected error generating %s: %s", product_id, exc)

    return generated


# ---------------------------------------------------------------------------
# Internal publish step
# ---------------------------------------------------------------------------

async def _publish(bot, generated: dict) -> dict:
    """
    Send each generated post to its channel.
    Returns {"sent": int, "failed": int, "details": list}.
    """
    from bot.services.channel_content_service import publish_channel_post, CHANNEL_IDS

    sent = 0
    failed = 0
    details: list[str] = []

    for product_id, text in generated.items():
        channel_id = CHANNEL_IDS.get(product_id)
        if not channel_id:
            details.append(f"  SKIP  {product_id}: channel ID not configured")
            failed += 1
            continue

        result = await publish_channel_post(bot, product_id, text, pin=False)
        if result["ok"]:
            sent += 1
            details.append(f"  OK    {product_id}: msg_id={result['message_id']}")
        else:
            failed += 1
            details.append(f"  FAIL  {product_id}: {result['error']}")

    return {"sent": sent, "failed": failed, "details": details}


# ---------------------------------------------------------------------------
# One full cycle: generate then publish
# ---------------------------------------------------------------------------

async def run_auto_publish_cycle(bot) -> None:
    """
    Execute one complete auto-publish cycle.
    Raises on unrecoverable failure so the caller can decide to retry.
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    logger.info("[auto-publish] Cycle started at %s", now)

    generated = await _generate(bot)

    if not generated:
        raise RuntimeError("Generation produced zero posts -- all OpenAI calls failed.")

    result = await _publish(bot, generated)

    detail_block = "\n".join(result["details"])
    logger.info(
        "[auto-publish] Cycle complete -- generated=%s sent=%s failed=%s\n%s",
        len(generated), result["sent"], result["failed"], detail_block,
    )

    if result["sent"] == 0:
        raise RuntimeError(
            f"Publish step sent 0 posts (generated={len(generated)}, "
            f"failed={result['failed']}). Check channel IDs."
        )


# ---------------------------------------------------------------------------
# Background loop -- started once, runs forever
# ---------------------------------------------------------------------------

async def auto_publish_loop(bot) -> None:
    """
    Infinite loop: wait 24h, run cycle, retry once on failure.
    Designed to run as asyncio.create_task() alongside bot polling.
    """
    logger.info(
        "[auto-publish] Scheduler started. First run in %sh.",
        _INTERVAL_SECONDS // 3600,
    )

    while True:
        await asyncio.sleep(_INTERVAL_SECONDS)

        logger.info("[auto-publish] 24h interval elapsed -- starting cycle.")

        try:
            await run_auto_publish_cycle(bot)
        except Exception as exc:
            logger.error("[auto-publish] Cycle failed: %s -- retrying in %ds.", exc, _RETRY_DELAY_SECONDS)
            await asyncio.sleep(_RETRY_DELAY_SECONDS)
            try:
                await run_auto_publish_cycle(bot)
                logger.info("[auto-publish] Retry succeeded.")
            except Exception as retry_exc:
                logger.error(
                    "[auto-publish] Retry also failed: %s -- next attempt in 24h.", retry_exc
                )


def start_auto_publish_loop(bot) -> asyncio.Task:
    """
    Schedule the auto-publish loop as a background asyncio task.
    Returns the Task so main.py can log a reference to it.
    """
    task = asyncio.create_task(auto_publish_loop(bot), name="auto_publish_loop")
    logger.info("[auto-publish] Background task created: %s", task.get_name())
    return task
