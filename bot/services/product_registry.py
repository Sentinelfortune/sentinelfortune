"""
Sentinel Fortune — Product Registry.

Defines the standard product model used by the build and delivery layers.
No custom logic per product — all products follow the same schema.

Schema:
  {
    "product_id":    str,        unique identifier
    "tier":          str,        Stripe tier this product is delivered for
    "label":         str,        human-readable name
    "version":       str,        current live version (e.g. "v1")
    "main_asset":    "pdf",      primary deliverable (always pdf)
    "tts_available": bool,       True when audio exists in R2
    "r2_paths": {
        "pdf":    str,           R2 key for PDF asset
        "audio":  str,           R2 key for audio file (mp3)
        "script": str,           R2 key for TTS script JSON
        "meta":   str,           R2 key for product manifest JSON
    },
    "filenames": {
        "pdf":   str,            filename to use when sending via Telegram
        "audio": str,            filename for audio delivery
    },
    "messages": {
        "welcome":      str,     MSG 1
        "pdf_caption":  str,     caption on the document send
        "tts_caption":  str,     caption on the audio send
        "cta":          str,     MSG 4
        "pdf_missing":  str,     fallback when PDF is not yet in R2
    }
  }

TIER_PRODUCT_MAP: maps a Stripe tier slug → product_id.
Only tiers that have an associated product appear here.
Tiers with no product (monthly, pro, oem, licensing) deliver channel access only.
"""

# ---------------------------------------------------------------------------
# Product definitions
# ---------------------------------------------------------------------------

PRODUCT_REGISTRY: dict[str, dict] = {

    "execution_v1": {
        "product_id":    "execution_v1",
        "tier":          "lite",
        "label":         "Execution System v1",
        "version":       "v1",
        "main_asset":    "pdf",
        "tts_available": False,   # set True after audio is built and uploaded
        "r2_paths": {
            "pdf":    "originus/products/execution_v1/execution_system_v1.pdf",
            "audio":  "originus/products/execution_v1/audio_v1.mp3",
            "script": "originus/products/execution_v1/audio_script.json",
            "meta":   "originus/products/execution_v1/meta.json",
        },
        "filenames": {
            "pdf":   "Execution_System_v1.pdf",
            "audio": "execution_system_v1.mp3",
        },
        "messages": {
            "welcome": (
                "<b>Welcome.</b>\n\n"
                "This is not content.\n"
                "This is structure.\n\n"
                "You are now inside the Sentinel Fortune operating framework.\n"
                "What follows is the Execution System — your first orientation layer."
            ),
            "pdf_caption": (
                "<b>Execution System v1</b>\n"
                "Read this first.\n"
                "It is short. It is structured. Execute what it says."
            ),
            "tts_caption": (
                "Audio orientation — Execution System v1.\n"
                "Listen before entering the Vault."
            ),
            "cta": (
                "<b>Structure delivered.</b>\n\n"
                "Your Teachings Vault access is active.\n"
                "Enter the vault. Read Unit 1. Execute before you open Unit 2.\n\n"
                "When you are ready to go deeper:\n"
                "<code>/buy starter</code> — full Teachings Vault (one-time)\n"
                "<code>/buy pro</code> — Vault + Sentinel Engine"
            ),
            "pdf_missing": (
                "<b>Execution System v1 — PDF</b>\n\n"
                "Your PDF guide is being prepared and will be delivered to this chat shortly.\n\n"
                "Proceed to the Teachings Vault using your access button below."
            ),
        },
    },

}


# ---------------------------------------------------------------------------
# Tier → product map
# Only tiers with an associated product are listed here.
# ---------------------------------------------------------------------------

TIER_PRODUCT_MAP: dict[str, str] = {
    "lite": "execution_v1",
}


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------

def get_product(product_id: str) -> dict | None:
    """Return the product definition or None."""
    return PRODUCT_REGISTRY.get(product_id)


def get_product_for_tier(tier: str) -> dict | None:
    """Return the product definition for a tier, or None if tier has no product."""
    pid = TIER_PRODUCT_MAP.get(tier)
    return PRODUCT_REGISTRY.get(pid) if pid else None
