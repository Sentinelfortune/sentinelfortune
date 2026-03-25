"""
Sentinel Channel Publishing Service.

Handles:
  - Content registry (4 posts per product channel)
  - publish_channel_post()   -- single post, optional pin
  - publish_channel_bundle() -- ordered post series, optional pin-first
  - R2 publish log           -- originus/channel_content_logs/{product_id}/{timestamp}.json

IMPORTANT -- Telegram requirement:
  The bot must be added as an admin with "Post Messages" permission
  to each private channel. Channel IDs (numeric, e.g. -1001234567890)
  must be set via environment variables:

  CHANNEL_ID_RESET_V1, CHANNEL_ID_QUICK_ACCESS_V1,
  CHANNEL_ID_TEACHINGS_VAULT_V1, CHANNEL_ID_SENTINEL_ACCESS_V1,
  CHANNEL_ID_SENTINEL_ENGINE_V1, CHANNEL_ID_SENTINEL_ARCHITECT_V1

  To find a channel's numeric ID: forward any channel message to @userinfobot
  or use /get_channel_id in the bot after adding it to the channel.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_LOG_PREFIX = "originus/channel_content_logs/"
_QUEUE_PREFIX = "originus/channel_content/"

# ---------------------------------------------------------------------------
# Channel ID map -- loaded from environment variables
# ---------------------------------------------------------------------------

CHANNEL_IDS: dict = {
    "reset_v1":             os.environ.get("CHANNEL_ID_RESET_V1"),
    "quick_access_v1":      os.environ.get("CHANNEL_ID_QUICK_ACCESS_V1"),
    "teachings_vault_v1":   os.environ.get("CHANNEL_ID_TEACHINGS_VAULT_V1"),
    "sentinel_access_v1":   os.environ.get("CHANNEL_ID_SENTINEL_ACCESS_V1"),
    "sentinel_engine_v1":   os.environ.get("CHANNEL_ID_SENTINEL_ENGINE_V1"),
    "sentinel_architect_v1":os.environ.get("CHANNEL_ID_SENTINEL_ARCHITECT_V1"),
}

# ---------------------------------------------------------------------------
# Content registry -- 4 structured posts per channel
# ---------------------------------------------------------------------------

_RESET_POSTS = [
    (
        "<b>WELCOME TO RESET CHANNEL</b>\n\n"
        "This is your private reset space.\n\n"
        "You are here because you understand one thing:\n"
        "your internal state is the foundation of everything.\n\n"
        "This channel delivers structured reset practices, frameworks, "
        "and anchors -- one step at a time.\n\n"
        "Start here. Work through each post in order.\n\n"
        "<i>Reset is not a one-time event. It is a practice.</i>"
    ),
    (
        "<b>WHY YOU FEEL STUCK</b>\n\n"
        "Most people try to solve external problems first.\n\n"
        "They change jobs. Change cities. Change relationships.\n\n"
        "But the instability follows them -- because the source is internal.\n\n"
        "When your inner foundation is unstable:\n"
        "- Decisions feel heavy\n"
        "- Pressure builds from nothing\n"
        "- Simple tasks become exhausting\n\n"
        "This is not a character flaw. It is a foundation problem.\n\n"
        "The fix is not outside. It is inside.\n\n"
        "<b>That is what this channel addresses.</b>"
    ),
    (
        "<b>THE RESET PROTOCOL</b>\n\n"
        "When you feel destabilized, run this:\n\n"
        "<b>STEP 1 -- STOP</b>\n"
        "Pause all activity. One breath in, hold, release.\n\n"
        "<b>STEP 2 -- LOCATE</b>\n"
        "Ask: where am I feeling this in my body?\n"
        "Not your thoughts -- your body.\n\n"
        "<b>STEP 3 -- DECLARE</b>\n"
        "'I am stabilizing.'\n"
        "'I return to clarity.'\n"
        "'I choose calm over pressure.'\n\n"
        "Repeat until the internal noise reduces.\n\n"
        "This takes 90 seconds. Use it daily."
    ),
    (
        "<b>YOUR DAILY ANCHOR PRACTICE</b>\n\n"
        "Every morning, before anything else:\n\n"
        "1. Sit still for 60 seconds\n"
        "2. State your intention for the day -- one sentence\n"
        "3. Repeat: 'I operate from a stable foundation.'\n\n"
        "Every evening, before sleep:\n\n"
        "1. Name one thing that went right today\n"
        "2. Name one adjustment for tomorrow\n"
        "3. Release the day: 'I close this day. I reset.'\n\n"
        "<b>Consistency beats intensity.</b>\n\n"
        "Small daily practice builds the foundation that nothing can shake."
    ),
]

_QUICK_POSTS = [
    (
        "<b>WELCOME TO QUICK ACCESS</b>\n\n"
        "This is your private clarity channel.\n\n"
        "You are here because you need structure that works fast.\n\n"
        "No philosophy. No theory. Just the operational frameworks "
        "that cut confusion and drive immediate action.\n\n"
        "Work through each post in order. Apply before moving on.\n\n"
        "<i>Clarity is not found. It is built through elimination and action.</i>"
    ),
    (
        "<b>THE ISOLATION PRINCIPLE</b>\n\n"
        "The source of most confusion: too many open loops.\n\n"
        "Your brain cannot hold ten priorities. It collapses under the weight.\n\n"
        "The solution is isolation:\n\n"
        "<b>RULE:</b> At any given time, you have ONE primary objective.\n\n"
        "How to find it:\n"
        "1. Write down every open task and concern\n"
        "2. Ask: which one, if resolved, makes everything else easier?\n"
        "3. That is your ONE. Everything else is secondary.\n\n"
        "Your ONE changes as things are completed.\n"
        "It is never five things. It is always one.\n\n"
        "<b>Identify your ONE now.</b>"
    ),
    (
        "<b>THE 10-MINUTE RULE</b>\n\n"
        "Confusion is not a thinking problem. It is a movement problem.\n\n"
        "When you cannot decide, you are not missing information.\n"
        "You are missing momentum.\n\n"
        "<b>THE RULE:</b>\n"
        "Within 10 minutes of identifying your ONE -- take one action.\n\n"
        "Not the perfect action. The first action.\n\n"
        "Send the message.\n"
        "Write the first sentence.\n"
        "Open the file.\n"
        "Make the call.\n\n"
        "Action creates information.\n"
        "Information creates clarity.\n"
        "Clarity creates momentum.\n\n"
        "<b>10 minutes. Move.</b>"
    ),
    (
        "<b>THE WEEKLY CLARITY CYCLE</b>\n\n"
        "Use this every Sunday or Monday:\n\n"
        "<b>REVIEW (10 min)</b>\n"
        "What was completed last week?\n"
        "What was avoided? Why?\n\n"
        "<b>RESET (5 min)</b>\n"
        "Close last week fully. Write: 'Last week is done.'\n\n"
        "<b>SET ONE OBJECTIVE (5 min)</b>\n"
        "What is the ONE outcome this week that matters most?\n"
        "Write it down. Put it where you will see it daily.\n\n"
        "<b>EXECUTE</b>\n"
        "The week is now structured. Move on it.\n\n"
        "20 minutes of weekly planning prevents 20 hours of weekly confusion."
    ),
]

_VAULT_POSTS = [
    (
        "<b>WELCOME TO THE TEACHINGS VAULT</b>\n\n"
        "You have unlocked the foundational layer of the Sentinel system.\n\n"
        "This vault contains core principles -- not tactics.\n"
        "Principles are the reason tactics work or fail.\n\n"
        "Read each teaching slowly.\n"
        "Apply it before reading the next.\n\n"
        "The vault is not for passive reading.\n"
        "It is a structured path through the core of how Sentinel operates.\n\n"
        "<i>What is built on a weak foundation collapses. Build correctly.</i>"
    ),
    (
        "<b>TEACHING 1 -- INTERNAL STATE BEFORE EXTERNAL ACTION</b>\n\n"
        "Every action you take is a product of your internal state.\n\n"
        "When your state is unstable:\n"
        "- Your decisions are reactive, not strategic\n"
        "- Your execution is inconsistent\n"
        "- Your results are unpredictable\n\n"
        "When your state is stable:\n"
        "- Your decisions are clear\n"
        "- Your execution is consistent\n"
        "- Your results compound\n\n"
        "This is why all Sentinel frameworks begin with state management.\n\n"
        "Before you try to fix your results -- stabilize your state.\n\n"
        "<b>Internal state first. Always.</b>"
    ),
    (
        "<b>TEACHING 2 -- CLARITY, DECISION, ACTION</b>\n\n"
        "Most people operate in reverse:\n"
        "They act without deciding, and decide without clarity.\n\n"
        "The Sentinel sequence:\n\n"
        "<b>CLARITY</b>\n"
        "What is the actual situation? Not the story about it -- the facts.\n\n"
        "<b>DECISION</b>\n"
        "Given the facts, what is the correct next step?\n"
        "One step. Not a strategy. A step.\n\n"
        "<b>ACTION</b>\n"
        "Execute the step immediately.\n"
        "Evaluation comes after, not before.\n\n"
        "Most paralysis lives between Clarity and Decision.\n"
        "Most failure lives between Decision and Action.\n\n"
        "<b>Clarity. Decision. Action. In that order. Every time.</b>"
    ),
    (
        "<b>TEACHING 3 -- THE DAILY PRACTICE STRUCTURE</b>\n\n"
        "Insight without practice is information.\n"
        "Practice without insight is habit.\n"
        "Both together build a system.\n\n"
        "<b>MORNING PRACTICE (10 min)</b>\n"
        "1. Define the one outcome for today\n"
        "2. Identify the single first action\n"
        "3. State your operating posture: calm, clear, direct\n\n"
        "<b>MIDDAY CHECK (2 min)</b>\n"
        "1. Am I still on the ONE objective?\n"
        "2. If not -- what pulled me off? Reorient.\n\n"
        "<b>EVENING CLOSE (5 min)</b>\n"
        "1. What was completed?\n"
        "2. What carries forward?\n"
        "3. Close the day: 'This day is complete.'\n\n"
        "<b>17 minutes of structure per day. Apply it.</b>"
    ),
]

_ACCESS_POSTS = [
    (
        "<b>SENTINEL ACCESS -- WELCOME</b>\n\n"
        "You have entered the Sentinel system.\n\n"
        "This is the foundation layer.\n\n"
        "Sentinel Access is designed to:\n"
        "- Install the core operating framework\n"
        "- Build your internal structure before external execution\n"
        "- Orient you within the Sentinel system clearly\n\n"
        "Work through each post in the order they appear.\n"
        "Do not skip ahead. The sequence is deliberate.\n\n"
        "<i>Foundation before everything. This is where it begins.</i>"
    ),
    (
        "<b>HOW THE SENTINEL SYSTEM WORKS</b>\n\n"
        "Sentinel is not a course. It is an operating system.\n\n"
        "It has three layers:\n\n"
        "<b>LAYER 1 -- FOUNDATION (Sentinel Access)</b>\n"
        "Internal state. Clarity framework. Decision structure.\n"
        "This is where you are now.\n\n"
        "<b>LAYER 2 -- EXECUTION (Sentinel Engine)</b>\n"
        "Offers. Revenue. Operations. Deal flow.\n"
        "This layer runs on the foundation built here.\n\n"
        "<b>LAYER 3 -- ARCHITECTURE (Sentinel Architect)</b>\n"
        "Systems. IP. Long-term positioning. Strategic design.\n"
        "This layer runs on the execution built in Layer 2.\n\n"
        "Each layer depends on the one beneath it.\n\n"
        "<b>You cannot build Layer 3 without completing Layer 1.</b>\n"
        "Work the sequence."
    ),
    (
        "<b>YOUR FIRST WEEK IN SENTINEL ACCESS</b>\n\n"
        "<b>DAY 1-2: ORIENT</b>\n"
        "Read all posts in this channel.\n"
        "Do not apply yet. Absorb the structure first.\n\n"
        "<b>DAY 3-4: INSTALL</b>\n"
        "Begin the daily practice structure.\n"
        "Morning intention. One objective. Evening close.\n\n"
        "<b>DAY 5-6: EXECUTE</b>\n"
        "Apply the Clarity, Decision, Action sequence to your current situation.\n"
        "One real decision. One real action.\n\n"
        "<b>DAY 7: REVIEW</b>\n"
        "What shifted this week?\n"
        "What still needs work?\n"
        "Set your ONE objective for next week.\n\n"
        "<b>One week of structured work builds more than a year of reactive effort.</b>"
    ),
    (
        "<b>HOW TO USE SENTINEL ACCESS EFFECTIVELY</b>\n\n"
        "Three operating rules:\n\n"
        "<b>RULE 1 -- ONE POST PER DAY</b>\n"
        "Do not read everything at once.\n"
        "One post. One application. Then the next.\n\n"
        "<b>RULE 2 -- APPLY BEFORE ADVANCING</b>\n"
        "If you cannot describe how you used the last framework --\n"
        "you are not ready for the next one.\n\n"
        "<b>RULE 3 -- MEASURE BY OUTCOME, NOT UNDERSTANDING</b>\n"
        "Understanding is not the goal. Results are.\n"
        "Each framework must produce a visible change in your behavior or decisions.\n\n"
        "This is an active system. Engage with it actively.\n\n"
        "<i>Passive consumption produces no change. "
        "Active application produces compounding results.</i>"
    ),
]

_ENGINE_POSTS = [
    (
        "<b>SENTINEL ENGINE -- WELCOME</b>\n\n"
        "You have entered the execution layer of the Sentinel system.\n\n"
        "The Engine is where strategy becomes revenue.\n\n"
        "This channel delivers:\n"
        "- Offer construction frameworks\n"
        "- Revenue architecture models\n"
        "- Operational execution systems\n"
        "- Monetization logic\n\n"
        "Prerequisite: The foundation from Sentinel Access must be stable.\n"
        "If it is not -- start there first.\n\n"
        "<i>The Engine is powerful. It requires a stable operator.</i>"
    ),
    (
        "<b>THE OFFER CONSTRUCTION PROTOCOL</b>\n\n"
        "Every offer must pass three tests:\n\n"
        "<b>TEST 1 -- CLARITY</b>\n"
        "Can you explain what you sell in one sentence?\n"
        "If not -- the offer is not clear enough to sell.\n\n"
        "<b>TEST 2 -- URGENCY</b>\n"
        "Does the buyer need this now, or someday?\n"
        "Someday is not a selling condition. Urgency is.\n\n"
        "<b>TEST 3 -- SELLABILITY</b>\n"
        "Has someone already paid for this, or something like it?\n"
        "If not -- it is a hypothesis, not an offer.\n\n"
        "When all three pass -- you have a real offer.\n\n"
        "<b>Build the offer. Test it. Sell it. Then scale it.</b>\n"
        "Never in reverse order."
    ),
    (
        "<b>THE 5-LAYER REVENUE MODEL</b>\n\n"
        "<b>LAYER 1 -- ENTRY ($9-$29)</b>\n"
        "Low barrier. High volume. Builds trust and list.\n\n"
        "<b>LAYER 2 -- CORE ($97-$197)</b>\n"
        "Primary revenue driver. Delivers your main system or method.\n\n"
        "<b>LAYER 3 -- ADVANCED ($297-$497)</b>\n"
        "Premium layer. Deeper access, more customization.\n\n"
        "<b>LAYER 4 -- DONE-WITH-YOU ($997-$2,997)</b>\n"
        "High-touch delivery. Your time is part of the product.\n\n"
        "<b>LAYER 5 -- DONE-FOR-YOU / LICENSING ($5,000+)</b>\n"
        "You build it. They use it. Highest margin, lowest volume.\n\n"
        "You do not need all five layers immediately.\n"
        "You need Layers 1-2 active and working before adding more.\n\n"
        "<b>Depth before breadth. Revenue before complexity.</b>"
    ),
    (
        "<b>THE WEEKLY EXECUTION LOOP</b>\n\n"
        "<b>MONDAY -- ORIENT</b>\n"
        "One revenue objective for the week.\n"
        "One offer to push. One channel to use.\n\n"
        "<b>TUESDAY-THURSDAY -- EXECUTE</b>\n"
        "Three days of focused offer delivery and follow-up.\n"
        "No new strategies. Execute the current one.\n\n"
        "<b>FRIDAY -- MEASURE</b>\n"
        "What was the revenue result?\n"
        "What worked? What failed? Why?\n\n"
        "<b>SATURDAY -- ADJUST</b>\n"
        "Refine one element based on Friday's data.\n"
        "One adjustment. Not a rebuild.\n\n"
        "<b>SUNDAY -- RESET</b>\n"
        "Close the week. Prepare the next objective.\n\n"
        "Five-day execution cycle. Repeat until the model is stable.\n"
        "<b>Stability before scale.</b>"
    ),
]

_ARCHITECT_POSTS = [
    (
        "<b>SENTINEL ARCHITECT -- WELCOME</b>\n\n"
        "You have reached the strategic layer.\n\n"
        "Architect level is not for beginners.\n"
        "It is for operators who have a working execution layer "
        "and are ready to build the system behind the system.\n\n"
        "This channel delivers:\n"
        "- System architecture principles\n"
        "- IP structuring and licensing fundamentals\n"
        "- Long-term positioning strategy\n"
        "- Deal architecture and partner framework\n\n"
        "The Architect does not execute tasks. "
        "The Architect designs systems that execute.\n\n"
        "<i>You are not building a business. You are building a machine.</i>"
    ),
    (
        "<b>SYSTEM VS. BUSINESS -- THE CRITICAL DISTINCTION</b>\n\n"
        "A business requires your presence to generate revenue.\n"
        "A system generates revenue whether or not you are present.\n\n"
        "Most operators build a business.\n"
        "Architects build a system.\n\n"
        "The difference:\n\n"
        "<b>BUSINESS</b>\n"
        "You are the product. Your time is the delivery mechanism.\n"
        "Revenue ceiling = your available hours.\n\n"
        "<b>SYSTEM</b>\n"
        "The method is the product. Delivery is automated or delegated.\n"
        "Revenue ceiling = system capacity, not personal time.\n\n"
        "How to cross from business to system:\n"
        "1. Document everything you do manually\n"
        "2. Determine what can be standardized\n"
        "3. Build the standard into a repeatable process\n"
        "4. Replace yourself in that process\n\n"
        "<b>One process at a time. Start with the most frequent.</b>"
    ),
    (
        "<b>IP STRUCTURING FUNDAMENTALS</b>\n\n"
        "Your most valuable asset is not your time. It is your method.\n\n"
        "Intellectual Property (IP) is any structured system, method, "
        "framework, or process that produces a repeatable result.\n\n"
        "IP can be:\n"
        "- Licensed (others pay to use your method)\n"
        "- Packaged (sold as a product)\n"
        "- White-labeled (others deliver it under their brand)\n"
        "- Franchised (others build on your system with your support)\n\n"
        "<b>The Sentinel IP Framework:</b>\n"
        "1. Name your method\n"
        "2. Document the steps\n"
        "3. Define the result it produces\n"
        "4. Build a delivery mechanism\n"
        "5. License the mechanism\n\n"
        "IP converts your expertise into an asset that earns without your presence.\n\n"
        "<b>Your method is worth more than your time. Structure it accordingly.</b>"
    ),
    (
        "<b>THE LONG-TERM ARCHITECTURE PROTOCOL</b>\n\n"
        "Three-horizon planning model:\n\n"
        "<b>HORIZON 1 -- NOW (0-90 days)</b>\n"
        "What is the current offer generating revenue?\n"
        "Stabilize it. Make it consistent. Document it fully.\n\n"
        "<b>HORIZON 2 -- NEXT (90 days - 1 year)</b>\n"
        "What is the next system layer to build?\n"
        "One new revenue stream. One new delivery method.\n"
        "Built on the stable foundation of Horizon 1.\n\n"
        "<b>HORIZON 3 -- FUTURE (1-3 years)</b>\n"
        "What does the full system look like when complete?\n"
        "Not a goal. A design. Work backward from it.\n\n"
        "Architecture principle:\n"
        "Never build Horizon 2 until Horizon 1 is stable.\n"
        "Never design Horizon 3 until Horizon 2 is in motion.\n\n"
        "<b>Sequence is not optional. It is the architecture.</b>"
    ),
]

_CONTENT: dict = {
    "reset_v1":             _RESET_POSTS,
    "quick_access_v1":      _QUICK_POSTS,
    "teachings_vault_v1":   _VAULT_POSTS,
    "sentinel_access_v1":   _ACCESS_POSTS,
    "sentinel_engine_v1":   _ENGINE_POSTS,
    "sentinel_architect_v1":_ARCHITECT_POSTS,
}


def get_channel_content(product_id: str) -> list:
    """Return the 4-post content bundle for a product channel."""
    return _CONTENT.get(product_id, [])


# ---------------------------------------------------------------------------
# R2 publish logger
# ---------------------------------------------------------------------------

async def _log_publish(product_id: str, channel_id: str, post_index: int, status: str) -> None:
    try:
        from bot.services.r2_service import put_json
        now = datetime.now(timezone.utc)
        ts = now.strftime("%Y%m%dT%H%M%S")
        key = f"{_LOG_PREFIX}{product_id}/{ts}_{post_index}.json"
        await put_json(key, {
            "product_id": product_id,
            "channel":    channel_id,
            "post_index": post_index,
            "posted_at":  now.isoformat(),
            "status":     status,
            "source":     "telegram_bot",
        })
    except Exception as exc:
        logger.warning("_log_publish failed: %s", exc)


# ---------------------------------------------------------------------------
# Core publishing functions
# ---------------------------------------------------------------------------

async def publish_channel_post(bot, product_id: str, text: str, pin: bool = False) -> dict:
    """
    Send one post to a product's private channel.
    Returns {"ok": True/False, "message_id": int|None, "error": str|None}.
    """
    channel_id = CHANNEL_IDS.get(product_id)
    if not channel_id:
        msg = (
            f"Channel ID not configured for {product_id}. "
            f"Set env var CHANNEL_ID_{product_id.upper()} to the numeric channel ID."
        )
        logger.warning(msg)
        return {"ok": False, "message_id": None, "error": msg}

    try:
        sent = await bot.send_message(
            chat_id=int(channel_id),
            text=text,
            parse_mode="HTML",
        )
        message_id = sent.message_id

        if pin:
            try:
                await bot.pin_chat_message(
                    chat_id=int(channel_id),
                    message_id=message_id,
                    disable_notification=True,
                )
                logger.info("Pinned message %s in %s", message_id, channel_id)
            except Exception as pin_err:
                logger.warning("Pin failed (post still sent): %s", pin_err)

        asyncio.create_task(_log_publish(product_id, channel_id, 0, "published"))
        logger.info("Published to %s channel_id=%s msg_id=%s", product_id, channel_id, message_id)
        return {"ok": True, "message_id": message_id, "error": None}

    except Exception as exc:
        logger.error("publish_channel_post failed: %s", exc)
        return {"ok": False, "message_id": None, "error": str(exc)}


async def publish_channel_bundle(bot, product_id: str, posts=None, pin_first: bool = False) -> dict:
    """
    Publish multiple posts in order to a product's channel.
    Uses the built-in content registry if posts is None.
    Returns {"ok": True/False, "published": int, "errors": list}.
    """
    if posts is None:
        posts = get_channel_content(product_id)

    if not posts:
        return {"ok": False, "published": 0, "errors": [f"No content for {product_id}"]}

    channel_id = CHANNEL_IDS.get(product_id)
    if not channel_id:
        err = (
            f"Channel ID not configured for {product_id}. "
            f"Set env var CHANNEL_ID_{product_id.upper()}."
        )
        return {"ok": False, "published": 0, "errors": [err]}

    published = 0
    errors = []

    for idx, text in enumerate(posts):
        pin = pin_first and idx == 0
        try:
            sent = await bot.send_message(
                chat_id=int(channel_id),
                text=text,
                parse_mode="HTML",
            )
            if pin:
                try:
                    await bot.pin_chat_message(
                        chat_id=int(channel_id),
                        message_id=sent.message_id,
                        disable_notification=True,
                    )
                except Exception as pin_err:
                    logger.warning("Pin failed on post %s: %s", idx, pin_err)
            asyncio.create_task(_log_publish(product_id, channel_id, idx, "published"))
            published += 1
            await asyncio.sleep(0.5)
        except Exception as exc:
            err_msg = f"Post {idx} failed: {exc}"
            logger.error(err_msg)
            errors.append(err_msg)

    ok = published > 0 and not errors
    logger.info("Bundle complete: product=%s published=%s errors=%s", product_id, published, len(errors))
    return {"ok": ok, "published": published, "errors": errors}
