/* SFL EDITORIAL TRANSPORT — the governing tests.
 *
 * These test the TRANSPORT: routing, authentication, revocation, replay
 * protection, malformed input, forbidden actions, the mode lock, and the
 * boundary between the client surface and the Owner surface.
 *
 * They do NOT re-test the corridor. The corridor has its own 23 tests and is
 * called here, never reimplemented — which is the thing most worth proving
 * about a transport.
 *
 *   node --test transport/tests/transport.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createApi, MAX_BODY_BYTES, API_VERSION } from "../core/http.js";
import { createCorridor } from "../../corridor/actions.js";
import { sha256Hex, hmacHex, timingSafeEqualHex, readAuthConfig } from "../core/auth.js";

/* ── fixtures ──────────────────────────────────────────────────────────── */

const CHATGPT_TOKEN = "sfl_test_chatgpt_token_value";
const CLAUDE_TOKEN = "sfl_test_claude_token_value";
const OWNER_TOKEN = "sfl_test_owner_token_value";

let digests;
async function envWith(over = {}) {
  digests = digests || {
    SFL_CORRIDOR_CHATGPT_TOKEN_SHA256: await sha256Hex(CHATGPT_TOKEN),
    SFL_CORRIDOR_CLAUDE_TOKEN_SHA256: await sha256Hex(CLAUDE_TOKEN),
    SFL_CORRIDOR_OWNER_TOKEN_SHA256: await sha256Hex(OWNER_TOKEN),
  };
  return { ...digests, SFL_CORRIDOR_MODE: "TEST_PREVIEW", ...over };
}

/** A log that captures instead of printing, so a test can assert on it. */
function captureLog() {
  const lines = [];
  const push = (level) => (...args) => lines.push(`${level} ${args.join(" ")}`);
  return { lines, error: push("error"), warn: push("warn"), log: push("log"), info: push("log") };
}

async function apiWith(over = {}, { corridor = createCorridor(), log = captureLog() } = {}) {
  const env = await envWith(over);
  return { api: createApi({ env, corridor, log }), corridor, log, env };
}

let seq = 0;
const iid = (label) => `t_${label}_${++seq}`;

function post(path, body, token, headers = {}) {
  return {
    method: "POST",
    path,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    rawBody: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function get(path, token, headers = {}) {
  return { method: "GET", path, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } };
}

const chatgptDraft = (over = {}) => ({
  operation: "PREPARE",
  instruction_id: iid("cg"),
  branch: "VIBRAFLOW_MEDIA",
  content_type: "TEACHING",
  title: "The Discipline of an Unhurried Morning",
  slug: `unhurried-morning-${seq}`,
  summary: "A teaching on the first twenty minutes.",
  body: "There is a kind of strength that does not announce itself, and this teaching sits with it.",
  language: "en",
  ...over,
});

const claudeDraft = (over = {}) => {
  const { editorial = {}, ...rest } = over;
  return {
    intent: "PREPARE",
    instructionId: iid("cl"),
    editorial: {
      branch: "LUMEN_SCHOOL_ACADEMY",
      contentType: "LESSON",
      title: "What a Price Actually Says",
      slug: `what-a-price-says-${seq}`,
      summary: "A free lesson on pricing as a message.",
      body: "A price is a sentence your business speaks before you do, and this lesson reads it aloud.",
      language: "en",
      ...editorial,
    },
    ...rest,
  };
};

/* ═════════════════════════════════════════════════════════════════════════
   ROUTING
   ═════════════════════════════════════════════════════════════════════════ */

test("health and contract are unauthenticated, and disclose no editorial data", async () => {
  const { api } = await apiWith();

  const health = await api.handle(get("/v1/health"));
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.api, API_VERSION);
  assert.equal(health.body.mode, "TEST_PREVIEW");
  assert.equal(health.body.publicationEnabled, false);
  /* Which principals exist is not disclosed. */
  assert.equal("principals" in health.body, false);
  assert.ok(!JSON.stringify(health.body).includes(CHATGPT_TOKEN));

  const contract = await api.handle(get("/v1/contract"));
  assert.equal(contract.status, 200);
  assert.equal(contract.body.actions.length, 8);
  assert.equal(contract.body.defaults.intent, "PREPARE");
  assert.ok(contract.body.rules.some((r) => /never to PUBLISH/.test(r)));
  assert.ok(contract.body.rules.some((r) => /TEST_PREVIEW/.test(r)));
});

