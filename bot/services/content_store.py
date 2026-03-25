import re
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

_store: dict[int, dict] = {}


def save_content(user_id: int, content_type: str, title: str, body: str) -> None:
    _store[user_id] = {
        "type": content_type,
        "title": title,
        "body": body,
        "timestamp": datetime.utcnow(),
    }
    logger.debug("Stored content for user %d: type=%r title=%r", user_id, content_type, title)


def get_content(user_id: int) -> Optional[dict]:
    return _store.get(user_id)


def extract_title(content: str, fallback: str = "Content") -> str:
    prefixes = ("title:", "working title:", "asset title:", "scene title:")
    lines = content.strip().split("\n")
    for line in lines[:6]:
        line_stripped = line.strip()
        if not line_stripped:
            continue
        lower = line_stripped.lower()
        for prefix in prefixes:
            if lower.startswith(prefix):
                t = line_stripped[len(prefix):].strip()
                if t:
                    return t[:80]
    clean = re.sub(r"[^\w\s\-]", "", fallback).strip()
    return clean[:60] if clean else "Sentinel Fortune Content"
