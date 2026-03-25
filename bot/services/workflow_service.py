import logging
from typing import Any

from bot.services.openai_service import generate_text_factory, FALLBACK_MESSAGE
from bot.services.content_store import save_content, get_content, extract_title
from bot.services.export_service import generate_pdf, generate_docx, safe_filename

logger = logging.getLogger(__name__)

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

_GENERATION_COMMANDS = set(_FORMAT_LABELS.keys())


async def execute_step(user_id: int, step: dict) -> dict[str, Any]:
    command = step.get("command", "")
    args = step.get("args", "").strip()

    if command in _GENERATION_COMMANDS:
        try:
            result = await generate_text_factory(command, args or "untitled")
        except Exception as e:
            logger.error("Step generation failed [%s]: %s", command, e)
            return {"type": "text", "content": FALLBACK_MESSAGE}

        label = _FORMAT_LABELS[command]
        title = extract_title(result, args[:50])
        save_content(user_id, label, title, result)
        return {"type": "text", "content": result, "title": title}

    if command == "export_pdf":
        stored = get_content(user_id)
        if not stored:
            return {
                "type": "text",
                "content": (
                    "No generated content is available to export. "
                    "A generation step must precede this export step."
                ),
            }
        try:
            pdf_bytes = generate_pdf(stored["title"], stored["type"], stored["body"])
            filename = safe_filename(stored["title"], "pdf")
            return {
                "type": "pdf",
                "bytes": pdf_bytes,
                "title": stored["title"],
                "filename": filename,
                "content_type": stored["type"],
            }
        except Exception as e:
            logger.error("PDF export failed in workflow: %s", e)
            return {"type": "text", "content": "PDF export encountered an error."}

    if command == "export_docx":
        stored = get_content(user_id)
        if not stored:
            return {
                "type": "text",
                "content": (
                    "No generated content is available to export. "
                    "A generation step must precede this export step."
                ),
            }
        try:
            docx_bytes = generate_docx(stored["title"], stored["type"], stored["body"])
            filename = safe_filename(stored["title"], "docx")
            return {
                "type": "docx",
                "bytes": docx_bytes,
                "title": stored["title"],
                "filename": filename,
                "content_type": stored["type"],
            }
        except Exception as e:
            logger.error("DOCX export failed in workflow: %s", e)
            return {"type": "text", "content": "DOCX export encountered an error."}

    if command in ("product", "bundle"):
        from bot.services.openai_service import generate_product_framing, generate_bundle_framing
        from bot.services.product_store import save_product, save_bundle

        stored = get_content(user_id)
        seed = args if args else (stored["title"] if stored else "")
        content_type = stored["type"] if stored else ""
        body_excerpt = stored["body"][:600] if stored else ""

        if not seed:
            return {
                "type": "text",
                "content": (
                    "No content or seed available. "
                    "A generation step must precede this packaging step."
                ),
            }

        try:
            if command == "product":
                framing = await generate_product_framing(seed, content_type, body_excerpt)
                save_product(user_id, content_type or "Product Framing", seed, framing)
            else:
                framing = await generate_bundle_framing(seed, content_type, body_excerpt)
                save_bundle(user_id, content_type or "Bundle Concept", seed, framing)
        except Exception as e:
            logger.error("Product/bundle step failed in workflow [%s]: %s", command, e)
            return {"type": "text", "content": "Product framing encountered an error."}

        return {"type": "text", "content": framing, "title": seed[:80]}

    if command == "audio":
        from bot.services.tts_service import generate_audio, prepare_for_tts
        stored = get_content(user_id)
        if not stored:
            return {
                "type": "text",
                "content": (
                    "No generated content is available for audio. "
                    "A generation step must precede this audio step."
                ),
            }
        try:
            tts_text = prepare_for_tts(stored["body"])
            audio_bytes = await generate_audio(tts_text, stored["type"])
            if audio_bytes is None:
                return {
                    "type": "text",
                    "content": "Audio generation is not available at this time.",
                }
            filename = safe_filename(stored["title"], "mp3")
            return {
                "type": "audio",
                "bytes": audio_bytes,
                "title": stored["title"],
                "filename": filename,
                "content_type": stored["type"],
            }
        except Exception as e:
            logger.error("Audio step failed in workflow: %s", e)
            return {"type": "text", "content": "Audio generation encountered an error."}

    if command == "offer":
        from bot.services.product_store import get_product, get_bundle
        from bot.services.pricing_service import suggest_price
        from bot.services.offer_service import generate_offer_text
        from bot.services.product_store import update_product_price, update_bundle_price

        entry = get_product(user_id) or get_bundle(user_id)
        is_bundle = get_product(user_id) is None and get_bundle(user_id) is not None

        if not entry:
            return {
                "type": "text",
                "content": (
                    "No product or bundle available for offer generation. "
                    "A product or bundle step must precede this step."
                ),
            }

        price = entry.get("price")
        if price is None:
            price, _ = suggest_price(
                entry["product_type"],
                content_length=len(entry["body"]),
                bundle=is_bundle,
            )
            if is_bundle:
                update_bundle_price(user_id, price, "EUR")
            else:
                update_product_price(user_id, price, "EUR")

        offer_text = generate_offer_text(
            title=entry["title"],
            product_type=entry["product_type"],
            body=entry["body"],
            price=price,
            currency=entry.get("currency", "EUR"),
        )
        return {"type": "text", "content": offer_text, "title": entry["title"]}

    return {
        "type": "text",
        "content": f"Step command '{command}' is not recognised. Skipping.",
    }


def format_plan(workflow: dict) -> str:
    plan = workflow["plan"]
    current = workflow["current_step"]
    lines = []
    for i, step in enumerate(plan):
        if i < current:
            lines.append(f"✓ {i + 1}. {step['label']}")
        elif i == current:
            lines.append(f"→ {i + 1}. {step['label']}  (next)")
        else:
            lines.append(f"  {i + 1}. {step['label']}")
    return "\n".join(lines)


def format_status(workflow: dict) -> str:
    plan = workflow["plan"]
    current = workflow["current_step"]
    total = len(plan)
    done = current
    status = workflow["status"].capitalize()

    completed_lines = [
        f"✓ Step {i + 1}: {plan[i]['label']}"
        for i in range(done)
    ]
    remaining_lines = [
        (f"→ Step {i + 1}: {plan[i]['label']}  (next)" if i == current
         else f"  Step {i + 1}: {plan[i]['label']}")
        for i in range(current, total)
    ]

    parts = [
        "<b>Workflow Status</b>",
        "",
        f"<b>Objective:</b> {workflow['objective']}",
        f"<b>Status:</b> {status}",
        f"<b>Progress:</b> {done} of {total} steps completed",
    ]

    if completed_lines:
        parts += ["", "<b>Completed:</b>"] + completed_lines

    if remaining_lines:
        parts += ["", "<b>Remaining:</b>"] + remaining_lines

    if workflow["status"] == "active":
        parts += ["", "Use /continue to proceed."]
    else:
        parts += ["", "Project complete. Use /resetproject to start a new one."]

    return "\n".join(parts)
