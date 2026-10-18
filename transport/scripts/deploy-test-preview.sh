#!/usr/bin/env bash
#
# SFL EDITORIAL TRANSPORT — Phase 2 activation, TEST_PREVIEW only.
#
# ONE command for the whole Owner-side deployment:
#
#   bash transport/scripts/deploy-test-preview.sh
#
# It will:
#   1. check wrangler is present and you are logged in
#   2. create (or reuse) the KV namespace and write its id into wrangler.toml
#   3. mint three independent credentials into a 0600 directory OUTSIDE this repo
#   4. pipe each DIGEST into `wrangler secret put` over stdin
#   5. deploy the Worker in TEST_PREVIEW mode
#   6. print the public hostname and the exact next command
#
# SECRET HYGIENE — what this script deliberately does NOT do
# ----------------------------------------------------------
#   • it never echoes a token or a digest
#   • it never passes one as a command-line argument, because arguments are
#     visible to `ps` for the lifetime of the process; digests go in over stdin
#   • it never writes one inside this repository; mint-credential.mjs refuses
#     an --out directory under the repo root
#   • `set +x` is asserted, so a caller running with tracing on cannot leak
#     the values through the trace
#
# The three TOKEN files are left on disk, 0600, for you to paste into ChatGPT
# and Claude. Delete them once pasted — step 6 reminds you.
#
# WHAT THIS SCRIPT WILL NOT DO
# ----------------------------
#   • it will not set SFL_CORRIDOR_MODE=LIVE
#   • it will not deploy --env production
#   • it will not touch DNS, a custom hostname, Stripe, R2, the Shop, House of
#     Assets or any of the seven canonical subdomains
# It deploys one isolated Worker on its workers.dev hostname. Nothing else.

set -euo pipefail
set +x                      # never trace: this script handles digests

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRANSPORT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$TRANSPORT_DIR/wrangler.toml"

CRED_DIR="${SFL_CRED_DIR:-$HOME/.sfl-editorial}"
KV_BINDING="EDITORIAL_KV"
KV_TITLE="${SFL_KV_TITLE:-sfl-editorial}"
WRANGLER="${WRANGLER:-wrangler}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
say "1/6  Preconditions"

command -v "$WRANGLER" >/dev/null 2>&1 || die "wrangler not found. Install it: npm i -g wrangler  (or set WRANGLER=./node_modules/.bin/wrangler)"
command -v node >/dev/null 2>&1 || die "node not found. Node 22 or newer is required."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || die "Node $NODE_MAJOR found; 22 or newer is required (the corridor's .js modules rely on module-syntax detection)."

# `wrangler whoami` EXITS 0 WHEN NOT LOGGED IN — it reports the problem on
# stdout and returns success. Trusting its exit code lets this script march on
# and fail later, somewhere more confusing. So inspect what it actually said.
WHOAMI="$("$WRANGLER" whoami 2>&1 || true)"
if printf '%s' "$WHOAMI" | grep -qiE 'not authenticated'; then
  die "wrangler is not logged in. Run: wrangler login   (then re-run this script)"
fi
printf '%s' "$WHOAMI" | grep -qiE 'account id|associated with the email|account name' \
  || die "could not confirm a Cloudflare account from \`wrangler whoami\`. Run: wrangler login"

echo "  wrangler $("$WRANGLER" --version 2>/dev/null | tail -1), node $NODE_MAJOR, authenticated."

# The bundle must build before anything is created in the account.
say "2/6  Building the Worker (offline dry run) before touching the account"
"$WRANGLER" deploy --dry-run --env="" --outdir "$(mktemp -d)" --config "$CONFIG" >/dev/null \
  || die "the Worker does not build. Nothing was created. Fix the build first."
echo "  builds cleanly."

# ─────────────────────────────────────────────────────────────────────────────
say "3/6  KV namespace (the corridor's snapshot seam)"

