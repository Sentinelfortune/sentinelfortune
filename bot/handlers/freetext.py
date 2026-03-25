import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from aiogram import Router, F
from aiogram.types import Message

from bot.services.openai_service import ask_sentinel, FALLBACK_MESSAGE
from bot.services.delivery_service import get_user_pending, has_active_grant
from bot.services.gateway_service import (
    route_through_gateway, detect_intent,
    INTENT_CONTACT, INTENT_OEM, INTENT_LICENSING,
    INTENT_GOVERNANCE, INTENT_DEALS,
)
from bot.services.retrieval_service import retrieve
from bot.services.email_intake_service import process_email_inquiry, classify_desk
from bot.services.deal_service import (
    create_lead,
    deal_response_for_message,
    parse_structured_reply,
    get_latest_lead_for_user,
    enrich_lead_from_reply,
    NDA_DETAIL_REQUEST,
    NEGOTIATION_MESSAGE,
    get_pack_for_desk,
    _DESK_RISK,
)
from bot.services.qualification_service import (
    get_session,
    start_session,
    advance_session,
    clear_session,
)
from bot.services.routing_service import route_qual_record

logger = logging.getLogger(__name__)
router = Router()

# ---------------------------------------------------------------------------
# Email intake triggering
# ---------------------------------------------------------------------------

_INTAKE_INTENTS = frozenset({
    INTENT_CONTACT,
    INTENT_OEM,
    INTENT_LICENSING,
    INTENT_GOVERNANCE,
    INTENT_DEALS,
})

_CONTACT_SIGNALS = frozenset({
    "contact", "reach", "email", "speak", "talk", "connect",
    "partner", "partnership", "submit", "apply", "inquire",
    "inquiry", "enquire", "enquiry", "interested", "follow up",
    "follow-up", "schedule", "meet", "discuss", "request",
    "proposal", "pitch", "engage", "join", "would like",
    "want to", "looking for", "looking to", "working with",
    "we are", "we want", "i want", "i am", "introduce",
    "collaborate", "collaboration", "get in touch",
})


def _has_contact_signal(text: str) -> bool:
    lower = text.lower()
    words = set(lower.split())
    return bool(words & _CONTACT_SIGNALS) or any(
        phrase in lower for phrase in _CONTACT_SIGNALS if " " in phrase
    )


def _should_fire_intake(intent: str, text: str) -> bool:
    if intent not in _INTAKE_INTENTS:
        return False
    if intent == INTENT_CONTACT:
        return True
    return _has_contact_signal(text)


_OFFER_LABELS: dict[str, str] = {
    "access":    "Sentinel Access",
    "engine":    "Sentinel Engine",
    "architect": "Sentinel Architect",
    "unknown":   "Unknown",
}

_RETRIEVAL_INTENTS = frozenset({
    "query.governance",
    "query.licensing",
    "query.oem",
    "query.deals",
    "query.ip",
    "query.universes",
    "query.worlds",
    "query.domain",
    "query.delivery_status",
    "query.contact",
})


async def _resolve_access_level(user_id: int) -> str:
    for tier in ("architect", "engine", "access"):
        if await has_active_grant(user_id, tier):
            return "architect" if tier == "architect" else "member"
    return "public"


# ---------------------------------------------------------------------------
# Primary handler
# ---------------------------------------------------------------------------