test("an unknown route and a wrong method are refused, not served", async () => {
  const { api } = await apiWith();
  assert.equal((await api.handle(get("/v1/nope", CHATGPT_TOKEN))).body.error.code, "UNKNOWN_ROUTE");
  assert.equal((await api.handle(get("/", CHATGPT_TOKEN))).status, 404);
  assert.equal((await api.handle(post("/v1/health", {}, CHATGPT_TOKEN))).body.error.code, "METHOD_NOT_ALLOWED");
  assert.equal((await api.handle(get("/v1/editorial", CHATGPT_TOKEN))).body.error.code, "METHOD_NOT_ALLOWED");
  /* A trailing slash and a query string are the same endpoint, not a 404. */
  assert.equal((await api.handle(get("/v1/health/"))).status, 200);
  assert.equal((await api.handle(get("/v1/health?probe=1"))).status, 200);
});

/* ═════════════════════════════════════════════════════════════════════════
   AUTHENTICATION
   ═════════════════════════════════════════════════════════════════════════ */

test("an unauthorized request is rejected — and told nothing", async () => {
  const { api, corridor } = await apiWith();

  const none = await api.handle(post("/v1/editorial", chatgptDraft(), null));
  assert.equal(none.status, 401);
  assert.equal(none.body.error.code, "NO_CREDENTIAL");
  assert.equal(none.body.error.message, "Request refused.");      // generic, pre-auth
  assert.equal(none.headers["WWW-Authenticate"], 'Bearer realm="sfl-editorial"');

  const wrong = await api.handle(post("/v1/editorial", chatgptDraft(), "sfl_not_a_real_token"));
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error.code, "BAD_CREDENTIAL");
  assert.equal(wrong.body.error.message, "Request refused.");

  /* A near-miss of a real token is still a miss. */
  const nearMiss = await api.handle(post("/v1/editorial", chatgptDraft(), `${CHATGPT_TOKEN}x`));
  assert.equal(nearMiss.status, 401);

  /* Nothing reached the editorial store. */
  assert.equal(corridor.store.all().length, 0);
});

test("a deployment with no credential digest configured refuses everything authenticated", async () => {
  const log = captureLog();
  const api = createApi({ env: { SFL_CORRIDOR_MODE: "TEST_PREVIEW" }, log });
  assert.equal(api.authConfigured, false);

  const res = await api.handle(post("/v1/editorial", chatgptDraft(), CHATGPT_TOKEN));
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, "NOT_CONFIGURED");
  /* Health still answers, so the Owner can see WHY it is refusing. */
  assert.equal((await api.handle(get("/v1/health"))).body.configured, false);
});

test("a malformed digest disables that principal and is logged, not silently accepted", async () => {
  const log = captureLog();
  const env = await envWith({ SFL_CORRIDOR_CHATGPT_TOKEN_SHA256: "not-a-digest" });
  const api = createApi({ env, log });

  assert.equal((await api.handle(post("/v1/editorial", chatgptDraft(), CHATGPT_TOKEN))).body.error.code, "BAD_CREDENTIAL");
  assert.ok(log.lines.some((l) => /is not 64 hex characters/.test(l)));
  /* The other principals are unaffected. */
  assert.equal((await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN))).status, 200);
});

