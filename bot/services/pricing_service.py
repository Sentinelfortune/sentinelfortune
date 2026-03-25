_PRICE_RANGES: dict[str, tuple[int, int]] = {
    "Meditation": (9, 19),
    "Teaching": (19, 49),
    "Coaching Note": (19, 39),
    "Story": (5, 15),
    "Narrative Scene": (5, 15),
    "Ebook Blueprint": (19, 59),
    "Ebook": (19, 59),
    "Bundle": (29, 99),
    "Bundle Concept": (29, 99),
    "Strategic Asset": (19, 39),
    "Product Framing": (19, 39),
    "Rhapsody": (9, 19),
}

_JUSTIFICATIONS: dict[str, str] = {
    "Meditation": "Guided meditation assets carry high perceived value as wellness tools.",
    "Teaching": "Structured teaching packs are positioned as premium reference material.",
    "Coaching Note": "Focused coaching notes function as clarity session deliverables.",
    "Story": "Short narrative assets are priced as micro-creative products.",
    "Narrative Scene": "Cinematic scenes are compact creative assets.",
    "Ebook Blueprint": "Ebook blueprints are positioned as full digital guides.",
    "Ebook": "Ebook blueprints are positioned as full digital guides.",
    "Bundle": "Multi-format bundles carry a composite value across included assets.",
    "Bundle Concept": "Multi-format bundles carry a composite value across included assets.",
    "Strategic Asset": "Strategic briefs are positioned as advisory-tier assets.",
    "Product Framing": "Product framings are priced as strategic packaging assets.",
    "Rhapsody": "Reflective pieces are compact premium assets.",
}


def suggest_price(
    product_type: str,
    content_length: int = 0,
    bundle: bool = False,
) -> tuple[int, str]:
    if bundle or product_type in ("Bundle", "Bundle Concept"):
        low, high = _PRICE_RANGES["Bundle"]
        justification = _JUSTIFICATIONS["Bundle"]
    else:
        low, high = _PRICE_RANGES.get(product_type, (19, 39))
        justification = _JUSTIFICATIONS.get(product_type, f"{product_type} asset.")

    if content_length > 2000:
        price = high
        tier = "Full-length content."
    elif content_length > 800:
        price = round((low + high) / 2)
        tier = "Standard-length content."
    else:
        price = low
        tier = "Compact format."

    return price, f"{justification} {tier}"
