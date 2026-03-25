import asyncio
import logging
import os
import signal
import subprocess

from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from aiogram.types import ErrorEvent

from bot.config import TELEGRAM_BOT_TOKEN
from bot.handlers import (
    start, menu, about, sections, offer,
    seed, domains, teach, rhapsody, meditation, coach, story, scene, ebook, asset,
    export, workflow, audio, product, monetize, buy, done, admin,
    freetext, fallback,
)
from bot.handlers import onboarding
from bot.handlers import reset
from bot.handlers import store
from bot.handlers import publish
from bot.handlers import ai_content
from bot.handlers import money
from bot.handlers import premium_admin
from bot.handlers import stripe_admin
from bot.handlers import enter as enter_handler
from bot.handlers import status_cmd
from bot.services.auto_publish import start_auto_publish_loop
from bot.services.stripe_webhook import start_webhook_server

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logging.getLogger("aiogram").setLevel(logging.DEBUG)

logger = logging.getLogger(__name__)


def _kill_competing_instances() -> None:
    """
    Kill any other running bot.main processes before starting.
    Prevents TelegramConflictError caused by stale instances after workflow restart.
    """
    current_pid = os.getpid()
    try:
        result = subprocess.run(
            ["pgrep", "-f", "bot.main"],
            capture_output=True, text=True, timeout=5,
        )
        for line in result.stdout.strip().splitlines():
            try:
                pid = int(line.strip())
                if pid != current_pid:
                    os.kill(pid, signal.SIGTERM)
                    logger.warning("Terminated competing instance PID=%d", pid)
            except (ValueError, ProcessLookupError):
                pass
    except Exception as exc:
        logger.warning("Could not scan for competing instances: %s", exc)


async def main() -> None:
    bot = Bot(
        token=TELEGRAM_BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )

    dp = Dispatcher()

    @dp.errors()
    async def global_error_handler(event: ErrorEvent) -> bool:
        logger.error(
            "Handler exception for update %s: %s",
            event.update,
            event.exception,
            exc_info=event.exception,
        )
        return True

    # --- Core gateway ---
    dp.include_router(start.router)
    dp.include_router(onboarding.router)
    dp.include_router(menu.router)
    dp.include_router(about.router)
    dp.include_router(sections.router)
    dp.include_router(offer.router)

    # --- Text Factory ---
    dp.include_router(seed.router)
    dp.include_router(domains.router)
    dp.include_router(teach.router)
    dp.include_router(rhapsody.router)
    dp.include_router(meditation.router)
    dp.include_router(coach.router)
    dp.include_router(story.router)
    dp.include_router(scene.router)
    dp.include_router(ebook.router)
    dp.include_router(asset.router)

    # --- Export layer ---
    dp.include_router(export.router)

    # --- Workflow agent layer ---
    dp.include_router(workflow.router)

    # --- Audio / TTS layer ---
    dp.include_router(audio.router)

    # --- Product layer ---
    dp.include_router(product.router)

    # --- Monetization layer ---
    dp.include_router(monetize.router)

    # --- /enter and /status API commands ---
    dp.include_router(enter_handler.router)
    dp.include_router(status_cmd.router)

    # --- Catalog / Buy / Done layer ---
    dp.include_router(buy.router)
    dp.include_router(done.router)

    # --- Admin layer ---
    dp.include_router(admin.router)

    # --- Channel publishing (owner-only commands) ---
    dp.include_router(publish.router)

    # --- AI content generation (owner-only commands) ---
    dp.include_router(ai_content.router)

    # --- Phase 3 money engine (public flows + /upgrade) ---
    dp.include_router(money.router)

    # --- Phase 3 premium management (owner + /premium) ---
    dp.include_router(premium_admin.router)

    # --- Stripe admin test commands (owner-only) ---
    dp.include_router(stripe_admin.router)

    # --- Store navigation (legacy 4-category flow, p3_ callbacks handled above) ---
    dp.include_router(store.router)

    # --- RESET product ---
    dp.include_router(reset.router)

    # --- General free-text + fallback (must be last) ---
    dp.include_router(freetext.router)
    dp.include_router(fallback.router)

    logger.info("Starting sentinelfortune_bot...")
    logger.info(
        "Registered routers: start, menu, about, sections, offer | "
        "seed, domains, teach, rhapsody, meditation, coach, story, scene, ebook, asset | "
        "export | workflow | audio | product | monetize | buy, done, admin | freetext, fallback"
    )

    # --- Auto-publish background task (24h cycle, non-blocking) ---
    start_auto_publish_loop(bot)

    # --- Stripe webhook server (aiohttp, runs concurrently with polling) ---
    asyncio.create_task(start_webhook_server(bot))

    await dp.start_polling(bot, drop_pending_updates=True)


if __name__ == "__main__":
    _kill_competing_instances()
    asyncio.run(main())