test("the CREDENTIAL chooses the adapter — a client cannot act as the other one", async () => {
  const { api } = await apiWith();

  /* A ChatGPT token sending a Claude-shaped body does NOT quietly become
     Claude. The ChatGPT adapter runs — it is the one the credential selects —
     so the nested `editorial` object is not where it looks, and the command is
     refused for the fields it genuinely lacks. The credential wins; the body
     does not get a vote. */
  const crossShaped = await api.handle(post("/v1/editorial", claudeDraft(), CHATGPT_TOKEN));
  assert.equal(crossShaped.status, 400);
  /* It does not even reach branch validation: the ChatGPT adapter reads
     `instruction_id`, and a Claude-shaped body carries `instructionId`. */
  assert.equal(crossShaped.body.error.code, "NO_INSTRUCTION_ID");
  assert.equal(crossShaped.body.error.step, "COMMAND_VALIDATION");

  const claude = await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN));
  assert.equal(claude.status, 200);
  assert.equal(claude.body.client, "CLIENT_CLAUDE");
  assert.equal(claude.body.record.sourceClient, "CLIENT_CLAUDE");

  /* There is no field that changes identity. Asking for one is ignored. */
  const spoof = await api.handle(post("/v1/editorial", { ...claudeDraft(), client: "CLIENT_CHATGPT", provider: "chatgpt", sourceClient: "OWNER" }, CLAUDE_TOKEN));
  assert.equal(spoof.body.client, "CLIENT_CLAUDE");
  assert.equal(spoof.body.record.sourceClient, "CLIENT_CLAUDE");
});

test("a revoked client is rejected before anything is evaluated", async () => {
  const { api, corridor } = await apiWith({ SFL_CORRIDOR_REVOKED: "CLIENT_CHATGPT" });

  const revoked = await api.handle(post("/v1/editorial", chatgptDraft(), CHATGPT_TOKEN));
  assert.equal(revoked.status, 403);
  assert.equal(revoked.body.error.code, "REVOKED_CREDENTIAL");
  assert.equal(corridor.store.all().length, 0);

  /* Revoking one principal does not touch the others. */
  assert.equal((await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN))).status, 200);
  assert.equal((await api.handle(get("/v1/owner/approvals", OWNER_TOKEN))).status, 200);
});

test("revoking the Owner is possible too, and is independent", async () => {
  const { api } = await apiWith({ SFL_CORRIDOR_REVOKED: "OWNER" });
  assert.equal((await api.handle(get("/v1/owner/approvals", OWNER_TOKEN))).body.error.code, "REVOKED_CREDENTIAL");
  assert.equal((await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN))).status, 200);
});

/* ═════════════════════════════════════════════════════════════════════════
   THE CLIENT / OWNER BOUNDARY
   ═════════════════════════════════════════════════════════════════════════ */

test("an AI client cannot reach any Owner route", async () => {
  const { api, corridor } = await apiWith();
  const draft = await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN));
  const recordId = draft.body.record.id;

  for (const path of ["/v1/owner/approve", "/v1/owner/withdrawal", "/v1/owner/reject", "/v1/owner/rollback"]) {
    for (const token of [CHATGPT_TOKEN, CLAUDE_TOKEN]) {
      const res = await api.handle(post(path, { recordId, action: "unpublish", toVersion: 1 }, token));
      assert.equal(res.status, 403, `${path} with ${token}`);
      assert.equal(res.body.error.code, "OWNER_ROUTE");
    }
  }
  for (const path of ["/v1/owner/approvals", "/v1/owner/feed", "/v1/owner/audit", "/v1/owner/records"]) {
    assert.equal((await api.handle(get(path, CLAUDE_TOKEN))).body.error.code, "OWNER_ROUTE");
  }

  /* No approval was minted and the record did not move. */
  assert.equal(corridor.pendingApprovals().length, 0);
  assert.equal(corridor.store.get(recordId).status, "DRAFT");
});

test("the Owner credential cannot run editorial commands as a client", async () => {
  const { api, corridor } = await apiWith();
  const res = await api.handle(post("/v1/editorial", chatgptDraft(), OWNER_TOKEN));
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "CLIENT_ROUTE");
  assert.equal(corridor.store.all().length, 0);
});

/* ═════════════════════════════════════════════════════════════════════════
   MALFORMED INPUT
   ═════════════════════════════════════════════════════════════════════════ */

