/* SFL EDITORIAL TRANSPORT — build the two client integration packages.
 *
 *   node transport/scripts/make-connector.mjs https://sfl-editorial-api.<subdomain>.workers.dev
 *
 * Takes the deployed Worker's real hostname and writes, into
 * transport/contracts/generated/ :
 *
 *   openapi.chatgpt.json   upload this as a ChatGPT connector / custom action
 *   claude-tools.json      register this as the Claude tool definition
 *
 * IT CHANGES ONLY THE SERVER URL. Everything else — the schemas, the action
 * list, the scope model, the behaviour rules — is copied from the committed
 * contracts, so the thing the clients are given is the thing that was
 * reviewed.
 *
 * THREE REFUSALS, ASSERTED BEFORE ANYTHING IS WRITTEN
 * ---------------------------------------------------
 *   1. no Owner endpoint may appear in a client package
 *   2. no credential may be embedded in a client package
 *   3. no placeholder may survive into a client package
 *
 * Each is checked against the generated output rather than trusted, because a
 * package handed to a third-party client is the last place to discover that an
 * Owner route leaked into it.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACTS = resolve(HERE, "../contracts");
const OUT = resolve(CONTRACTS, "generated");

const base = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https:\/\/[a-z0-9.-]+$/i.test(base)) {
  console.error("usage: node transport/scripts/make-connector.mjs https://sfl-editorial-api.<subdomain>.workers.dev");
  console.error("(https is required — a connector credential must never travel over http)");
  process.exit(2);
}

/* ── ChatGPT: OpenAPI, server URL replaced ─────────────────────────────── */

const openapi = JSON.parse(readFileSync(resolve(CONTRACTS, "openapi.json"), "utf8"));
openapi.servers = [{ url: base, description: "SFL Editorial API (TEST_PREVIEW)" }];

/* ── Claude: tool config, endpoint URL replaced ────────────────────────── */

const claude = JSON.parse(readFileSync(resolve(CONTRACTS, "claude-tools.json"), "utf8"));
claude.endpoint.url = `${base}/v1/editorial`;

/* ── the three refusals ────────────────────────────────────────────────── */

const problems = [];

/* 1. No Owner route may be CALLABLE.
 *
 *    Checked structurally, in the positions a client actually dials: the
 *    OpenAPI `paths` keys and the Claude `endpoint.url`. Deliberately NOT a
 *    blanket text match — the Claude package's prose says "…requires an Owner
 *    approval recorded through /v1/owner/*, which Claude's credential cannot
 *    reach", and that sentence is the reason a refusal makes sense to the
 *    client. Describing a door is not the same as opening it. */
const ownerish = (p) => /\/v1\/owner/.test(p);

for (const path of Object.keys(openapi.paths)) {
  if (ownerish(path)) problems.push(`openapi.chatgpt.json: Owner route ${path} is a callable path`);
}
if (ownerish(claude.endpoint.url)) problems.push(`claude-tools.json: endpoint.url points at an Owner route`);
for (const granted of claude.scopeModel.grants) {
  if (["approve", "authorizeWithdrawal", "reject", "rollback"].includes(granted)) {
    problems.push(`claude-tools.json: ${granted} appears in scopeModel.grants`);
  }
}

for (const [name, pkg] of [["openapi.chatgpt.json", openapi], ["claude-tools.json", claude]]) {
  const text = JSON.stringify(pkg);

  for (const ownerAction of ["approve", "authorizeWithdrawal", "reject", "rollback"]) {
    /* Named as a callable operation or tool, not merely described in prose. */
    if (new RegExp(`"operationId"\\s*:\\s*"${ownerAction}"`).test(text)) problems.push(`${name}: ${ownerAction} is exposed as an operation`);
    if (new RegExp(`"name"\\s*:\\s*"${ownerAction}"`).test(text)) problems.push(`${name}: ${ownerAction} is exposed as a tool`);
  }

  /* 2. no credential. Anything token-shaped, digest-shaped or key-shaped. */
  if (/sfl_[A-Za-z0-9_-]{20,}/.test(text)) problems.push(`${name}: something token-shaped is embedded`);
  if (/\b[0-9a-f]{64}\b/.test(text)) problems.push(`${name}: something digest-shaped is embedded`);
  if (/(sk_live|sk_test|whsec_|Bearer\s+[A-Za-z0-9._-]{12,})/.test(text)) problems.push(`${name}: a credential literal is embedded`);

  /* 3. no placeholder. */
  if (/REPLACE_WITH/.test(text)) problems.push(`${name}: a REPLACE_WITH placeholder survived`);
}

if (problems.length) {
  console.error("refusing to write the client packages:\n");
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

/* ── write ─────────────────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "openapi.chatgpt.json"), `${JSON.stringify(openapi, null, 2)}\n`);
writeFileSync(resolve(OUT, "claude-tools.json"), `${JSON.stringify(claude, null, 2)}\n`);

const clientPaths = Object.keys(openapi.paths);

console.log(`
Client packages written for  ${base}

  ${resolve(OUT, "openapi.chatgpt.json")}
  ${resolve(OUT, "claude-tools.json")}

Verified before writing:
  • no Owner route in either package
  • no credential, digest or token embedded in either package
  • no placeholder left in either package
  • the ChatGPT package exposes only: ${clientPaths.join(", ")}

NEXT — ChatGPT
  1. ChatGPT → Settings → Connectors (or a GPT's Actions) → import the schema
     from openapi.chatgpt.json
  2. Authentication: API key, header "Authorization", value "Bearer <token>",
     using the CLIENT_CHATGPT token from your credential directory
  3. Send one PREPARE and confirm it comes back state DRAFT, isLive false

NEXT — Claude
  1. Register claude-tools.json as the tool definition
  2. Authentication: the CLIENT_CLAUDE token as the bearer credential
  3. Send one PREPARE and confirm state DRAFT, isLive false

Then delete the .token files. The digests are not credentials; the tokens are.

Publication stays refused at the edge while the deployment is TEST_PREVIEW,
whatever either client asks for.
`);
