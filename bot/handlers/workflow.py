import logging
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, BufferedInputFile

from bot.services.openai_service import generate_workflow_plan
from bot.services.workflow_store import create_workflow, get_workflow, delete_workflow
from bot.services.workflow_service import execute_step, format_plan, format_status

logger = logging.getLogger(__name__)
router = Router()


# ---------------------------------------------------------------------------
# /project [objective]
# ---------------------------------------------------------------------------

@router.message(Command("project"))
async def handle_project(message: Message) -> None:
    text = (message.text or "").strip()
    parts = text.split(maxsplit=1)
    objective = parts[1].strip() if len(parts) > 1 else ""

    if not objective:
        await message.answer(
            "<b>Start a Project Workflow</b>\n\n"
            "Provide your objective after /project and the system will generate "
            "a structured plan and execute it step by step.\n\n"
            "Example:\n"
            "/project Build a content pack about silent discipline"
        )
        return

    await message.answer("Generating workflow plan...")

    try:
        plan = await generate_workflow_plan(objective)
    except Exception as e:
        logger.error("Plan generation error: %s", e)
        await message.answer(
            "Plan generation encountered an error. Please try again."
        )
        return

    workflow = create_workflow(message.from_user.id, objective, plan)

    plan_lines = "\n".join(
        f"{i + 1}. {step['label']}" for i, step in enumerate(plan)
    )
    reply = (
        f"<b>Project Initialized</b>\n\n"
        f"<b>Objective:</b> {objective}\n\n"
        f"<b>Plan:</b>\n{plan_lines}\n\n"
        f"<b>Next step:</b> Step 1 — {plan[0]['label']}\n\n"
        f"Use /continue to execute step 1."
    )
    await message.answer(reply)


# ---------------------------------------------------------------------------
# /plan
# ---------------------------------------------------------------------------

@router.message(Command("plan"))
async def handle_plan(message: Message) -> None:
    workflow = get_workflow(message.from_user.id)
    if not workflow:
        await message.answer(
            "No active project.\n\n"
            "Use /project [objective] to start one."
        )
        return

    current = workflow["current_step"]
    total = len(workflow["plan"])
    plan_display = format_plan(workflow)

    reply = (
        f"<b>Active Project — Plan</b>\n\n"
        f"<b>Objective:</b> {workflow['objective']}\n\n"
        f"<b>Steps:</b>\n{plan_display}\n\n"
        f"Step {min(current + 1, total)} of {total}"
    )

    if workflow["status"] == "active":
        reply += "\n\nUse /continue to execute the next step."
    else:
        reply += "\n\nProject complete. Use /resetproject to start a new one."

    await message.answer(reply)


# ---------------------------------------------------------------------------
# /continue
# ---------------------------------------------------------------------------

@router.message(Command("continue"))
async def handle_continue(message: Message) -> None:
    user_id = message.from_user.id
    workflow = get_workflow(user_id)

    if not workflow:
        await message.answer(
            "No active project.\n\n"
            "Use /project [objective] to start one."
        )
        return

    if workflow["status"] == "completed":
        await message.answer(
            "This project is already complete.\n\n"
            "Use /status to review the outputs, or /resetproject to start a new one."
        )
        return

    current_idx = workflow["current_step"]
    plan = workflow["plan"]
    step = plan[current_idx]
    total = len(plan)

    step_label = f"<b>Step {current_idx + 1} of {total}: {step['label']}</b>"
    await message.answer(f"{step_label}\n\nGenerating...")

    result = await execute_step(user_id, step)

    output_summary = (
        result["content"][:200]
        if result["type"] == "text"
        else f"[File: {result['filename']}]"
    )
    workflow["outputs"][current_idx] = output_summary

    next_idx = current_idx + 1
    is_last = next_idx >= total
    workflow["current_step"] = next_idx
    workflow["status"] = "completed" if is_last else "active"

    if result["type"] == "text":
        content = result["content"]
        if len(content) > 4000:
            content = content[:3980] + "\n\n[truncated — use /pdf to export full content]"
        await message.answer(content)
    elif result["type"] in ("pdf", "docx"):
        await message.answer(f"Exported: <b>{result['title']}</b>")
        await message.answer_document(
            BufferedInputFile(result["bytes"], filename=result["filename"]),
            caption=f"Sentinel Fortune — {result['content_type']}",
        )
    elif result["type"] == "audio":
        await message.answer(f"Audio ready: <b>{result['title']}</b>")
        await message.answer_audio(
            BufferedInputFile(result["bytes"], filename=result["filename"]),
            title=result["title"],
            performer="Sentinel Fortune",
        )

    if is_last:
        await message.answer(
            "<b>Project complete.</b>\n\n"
            "All steps have been executed.\n\n"
            "Use /status to review the plan and outputs.\n"
            "Use /resetproject to start a new project."
        )
    else:
        next_step = plan[next_idx]
        await message.answer(
            f"Completed step {current_idx + 1}.\n\n"
            f"<b>Next:</b> Step {next_idx + 1} — {next_step['label']}\n\n"
            f"Use /continue to proceed."
        )


# ---------------------------------------------------------------------------
# /status
# ---------------------------------------------------------------------------

@router.message(Command("status"))
async def handle_status(message: Message) -> None:
    workflow = get_workflow(message.from_user.id)
    if not workflow:
        await message.answer(
            "No active project.\n\n"
            "Use /project [objective] to start one."
        )
        return
    await message.answer(format_status(workflow))


# ---------------------------------------------------------------------------
# /resetproject
# ---------------------------------------------------------------------------

@router.message(Command("resetproject"))
async def handle_resetproject(message: Message) -> None:
    workflow = get_workflow(message.from_user.id)
    if not workflow:
        await message.answer("No active project to reset.")
        return

    objective = workflow["objective"]
    delete_workflow(message.from_user.id)
    await message.answer(
        f"Project cleared.\n\n"
        f"Previous objective: {objective}\n\n"
        f"Use /project [objective] to start a new one."
    )
