import uuid
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_workflows: dict[int, dict] = {}


def create_workflow(user_id: int, objective: str, plan: list[dict]) -> dict:
    workflow = {
        "project_id": str(uuid.uuid4())[:8],
        "user_id": user_id,
        "objective": objective,
        "plan": plan,
        "current_step": 0,
        "outputs": {},
        "status": "active",
    }
    _workflows[user_id] = workflow
    logger.info(
        "Workflow created for user %d: id=%s steps=%d",
        user_id, workflow["project_id"], len(plan),
    )
    return workflow


def get_workflow(user_id: int) -> Optional[dict]:
    return _workflows.get(user_id)


def delete_workflow(user_id: int) -> None:
    _workflows.pop(user_id, None)
    logger.info("Workflow deleted for user %d", user_id)
