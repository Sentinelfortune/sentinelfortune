import os
from dotenv import load_dotenv

load_dotenv()

TELEGRAM_BOT_TOKEN: str = os.environ["TELEGRAM_BOT_TOKEN"].strip().replace(" ", "")
OPENAI_API_KEY: str | None = os.environ.get("OPENAI_API_KEY")

# Cloudflare R2 — all optional; bot runs without them (in-memory fallback)
CF_ACCOUNT_ID: str = os.environ.get("CF_ACCOUNT_ID", "").strip()
CF_R2_ACCESS_KEY_ID: str = os.environ.get("CF_R2_ACCESS_KEY_ID", "").strip()
CF_R2_SECRET_ACCESS_KEY: str = os.environ.get("CF_R2_SECRET_ACCESS_KEY", "").strip()
CF_R2_BUCKET: str = os.environ.get("CF_R2_BUCKET", "originus-infinity-vault")
CF_R2_ENDPOINT: str = os.environ.get(
    "CF_R2_ENDPOINT",
    f"https://{CF_ACCOUNT_ID}.r2.cloudflarestorage.com" if CF_ACCOUNT_ID else "",
)

# Cloudflare Worker gateway — sfl-access-gateway
BASE_WORKER_URL: str = os.environ.get(
    "BASE_WORKER_URL",
    "https://sfl-access-gateway.sentinelfortunellc.workers.dev",
).strip()

# Intake route path within the worker (default: /intake)
# Override with BASE_WORKER_INTAKE_PATH if your worker uses a different path
BASE_WORKER_INTAKE_PATH: str = os.environ.get(
    "BASE_WORKER_INTAKE_PATH",
    "/intake",
).strip()