@router.message(F.text)
async def handle_freetext(message: Message) -> None:
    from bot.handlers.done import process_done

    user_text = (message.text or "").strip()
    logger.info("Free-text message received: %r", user_text[:80])

    lower = user_text.lower()

    # --- DONE shortcut ---
    if lower == "done" or lower.startswith("done "):
        await process_done(message, user_text)
        return

    # --- Pending delivery guard ---
    pending = get_user_pending(message.from_user.id)
    if pending:
        offer_label = _OFFER_LABELS.get(pending["detected_offer"], "Unknown")
        await message.answer(
            "Your request is already being processed.\n\n"
            f"Offer: {offer_label}\n"
            "Status: Pending review\n\n"
            "You will be contacted once your delivery is confirmed."
        )
        return

    user    = message.from_user
    user_id = user.id
    username = user.username or user.full_name or None
    chat_id  = message.chat.id

    # --- Structured intake reply (Key: Value format) ---
    if await _handle_structured_intake_reply(message, user_id, user_text):
        return

    # --- Active qualification session → advance it, skip all routing ---
    if get_session(user_id):
        await _advance_active_session(message, user_id, user_text)
        return

    # --- Intent + desk detection ---
    intent = detect_intent(user_text)
    _desk  = classify_desk(user_text)

    # Determine whether this message crosses the qualification threshold.
    # deal_response_for_message returns None for pure informational queries.
    _risk         = _DESK_RISK.get(_desk, "low")
    _qual_trigger = deal_response_for_message(user_text, _desk, _risk)

    # --- Qualifying message → start session (gatekeeper mode) ---
    if _qual_trigger is not None:
        q_intro = start_session(user_id, _desk)
        await message.answer(q_intro)
        # Fire lead creation in background so the session has a lead to enrich on completion
        asyncio.create_task(
            _fire_lead_creation(user_id, username, user_text, intent)
        )
        if _should_fire_intake(intent, user_text):
            asyncio.create_task(_fire_email_intake(user_id, username, user_text))
        return

    # --- Informational message → normal routing ---

    # Primary: sfl-access-gateway
    try:
        worker_response = await route_through_gateway(
            user_id=user_id,
            username=username,
            chat_id=chat_id,
            text=user_text,
        )
    except Exception as exc:
        logger.error("Gateway routing raised unexpectedly: %s", exc)
        worker_response = None

    if worker_response:
        await message.answer(worker_response)
        if _should_fire_intake(intent, user_text):
            asyncio.create_task(_fire_email_intake(user_id, username, user_text))
        return

    # Secondary: R2 retrieval
    if intent in _RETRIEVAL_INTENTS:
        logger.info("Gateway unavailable — using R2 retrieval for intent=%s", intent)
        try:
            access_level = await _resolve_access_level(user_id)
            retrieval_response = await retrieve(intent, access_level, enrich_from_canon=True)
            if retrieval_response:
                await message.answer(retrieval_response)
                if _should_fire_intake(intent, user_text):
                    asyncio.create_task(_fire_email_intake(user_id, username, user_text))
                return
        except Exception as exc:
            logger.error("Retrieval service failed: %s", exc)

    # Fallback: OpenAI
    logger.info("Using OpenAI fallback for user_id=%s intent=%s", user_id, intent)
    try:
        response = await ask_sentinel(user_text)
    except Exception as exc:
        logger.error("OpenAI fallback also failed: %s", exc)
        response = FALLBACK_MESSAGE

    await message.answer(response)
    if _should_fire_intake(intent, user_text):
        asyncio.create_task(_fire_email_intake(user_id, username, user_text))


# ---------------------------------------------------------------------------
# Qualification session helpers
# ---------------------------------------------------------------------------

async def _advance_active_session(message: Message, user_id: int, text: str) -> None:
    """
    Advance the user's active qualification session by one answer.
    Sends the next question or the completion summary.
    On completion: persists to R2 and enriches the lead record.
    User-facing response is never blocked by background tasks.
    """
    response, is_complete, answers = advance_session(user_id, text)
    await message.answer(response)

    if is_complete and answers:
        # Extract private routing keys — strip before passing to lead enrichment
        ref_id = answers.pop("_ref_id", None)
        desk   = answers.pop("_desk", None)

        # R2 persistence — fire and forget, never blocks user
        if ref_id and desk:
            asyncio.create_task(
                _persist_qual_to_r2(
                    ref_id=ref_id,
                    desk=desk,
                    answers=dict(answers),   # clean copy, no private keys
                    summary=response,
                )
            )

        # Lead enrichment — existing behaviour, unchanged
        asyncio.create_task(_enrich_lead_from_qual(user_id, dict(answers)))


async def _persist_qual_to_r2(
    ref_id: str,
    desk: str,
    answers: dict,
    summary: str,
) -> None:
    """
    Background task: write completed qualification record to R2.
    Path: originus/bot/deals/intake/{ref_id}.json
    Exactly one write per ref_id — guards against duplicate writes.
    Never raises — failures are logged internally only.
    """
    from bot.services.r2_service import put_json, key_exists

    _CLASSIFICATION = {
        "oem":       "oem_partner",
        "licensing": "licensing_applicant",
        "investor":  "investor_applicant",
        "legal":     "legal_inquiry",
        "contact":   "general_inquiry",
    }
    _NEXT_ACTION = {
        "oem":       "OEM_DESK_REVIEW",
        "licensing": "LICENSING_DESK_REVIEW",
        "investor":  "INVESTOR_RELATIONS_REVIEW",
        "legal":     "LEGAL_DESK_REVIEW",
        "contact":   "GENERAL_INTAKE_REVIEW",
    }

    key = f"originus/bot/deals/intake/{ref_id}.json"
    try:
        if await key_exists(key):
            logger.warning("R2 qual record already exists — skipping duplicate write: %s", key)
            return

        record = {
            "ref_id":         ref_id,
            "desk":           desk,
            "classification": _CLASSIFICATION.get(desk, "general_inquiry"),
            "completed_at":   datetime.now(timezone.utc).isoformat(),
            "answers":        answers,
            "final_summary":  summary,
            "next_action":    _NEXT_ACTION.get(desk, "GENERAL_INTAKE_REVIEW"),
            "status":         "NEW",
            "source":         "telegram_bot",
            "bot_username":   "@sentinelfortune_bot",
        }

        ok = await put_json(key, record)
        if ok:
            logger.info("Qual record persisted to R2: %s", key)
            # Route to desk namespace — non-blocking, never breaks chat flow
            asyncio.create_task(route_qual_record(record))
        else:
            logger.error("Qual record R2 write failed (non-blocking): %s", key)

    except Exception as exc:
        logger.error("_persist_qual_to_r2 raised unexpectedly (non-blocking): %s", exc)


