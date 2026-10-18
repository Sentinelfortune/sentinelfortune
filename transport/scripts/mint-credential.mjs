/* SFL EDITORIAL TRANSPORT — mint one credential.
 *
 *   node transport/scripts/mint-credential.mjs CLIENT_CHATGPT
 *
 * Prints a fresh random token and its SHA-256 digest.
 *
 *   • the TOKEN goes into the client (the ChatGPT connector's auth field, or
 *     the Claude integration's secret store)
 *   • the DIGEST goes into the Worker: wrangler secret put ..._SHA256
 *
 * The token is printed ONCE, to stdout, and is never written to a file. It
 * cannot be recovered afterwards — mint a new one instead, which is the
 * correct response to a lost credential anyway.
 *
 * Nothing in this script contacts the network and nothing is stored on disk.
 */

import { webcrypto } from "node:crypto";

const PRINCIPALS = { CLIENT_CHATGPT: "SFL_CORRIDOR_CHATGPT_TOKEN_SHA256", CLIENT_CLAUDE: "SFL_CORRIDOR_CLAUDE_TOKEN_SHA256", OWNER: "SFL_CORRIDOR_OWNER_TOKEN_SHA256" };

const principal = (process.argv[2] || "").toUpperCase();
if (!PRINCIPALS[principal]) {
  console.error(`usage: node transport/scripts/mint-credential.mjs <${Object.keys(PRINCIPALS).join("|")}>`);
  process.exit(2);
}

/* 32 bytes of CSPRNG output, base64url. Long enough that guessing is not a
   threat model, short enough to paste into a connector field. */
const bytes = webcrypto.getRandomValues(new Uint8Array(32));
const token = `sfl_${Buffer.from(bytes).toString("base64url")}`;

const digestBuffer = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
const digest = [...new Uint8Array(digestBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

console.log(`
principal : ${principal}

TOKEN  (give to the client — treat as a password, shown only once)
  ${token}

DIGEST (give to the Worker — safe to store in Worker secrets)
  ${digest}

Next:
  wrangler secret put ${PRINCIPALS[principal]} --config transport/wrangler.toml
  # paste the DIGEST above, not the token

Do NOT commit either value. Do NOT paste the TOKEN into a terminal that logs,
a ticket, a chat, or a file in this repository.
`);