test("malformed bodies are refused with a precise code and no stack", async () => {
  const { api, corridor } = await apiWith();

  const bad = await api.handle(post("/v1/editorial", "{not json", CHATGPT_TOKEN));
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "MALFORMED_JSON");
  assert.ok(!/at |\.js:/.test(bad.body.error.message));          // no stack, no paths

  for (const body of ["[]", '"a string"', "42", "null", "true"]) {
    const res = await api.handle(post("/v1/editorial", body, CHATGPT_TOKEN));
    assert.equal(res.body.error.code, "MALFORMED_JSON", body);
  }

  /* An empty body is a command with no instruction id — the corridor's own
     refusal, reached through the transport rather than guessed at by it. */
  const empty = await api.handle(post("/v1/editorial", "", CHATGPT_TOKEN));
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.code, "NO_INSTRUCTION_ID");
  assert.equal(empty.body.error.step, "COMMAND_VALIDATION");

  const oversize = await api.handle(post("/v1/editorial", JSON.stringify({ instruction_id: "x", body: "z".repeat(MAX_BODY_BYTES) }), CHATGPT_TOKEN));
  assert.equal(oversize.status, 413);
  assert.equal(oversize.body.error.code, "BODY_TOO_LARGE");

  assert.equal(corridor.store.all().length, 0);
});

test("a command with no instruction id is refused — replay protection is not optional", async () => {
  const { api } = await apiWith();
  const { instruction_id, ...noId } = chatgptDraft();
  const res = await api.handle(post("/v1/editorial", noId, CHATGPT_TOKEN));
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "NO_INSTRUCTION_ID");
  assert.match(res.body.error.message, /instruction id/);
});

/* ═════════════════════════════════════════════════════════════════════════
   IDEMPOTENCY / REPLAY
   ═════════════════════════════════════════════════════════════════════════ */

test("a duplicate request creates no duplicate record", async () => {
  const { api, corridor } = await apiWith();
  const request = post("/v1/editorial", chatgptDraft(), CHATGPT_TOKEN);

  const first = await api.handle(request);
  const second = await api.handle(request);
  const third = await api.handle(request);

  assert.equal(first.status, 200);
  assert.equal(first.body.replay, false);
  assert.equal(second.status, 200);
  assert.equal(second.body.replay, true);
  assert.equal(third.body.replay, true);
  assert.equal(second.body.record.id, first.body.record.id);
  assert.equal(second.body.record.version, 1);
  assert.equal(corridor.store.all().length, 1);
});

test("an Idempotency-Key that disagrees with the body is refused", async () => {
  const { api, corridor } = await apiWith();
  const body = chatgptDraft();

  const mismatch = await api.handle(post("/v1/editorial", body, CHATGPT_TOKEN, { "idempotency-key": "a-different-key" }));
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.error.code, "IDEMPOTENCY_KEY_MISMATCH");
  assert.equal(corridor.store.all().length, 0);

  const agreeing = await api.handle(post("/v1/editorial", body, CHATGPT_TOKEN, { "idempotency-key": body.instruction_id }));
  assert.equal(agreeing.status, 200);
});

/* ═════════════════════════════════════════════════════════════════════════
   PREPARE AND PREVIEW — what Phase 1 must actually do
   ═════════════════════════════════════════════════════════════════════════ */

test("PREPARE works for both clients and produces a draft that is not live", async () => {
  const { api } = await apiWith();

  for (const [token, body, expectClient, expectIdentity] of [
    [CHATGPT_TOKEN, chatgptDraft(), "CLIENT_CHATGPT", "vibraflowmedia"],
    [CLAUDE_TOKEN, claudeDraft(), "CLIENT_CLAUDE", "lumenschoolacademy"],
  ]) {
    const res = await api.handle(post("/v1/editorial", body, token));
    assert.equal(res.status, 200);
    assert.equal(res.body.client, expectClient);
    assert.equal(res.body.action, "create_draft");
    assert.equal(res.body.intent, "PREPARE");
    assert.equal(res.body.state, "DRAFT");
    assert.equal(res.body.isLive, false);
    assert.equal(res.body.record.identity, expectIdentity);
    assert.ok(res.body.audit.length > 0);
  }
});

test("an ambiguous instruction becomes a draft and says it is not confident", async () => {
  const { api } = await apiWith();
  const { operation, ...noOp } = chatgptDraft();
  const res = await api.handle(post("/v1/editorial", { ...noOp, user_message: "handle this one for me" }, CHATGPT_TOKEN));
  assert.equal(res.status, 200);
  assert.equal(res.body.intent, "PREPARE");
  assert.equal(res.body.confident, false);
  assert.equal(res.body.isLive, false);
});

