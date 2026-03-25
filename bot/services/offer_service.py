import os
import logging

logger = logging.getLogger(__name__)

_paypal_link: str = os.environ.get("PAYPAL_ME_LINK", "").strip().rstrip("/")


def set_paypal_link(link: str) -> None:
    global _paypal_link
    _paypal_link = link.strip().rstrip("/")
    logger.info("PayPal link updated.")


def get_paypal_link() -> str:
    return _paypal_link


def build_payment_url(price: int) -> str:
    link = get_paypal_link()
    if not link:
        return ""
    return f"{link}/{price}"


def _extract_field(body: str, label: str) -> str:
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith(label.lower() + ":"):
            return stripped[len(label) + 1 :].strip()
    return ""


def generate_offer_text(
    title: str,
    product_type: str,
    body: str,
    price: int,
    currency: str = "USD",
    payment_url: str = "",
) -> str:
    positioning = _extract_field(body, "Core Positioning") or _extract_field(body, "Bundle Positioning")
    included = _extract_field(body, "What's Included") or _extract_field(body, "Included Assets")
    use_case = _extract_field(body, "Primary Use Case") or _extract_field(body, "Best Audience")
    delivery = _extract_field(body, "Delivery Format") or _extract_field(body, "Recommended Delivery")

    resolved_url = payment_url or build_payment_url(price)
    if resolved_url:
        payment_block = (
            f"<b>To purchase:</b>\n"
            f"{resolved_url}\n\n"
            "After payment, send <b>DONE</b> with your email or Telegram handle. "
            "Delivery is confirmed manually."
        )
    else:
        payment_block = (
            "Payment link not configured.\n"
            "Use /setpaypal to add your PayPal.Me link, or use /buy to view live offers."
        )

    parts = [f"<b>{title}</b>"]

    if positioning:
        parts.append(f"\n{positioning}")

    if included:
        parts.append(f"\n<b>What's included:</b>\n{included}")

    if use_case:
        parts.append(f"<b>Use case:</b> {use_case}")

    if delivery:
        parts.append(f"<b>Format:</b> {delivery}")

    parts.append(f"\n<b>Price:</b> ${price} {currency}")
    parts.append(payment_block)

    return "\n".join(parts)
