#!/usr/bin/env bash
# Sentinel Fortune — Production Build
# Compiles TypeScript API server to dist/index.cjs

set -e
echo "[build] Installing dependencies..."
pnpm install --frozen-lockfile

echo "[build] Compiling API server..."
pnpm --filter @workspace/api-server run build

echo "[build] Done. Output: artifacts/api-server/dist/index.cjs"
ls -lh artifacts/api-server/dist/index.cjs
