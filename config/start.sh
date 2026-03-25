#!/usr/bin/env bash
# Sentinel Fortune — Production Start
# Starts Telegram bot (background) + Express API server (foreground)
# Used as the deployment run command.

set -e

export PORT="${PORT:-8080}"

echo "[start] Sentinel Fortune production boot"
echo "[start] PORT=$PORT"
echo "[start] Working directory: $(pwd)"

# Telegram bot — background
echo "[start] Starting Telegram bot..."
python -m bot.main &
BOT_PID=$!
echo "[start] Bot PID: $BOT_PID"

# Express API server — foreground (keeps container alive)
echo "[start] Starting API server on 0.0.0.0:$PORT"
node artifacts/api-server/dist/index.cjs

# If node exits, kill the bot too
kill $BOT_PID 2>/dev/null || true
