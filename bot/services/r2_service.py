"""
Cloudflare R2 service — S3-compatible async client.

All public functions are async and use asyncio.to_thread to wrap
the synchronous boto3 calls. Returns None / False gracefully if
R2 is not configured or if any error occurs. No secrets are logged.
"""

import asyncio
import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Client factory — lazy, reads env vars at call time
# ---------------------------------------------------------------------------

def _build_client():
    account_id = os.environ.get("CF_ACCOUNT_ID", "").strip()
    access_key = os.environ.get("CF_R2_ACCESS_KEY_ID", "").strip()
    secret_key = os.environ.get("CF_R2_SECRET_ACCESS_KEY", "").strip()
    endpoint = os.environ.get("CF_R2_ENDPOINT", "").strip()

    if not endpoint and account_id:
        endpoint = f"https://{account_id}.r2.cloudflarestorage.com"

    if not all([access_key, secret_key, endpoint]):
        return None

    try:
        import boto3
        return boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
        )
    except Exception as e:
        logger.error("R2 client init failed (config error): %s", type(e).__name__)
        return None


def _bucket() -> str:
    return os.environ.get("CF_R2_BUCKET", "originus-infinity-vault")


def is_configured() -> bool:
    return bool(
        os.environ.get("CF_ACCOUNT_ID", "").strip()
        and os.environ.get("CF_R2_ACCESS_KEY_ID", "").strip()
        and os.environ.get("CF_R2_SECRET_ACCESS_KEY", "").strip()
    )


# ---------------------------------------------------------------------------
# Synchronous internals (run inside thread executor)
# ---------------------------------------------------------------------------

def _sync_get_json(key: str) -> Optional[dict]:
    client = _build_client()
    if client is None:
        return None
    try:
        response = client.get_object(Bucket=_bucket(), Key=key)
        body = response["Body"].read().decode("utf-8")
        return json.loads(body)
    except client.exceptions.NoSuchKey:
        return None
    except Exception as e:
        logger.warning("R2 get_json [%s]: %s", key, type(e).__name__)
        return None


def _sync_put_json(key: str, data: dict) -> bool:
    client = _build_client()
    if client is None:
        return False
    try:
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        client.put_object(
            Bucket=_bucket(),
            Key=key,
            Body=body,
            ContentType="application/json",
        )
        logger.debug("R2 put_json OK: %s", key)
        return True
    except Exception as e:
        logger.warning("R2 put_json [%s]: %s", key, type(e).__name__)
        return False


def _sync_key_exists(key: str) -> bool:
    client = _build_client()
    if client is None:
        return False
    try:
        client.head_object(Bucket=_bucket(), Key=key)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Public async API
# ---------------------------------------------------------------------------

async def get_json(key: str) -> Optional[dict]:
    if not is_configured():
        return None
    return await asyncio.to_thread(_sync_get_json, key)


async def put_json(key: str, data: dict) -> bool:
    if not is_configured():
        return False
    return await asyncio.to_thread(_sync_put_json, key, data)


async def key_exists(key: str) -> bool:
    if not is_configured():
        return False
    return await asyncio.to_thread(_sync_key_exists, key)


async def append_to_array(
    key: str,
    item: dict,
    array_field: str,
    default_structure: Optional[dict] = None,
) -> bool:
    """Read JSON at key, append item to array_field, write back atomically."""
    current = await get_json(key)
    if current is None:
        current = default_structure.copy() if default_structure else {array_field: []}
    if array_field not in current:
        current[array_field] = []
    current[array_field].append(item)
    return await put_json(key, current)


async def append_log_entry(key: str, entry: dict) -> bool:
    return await append_to_array(key, entry, "entries", {"entries": []})


# ---------------------------------------------------------------------------
# Binary upload / download helpers
# ---------------------------------------------------------------------------

def _sync_put_bytes(key: str, data: bytes, content_type: str) -> bool:
    client = _build_client()
    if client is None:
        return False
    try:
        client.put_object(
            Bucket=_bucket(),
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        logger.debug("R2 put_bytes OK: %s (%d bytes)", key, len(data))
        return True
    except Exception as e:
        logger.warning("R2 put_bytes [%s]: %s", key, type(e).__name__)
        return False


def _sync_get_bytes(key: str) -> Optional[bytes]:
    client = _build_client()
    if client is None:
        return None
    try:
        response = client.get_object(Bucket=_bucket(), Key=key)
        return response["Body"].read()
    except Exception as e:
        logger.warning("R2 get_bytes [%s]: %s", key, type(e).__name__)
        return None


async def put_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> bool:
    if not is_configured():
        return False
    return await asyncio.to_thread(_sync_put_bytes, key, data, content_type)


async def get_bytes(key: str) -> Optional[bytes]:
    if not is_configured():
        return None
    return await asyncio.to_thread(_sync_get_bytes, key)
