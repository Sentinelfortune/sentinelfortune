/* SFL EDITORIAL TRANSPORT — Phase 2 remote validation.
 *
 * Runs every check Phase 2 requires against the REAL deployed Worker, over the
 * public Internet, and writes a machine-readable report.
 *
 *   SFL_API_BASE=https://sfl-editorial-api.<subdomain>.workers.dev \
 *   SFL_CRED_DIR=~/.sfl-editorial \
 *     node transport/scripts/validate-remote.mjs
 *
 * Tokens are read from files in SFL_CRED_DIR (0600, written by
 * mint-credential.mjs --out) or, failing that, from the environment:
 *   SFL_CHATGPT_TOKEN  SFL_CLAUDE_TOKEN  SFL_OWNER_TOKEN
 *
 * NO TOKEN IS EVER PRINTED, and no token is written into the report. The
 * report records what happened, not what was presented.
 *
 * ── THE REVOCATION CHECK NEEDS TWO PASSES ──────────────────────────────────
 * Revocation is a deployment variable, so it cannot be exercised in the same
 * pass as the working credentials. Pass 1 reports it NOT_TESTED. To test it:
 *
 *   1. set  SFL_CORRIDOR_REVOKED = "CLIENT_CHATGPT"  in transport/wrangler.toml
 *   2. wrangler deploy --env="" --config transport/wrangler.toml
 *   3. node transport/scripts/validate-remote.mjs --revoked CLIENT_CHATGPT
 *   4. set it back to "" and deploy again
 *
 * The script says this at the end rather than quietly skipping it.
 *
 * ── WHAT THIS LEAVES BEHIND ────────────────────────────────────────────────
 * Its test records are slugged `sfl-validation-<runId>` so they are obvious,
 * and the run ARCHIVES each one it created before finishing. Nothing it makes
 * is ever published — a dedicated check asserts the public feed is empty.
 */

import { readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

/* ── configuration ─────────────────────────────────────────────────────── */

const BASE = (process.env.SFL_API_BASE || "").replace(/\/+$/, "");
if (!BASE) {
  console.error("SFL_API_BASE is required, e.g. https://sfl-editorial-api.<subdomain>.workers.dev");
  process.exit(2);
}
/**
 * A credentialed API is https. The ONE exception is a loopback address, which
 * exists so this script can be rehearsed against `runtime/node.mjs` before it
 * is pointed at the real Worker — a validation script nobody has run is not
 * evidence of anything.
 *
 * A loopback run is labelled LOCAL_LOOPBACK in the report and in the banner,
 * and is NOT public-Internet validation. Only a PUBLIC_INTERNET run can
 * support a REMOTE_TRANSPORT_VERIFIED claim.
 */
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(BASE);
const TRANSPORT_KIND = LOOPBACK ? "LOCAL_LOOPBACK" : "PUBLIC_INTERNET";
if (!BASE.startsWith("https://") && !LOOPBACK) {
  console.error("SFL_API_BASE must be https — this is a credentialed API.");
  console.error("(http is accepted only for 127.0.0.1 / localhost, to rehearse this script.)");
  process.exit(2);
}

const revokedArg = process.argv.indexOf("--revoked");
const EXPECT_REVOKED = revokedArg === -1 ? null : (process.argv[revokedArg + 1] || "").toUpperCase();

const credDir = (process.env.SFL_CRED_DIR || `${homedir()}/.sfl-editorial`).replace(/^~(?=$|\/)/, homedir());

function tokenFor(principal, envVar) {
  if (process.env[envVar]) return process.env[envVar].trim();
  try {
    return readFileSync(resolve(credDir, `${principal}.token`), "utf8").trim();
  } catch {
    return null;
  }
}

const CHATGPT = tokenFor("CLIENT_CHATGPT", "SFL_CHATGPT_TOKEN");
const CLAUDE = tokenFor("CLIENT_CLAUDE", "SFL_CLAUDE_TOKEN");
const OWNER = tokenFor("OWNER", "SFL_OWNER_TOKEN");

for (const [name, value] of [["CLIENT_CHATGPT", CHATGPT], ["CLIENT_CLAUDE", CLAUDE], ["OWNER", OWNER]]) {
  if (!value) {
    console.error(`no token for ${name}. Looked in ${credDir}/${name}.token and the environment.`);
    process.exit(2);
  }
}

const runId = `${Date.now().toString(36)}`;
const results = [];
let failures = 0;
let step = 0;

function check(id, label, condition, detail = "") {
  const ok = condition === true;
  if (!ok) failures++;
  results.push({ id, label, outcome: ok ? "PASS" : "FAIL", detail: String(detail).slice(0, 400) });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

function note(id, label, outcome, detail) {
  results.push({ id, label, outcome, detail });
  console.log(`  ${outcome}  ${label}${detail ? `  — ${detail}` : ""}`);
}

function heading(text) {
  step++;
  console.log(`\n${"─".repeat(78)}\n${step}. ${text}\n${"─".repeat(78)}`);
}

/** One real HTTPS request to the deployed Worker. */
async function call(path, { token, body, method = body === undefined ? "GET" : "POST", headers = {} } = {}) {
  const started = Date.now();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    return { status: 0, body: null, ms: Date.now() - started, networkError: String(err && err.message) };
  }
  let json = null;
  try { json = await res.json(); } catch { /* a non-JSON body is itself a finding */ }
  return { status: res.status, headers: res.headers, body: json, ms: Date.now() - started };
}

const code = (r) => (r.body && r.body.error && r.body.error.code) || null;
const message = (r) => (r.body && r.body.error && r.body.error.message) || "";

/* ── the two provider-shaped payloads ──────────────────────────────────── */

const CG_SLUG = `sfl-validation-chatgpt-${runId}`;
const CL_SLUG = `sfl-validation-claude-${runId}`;

const CG_PREPARE = {
  operation: "PREPARE",
  instruction_id: `sfl-validation-cg-prepare-${runId}`,
  branch: "VIBRAFLOW_MEDIA",
  content_type: "TEACHING",
  title: `Remote validation teaching (${runId})`,
  slug: CG_SLUG,
  summary: "A TEST_PREVIEW record created by Phase 2 remote validation.",
  body: "This record exists only to prove that an authenticated ChatGPT-shaped request crossed the public Internet, reached the deployed Worker, and was accepted by the corridor as a draft. It is archived at the end of the run.",
  language: "en",
  translations: {
    fr: {
      title: `Enseignement de validation (${runId})`,
      summary: "Un enregistrement TEST_PREVIEW créé par la validation Phase 2.",
      body: "Cet enregistrement existe uniquement pour prouver qu'une requête authentifiée a traversé l'Internet public et atteint le Worker déployé.",
    },
  },
  cta: { type: "SUPPORT_THE_WORK", destination: "https://sentinelfortune.com/support" },
};

const CL_PREPARE = {
  intent: "PREPARE",
  instructionId: `sfl-validation-cl-prepare-${runId}`,
  editorial: {
    branch: "LUMEN_SCHOOL_ACADEMY",
    contentType: "LESSON",
    title: `Remote validation lesson (${runId})`,
    slug: CL_SLUG,
    summary: "A TEST_PREVIEW record created by Phase 2 remote validation.",
    body: "This record exists only to prove that an authenticated Claude-shaped request crossed the public Internet, reached the deployed Worker, and was accepted by the corridor as a draft. It is archived at the end of the run.",
    language: "en",
    cta: { type: "READ_MORE", destination: "/learn/remote-validation" },
  },
};

console.log(`SFL Editorial API — Phase 2 remote validation`);
console.log(`target : ${BASE}`);
console.log(`network: ${TRANSPORT_KIND}`);
console.log(`run id : ${runId}`);
console.log(`creds  : ${credDir} (values never printed)`);
if (LOOPBACK) {
  console.log(`
  ****************************************************************************
  LOCAL_LOOPBACK — this is a REHEARSAL against a process on this machine.
  It verifies that this validation script is correct. It is NOT
  public-Internet validation and cannot support REMOTE_TRANSPORT_VERIFIED.
  ****************************************************************************`);
}

/* ══ 1. reachability, unauthenticated ═══════════════════════════════════ */

heading("PUBLIC REACHABILITY  ·  unauthenticated");

const health = await call("/v1/health");
check("health.reachable", "GET /v1/health answered over the public Internet",
  health.status === 200, health.networkError || `${health.status} in ${health.ms}ms`);
if (health.status !== 200) {
  console.error(`\nThe deployed Worker did not answer. Nothing further can be validated.`);
  console.error(health.networkError || JSON.stringify(health.body));
  finish();
}
check("health.mode", 'it reports mode "TEST_PREVIEW"', health.body.mode === "TEST_PREVIEW", `mode=${health.body.mode}`);
check("health.publication", "it reports publicationEnabled: false", health.body.publicationEnabled === false);
check("health.configured", "it reports credentials configured", health.body.configured === true);
check("health.noPrincipals", "it does not disclose which principals exist", !("principals" in health.body));
check("health.nostore", "responses are marked no-store", health.headers.get("cache-control") === "no-store");
/* TLS is mandatory for a real deployment and meaningless on loopback. A
   rehearsal records it as not applicable rather than as a failure — the
   status logic blocks REMOTE_TRANSPORT_VERIFIED on loopback regardless, so
   nothing is weakened by not counting it twice. */
if (TRANSPORT_KIND === "PUBLIC_INTERNET") {
  check("health.tls", "it was reached over https", BASE.startsWith("https://"));
} else {
  note("health.tls", "https not applicable on a loopback rehearsal", "NOT_APPLICABLE", BASE);
}

const contract = await call("/v1/contract");
check("contract.reachable", "GET /v1/contract answered", contract.status === 200, `${contract.status}`);
check("contract.actions", "it lists the eight corridor actions", Array.isArray(contract.body.actions) && contract.body.actions.length === 8, (contract.body.actions || []).join(", "));
check("contract.default", "it states the default intent is PREPARE", contract.body.defaults && contract.body.defaults.intent === "PREPARE");
check("contract.testpreview", "it states TEST_PREVIEW refuses publication at the edge",
  (contract.body.rules || []).some((r) => /TEST_PREVIEW/.test(r)));
check("contract.noOwnerLeak", "it does not expose an Owner action to a client",
  !(contract.body.actions || []).some((a) => ["approve", "reject", "rollback", "authorizeWithdrawal"].includes(a)));

/* ══ 2. unauthorized ════════════════════════════════════════════════════ */

heading("UNAUTHORIZED  ·  rejected over the real network");

const noCred = await call("/v1/editorial", { body: CG_PREPARE });
check("auth.none", "no credential is 401", noCred.status === 401, code(noCred));
check("auth.none.generic", "the message is generic before authentication", message(noCred) === "Request refused.");
check("auth.none.challenge", "a WWW-Authenticate challenge is returned",
  noCred.headers.get("www-authenticate") === 'Bearer realm="sfl-editorial"');

const wrongCred = await call("/v1/editorial", { token: "sfl_definitely_not_a_valid_token", body: CG_PREPARE });
check("auth.wrong", "a wrong credential is 401", wrongCred.status === 401, code(wrongCred));
check("auth.wrong.generic", "the message is still generic", message(wrongCred) === "Request refused.");

/* ══ 3. revocation ══════════════════════════════════════════════════════ */

heading("REVOCATION");

if (EXPECT_REVOKED) {
  const token = EXPECT_REVOKED === "CLIENT_CHATGPT" ? CHATGPT : EXPECT_REVOKED === "CLIENT_CLAUDE" ? CLAUDE : OWNER;
  const other = EXPECT_REVOKED === "CLIENT_CHATGPT" ? CLAUDE : CHATGPT;
  const revoked = await call("/v1/editorial", { token, body: { ...CG_PREPARE, instruction_id: `rev-${runId}` } });
  check("revoked.rejected", `${EXPECT_REVOKED} is rejected`, revoked.status === 403 && code(revoked) === "REVOKED_CREDENTIAL", `${revoked.status} ${code(revoked)}`);

  const stillWorks = await call("/v1/editorial", { token: other, body: { intent: "LIST", instructionId: `rev-list-${runId}` } });
  check("revoked.isolated", "revoking one principal does not affect another", stillWorks.status === 200, `${stillWorks.status}`);
  note("revoked.reminder", "REMEMBER to set SFL_CORRIDOR_REVOKED back to \"\" and redeploy", "ACTION_REQUIRED", "");
} else {
  note("revoked.notTested", "revocation NOT tested in this pass", "NOT_TESTED",
    'run again with --revoked CLIENT_CHATGPT after setting SFL_CORRIDOR_REVOKED="CLIENT_CHATGPT" and redeploying');
}

/* A --revoked pass stops here, deliberately.
 *
 * Its whole purpose is to prove that the named principal is refused and that
 * the others are unaffected. Running the rest of the suite with one credential
 * revoked would report failures that are the correct behaviour, which is worse
 * than not running them. The safety assertion still runs, because "nothing
 * became public" must hold on every pass. */
if (EXPECT_REVOKED) {
  heading("SAFETY ASSERTION  ·  nothing became public during the revoked pass");
  const revokedFeed = await call("/v1/owner/feed", { token: OWNER });
  check("revoked.feedEmpty", "THE PUBLIC FEED CONTAINS ZERO RECORDS",
    revokedFeed.status === 200 && revokedFeed.body.feed.records.length === 0,
    revokedFeed.status === 200 ? `${revokedFeed.body.feed.records.length} record(s)` : `feed ${revokedFeed.status}`);
  check("revoked.evidence", 'the feed is marked evidence "TEST_PREVIEW"',
    revokedFeed.status === 200 && revokedFeed.body.feed.evidence === "TEST_PREVIEW");
  note("revoked.scope", "this pass verifies revocation only — run without --revoked for the full suite", "NOT_APPLICABLE", "");
  finish();
}

/* ══ 4. ChatGPT: PREPARE → DRAFT, PREVIEW → not live ════════════════════ */

heading("CHATGPT CREDENTIAL  ·  PREPARE → DRAFT, PREVIEW → not live");

const cgDraft = await call("/v1/editorial", { token: CHATGPT, body: CG_PREPARE });
check("chatgpt.prepare", "an authenticated ChatGPT-shaped PREPARE is 200", cgDraft.status === 200, code(cgDraft) || message(cgDraft));
check("chatgpt.client", "the Worker attributes it to CLIENT_CHATGPT", cgDraft.body?.client === "CLIENT_CHATGPT");
check("chatgpt.action", "the corridor resolved create_draft", cgDraft.body?.action === "create_draft");
check("chatgpt.draft", "the state is DRAFT", cgDraft.body?.state === "DRAFT");
check("chatgpt.notlive", "the response states isLive: false", cgDraft.body?.isLive === false);
check("chatgpt.identity", "it is routed to VibraFlow Media", cgDraft.body?.record?.identity === "vibraflowmedia");

const cgId = cgDraft.body?.record?.id || null;
if (cgId) console.log(`        record ${cgId} · v${cgDraft.body.record.version}`);

const cgPreview = cgId
  ? await call("/v1/editorial", {
    token: CHATGPT, body: { operation: "PREVIEW", instruction_id: `sfl-validation-cg-preview-${runId}`, record_id: cgId },
  })
  : { status: 0, body: null };
check("chatgpt.preview", "a ChatGPT-shaped PREVIEW is 200", cgPreview.status === 200, code(cgPreview) || message(cgPreview));
check("chatgpt.preview.flag", "it says preview: true", cgPreview.body?.preview?.preview === true);
check("chatgpt.preview.notlive", "it says isLive: false, twice",
  cgPreview.body?.preview?.isLive === false && cgPreview.body?.isLive === false);
check("chatgpt.preview.langs", "it renders EN and FR",
  (cgPreview.body?.preview?.languages || []).includes("en") && (cgPreview.body?.preview?.languages || []).includes("fr"));

/* ══ 5. Claude: PREPARE → DRAFT, PREVIEW → not live ═════════════════════ */

heading("CLAUDE CREDENTIAL  ·  PREPARE → DRAFT, PREVIEW → not live");

const clDraft = await call("/v1/editorial", { token: CLAUDE, body: CL_PREPARE });
check("claude.prepare", "an authenticated Claude-shaped PREPARE is 200", clDraft.status === 200, code(clDraft) || message(clDraft));
check("claude.client", "the Worker attributes it to CLIENT_CLAUDE", clDraft.body?.client === "CLIENT_CLAUDE");
check("claude.draft", "the state is DRAFT and not live", clDraft.body?.state === "DRAFT" && clDraft.body?.isLive === false);
check("claude.identity", "it is routed to Lumen School Academy", clDraft.body?.record?.identity === "lumenschoolacademy");
check("claude.samepipeline", "both clients reached the same pipeline step",
  Boolean(clDraft.body) && Boolean(cgDraft.body) && clDraft.body.step === cgDraft.body.step, clDraft.body?.step);

const clId = clDraft.body?.record?.id || null;
if (clId) console.log(`        record ${clId} · v${clDraft.body.record.version}`);

const clPreview = clId
  ? await call("/v1/editorial", {
    token: CLAUDE, body: { intent: "PREVIEW", instructionId: `sfl-validation-cl-preview-${runId}`, recordId: clId },
  })
  : { status: 0, body: null };
check("claude.preview", "a Claude-shaped PREVIEW is 200", clPreview.status === 200, code(clPreview) || message(clPreview));
check("claude.preview.flag", "it says preview: true and isLive: false",
  clPreview.body?.preview?.preview === true && clPreview.body?.preview?.isLive === false);

/* ══ 6. the boundary ════════════════════════════════════════════════════ */

heading("BOUNDARY  ·  clients cannot reach Owner routes, and vice versa");

for (const path of ["/v1/owner/approve", "/v1/owner/withdrawal", "/v1/owner/reject", "/v1/owner/rollback"]) {
  const res = await call(path, { token: CLAUDE, body: { recordId: clId, action: "unpublish", toVersion: 1 } });
  check(`boundary${path}`, `an AI client cannot POST ${path}`, res.status === 403 && code(res) === "OWNER_ROUTE", `${res.status} ${code(res)}`);
}
const ownerAsClient = await call("/v1/editorial", { token: OWNER, body: { ...CG_PREPARE, instruction_id: `owner-as-client-${runId}` } });
check("boundary.ownerAsClient", "the Owner credential cannot run client commands",
  ownerAsClient.status === 403 && code(ownerAsClient) === "CLIENT_ROUTE", `${ownerAsClient.status} ${code(ownerAsClient)}`);

/* ══ 7. idempotency ════════════════════════════════════════════════════ */

heading("IDEMPOTENCY  ·  a duplicate instruction id creates no duplicate");

const cgReplay = await call("/v1/editorial", { token: CHATGPT, body: CG_PREPARE });
check("replay.ok", "re-sending the identical request is 200", cgReplay.status === 200, `${cgReplay.status}`);
check("replay.flagged", "it is marked replay: true", cgReplay.body && cgReplay.body.replay === true);
check("replay.sameRecord", "it returns the original record", cgReplay.body && cgReplay.body.record.id === cgId);
check("replay.noVersionBump", "no version was bumped", cgReplay.body && cgReplay.body.record.version === 1);

const keyMismatch = await call("/v1/editorial", {
  token: CHATGPT, body: CG_PREPARE, headers: { "Idempotency-Key": `deliberately-different-${runId}` },
});
check("replay.keyMismatch", "an Idempotency-Key disagreeing with the body is 400",
  keyMismatch.status === 400 && code(keyMismatch) === "IDEMPOTENCY_KEY_MISMATCH", `${keyMismatch.status} ${code(keyMismatch)}`);

const noId = { ...CG_PREPARE };
delete noId.instruction_id;
const missingId = await call("/v1/editorial", { token: CHATGPT, body: noId });
check("replay.required", "a command with no instruction id is refused",
  missingId.status === 400 && code(missingId) === "NO_INSTRUCTION_ID", code(missingId));

/* ══ 8. forbidden commercial actions ════════════════════════════════════ */

heading("FORBIDDEN COMMERCIAL  ·  price and checkout rejected");

const checkoutAttempt = await call("/v1/editorial", {
  token: CLAUDE,
  body: {
    intent: "PREPARE", instructionId: `sfl-validation-checkout-${runId}`,
    editorial: { ...CL_PREPARE.editorial, slug: `sfl-validation-checkout-${runId}`, cta: { type: "VIEW_PRODUCT", destination: "https://checkout.stripe.com/pay/abc" } },
  },
});
check("commercial.checkout", "a CTA pointing into a checkout is rejected",
  checkoutAttempt.status === 400 && code(checkoutAttempt) === "INVALID_RECORD", message(checkoutAttempt));
check("commercial.checkout.step", "the refusal names EDITORIAL_VALIDATION",
  checkoutAttempt.body && checkoutAttempt.body.error.step === "EDITORIAL_VALIDATION");

const priceAttempt = await call("/v1/editorial", {
  token: CHATGPT,
  body: { ...CG_PREPARE, instruction_id: `sfl-validation-price-${runId}`, slug: `sfl-validation-price-${runId}`, price: 4900, pricingTier: "PAID", compareAtPrice: 9900, checkoutUrl: "https://checkout.stripe.com/x" },
});
check("commercial.price", "a price cannot be carried at all",
  priceAttempt.status === 200 && priceAttempt.body.record.price === undefined, `status ${priceAttempt.status}`);
check("commercial.tier", "no pricing tier was stored", priceAttempt.status === 200 && priceAttempt.body.record.pricingTier === undefined);
check("commercial.checkoutUrl", "no checkout url was stored", priceAttempt.status === 200 && priceAttempt.body.record.checkoutUrl === undefined);

const scrapedAttempt = await call("/v1/editorial", {
  token: CHATGPT,
  body: { ...CG_PREPARE, instruction_id: `sfl-validation-scraped-${runId}`, slug: `sfl-validation-scraped-${runId}`, hero_media: { kind: "HERO", src: "https://benchmark.example/x.jpg", source: "SCRAPED", altText: "taken" } },
});
check("commercial.scraped", "scraped media is rejected by name",
  scrapedAttempt.status === 400 && code(scrapedAttempt) === "MEDIA_REFUSED", message(scrapedAttempt));

const wrongHouse = await call("/v1/editorial", {
  token: CHATGPT,
  body: { ...CG_PREPARE, instruction_id: `sfl-validation-house-${runId}`, slug: `sfl-validation-house-${runId}`, content_type: "TUTORIAL" },
});
check("commercial.wrongHouse", "the wrong house refuses rather than redirecting",
  code(wrongHouse) === "BRANCH_REJECTS_TYPE", message(wrongHouse));

/* ══ 9. publication authority ═══════════════════════════════════════════ */

heading("PUBLICATION  ·  Owner-gated, and refused by TEST_PREVIEW at the edge");

const publishUnapproved = await call("/v1/editorial", {
  token: CLAUDE, body: { intent: "PUBLISH", instructionId: `sfl-validation-pub-unapproved-${runId}`, recordId: clId },
});
check("publish.unapproved", "PUBLISH without Owner approval is refused",
  publishUnapproved.status === 403, `${publishUnapproved.status} ${code(publishUnapproved)}`);
check("publish.unapproved.code", "the refusal is OWNER_APPROVAL_REQUIRED or PUBLICATION_DISABLED",
  ["OWNER_APPROVAL_REQUIRED", "PUBLICATION_DISABLED"].includes(code(publishUnapproved)), code(publishUnapproved));

const approved = await call("/v1/owner/approve", { token: OWNER, body: { recordId: clId } });
check("publish.ownerApprove", "the Owner CAN approve through the Owner credential",
  approved.status === 200, `${approved.status} ${code(approved) || ""}`);

const publishApproved = await call("/v1/editorial", {
  token: CLAUDE, body: { intent: "PUBLISH", instructionId: `sfl-validation-pub-approved-${runId}`, recordId: clId },
});
check("publish.blockedByMode", "PUBLISH is refused EVEN WITH an approval, by TEST_PREVIEW at the edge",
  publishApproved.status === 403 && code(publishApproved) === "PUBLICATION_DISABLED",
  `${publishApproved.status} ${code(publishApproved)}`);

/* ══ 10. THE CRITICAL SAFETY ASSERTION ══════════════════════════════════ */

heading("SAFETY ASSERTION  ·  the public feed holds ZERO publications");

const feed = await call("/v1/owner/feed", { token: OWNER });
check("safety.feedReadable", "the Owner can read the feed", feed.status === 200, `${feed.status}`);
const feedBody = feed.status === 200 ? feed.body.feed : null;
check("safety.zeroRecords", "THE PUBLIC FEED CONTAINS ZERO RECORDS",
  Boolean(feedBody) && Array.isArray(feedBody.records) && feedBody.records.length === 0,
  feedBody ? `${feedBody.records.length} record(s)` : "feed unreadable");
check("safety.evidence", 'the feed is explicitly marked evidence "TEST_PREVIEW"',
  Boolean(feedBody) && feedBody.evidence === "TEST_PREVIEW", feedBody && feedBody.evidence);
check("safety.schema", "the feed uses the engine's existing envelope",
  Boolean(feedBody) && feedBody.schema === "sf.public-site/1.0", feedBody && feedBody.schema);

const records = await call("/v1/owner/records", { token: OWNER });
const stored = (records.status === 200 && records.body.records) || [];
check("safety.nonePublished", "no stored record is in state PUBLISHED",
  stored.every((r) => r.status !== "PUBLISHED"),
  stored.filter((r) => r.status === "PUBLISHED").map((r) => r.id).join(", ") || "none");
check("safety.allValidation", "every record this run created is a labelled validation record",
  stored.filter((r) => [cgId, clId].includes(r.id)).every((r) => r.slug.startsWith("sfl-validation-")));
console.log(`        ${stored.length} record(s) in the TEST_PREVIEW store, 0 published`);

/* ══ 11. no secret over the wire ════════════════════════════════════════ */

heading("SECRETS  ·  nothing credential-shaped came back");

const everything = JSON.stringify([health, contract, cgDraft, cgPreview, clDraft, clPreview, feed, records].map((r) => r.body));
for (const [name, secret] of [["CLIENT_CHATGPT", CHATGPT], ["CLIENT_CLAUDE", CLAUDE], ["OWNER", OWNER]]) {
  check(`secret.${name}`, `no response echoed the ${name} token`, !everything.includes(secret));
}
check("secret.noDigest", "no response contained a 64-hex digest", !/[0-9a-f]{64}/.test(everything));

/* ══ 12. cleanup ════════════════════════════════════════════════════════ */

heading("CLEANUP  ·  archive what this run created");

for (const [label, id] of [["ChatGPT", cgId], ["Claude", clId]]) {
  if (!id) continue;
  const auth = await call("/v1/owner/withdrawal", { token: OWNER, body: { recordId: id, action: "archive" } });
  const archived = await call("/v1/editorial", {
    token: label === "ChatGPT" ? CHATGPT : CLAUDE,
    body: label === "ChatGPT"
      ? { operation: "ARCHIVE", instruction_id: `sfl-validation-archive-cg-${runId}`, record_id: id }
      : { intent: "ARCHIVE", instructionId: `sfl-validation-archive-cl-${runId}`, recordId: id },
  });
  check(`cleanup.${label}`, `the ${label} validation record is archived`,
    archived.status === 200 && archived.body.state === "ARCHIVED",
    `authorize ${auth.status}, archive ${archived.status} ${code(archived) || ""}`);
}

const feedAfter = await call("/v1/owner/feed", { token: OWNER });
check("cleanup.feedStillEmpty", "the public feed is STILL empty after cleanup",
  feedAfter.status === 200 && feedAfter.body.feed.records.length === 0);

finish();

/* ═══════════════════════════════════════════════════════════════════════ */

function finish() {
  const notTested = results.filter((r) => r.outcome === "NOT_TESTED").length;
  const report = {
    api: BASE,
    network: TRANSPORT_KIND,
    runId,
    at: new Date().toISOString(),
    mode: health && health.body && health.body.mode,
    pass: results.filter((r) => r.outcome === "PASS").length,
    fail: results.filter((r) => r.outcome === "FAIL").length,
    notTested,
    actionRequired: results.filter((r) => r.outcome === "ACTION_REQUIRED").length,
    /* A loopback rehearsal can never read VERIFIED, however green it is. */
    status: failures > 0
      ? "REMOTE_TRANSPORT_FAILED"
      : TRANSPORT_KIND !== "PUBLIC_INTERNET"
        ? "LOCAL_REHEARSAL_ONLY"
        : notTested > 0
          ? "REMOTE_TRANSPORT_PARTIAL"
          : "REMOTE_TRANSPORT_VERIFIED",
    results,
  };
  /* The report lands beside the credentials by default — outside the
     repository, so a run from the repo root cannot leave an untracked
     artefact behind. It holds no credential; SFL_REPORT_DIR overrides. */
  const path = resolve(process.env.SFL_REPORT_DIR || credDir, `sfl-remote-validation-${runId}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\n${"═".repeat(78)}`);
  console.log(`${report.pass} passed · ${report.fail} failed · ${report.notTested} not tested`);
  console.log(failures === 0
    ? "REMOTE VALIDATION: all executed checks passed."
    : `REMOTE VALIDATION: ${failures} check(s) FAILED.`);
  console.log(`STATUS: ${report.status}   (network: ${TRANSPORT_KIND})`);
  if (report.notTested > 0) console.log("Revocation still needs its second pass — see the header of this script.");
  console.log(`report written to ${path}  (contains no credential)`);
  console.log("═".repeat(78));
  process.exit(failures === 0 ? 0 : 1);
}