test("PREVIEW works remotely and never masquerades as live", async () => {
  const { api, corridor } = await apiWith();
  const draft = await api.handle(post("/v1/editorial", claudeDraft({
    editorial: { translations: { fr: { title: "Ce qu'un prix dit vraiment", summary: "Une leçon.", body: "Un prix est une phrase que votre entreprise prononce avant vous." } } },
  }), CLAUDE_TOKEN));
  const recordId = draft.body.record.id;

  const pv = await api.handle(post("/v1/editorial", { intent: "PREVIEW", instructionId: iid("pv"), recordId }, CLAUDE_TOKEN));
  assert.equal(pv.status, 200);
  assert.equal(pv.body.action, "get_preview");
  assert.equal(pv.body.preview.preview, true);
  assert.equal(pv.body.preview.isLive, false);
  assert.equal(pv.body.isLive, false);
  assert.deepEqual(pv.body.preview.languages.sort(), ["en", "fr"]);
  assert.equal(pv.body.preview.renderings.fr.title, "Ce qu'un prix dit vraiment");

  /* The preview changed nothing and published nothing. */
  assert.equal(corridor.store.get(recordId).status, "DRAFT");
  assert.equal(corridor.feed().records.length, 0);
});

test("the client view withholds governance data but echoes the content", async () => {
  const { api } = await apiWith();
  const res = await api.handle(post("/v1/editorial", chatgptDraft({
    hero_media: { kind: "HERO", src: "https://sentinelfortune.com/a.jpg", source: "APPROVED_PUBLIC", altText: "Light", rights: { licence: "CC0-1.0", approved: true } },
  }), CHATGPT_TOKEN));

  const record = res.body.record;
  assert.equal(record.title, "The Discipline of an Unhurried Morning");   // echoed
  assert.equal("audit" in record, false);
  assert.equal("revisionHistory" in record, false);
  assert.equal("rights" in record, false);
  /* Media rights are reduced to whether they cleared. */
  assert.equal(record.heroMedia.rightsCleared, true);
  assert.equal("rights" in record.heroMedia, false);
  assert.deepEqual(record.versions, []);
});

/* ═════════════════════════════════════════════════════════════════════════
   FORBIDDEN COMMERCIAL ACTIONS
   ═════════════════════════════════════════════════════════════════════════ */

test("a forbidden commercial action is rejected through the transport", async () => {
  const { api, corridor } = await apiWith();

  /* A checkout destination is refused at EDITORIAL_VALIDATION. */
  const checkout = await api.handle(post("/v1/editorial", claudeDraft({
    editorial: { cta: { type: "VIEW_PRODUCT", destination: "https://checkout.stripe.com/pay/abc" } },
  }), CLAUDE_TOKEN));
  assert.equal(checkout.status, 400);
  assert.equal(checkout.body.error.code, "INVALID_RECORD");
  assert.equal(checkout.body.error.step, "EDITORIAL_VALIDATION");
  assert.match(checkout.body.error.message, /checkout/);

  /* A price cannot even be carried: the adapter has no field for it, so it is
     dropped before the corridor, and nothing priced is ever stored. */
  const priced = await api.handle(post("/v1/editorial", { ...chatgptDraft(), price: 4900, compareAtPrice: 9900, checkoutUrl: "https://checkout.stripe.com/x", pricingTier: "PAID" }, CHATGPT_TOKEN));
  assert.equal(priced.status, 200);
  assert.equal(priced.body.record.price, undefined);
  assert.equal(priced.body.record.pricingTier, undefined);
  assert.equal(priced.body.record.checkoutUrl, undefined);
  const stored = corridor.store.get(priced.body.record.id);
  assert.equal(stored.price, undefined);
  assert.equal(stored.checkoutUrl, undefined);

  /* Scraped media is refused by name, at MEDIA_RIGHTS. */
  const scraped = await api.handle(post("/v1/editorial", chatgptDraft({
    hero_media: { kind: "HERO", src: "https://benchmark.example/hero.jpg", source: "SCRAPED", altText: "taken" },
  }), CHATGPT_TOKEN));
  assert.equal(scraped.body.error.code, "MEDIA_REFUSED");
  assert.equal(scraped.body.error.step, "MEDIA_RIGHTS");

  /* The wrong house refuses rather than redirecting. */
  const wrongHouse = await api.handle(post("/v1/editorial", chatgptDraft({ content_type: "TUTORIAL" }), CHATGPT_TOKEN));
  assert.equal(wrongHouse.body.error.code, "BRANCH_REJECTS_TYPE");
  assert.equal(wrongHouse.body.error.step, "IDENTITY_VALIDATION");
  assert.match(wrongHouse.body.error.message, /VibraFlow Media does not publish TUTORIAL/);
});