if grep -q 'REPLACE_WITH_REAL_KV_NAMESPACE_ID' "$CONFIG"; then
  KV_ID="${SFL_KV_ID:-}"

  if [ -z "$KV_ID" ]; then
    echo "  looking for an existing namespace titled like '$KV_TITLE'..."
    KV_ID="$("$WRANGLER" kv namespace list 2>/dev/null \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s.slice(s.indexOf("[")));const m=j.find(n=>(n.title||"").includes(process.argv[1]));process.stdout.write(m?m.id:"")}catch{process.stdout.write("")}})' "$KV_TITLE" || true)"
  fi

  if [ -z "$KV_ID" ]; then
    echo "  creating it..."
    CREATE_OUT="$("$WRANGLER" kv namespace create "$KV_BINDING" --config "$CONFIG" 2>&1 || true)"
    KV_ID="$(printf '%s' "$CREATE_OUT" | grep -oE 'id *= *"[0-9a-f]{32}"' | head -1 | grep -oE '[0-9a-f]{32}' || true)"
    [ -n "$KV_ID" ] || { printf '%s\n' "$CREATE_OUT"; die "could not determine the new KV namespace id. Create it manually, then re-run with SFL_KV_ID=<id>."; }
  fi

  # Replace the placeholder in BOTH the top-level and the production block.
  node -e '
    const fs = require("fs");
    const [, file, id] = process.argv;
    const before = fs.readFileSync(file, "utf8");
    const after = before.replaceAll("REPLACE_WITH_REAL_KV_NAMESPACE_ID", id);
    if (after === before) { console.error("placeholder not found"); process.exit(1); }
    fs.writeFileSync(file, after);
  ' "$CONFIG" "$KV_ID"
  echo "  namespace id written into wrangler.toml (this is a config change to commit)."
else
  echo "  wrangler.toml already carries a namespace id — leaving it alone."
fi

# ─────────────────────────────────────────────────────────────────────────────
say "4/6  Three independent credentials"

mkdir -p "$CRED_DIR"
chmod 700 "$CRED_DIR"

for PRINCIPAL in CLIENT_CHATGPT CLIENT_CLAUDE OWNER; do
  if [ -f "$CRED_DIR/$PRINCIPAL.digest" ]; then
    echo "  $PRINCIPAL: reusing the digest already in $CRED_DIR"
  else
    node "$SCRIPT_DIR/mint-credential.mjs" "$PRINCIPAL" --out "$CRED_DIR" >/dev/null \
      || die "could not mint $PRINCIPAL"
    echo "  $PRINCIPAL: minted (token and digest written 0600, nothing printed)"
  fi
done

say "5/6  Storing the three DIGESTS in Cloudflare secret storage"
echo "  (values go in over stdin — never as an argument, never echoed)"

put_secret() {                       # $1 = secret name, $2 = file holding it
  # shellcheck disable=SC2002
  cat "$2" | "$WRANGLER" secret put "$1" --config "$CONFIG" >/dev/null 2>&1 \
    || die "failed to set $1"
  echo "  $1: set"
}

put_secret SFL_CORRIDOR_CHATGPT_TOKEN_SHA256 "$CRED_DIR/CLIENT_CHATGPT.digest"
put_secret SFL_CORRIDOR_CLAUDE_TOKEN_SHA256  "$CRED_DIR/CLIENT_CLAUDE.digest"
put_secret SFL_CORRIDOR_OWNER_TOKEN_SHA256   "$CRED_DIR/OWNER.digest"

# ─────────────────────────────────────────────────────────────────────────────
say "6/6  Deploying in TEST_PREVIEW mode"

# --env="" targets the top-level environment explicitly, so this can never be
# mistaken for the production environment.
DEPLOY_OUT="$("$WRANGLER" deploy --env="" --config "$CONFIG" 2>&1)"
printf '%s\n' "$DEPLOY_OUT" | grep -vE 'SHA256|digest' || true

BASE_URL="$(printf '%s' "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1 || true)"
[ -n "$BASE_URL" ] || die "deployed, but could not read the hostname from the output. Find it with: wrangler deployments list --config $CONFIG"

say "DEPLOYED — TEST_PREVIEW"
echo "  $BASE_URL"
echo
echo "Confirm it is up and in the right mode:"
echo "  curl -s $BASE_URL/v1/health"
echo "  # expect: \"mode\":\"TEST_PREVIEW\", \"publicationEnabled\":false"
echo
echo "Then run the full remote validation (reads the tokens from $CRED_DIR):"
echo "  SFL_API_BASE=$BASE_URL SFL_CRED_DIR=$CRED_DIR \\"
echo "    node transport/scripts/validate-remote.mjs"
echo
echo "Then build the connector packages with the real URL:"
echo "  node transport/scripts/make-connector.mjs $BASE_URL"
echo
echo "Commit the one configuration change this made:"
echo "  git add transport/wrangler.toml"
echo "  git commit -m 'chore(transport): record the SFL_EDITORIAL KV namespace id'"
echo "  git push -u origin feature/sfl-editorial-transport"
echo
echo "FINALLY, once the tokens are pasted into ChatGPT and Claude:"
echo "  rm -f $CRED_DIR/*.token"
echo "  # the digests can stay; they are not credentials. The tokens are."
echo
echo "Publication stays OFF. This deployment refuses publish_approved at the"
echo "edge, and the corridor's Owner-approval gate is unchanged underneath it."
