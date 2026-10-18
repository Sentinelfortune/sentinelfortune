/* SFL EDITORIAL TRANSPORT — the live proof.
 *
 * Not a unit test. This boots the REAL Node runtime on a real socket and
 * drives it with real `fetch` calls — real headers, real status codes, real
 * JSON over the wire — because "the handler returns 401" and "an HTTP request
 * gets a 401" are not the same claim.
 *
 * It proves exactly what Phase 1 asks to be proven:
 *
 *   ChatGPT-shaped request → authenticated → corridor → draft → preview
 *   Claude-shaped  request → authenticated → corridor → draft → preview
 *   unauthorized request   → rejected
 *   revoked client         → rejected
 *   duplicate request      → no duplicate record
 *   forbidden commercial   → rejected
 *   publish                → still Owner-gated, in both modes
 *
 * Everything binds to 127.0.0.1 and nothing is deployed. No production
 * content is published: the server runs in TEST_PREVIEW, and the one LIVE
 * server at the end exists only to show the Owner gate still holds there.
 *
 *   node transport/e2e/live.mjs
 */

import { createNodeServer } from "../runtime/node.mjs";
import { createCorridor } from "../../corridor/actions.js";
import { sha256Hex } from "../core/auth.js";

const CHATGPT_TOKEN = "sfl_live_proof_chatgpt";
const CLAUDE_TOKEN = "sfl_live_proof_claude";
const OWNER_TOKEN = "sfl_live_proof_owner";

let failures = 0;
let section = 0;

