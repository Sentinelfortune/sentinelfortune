/* SFL EDITORIAL TRANSPORT — mint one credential.
 *
 *   node transport/scripts/mint-credential.mjs CLIENT_CHATGPT
 *   node transport/scripts/mint-credential.mjs CLIENT_CHATGPT --out ~/.sfl-editorial
 *
 * Produces a fresh random token and its SHA-256 digest.
 *
 *   • the TOKEN goes into the client (the ChatGPT connector's auth field, or
 *     the Claude integration's secret store)
 *   • the DIGEST goes into the Worker: wrangler secret put ..._SHA256
 *
 * TWO MODES, AND WHY
 * ------------------
 * Without `--out`, both values are printed to stdout. Convenient, but a
 * terminal can be scrolled back, screen-shared or logged by the shell.
 *
 * With `--out <dir>`, nothing secret is printed at all. The token and the
 * digest are written to two files with 0600 permissions, and only the PATHS
 * are printed. That is the mode `deploy-test-preview.sh` uses, so that a
 * digest can be piped straight into `wrangler secret put` without ever
 * appearing on screen or in shell history.
 *
 * `<dir>` must not be inside this repository — the script refuses if it is,
 * because the one place a credential must never land is the thing that gets
 * committed and pushed.
 *
 * A token cannot be recovered after the fact. Mint a new one instead, which is
 * the correct response to a lost credential anyway.
 *
 * Nothing here contacts the network.
 */

import { webcrypto } from "node:crypto";
import { writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const PRINCIPALS = {
  CLIENT_CHATGPT: "SFL_CORRIDOR_CHATGPT_TOKEN_SHA256",
  CLIENT_CLAUDE: "SFL_CORRIDOR_CLAUDE_TOKEN_SHA256",
  OWNER: "SFL_CORRIDOR_OWNER_TOKEN_SHA256",
};

const args = process.argv.slice(2);
const principal = (args[0] || "").toUpperCase();
const outIndex = args.indexOf("--out");
const outDirRaw = outIndex === -1 ? null : args[outIndex + 1];

if (!PRINCIPALS[principal]) {
  console.error(`usage: node transport/scripts/mint-credential.mjs <${Object.keys(PRINCIPALS).join("|")}> [--out <dir outside this repo>]`);
  process.exit(2);
}

/* 32 bytes of CSPRNG output, base64url. Long enough that guessing is not a
   threat model, short enough to paste into a connector field. */
const bytes = webcrypto.getRandomValues(new Uint8Array(32));
const token = `sfl_${Buffer.from(bytes).toString("base64url")}`;

const digestBuffer = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
const digest = [...new Uint8Array(digestBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

if (!outDirRaw) {
  console.log(`
principal : ${principal}

TOKEN  (give to the client — treat as a password, shown only once)
  ${token}

DIGEST (give to the Worker — safe to store in Worker secrets)
  ${digest}

Next:
  wrangler secret put ${PRINCIPALS[principal]} --config transport/wrangler.toml
  # paste the DIGEST above, not the token

Do NOT commit either value. Do NOT paste the TOKEN into a ticket, a chat, or a
file in this repository. To avoid printing secrets at all, re-run with
--out <dir outside this repo>.
`);
  process.exit(0);
}

/* ── file mode: nothing secret is printed ──────────────────────────────── */

const outDir = resolve(outDirRaw.replace(/^~(?=$|\/)/, homedir()));
const repoRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));

if (outDir === repoRoot || outDir.startsWith(`${repoRoot}/`)) {
  console.error(`refusing to write a credential inside the repository (${outDir}).`);
  console.error("choose a directory outside it, e.g. --out ~/.sfl-editorial");
  process.exit(2);
}

mkdirSync(outDir, { recursive: true, mode: 0o700 });
const tokenPath = `${outDir}/${principal}.token`;
const digestPath = `${outDir}/${principal}.digest`;
writeFileSync(tokenPath, `${token}\n`, { mode: 0o600 });
writeFileSync(digestPath, `${digest}\n`, { mode: 0o600 });

console.log(`${principal}: written`);
console.log(`  token  -> ${tokenPath}   (0600 — paste into the client, then delete)`);
console.log(`  digest -> ${digestPath}  (0600 — goes to wrangler secret put ${PRINCIPALS[principal]})`);
