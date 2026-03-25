import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_product_store: dict[int, dict] = {}
_bundle_store: dict[int, dict] = {}


def _entry(product_type: str, title: str, body: str) -> dict:
    return {
        "product_type": product_type,
        "title": title,
        "body": body,
        "price": None,
        "currency": "EUR",
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    }


def save_product(user_id: int, product_type: str, title: str, body: str) -> None:
    _product_store[user_id] = _entry(product_type, title, body)
    logger.info("Product saved for user %d: %r [%s]", user_id, title[:60], product_type)


def get_product(user_id: int) -> Optional[dict]:
    return _product_store.get(user_id)


def delete_product(user_id: int) -> None:
    _product_store.pop(user_id, None)


def update_product_price(user_id: int, price: int, currency: str = "EUR") -> bool:
    entry = _product_store.get(user_id)
    if entry is None:
        return False
    entry["price"] = price
    entry["currency"] = currency
    logger.info("Product price set for user %d: %s %d", user_id, currency, price)
    return True


def save_bundle(user_id: int, product_type: str, title: str, body: str) -> None:
    _bundle_store[user_id] = _entry(product_type, title, body)
    logger.info("Bundle saved for user %d: %r [%s]", user_id, title[:60], product_type)


def get_bundle(user_id: int) -> Optional[dict]:
    return _bundle_store.get(user_id)


def delete_bundle(user_id: int) -> None:
    _bundle_store.pop(user_id, None)


def update_bundle_price(user_id: int, price: int, currency: str = "EUR") -> bool:
    entry = _bundle_store.get(user_id)
    if entry is None:
        return False
    entry["price"] = price
    entry["currency"] = currency
    logger.info("Bundle price set for user %d: %s %d", user_id, currency, price)
    return True