function check(label, condition, detail = "") {
  const ok = condition === true;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

function heading(text) {
  section++;
  console.log(`\n${"─".repeat(76)}\n${section}. ${text}\n${"─".repeat(76)}`);
}

/** Boot the real server on an ephemeral port. */
async function boot(over = {}) {
  const env = {
    SFL_CORRIDOR_CHATGPT_TOKEN_SHA256: await sha256Hex(CHATGPT_TOKEN),
    SFL_CORRIDOR_CLAUDE_TOKEN_SHA256: await sha256Hex(CLAUDE_TOKEN),
    SFL_CORRIDOR_OWNER_TOKEN_SHA256: await sha256Hex(OWNER_TOKEN),
    SFL_CORRIDOR_MODE: "TEST_PREVIEW",
    ...over,
  };
  const corridor = createCorridor();
  const { server, api } = createNodeServer({ env, corridor, log: { error() {}, warn() {}, log() {}, info() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    api,
    corridor,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** A real HTTP call. */
async function call(base, path, { token, body, method = body === undefined ? "GET" : "POST", headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
  });
  let json = null;
  try { json = await res.json(); } catch { /* a body that is not JSON is itself a finding */ }
  return { status: res.status, headers: res.headers, body: json };
}

/* ── the two provider-shaped payloads ──────────────────────────────────── */

const CHATGPT_PREPARE = {
  operation: "PREPARE",
  instruction_id: "live-vibraflow-01",
  user_message: "prépare un enseignement pour VibraFlow sur le silence du matin",
  branch: "VIBRAFLOW_MEDIA",
  content_type: "TEACHING",
  title: "The Discipline of an Unhurried Morning",
  slug: "discipline-of-an-unhurried-morning",
  summary: "A teaching on the first twenty minutes, and what they decide.",
  body: "Most people lose the day before it begins. Not to failure — to noise. This teaching sits with the first twenty minutes of a morning and asks what they are actually for.",
  language: "en",
  translations: {
    fr: {
      title: "La discipline d'un matin sans hâte",
      summary: "Un enseignement sur les vingt premières minutes.",
      body: "La plupart des gens perdent la journée avant qu'elle ne commence. Non par échec — par bruit. Cet enseignement s'assoit avec les vingt premières minutes d'un matin.",
    },
  },
  topics: ["stillness", "discipline"],
  cta: { type: "SUPPORT_THE_WORK", destination: "https://sentinelfortune.com/support" },
};

const CLAUDE_PREPARE = {
  intent: "PREPARE",
  instructionId: "live-academy-01",
  ownerUtterance: "prepare a free lesson for the Academy about what a price communicates",
  editorial: {
    branch: "LUMEN_SCHOOL_ACADEMY",
    contentType: "LESSON",
    title: "What a Price Actually Says",
    slug: "what-a-price-actually-says",
    summary: "A free lesson on pricing as a sentence your business speaks before you do.",
    body: "A price is not a number. It is a sentence your business speaks before you open your mouth, and most founders never read theirs back. This lesson reads it out loud.",
    language: "en",
    topics: ["pricing", "business"],
    cta: { type: "READ_MORE", destination: "/learn/what-a-price-actually-says" },
  },
};

/* ═══════════════════════════════════════════════════════════════════════════ */

const live = await boot();
console.log(`SFL Editorial API — live proof on ${live.base}  (mode: ${live.api.mode})`);

/* ── 1. health, unauthenticated ─────────────────────────────────────────── */

heading("HEALTH  ·  unauthenticated, and disclosing nothing");

const health = await call(live.base, "/v1/health");
check("GET /v1/health returns 200 over real HTTP", health.status === 200);
check("it reports TEST_PREVIEW mode", health.body.mode === "TEST_PREVIEW");
check("it reports publication disabled", health.body.publicationEnabled === false);
check("it does not disclose which principals exist", !("principals" in health.body));
check("responses are marked no-store", health.headers.get("cache-control") === "no-store");

const contract = await call(live.base, "/v1/contract");
check("GET /v1/contract returns the eight actions", contract.body.actions.length === 8);

/* ── 2. unauthorized ───────────────────────────────────────────────────── */

heading("UNAUTHORIZED  ·  rejected, and told nothing");

const noCred = await call(live.base, "/v1/editorial", { body: CHATGPT_PREPARE });
check("a request with no credential is 401", noCred.status === 401, noCred.body.error.code);
check("the message is generic before authentication", noCred.body.error.message === "Request refused.");
check("it carries a WWW-Authenticate challenge", noCred.headers.get("www-authenticate") === 'Bearer realm="sfl-editorial"');

const badCred = await call(live.base, "/v1/editorial", { token: "sfl_not_a_real_token", body: CHATGPT_PREPARE });
check("a request with a wrong credential is 401", badCred.status === 401, badCred.body.error.code);
check("nothing reached the editorial store", live.corridor.store.all().length === 0);

/* ── 3. ChatGPT: authenticated → corridor → draft → preview ────────────── */

heading("CHATGPT  ·  authenticated → corridor → draft → preview");

const cgDraft = await call(live.base, "/v1/editorial", { token: CHATGPT_TOKEN, body: CHATGPT_PREPARE });
check("the authenticated ChatGPT request is 200", cgDraft.status === 200, cgDraft.body.error && cgDraft.body.error.message);
check("the API attributes it to CLIENT_CHATGPT", cgDraft.body.client === "CLIENT_CHATGPT");
check("the corridor resolved it to create_draft", cgDraft.body.action === "create_draft");
check("it is a DRAFT", cgDraft.body.state === "DRAFT");
check("the response states it is not live", cgDraft.body.isLive === false);
check("it is routed to VibraFlow Media", cgDraft.body.record.identity === "vibraflowmedia");
check("it presents as a type the public engine already renders", cgDraft.body.record.presentationType === "TEACHING");
console.log(`        record ${cgDraft.body.record.id} · v${cgDraft.body.record.version}`);

const cgPreview = await call(live.base, "/v1/editorial", {
  token: CHATGPT_TOKEN,
  body: { operation: "PREVIEW", instruction_id: "live-vibraflow-preview-01", record_id: cgDraft.body.record.id },
});
check("the preview is 200", cgPreview.status === 200, cgPreview.body.error && cgPreview.body.error.message);
check("the preview says preview: true", cgPreview.body.preview.preview === true);
check("the preview says isLive: false", cgPreview.body.preview.isLive === false && cgPreview.body.isLive === false);
check("the preview renders BOTH languages", cgPreview.body.preview.languages.includes("en") && cgPreview.body.preview.languages.includes("fr"));
check("the preview published nothing", live.corridor.feed().records.length === 0);
console.log(`        EN "${cgPreview.body.preview.renderings.en.title}"`);
console.log(`        FR "${cgPreview.body.preview.renderings.fr.title}"`);

/* ── 4. Claude: authenticated → corridor → draft → preview ─────────────── */

heading("CLAUDE  ·  authenticated → corridor → draft → preview");

const clDraft = await call(live.base, "/v1/editorial", { token: CLAUDE_TOKEN, body: CLAUDE_PREPARE });
check("the authenticated Claude request is 200", clDraft.status === 200, clDraft.body.error && clDraft.body.error.message);
check("the API attributes it to CLIENT_CLAUDE", clDraft.body.client === "CLIENT_CLAUDE");
check("the corridor resolved it to create_draft", clDraft.body.action === "create_draft");
check("it is a DRAFT and not live", clDraft.body.state === "DRAFT" && clDraft.body.isLive === false);
check("it is routed to Lumen School Academy", clDraft.body.record.identity === "lumenschoolacademy");
check("both clients went through the SAME pipeline step", clDraft.body.step === cgDraft.body.step, clDraft.body.step);
console.log(`        record ${clDraft.body.record.id} · v${clDraft.body.record.version}`);

const clPreview = await call(live.base, "/v1/editorial", {
  token: CLAUDE_TOKEN,
  body: { intent: "PREVIEW", instructionId: "live-academy-preview-01", recordId: clDraft.body.record.id },
});
check("the preview is 200", clPreview.status === 200, clPreview.body.error && clPreview.body.error.message);
check("the preview says preview: true and isLive: false", clPreview.body.preview.preview === true && clPreview.body.preview.isLive === false);
check("the preview published nothing", live.corridor.feed().records.length === 0);

/* ── 5. duplicate ──────────────────────────────────────────────────────── */

heading("DUPLICATE  ·  the same request again → no duplicate record");

const before = live.corridor.store.all().length;
const cgReplay = await call(live.base, "/v1/editorial", { token: CHATGPT_TOKEN, body: CHATGPT_PREPARE });
const clReplay = await call(live.base, "/v1/editorial", { token: CLAUDE_TOKEN, body: CLAUDE_PREPARE });

check("the replayed ChatGPT request is 200 and marked replay", cgReplay.status === 200 && cgReplay.body.replay === true);
check("the replayed Claude request is 200 and marked replay", clReplay.status === 200 && clReplay.body.replay === true);
check("no new record was created", live.corridor.store.all().length === before, `${before} before, ${live.corridor.store.all().length} after`);
check("no version was bumped", live.corridor.store.get(cgDraft.body.record.id).version === 1);
check("the replay returned the original record", cgReplay.body.record.id === cgDraft.body.record.id);

const keyMismatch = await call(live.base, "/v1/editorial", {
  token: CHATGPT_TOKEN, body: CHATGPT_PREPARE, headers: { "Idempotency-Key": "a-different-key" },
});
check("an Idempotency-Key disagreeing with the body is 400", keyMismatch.status === 400 && keyMismatch.body.error.code === "IDEMPOTENCY_KEY_MISMATCH");

/* ── 6. forbidden commercial action ────────────────────────────────────── */

heading("FORBIDDEN COMMERCIAL  ·  rejected");

const checkout = await call(live.base, "/v1/editorial", {
  token: CLAUDE_TOKEN,
  body: {
    intent: "PREPARE", instructionId: "live-checkout-attempt",
    editorial: { ...CLAUDE_PREPARE.editorial, slug: "checkout-attempt", cta: { type: "VIEW_PRODUCT", destination: "https://checkout.stripe.com/pay/abc" } },
  },
});
check("a CTA pointing at a checkout is rejected", checkout.status === 400 && checkout.body.error.code === "INVALID_RECORD", checkout.body.error.message);
check("the refusal names the step that refused it", checkout.body.error.step === "EDITORIAL_VALIDATION");

const priced = await call(live.base, "/v1/editorial", {
  token: CHATGPT_TOKEN,
  body: { ...CHATGPT_PREPARE, instruction_id: "live-price-attempt", slug: "price-attempt", price: 4900, pricingTier: "PAID", checkoutUrl: "https://checkout.stripe.com/x" },
});
check("a price cannot be carried at all", priced.status === 200 && priced.body.record.price === undefined);
check("no pricing tier was stored", priced.body.record.pricingTier === undefined);
check("no checkout url was stored", priced.body.record.checkoutUrl === undefined);

const scraped = await call(live.base, "/v1/editorial", {
  token: CHATGPT_TOKEN,
  body: { ...CHATGPT_PREPARE, instruction_id: "live-scraped-attempt", slug: "scraped-attempt", hero_media: { kind: "HERO", src: "https://benchmark.example/x.jpg", source: "SCRAPED", altText: "taken" } },
});
check("scraped media is rejected by name", scraped.status === 400 && scraped.body.error.code === "MEDIA_REFUSED", scraped.body.error.message);

const wrongHouse = await call(live.base, "/v1/editorial", {
  token: CHATGPT_TOKEN,
  body: { ...CHATGPT_PREPARE, instruction_id: "live-wrong-house", slug: "wrong-house", content_type: "TUTORIAL" },
});
check("the wrong house refuses rather than redirecting", wrongHouse.body.error.code === "BRANCH_REJECTS_TYPE", wrongHouse.body.error.message);

/* ── 7. publication authority ──────────────────────────────────────────── */

heading("PUBLICATION  ·  refused by the mode, and still Owner-gated underneath");

const ownerApproved = await call(live.base, "/v1/owner/approve", { token: OWNER_TOKEN, body: { recordId: clDraft.body.record.id } });
check("the Owner can approve through the Owner credential", ownerApproved.status === 200, ownerApproved.body.error && ownerApproved.body.error.message);

const blocked = await call(live.base, "/v1/editorial", {
  token: CLAUDE_TOKEN, body: { intent: "PUBLISH", instructionId: "live-publish-attempt", recordId: clDraft.body.record.id },
});
check("TEST_PREVIEW refuses publication even WITH an approval", blocked.status === 403 && blocked.body.error.code === "PUBLICATION_DISABLED", blocked.body.error.message);
check("nothing is in the public feed", live.corridor.feed().records.length === 0);

const clientTriesOwner = await call(live.base, "/v1/owner/approve", { token: CLAUDE_TOKEN, body: { recordId: clDraft.body.record.id } });
check("an AI client cannot reach the Owner approval route", clientTriesOwner.status === 403 && clientTriesOwner.body.error.code === "OWNER_ROUTE");

const ownerTriesClient = await call(live.base, "/v1/editorial", { token: OWNER_TOKEN, body: CHATGPT_PREPARE });
check("the Owner credential cannot run client commands", ownerTriesClient.status === 403 && ownerTriesClient.body.error.code === "CLIENT_ROUTE");

/* ── 8. revoked ────────────────────────────────────────────────────────── */

heading("REVOKED  ·  rejected");

const revoked = await boot({ SFL_CORRIDOR_REVOKED: "CLIENT_CHATGPT" });
const revokedCall = await call(revoked.base, "/v1/editorial", { token: CHATGPT_TOKEN, body: CHATGPT_PREPARE });
check("a revoked client is 403", revokedCall.status === 403 && revokedCall.body.error.code === "REVOKED_CREDENTIAL");
check("it wrote nothing", revoked.corridor.store.all().length === 0);

const stillFine = await call(revoked.base, "/v1/editorial", { token: CLAUDE_TOKEN, body: CLAUDE_PREPARE });
check("revoking one client does not affect the other", stillFine.status === 200);
await revoked.close();

/* ── 9. the Owner gate in LIVE mode ───────────────────────────────────── */

heading("LIVE MODE  ·  the Owner gate is not relaxed by the mode");

const liveMode = await boot({ SFL_CORRIDOR_MODE: "LIVE" });
const liveDraft = await call(liveMode.base, "/v1/editorial", { token: CLAUDE_TOKEN, body: CLAUDE_PREPARE });
const liveId = liveDraft.body.record.id;

const unapproved = await call(liveMode.base, "/v1/editorial", { token: CLAUDE_TOKEN, body: { intent: "PUBLISH", instructionId: "live-unapproved", recordId: liveId } });
check("publishing without Owner approval is 403 in LIVE mode too", unapproved.status === 403 && unapproved.body.error.code === "OWNER_APPROVAL_REQUIRED", unapproved.body.error.message);
check("nothing was published", liveMode.corridor.feed().records.length === 0);

await call(liveMode.base, "/v1/owner/approve", { token: OWNER_TOKEN, body: { recordId: liveId } });
const published = await call(liveMode.base, "/v1/editorial", { token: CLAUDE_TOKEN, body: { intent: "PUBLISH", instructionId: "live-approved", recordId: liveId } });
check("with the Owner's approval it publishes", published.status === 200 && published.body.state === "PUBLISHED");
check("and only then does the response say isLive: true", published.body.isLive === true);

const spent = await call(liveMode.base, "/v1/editorial", { token: CLAUDE_TOKEN, body: { intent: "PUBLISH", instructionId: "live-again", recordId: liveId } });
check("the approval was spent — a second publish needs a second approval", spent.status === 403 && spent.body.error.code === "OWNER_APPROVAL_REQUIRED");
console.log("        (this LIVE server is a local, ephemeral, in-memory process on 127.0.0.1.");
console.log("         Nothing was deployed and nothing public was touched — it exists only to");
console.log("         show that LIVE mode does not relax the Owner gate.)");
await liveMode.close();

/* ── 10. no secret over the wire ──────────────────────────────────────── */

heading("SECRETS  ·  nothing credential-shaped crosses the wire");

const ownerFeed = await call(live.base, "/v1/owner/feed", { token: OWNER_TOKEN });
const ownerAudit = await call(live.base, "/v1/owner/audit", { token: OWNER_TOKEN });
const everything = JSON.stringify([health, contract, cgDraft, cgPreview, clDraft, clPreview, priced, ownerFeed, ownerAudit].map((r) => r.body));

for (const secret of [CHATGPT_TOKEN, CLAUDE_TOKEN, OWNER_TOKEN]) {
  check(`no response contains the ${secret.split("_").pop()} token`, !everything.includes(secret));
}
check("no response contains a credential digest", !new RegExp(await sha256Hex(CHATGPT_TOKEN)).test(everything));
check("the TEST_PREVIEW feed is marked TEST_PREVIEW", ownerFeed.body.feed.evidence === "TEST_PREVIEW");
check("the TEST_PREVIEW feed is empty — nothing was published", ownerFeed.body.feed.records.length === 0);

await live.close();

/* ═══════════════════════════════════════════════════════════════════════════ */

console.log(`\n${"═".repeat(76)}`);
console.log(failures === 0 ? "LIVE PROOF: all checks passed." : `LIVE PROOF: ${failures} check(s) FAILED.`);
console.log("═".repeat(76));
process.exit(failures === 0 ? 0 : 1);
