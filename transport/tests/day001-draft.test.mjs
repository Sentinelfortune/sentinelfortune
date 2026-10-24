/* VIBRAFLOW MEDIA — LEGACY 365 — DAY 001 — draft-only rehearsal.
 *
 * Exercises the committed draft package through the REAL transport handler
 * and corridor, in TEST_PREVIEW mode, exactly as the remote Worker would run
 * it. LOCAL: it proves the package is valid and governable; it is not a
 * remote PREPARE (that happens once the Worker is deployed).
 *
 *   node --test transport/tests/day001-draft.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createApi } from "../core/http.js";
import { createCorridor } from "../../corridor/actions.js";
import { sha256Hex } from "../core/auth.js";

const PKG = JSON.parse(readFileSync(new URL("../../corridor/editorial/drafts/vibraflow-legacy-365-day-001.draft.json", import.meta.url), "utf8"));
const TOKENS = { chatgpt: "sfl_day001_chatgpt", claude: "sfl_day001_claude", owner: "sfl_day001_owner" };
const silent = { error() {}, warn() {}, log() {}, info() {} };

async function setup() {
  const env = {
    SFL_CORRIDOR_CHATGPT_TOKEN_SHA256: await sha256Hex(TOKENS.chatgpt),
    SFL_CORRIDOR_CLAUDE_TOKEN_SHA256: await sha256Hex(TOKENS.claude),
    SFL_CORRIDOR_OWNER_TOKEN_SHA256: await sha256Hex(TOKENS.owner),
    SFL_CORRIDOR_MODE: "TEST_PREVIEW",
  };
  const corridor = createCorridor();
  return { api: createApi({ env, corridor, log: silent }), corridor };
}
const post = (path, body, token) => ({
  method: "POST", path, headers: { authorization: `Bearer ${token}` }, rawBody: JSON.stringify(body),
});

test("the package is draft-only by declaration", () => {
  assert.equal(PKG.status, "DRAFT_ONLY");
  assert.equal(PKG.governance.publicationAuthorized, false);
  assert.equal(PKG.governance.corridorMode, "TEST_PREVIEW");
  assert.equal(PKG.prepareRequest.operation, "PREPARE");
  for (const k of ["price", "pricing_tier", "checkoutUrl", "checkout_url", "cta"]) {
    assert.equal(k in PKG.prepareRequest, false, `${k} must not be attached`);
  }
});

test("DANI (ChatGPT) can PREPARE Day 001 as a VibraFlow draft that is not live", async () => {
  const { api, corridor } = await setup();
  const res = await api.handle(post("/v1/editorial", PKG.prepareRequest, TOKENS.chatgpt));
  assert.equal(res.status, 200, JSON.stringify(res.body.error || {}));
  assert.equal(res.body.action, "create_draft");
  assert.equal(res.body.state, "DRAFT");
  assert.equal(res.body.isLive, false);
  assert.equal(res.body.record.identity, "vibraflowmedia");
  assert.equal(corridor.feed().records.length, 0);
});

test("Day 001 previews in English (canonical) and French (distinct translation)", async () => {
  const { api, corridor } = await setup();
  const draft = await api.handle(post("/v1/editorial", PKG.prepareRequest, TOKENS.chatgpt));
  const recordId = draft.body.record.id;

  const stored = corridor.store.get(recordId);
  assert.equal(stored.language, "en");
  assert.equal(stored.body, PKG.prepareRequest.body, "English text stored verbatim");
  assert.equal(stored.translations.fr.body, PKG.prepareRequest.translations.fr.body, "French text stored verbatim");
  assert.notEqual(stored.translations.fr.title, stored.title);

  const pv = await api.handle(post("/v1/editorial", { operation: "PREVIEW", instruction_id: "day001-preview-1", record_id: recordId }, TOKENS.chatgpt));
  assert.equal(pv.status, 200);
  assert.equal(pv.body.preview.preview, true);
  assert.equal(pv.body.preview.isLive, false);
  const text = JSON.stringify(pv.body.preview);
  assert.ok(text.includes(PKG.prepareRequest.title), "EN title in preview");
  assert.ok(text.includes(PKG.prepareRequest.translations.fr.title), "FR title in preview");
});

test("Day 001 cannot be published in TEST_PREVIEW, even after Owner approval", async () => {
  const { api, corridor } = await setup();
  const draft = await api.handle(post("/v1/editorial", PKG.prepareRequest, TOKENS.chatgpt));
  const recordId = draft.body.record.id;

  const unapproved = await api.handle(post("/v1/editorial", { operation: "PUBLISH", instruction_id: "day001-pub-0", record_id: recordId }, TOKENS.chatgpt));
  assert.equal(unapproved.status, 403);

  const approved = await api.handle(post("/v1/owner/approve", { recordId }, TOKENS.owner));
  assert.equal(approved.status, 200);
  const pub = await api.handle(post("/v1/editorial", { operation: "PUBLISH", instruction_id: "day001-pub-1", record_id: recordId }, TOKENS.chatgpt));
  assert.equal(pub.status, 403);
  assert.equal(pub.body.error.code, "PUBLICATION_DISABLED");
  assert.equal(corridor.feed().records.length, 0);
});

test("the Day 001 instruction id is idempotent", async () => {
  const { api } = await setup();
  const a = await api.handle(post("/v1/editorial", PKG.prepareRequest, TOKENS.chatgpt));
  const b = await api.handle(post("/v1/editorial", PKG.prepareRequest, TOKENS.chatgpt));
  assert.equal(b.body.replay, true);
  assert.equal(b.body.record.id, a.body.record.id);
  assert.equal(b.body.record.version, a.body.record.version);
});

test("the French translation is complete — one French paragraph per English paragraph", () => {
  const en = PKG.prepareRequest.body.split("\n\n");
  const fr = PKG.prepareRequest.translations.fr.body.split("\n\n");
  assert.equal(fr.length, en.length);
  for (const marker of ["PRIÈRE", "AUDIT LEGACY", "ACTION DU JOUR", "RÉFLEXION MYSTIQUE", "LEGACY ET DROIT", "LEGACY ET FINANCE"]) {
    assert.ok(fr.some((p) => p.startsWith(marker)), `${marker} section present`);
  }
  assert.ok(PKG.prepareRequest.translations.fr.body.includes("ne rend pas cette structure sans importance"));
});

test("Day 001 previewed by the client stays a non-public DRAFT awaiting the Owner", async () => {
  const { api, corridor } = await setup();
  const draft = await api.handle(post("/v1/editorial", PKG.prepareRequest, TOKENS.chatgpt));
  const recordId = draft.body.record.id;
  await api.handle(post("/v1/editorial", { operation: "PREVIEW", instruction_id: "day001-review-1", record_id: recordId }, TOKENS.chatgpt));
  const status = corridor.store.get(recordId).status;
  /* The transport corridor has no client-driven review state: a DRAFT is
     what awaits the Owner's approval. */
  assert.equal(status, "DRAFT");
  assert.notEqual(status, "PUBLISHED");
  assert.equal(corridor.feed().records.length, 0);
});
