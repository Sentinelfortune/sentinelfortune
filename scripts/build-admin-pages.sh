#!/usr/bin/env bash
# Rebuild the Owner Admin's Pages Function bundle into admin/_worker.js.
#
# WHY THIS EXISTS
# ---------------
# sentinel-fortune-shop-admin is a Direct Upload Pages project: there is no
# build step on Cloudflare's side, so whatever is in admin/ is exactly what
# gets served.
#
# `wrangler pages deploy admin` only picks up the repository-root functions/
# directory when the command happens to be run from the repository root —
# wrangler resolves it as path.join(process.cwd(), "functions"). Run from any
# other directory it finds nothing, says nothing, and uploads the static files
# alone. That silent failure is what left /api/* dead in a previous deploy.
#
# Committing a prebuilt admin/_worker.js removes the dependency on cwd
# entirely: wrangler prefers _worker.js in the deploy directory over the
# functions/ directory, so the deploy is deterministic from anywhere.
#
# Re-run this script whenever anything under functions/ changes, then commit
# the regenerated admin/_worker.js. tests/admin-worker-bundle.test.ts checks
# the committed bundle still behaves correctly.
#
# Usage (from anywhere):  ./scripts/build-admin-pages.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Building functions/ -> admin/_worker.js ..."

# NOTE: --outdir, not --outfile. The deprecated --outfile writes a multipart
# worker-upload bundle, not JavaScript; using it produces an admin/_worker.js
# that starts with a form-data boundary and fails to parse at the edge.
npx wrangler pages functions build \
  --outdir="$TMP_DIR" \
  --output-routes-path=admin/_routes.json \
  --build-output-directory=admin

# Wrangler has changed the emitted filename across versions: 4.114 writes
# index.js, 4.118 writes _worker.js. Take whatever single .js file it produced
# rather than hard-coding either name.
BUILT="$(find "$TMP_DIR" -maxdepth 1 -name '*.js' -type f | head -1)"

if [ -z "$BUILT" ]; then
  echo "ERROR: wrangler produced no .js bundle — refusing to write a broken artifact." >&2
  exit 1
fi

# Guard against a multipart bundle ever being copied in.
if head -c 2 "$BUILT" | grep -q -- "--"; then
  echo "ERROR: build output looks like a multipart bundle, not JavaScript." >&2
  exit 1
fi

cp "$BUILT" admin/_worker.js

echo "Wrote admin/_worker.js ($(wc -c < admin/_worker.js) bytes)"
echo "Wrote admin/_routes.json:"
cat admin/_routes.json
echo
echo "Now run the test suite, then deploy from the repository root:"
echo "  npx wrangler pages deploy admin --project-name sentinel-fortune-shop-admin --branch main"
