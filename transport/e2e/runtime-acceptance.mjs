/* SFL EDITORIAL TRANSPORT — end-to-end acceptance against a running Worker.
 *
 * Proves the whole governed path over real HTTP, request by request, against
 * a Worker whose SFL_CORRIDOR_MODE is LIVE:
 *
 *   ChatGPT PREPARE → preview EN/FR → refusals → Owner approval → stale-version
 *   refusal → re-approval → PUBLISH → feed on the right world → withdrawal
 *   authorization → UNPUBLISH → feed empty → rollback
 *
 * plus concurrency (parallel PREPAREs, none lost), duplication (replay) and
 * unauthorized access. Each request is a separate HTTP call, so a Worker that
 * loses state between requests fails here even though it passes in-process.
 *
 *   SFL_API_BASE=http://127.0.0.1:8802 SFL_CRED_DIR=<dir> node transport/e2e/runtime-acceptance.mjs
 *
 * PUBLICATION GOVERNANCE. This script publishes (then withdraws) one test
 * record. It therefore REFUSES any non-loopback target unless it is given
 * --owner-authorized-publication, which the Owner passes only after deciding
 * to exercise a real LIVE deployment. No token is ever printed.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const BASE = (process.env.SFL_API_BASE || "").replace(/\/+$/, "");
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE);
if (!BASE || (!LOOPBACK && !BASE.startsWith("https://"))) {
  console.error("SFL_API_BASE must be https://… or a loopback http address");
  process.exit(2);
}
if (!LOOPBACK && !process.argv.includes("--owner-authorized-publication")) {
  console.error("refusing: this script publishes a test record. On a non-loopback target it");
  console.error("runs only with --owner-authorized-publication, given by the Owner.");
  process.exit(2);
}

const credDir = (process.env.SFL_CRED_DIR || `${homedir()}/.sfl-editorial`).replace(/^~(?=$|\/)/, homedir());
const token = (p) => readFileSync(`${credDir}/${p}.token`, "utf8").trim();
const T = { chatgpt: token("CLIENT_CHATGPT"), claude: token("CLIENT_CLAUDE"), owner: token("OWNER") };
const SECRETS = Object.values(T);

let failures = 0;
const transcript = [];
function check(label, ok, detail = "") {
  if (ok !== true) failures++;
  console.log(`  ${ok === true ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}
const heading = (t) => console.log(`\n── ${t}`);

async function http(method, path, body, tok) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  transcript.push(text);
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, body: json };
}
const editorial = (body, tok) => http("POST", "/v1/editorial", body, tok);
const ownerPost = (route, body) => http("POST", `/v1/owner/${route}`, body, T.owner);
const ownerGet = (route) => http("GET", `/v1/owner/${route}`, null, T.owner);

const runId = Date.now().toString(36);
let n = 0;
const iid = (l) => `rta-${runId}-${l}-${++n}`;

/* ─────────────────────────────────────────────────────────────────────── */

heading("1. target");
const health = await http("GET", "/v1/health");
check("health 200", health.status === 200);
check("mode is LIVE (publication path under test)", health.body && health.body.mode === "LIVE", health.body && health.body.mode);
if (!health.body || health.body.mode !== "LIVE") { console.log("\nnot a LIVE target — stopping."); process.exit(1); }

heading("2. unauthorized access");
check("no credential → 401", (await editorial({ operation: "PREPARE" })).status === 401);
check("wrong credential → 401", (await editorial({ operation: "PREPARE" }, "sfl_not_a_real_token")).status === 401);
check("client on an Owner route → 403", (await http("POST", "/v1/owner/approve", { recordId: "x" }, T.claude)).status === 403);
check("Owner on the client route → 403", (await editorial({ operation: "PREPARE", instruction_id: iid("o") }, T.owner)).status === 403);

heading("3. ChatGPT PREPARE + preview EN/FR");
const slug = `runtime-acceptance-${runId}`;
const prepareBody = {
  operation: "PREPARE", instruction_id: iid("prep"), branch: "VIBRAFLOW_MEDIA", content_type: "TEACHING",
  title: "Runtime Acceptance Teaching", slug, summary: "A test teaching for runtime acceptance.",
  body: "There is a kind of strength that does not announce itself, and this teaching sits with it.",
  language: "en",
  translations: { fr: { title: "Enseignement d'acceptation", summary: "Un enseignement de test.", body: "Il existe une force qui ne s'annonce pas, et cet enseignement demeure avec elle." } },
};
const prep = await editorial(prepareBody, T.chatgpt);
check("PREPARE → 200 DRAFT, not live", prep.status === 200 && prep.body.state === "DRAFT" && prep.body.isLive === false, `${prep.status} ${prep.body && prep.body.state}`);
check("routed to VibraFlow Media", prep.body && prep.body.record && prep.body.record.identity === "vibraflowmedia");
const recordId = prep.body && prep.body.record && prep.body.record.id;
const pv = await editorial({ operation: "PREVIEW", instruction_id: iid("pv"), record_id: recordId }, T.chatgpt);
const pvText = JSON.stringify(pv.body || {});
check("PREVIEW is a preview, not live", pv.status === 200 && pv.body.preview && pv.body.preview.preview === true && pv.body.preview.isLive === false);
check("preview carries EN and FR", pvText.includes("Runtime Acceptance Teaching") && pvText.includes("Enseignement d'acceptation"));