/* ═════════════════════════════════════════════════════════════════════════
   PUBLICATION AUTHORITY
   ═════════════════════════════════════════════════════════════════════════ */

test("TEST_PREVIEW refuses publication at the edge, before the corridor", async () => {
  const { api, corridor } = await apiWith({ SFL_CORRIDOR_MODE: "TEST_PREVIEW" });
  const draft = await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN));
  const recordId = draft.body.record.id;

  /* Even WITH an Owner approval in place, TEST_PREVIEW will not publish. */
  const approved = await api.handle(post("/v1/owner/approve", { recordId }, OWNER_TOKEN));
  assert.equal(approved.status, 200);
  assert.equal(approved.body.approval.approved, true);

  for (const body of [
    { intent: "PUBLISH", instructionId: iid("p1"), recordId },
    { instructionId: iid("p2"), recordId, ownerUtterance: "publish it now" },
  ]) {
    const res = await api.handle(post("/v1/editorial", body, CLAUDE_TOKEN));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "PUBLICATION_DISABLED");
  }
  assert.equal(corridor.feed().records.length, 0);
  assert.equal(corridor.store.get(recordId).status, "APPROVED");   // approved, not public
});

test("in LIVE mode publication is STILL Owner-gated — the mode does not relax it", async () => {
  const { api, corridor } = await apiWith({ SFL_CORRIDOR_MODE: "LIVE" });
  const draft = await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN));
  const recordId = draft.body.record.id;

  const unapproved = await api.handle(post("/v1/editorial", { intent: "PUBLISH", instructionId: iid("u"), recordId }, CLAUDE_TOKEN));
  assert.equal(unapproved.status, 403);
  assert.equal(unapproved.body.error.code, "OWNER_APPROVAL_REQUIRED");
  assert.equal(unapproved.body.error.step, "OWNER_AUTHORITY");
  assert.equal(corridor.feed().records.length, 0);

  /* With the Owner's approval, recorded through the Owner's own credential. */
  await api.handle(post("/v1/owner/approve", { recordId }, OWNER_TOKEN));
  const published = await api.handle(post("/v1/editorial", { intent: "PUBLISH", instructionId: iid("p"), recordId }, CLAUDE_TOKEN));
  assert.equal(published.status, 200);
  assert.equal(published.body.state, "PUBLISHED");
  assert.equal(published.body.isLive, true);
  assert.equal(corridor.feed().records.length, 1);

  /* The approval was spent. */
  const again = await api.handle(post("/v1/editorial", { intent: "PUBLISH", instructionId: iid("p2"), recordId }, CLAUDE_TOKEN));
  assert.equal(again.body.error.code, "OWNER_APPROVAL_REQUIRED");
});

test("an approval goes stale if the client edits after it was granted", async () => {
  const { api, corridor } = await apiWith({ SFL_CORRIDOR_MODE: "LIVE" });
  const draft = await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN));
  const recordId = draft.body.record.id;
  await api.handle(post("/v1/owner/approve", { recordId }, OWNER_TOKEN));

  const edited = await api.handle(post("/v1/editorial", {
    intent: "UPDATE", instructionId: iid("swap"), recordId,
    editorial: { body: "Text the Owner never read, swapped in after approval." },
  }, CLAUDE_TOKEN));
  assert.equal(edited.body.record.version, 2);

  const stale = await api.handle(post("/v1/editorial", { intent: "PUBLISH", instructionId: iid("s"), recordId }, CLAUDE_TOKEN));
  assert.equal(stale.status, 403);
  assert.equal(stale.body.error.code, "APPROVAL_STALE");
  assert.equal(corridor.feed().records.length, 0);
});