async def _enrich_lead_from_qual(user_id: int, answers: dict) -> None:
    """
    Background task: enrich the user's latest R2 lead record with
    the qualification answers collected during the session.
    """
    try:
        lead = await get_latest_lead_for_user(user_id)
        if not lead:
            logger.warning("No lead found to enrich after qual session: user=%s", user_id)
            return
        lead_id = lead.get("lead_id")
        if not lead_id:
            return
        enriched = await enrich_lead_from_reply(lead_id, answers)
        if enriched:
            logger.info(
                "Lead enriched from qual session: %s status=%s strength=%s",
                lead_id, enriched.get("status"), enriched.get("deal_strength"),
            )
    except Exception as exc:
        logger.warning("Qual lead enrichment failed (non-blocking): %s", exc)


# ---------------------------------------------------------------------------
# Structured intake reply handler (Key: Value form submissions)
# ---------------------------------------------------------------------------

async def _handle_structured_intake_reply(message: Message, user_id: int, text: str) -> bool:
    """
    Detect and process a structured intake reply (Key: Value format).
    Returns True if handled, False otherwise.
    """
    parsed = parse_structured_reply(text)
    if not parsed:
        return False
    lead = await get_latest_lead_for_user(user_id)
    if not lead:
        return False
    lead_id = lead.get("lead_id")
    if not lead_id:
        return False
    enriched = await enrich_lead_from_reply(lead_id, parsed)
    if not enriched:
        return False

    desk   = enriched.get("desk", "")
    status = enriched.get("status", "")
    na     = enriched.get("next_action", "")

    if status == "NDA_REQUIRED":
        pack = get_pack_for_desk(desk)
        confirmation = (
            "Intake received.\n\n"
            f"Qualifies for: {pack}\n"
            "Requirement: Non-Disclosure Agreement before disclosure.\n\n"
            + NDA_DETAIL_REQUEST
        )
    else:
        desk_label = {
            "oem":       "OEM",
            "licensing": "Licensing",
            "investor":  "Investor Relations",
            "legal":     "Legal",
            "contact":   "Intake",
        }.get(desk, "Intake")
        confirmation = (
            f"Received.\n\n"
            f"Logged to: {desk_label} desk\n"
            "Status: Under review\n\n"
            "You will be contacted once reviewed. No automated response will follow."
        )

    await message.answer(confirmation)
    logger.info(
        "Structured intake reply processed: lead=%s status=%s next_action=%s",
        lead_id, status, na,
    )
    return True


# ---------------------------------------------------------------------------
# Background side-effect tasks
# ---------------------------------------------------------------------------

async def _fire_email_intake(user_id: int, username: Optional[str], text: str) -> None:
    try:
        await process_email_inquiry(user_id=user_id, username=username, text=text)
        logger.info("Email intake fired for user_id=%s", user_id)
    except Exception as exc:
        logger.warning("Email intake fire failed (non-blocking): %s", exc)


async def _fire_lead_creation(
    user_id: int,
    username: Optional[str],
    text: str,
    intent: str,
) -> None:
    try:
        desk         = classify_desk(text)
        access_level = await _resolve_access_level(user_id)
        lead = await create_lead(
            user_id=user_id,
            username=username,
            text=text,
            desk=desk,
            intent=intent,
            access_level=access_level,
        )
        if lead:
            logger.info(
                "Deal lead created: %s desk=%s stage=%s qualification=%s",
                lead.get("lead_id"), lead.get("desk"),
                lead.get("status"), lead.get("classification"),
            )
    except Exception as exc:
        logger.warning("Lead creation fire failed (non-blocking): %s", exc)


# ---------------------------------------------------------------------------
# Kept for backward compatibility (used in tests)
# ---------------------------------------------------------------------------

def _get_deal_addon(user_text: str, desk: Optional[str] = None) -> Optional[str]:
    resolved_desk = desk or "contact"
    risk_level = _DESK_RISK.get(resolved_desk, "low")
    return deal_response_for_message(user_text, resolved_desk, risk_level)


def _has_contact_signal_export(text: str) -> bool:
    return _has_contact_signal(text)


def _should_fire_intake_export(intent: str, text: str) -> bool:
    return _should_fire_intake(intent, text)