heading("4. duplication and concurrency");
const dup = await editorial(prepareBody, T.chatgpt);
check("same instruction id → replay, same record, same version", dup.body && dup.body.replay === true && dup.body.record.id === recordId && dup.body.record.version === prep.body.record.version);
const N = 12;
const parallel = await Promise.all(Array.from({ length: N }, (_, i) => editorial({
  ...prepareBody, instruction_id: iid(`par${i}`), slug: `${slug}-p${i}`, title: `Parallel ${i}`,
}, T.chatgpt)));
check(`${N} parallel PREPAREs all succeed`, parallel.every((r) => r.status === 200), parallel.map((r) => r.status).join(","));
const records = await ownerGet("records");
const stored = new Set(((records.body && records.body.records) || []).map((r) => r.slug));
const lost = Array.from({ length: N }, (_, i) => `${slug}-p${i}`).filter((s) => !stored.has(s));
check("none of the parallel writes was lost", lost.length === 0, lost.length ? `lost: ${lost.join(", ")}` : `${N}/${N} stored`);

heading("5. publication is Owner-gated, per version");
const early = await editorial({ operation: "PUBLISH", instruction_id: iid("pub0"), record_id: recordId }, T.chatgpt);
check("PUBLISH before approval → 403", early.status === 403, early.body && early.body.error && early.body.error.code);
const appr = await ownerPost("approve", { recordId });
check("Owner approves → 200", appr.status === 200);
const edit = await editorial({ operation: "UPDATE", instruction_id: iid("upd"), record_id: recordId, summary: "Changed after approval." }, T.chatgpt);
check("client edits after approval → 200", edit.status === 200);
const stale = await editorial({ operation: "PUBLISH", instruction_id: iid("pub1"), record_id: recordId }, T.chatgpt);
check("PUBLISH of the edited version on the old approval → refused", stale.status >= 400 && stale.status < 500, `${stale.status} ${stale.body && stale.body.error && stale.body.error.code}`);
const appr2 = await ownerPost("approve", { recordId });
check("Owner re-approves the new version → 200", appr2.status === 200);
const pub = await editorial({ operation: "PUBLISH", instruction_id: iid("pub2"), record_id: recordId }, T.chatgpt);
check("PUBLISH → 200 PUBLISHED, live", pub.status === 200 && pub.body.state === "PUBLISHED" && pub.body.isLive === true, `${pub.status} ${pub.body && (pub.body.state || pub.body.error && pub.body.error.code)}`);

heading("6. feed, world, EN/FR");
const feed1 = await ownerGet("feed");
const inFeed = ((feed1.body && feed1.body.feed && feed1.body.feed.records) || []).find((r) => r.slug === slug);
check("the record is in the public feed", Boolean(inFeed));
check("…on the VibraFlow Media world only", inFeed && inFeed.identity === "vibraflowmedia");
check("…with the French rendition carried", JSON.stringify(inFeed || {}).includes("Enseignement d'acceptation"));
check("…FREE, no price or checkout", inFeed && inFeed.pricingTier === "FREE" && !JSON.stringify(inFeed).includes("checkout"));

heading("7. withdrawal and rollback");
const unAuth = await editorial({ operation: "UNPUBLISH", instruction_id: iid("un0"), record_id: recordId }, T.chatgpt);
check("UNPUBLISH without Owner authorization → 403", unAuth.status === 403);
const wd = await ownerPost("withdrawal", { recordId, action: "unpublish" });
check("Owner authorizes withdrawal → 200", wd.status === 200);
const un = await editorial({ operation: "UNPUBLISH", instruction_id: iid("un1"), record_id: recordId }, T.chatgpt);
check("UNPUBLISH → 200 UNPUBLISHED", un.status === 200 && un.body.state === "UNPUBLISHED", `${un.status} ${un.body && un.body.state}`);
const feed2 = await ownerGet("feed");
check("the record has left the public feed", !((feed2.body && feed2.body.feed && feed2.body.feed.records) || []).some((r) => r.slug === slug));
const rb = await ownerPost("rollback", { recordId, toVersion: 1 });
check("Owner rollback to v1 → 200, as a new version", rb.status === 200, `${rb.status}`);
const audit = await ownerGet("audit");
const auditText = JSON.stringify(audit.body || {});
check("the Owner audit trail survived across requests (approve + rollback recorded)", auditText.includes("APPROVAL_STATE:APPROVED") && auditText.includes("ROLLED_BACK"));

heading("8. cleanup and secrets");
for (let i = 0; i < N; i++) {
  /* archive the parallel test records so they are unmistakable and inert */
  const r = ((records.body && records.body.records) || []).find((x) => x.slug === `${slug}-p${i}`);
  if (r) {
    await ownerPost("withdrawal", { recordId: r.id, action: "archive" });
    await editorial({ operation: "ARCHIVE", instruction_id: iid(`arch${i}`), record_id: r.id }, T.chatgpt);
  }
}
const leaked = transcript.some((t) => SECRETS.some((s) => t.includes(s)));
check("no token appears in any response", !leaked);
check("no 64-hex digest appears in any response", !transcript.some((t) => /\b[0-9a-f]{64}\b/.test(t)));

console.log(`\n${failures === 0 ? "RUNTIME ACCEPTANCE: all checks passed." : `RUNTIME ACCEPTANCE: ${failures} check(s) FAILED.`}`);
console.log(`target: ${LOOPBACK ? "LOOPBACK (local runtime)" : "PUBLIC INTERNET"}`);
process.exit(failures ? 1 : 0);