test("withdrawal needs its own Owner authorization, which cannot publish", async () => {
  const { api, corridor } = await apiWith({ SFL_CORRIDOR_MODE: "LIVE" });
  const draft = await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN));
  const recordId = draft.body.record.id;
  await api.handle(post("/v1/owner/approve", { recordId }, OWNER_TOKEN));
  await api.handle(post("/v1/editorial", { intent: "PUBLISH", instructionId: iid("p"), recordId }, CLAUDE_TOKEN));
  assert.equal(corridor.feed().records.length, 1);

  const unauthorized = await api.handle(post("/v1/editorial", { intent: "UNPUBLISH", instructionId: iid("u0"), recordId }, CLAUDE_TOKEN));
  assert.equal(unauthorized.body.error.code, "OWNER_APPROVAL_REQUIRED");

  const authorized = await api.handle(post("/v1/owner/withdrawal", { recordId, action: "unpublish" }, OWNER_TOKEN));
  assert.equal(authorized.status, 200);
  /* A withdrawal authorization cannot be spent on publishing. */
  assert.equal(authorized.body.approval.action, "unpublish");

  const withdrawn = await api.handle(post("/v1/editorial", { intent: "UNPUBLISH", instructionId: iid("u1"), recordId }, CLAUDE_TOKEN));
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.body.state, "UNPUBLISHED");
  assert.equal(corridor.feed().records.length, 0);
  /* Nothing was deleted. */
  assert.equal(corridor.store.get(recordId).title, draft.body.record.title);
});

/* ═════════════════════════════════════════════════════════════════════════
   RATE LIMITING
   ═════════════════════════════════════════════════════════════════════════ */

test("a client is rate limited with a Retry-After the caller can honour", async () => {
  const { clientIdentity } = await import("../../corridor/core/authority.js");
  const corridor = createCorridor({ clients: { CLIENT_CLAUDE: clientIdentity("CLIENT_CLAUDE", { rateLimitPerHour: 3 }) } });
  const { api } = await apiWith({}, { corridor });

  for (let i = 0; i < 3; i++) {
    assert.equal((await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN))).status, 200, `call ${i}`);
  }
  const over = await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN));
  assert.equal(over.status, 429);
  assert.equal(over.body.error.code, "RATE_LIMITED");
  assert.equal(over.body.error.retryable, true);
  assert.ok(Number(over.headers["Retry-After"]) > 0);
});

/* ═════════════════════════════════════════════════════════════════════════
   OPTIONAL REQUEST SIGNING
   ═════════════════════════════════════════════════════════════════════════ */

test("when a signing secret is configured, every request must be signed", async () => {
  const SECRET = "test-signing-secret";
  const { api } = await apiWith({ SFL_CORRIDOR_SIGNING_SECRET: SECRET });
  const body = JSON.stringify(claudeDraft());

  const unsigned = await api.handle(post("/v1/editorial", body, CLAUDE_TOKEN));
  assert.equal(unsigned.status, 401);
  assert.equal(unsigned.body.error.code, "SIGNATURE_REQUIRED");

  const timestamp = String(Date.now());
  const material = `${timestamp}.POST./v1/editorial.${await sha256Hex(body)}`;
  const signature = await hmacHex(SECRET, material);

  const wrongSig = await api.handle(post("/v1/editorial", body, CLAUDE_TOKEN, { "x-sfl-timestamp": timestamp, "x-sfl-signature": await hmacHex("wrong-secret", material) }));
  assert.equal(wrongSig.body.error.code, "BAD_SIGNATURE");

  const stale = await api.handle(post("/v1/editorial", body, CLAUDE_TOKEN, { "x-sfl-timestamp": String(Date.now() - 600_000), "x-sfl-signature": signature }));
  assert.equal(stale.body.error.code, "STALE_TIMESTAMP");

  const signed = await api.handle(post("/v1/editorial", body, CLAUDE_TOKEN, { "x-sfl-timestamp": timestamp, "x-sfl-signature": signature }));
  assert.equal(signed.status, 200);

  /* A signature over a DIFFERENT body does not verify — so a captured
     signature cannot be reused to carry new content. */
  const swapped = await api.handle(post("/v1/editorial", JSON.stringify(claudeDraft()), CLAUDE_TOKEN, { "x-sfl-timestamp": timestamp, "x-sfl-signature": signature }));
  assert.equal(swapped.body.error.code, "BAD_SIGNATURE");
});

test("with no signing secret, signing is simply absent rather than pretended", async () => {
  const config = readAuthConfig(await envWith());
  assert.equal(config.signingSecret, null);
  const { api } = await apiWith();
  assert.equal((await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN))).status, 200);
});

/* ═════════════════════════════════════════════════════════════════════════
   NO SECRET ANYWHERE
   ═════════════════════════════════════════════════════════════════════════ */

test("no credential value appears in any response or any log line", async () => {
  const log = captureLog();
  const { api, corridor } = await apiWith({ SFL_CORRIDOR_SIGNING_SECRET: "test-signing-secret" }, { log });

  const responses = [];
  responses.push(await api.handle(get("/v1/health")));
  responses.push(await api.handle(get("/v1/contract")));
  responses.push(await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN)));
  responses.push(await api.handle(post("/v1/editorial", chatgptDraft(), "sfl_wrong_token")));
  responses.push(await api.handle(post("/v1/editorial", claudeDraft(), CLAUDE_TOKEN, { "x-sfl-timestamp": "1", "x-sfl-signature": "00" })));
  responses.push(await api.handle(get("/v1/owner/audit", OWNER_TOKEN)));
  responses.push(await api.handle(get("/v1/owner/records", OWNER_TOKEN)));

  const everything = JSON.stringify(responses) + log.lines.join("\n") + JSON.stringify(corridor.store.snapshot());
  for (const secret of [CHATGPT_TOKEN, CLAUDE_TOKEN, OWNER_TOKEN, "test-signing-secret"]) {
    assert.ok(!everything.includes(secret), `a response or log leaked ${secret}`);
  }
  /* Not even the digests are echoed. */
  for (const digest of Object.values(digests)) {
    assert.ok(!everything.includes(digest), "a response or log leaked a credential digest");
  }
});

test("the digest comparison is constant-time and length-safe", () => {
  assert.equal(timingSafeEqualHex("abc", "abc"), true);
  assert.equal(timingSafeEqualHex("abc", "abd"), false);
  assert.equal(timingSafeEqualHex("abc", "abcd"), false);
  assert.equal(timingSafeEqualHex("abc", null), false);
  assert.equal(timingSafeEqualHex(undefined, undefined), false);
});

/* ═════════════════════════════════════════════════════════════════════════
   NO DUPLICATED LOGIC
   ═════════════════════════════════════════════════════════════════════════ */

test("the transport reimplements no corridor rule", async () => {
  const { readFile } = await import("node:fs/promises");
  const files = ["core/http.js", "core/auth.js", "core/project.js", "core/errors.js", "core/bridge.js", "runtime/worker.js", "runtime/store-kv.js"];
  const sources = await Promise.all(files.map((f) => readFile(new URL(`../${f}`, import.meta.url), "utf8")));
  const all = sources.join("\n");

  /* None of the corridor's governing vocabulary is redefined in the
     transport. If any of these appears here as a definition, the rule now
     exists in two places and they will drift. */
  for (const forbidden of [
    "BRANCHES =", "CONTENT_TYPES =", "PRESENTATION =", "CTA_MAP =", "TRANSITIONS =",
    "function validate(", "function normalize(", "function canPublish(", "function isPublic(",
    "function resolveIntent(", "function toPublicRecord(", "function buildFeed(",
    "pricingTier:", "assertNoCommercial",
  ]) {
    assert.ok(!all.includes(forbidden), `the transport must not define ${forbidden}`);
  }

  /* And it does call the corridor. */
  assert.ok(all.includes("corridor/actions.js"));
  assert.ok(all.includes("intentToAction"));
});
