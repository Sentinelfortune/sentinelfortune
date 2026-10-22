/* SFL EDITORIAL TRANSPORT — Durable Object persistence tests.
 *
 * These test the LIVE-readiness guarantees of runtime/store-do.js against a
 * local model of Durable Object storage:
 *   - state survives across object instances (persistence)
 *   - concurrent commands lose nothing (serialization)
 *   - a failed write commits nothing and reports failure (atomicity)
 *   - an approval and the state it governs are stored together
 *
 * The model below is deliberately strict: a transaction stages its writes and
 * applies them only if the callback resolves, exactly like the real API.
 * It is a LOCAL SIMULATION. It proves the logic of this file, not the
 * Cloudflare runtime; remote validation of the DO Worker is a separate step
 * (transport/LIVE-PERSISTENCE.md §4).
 *
 *   node --test transport/tests/store-do.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { handleWithLedger, diffSnapshots, commitDiff, readSnapshot, EditorialLedger } from "../runtime/store-do.js";
import { sha256Hex } from "../core/auth.js";

/* ── a strict local model of Durable Object storage ───────────────────── */

function memoryStorage({ failTransactions = false } = {}) {
  const data = new Map();
  const clone = (v) => structuredClone(v);
  const storage = {
    data,
    commits: 0,
    async list({ prefix = "" } = {}) {
      const out = new Map();
      for (const k of [...data.keys()].sort()) if (k.startsWith(prefix)) out.set(k, clone(data.get(k)));
      return out;
    },
    async get(key) { return data.has(key) ? clone(data.get(key)) : undefined; },
    async transaction(fn) {
      const staged = new Map();
      const DELETE = Symbol("delete");
      await fn({ put: async (k, v) => { staged.set(k, clone(v)); }, delete: async (k) => { staged.set(k, DELETE); } });
      if (failTransactions) throw new Error("simulated storage failure");
      for (const [k, v] of staged) { if (v === DELETE) data.delete(k); else data.set(k, v); }   // all-or-nothing
      storage.commits += 1;
    },
  };
  return storage;
}

/** blockConcurrencyWhile, modelled as one strict FIFO queue. */
function serialGate() {
  let tail = Promise.resolve();
  return (fn) => {
    const run = tail.then(fn);
    tail = run.catch(() => {});
    return run;
  };
}

/* ── fixtures ──────────────────────────────────────────────────────────── */

const TOKENS = { chatgpt: "sfl_do_test_chatgpt", claude: "sfl_do_test_claude", owner: "sfl_do_test_owner" };
let envCache;
async function env(over = {}) {
  envCache = envCache || {
    SFL_CORRIDOR_CHATGPT_TOKEN_SHA256: await sha256Hex(TOKENS.chatgpt),
    SFL_CORRIDOR_CLAUDE_TOKEN_SHA256: await sha256Hex(TOKENS.claude),
    SFL_CORRIDOR_OWNER_TOKEN_SHA256: await sha256Hex(TOKENS.owner),
  };
  return { ...envCache, SFL_CORRIDOR_MODE: "TEST_PREVIEW", ...over };
}

const silent = { error() {}, warn() {}, log() {}, info() {} };
let seq = 0;
const post = (path, body, token) => ({
  method: "POST", path,
  headers: { authorization: `Bearer ${token}` },
  rawBody: JSON.stringify(body),
});
const draft = (n = ++seq) => ({
  operation: "PREPARE",
  instruction_id: `do_${n}`,
  branch: "VIBRAFLOW_MEDIA",
  content_type: "TEACHING",
  title: `A Ledger Teaching ${n}`,
  slug: `ledger-teaching-${n}`,
  summary: "A teaching used to prove the ledger.",
  body: "There is a kind of strength that does not announce itself, and this teaching sits with it.",
  language: "en",
});

/** Every record and instruction-ledger entry, serialized — the editorial
 *  state, excluding the rate-limit window. */
const editorialState = (storage) => JSON.stringify([...storage.data.entries()]
  .filter(([k]) => k.startsWith("rec:") || k.startsWith("ins:") || k.startsWith("apr:") || k.startsWith("oau:")));

async function run(storage, request, envOver) {
  return handleWithLedger({ storage, env: await env(envOver), request, log: silent });
}

/* ═════════════════════════════════════════════════════════════════════════ */

test("a draft persists across object instances", async () => {
  const storage = memoryStorage();
  const created = await run(storage, post("/v1/editorial", draft(), TOKENS.chatgpt));
  assert.equal(created.status, 200);
  const id = created.body.record.id;

  /* A brand-new handler with nothing in memory reads it back from storage. */
  const snap = await readSnapshot(storage);
  assert.ok(snap.records.some((r) => r.id === id && r.status === "DRAFT"));
  assert.equal(storage.commits, 1);
});

test("a replayed instruction writes nothing and returns the original outcome", async () => {
  const storage = memoryStorage();
  const body = draft();
  const first = await run(storage, post("/v1/editorial", body, TOKENS.chatgpt));
  const before = editorialState(storage);
  const again = await run(storage, post("/v1/editorial", body, TOKENS.chatgpt));
  assert.equal(again.status, 200);
  assert.equal(again.body.replay, true);
  assert.equal(again.body.record.id, first.body.record.id);
  assert.equal(editorialState(storage), before, "a replay must not change any record or ledger entry");
});

test("a refusal and a read change no editorial state (only the rate window counts them)", async () => {
  const storage = memoryStorage();
  await run(storage, post("/v1/editorial", { ...draft(), content_type: "NOT_A_TYPE" }, TOKENS.chatgpt));
  await run(storage, { method: "GET", path: "/v1/health", headers: {}, rawBody: "" });
  assert.equal(editorialState(storage), "[]");
  assert.ok([...storage.data.keys()].every((k) => k.startsWith("rl:") || k.startsWith("meta:")));
});

test("concurrent commands through the serial gate lose nothing", async () => {
  const storage = memoryStorage();
  const gate = serialGate();
  const e = await env();
  const N = 25;
  const results = await Promise.all(Array.from({ length: N }, () =>
    gate(() => handleWithLedger({ storage, env: e, request: post("/v1/editorial", draft(), TOKENS.chatgpt), log: silent }))));
  assert.ok(results.every((r) => r.status === 200));
  const snap = await readSnapshot(storage);
  assert.equal(snap.records.length, N, "every concurrent draft must be stored");
});

test("WITHOUT the gate the same load loses writes — the failure the gate removes", async () => {
  /* Control experiment: this documents why blockConcurrencyWhile is not
     optional. Interleaved read→write cycles drop records. Diffing protects
     against overwriting OTHER keys, so to show the hazard we race two
     commands on the SAME record (draft, then a competing update). */
  const storage = memoryStorage();
  const e = await env();
  const base = draft();
  await handleWithLedger({ storage, env: e, request: post("/v1/editorial", base, TOKENS.chatgpt), log: silent });
  const recordId = (await readSnapshot(storage)).records[0].id;

  const update = (n) => post("/v1/editorial", {
    operation: "UPDATE", instruction_id: `do_upd_${n}`, record_id: recordId,
    summary: `revision ${n}`,
  }, TOKENS.chatgpt);

  const raced = await Promise.all([1, 2].map((n) => handleWithLedger({ storage, env: e, request: update(n), log: silent })));
  const gated = serialGate();
  const storage2 = memoryStorage();
  await handleWithLedger({ storage: storage2, env: e, request: post("/v1/editorial", base, TOKENS.chatgpt), log: silent });
  await Promise.all([3, 4].map((n) => gated(() => handleWithLedger({ storage: storage2, env: e, request: update(n), log: silent }))));

  const ungatedVersion = (await readSnapshot(storage)).records[0].version;
  const gatedVersion = (await readSnapshot(storage2)).records[0].version;
  assert.ok(raced.every((r) => r.status === 200), "both raced updates report success");
  assert.equal(gatedVersion, ungatedVersion + 1, "ungated: one of two acknowledged updates was lost; gated: both kept");
});

test("a failed transaction commits nothing and reports a retryable failure", async () => {
  const storage = memoryStorage({ failTransactions: true });
  const res = await run(storage, post("/v1/editorial", draft(), TOKENS.chatgpt));
  assert.equal(res.status, 500);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error.retryable, true);
  assert.equal(storage.data.size, 0, "nothing may be partially stored");
  assert.ok(!JSON.stringify(res.body).includes("simulated storage failure"), "storage detail must not leak");
});

test("an Owner approval is stored atomically with the record it governs", async () => {
  const storage = memoryStorage();
  const created = await run(storage, post("/v1/editorial", draft(), TOKENS.chatgpt));
  const recordId = created.body.record.id;
  const before = storage.commits;
  const approved = await run(storage, post("/v1/owner/approve", { recordId }, TOKENS.owner));
  assert.equal(approved.status, 200);
  assert.equal(storage.commits, before + 1, "approval and state change land in ONE transaction");
  const rec = (await readSnapshot(storage)).records.find((r) => r.id === recordId);
  assert.equal(rec.status, "APPROVED");
});

test("TEST_PREVIEW still refuses publication with the ledger in place", async () => {
  const storage = memoryStorage();
  const created = await run(storage, post("/v1/editorial", draft(), TOKENS.chatgpt));
  const recordId = created.body.record.id;
  await run(storage, post("/v1/owner/approve", { recordId }, TOKENS.owner));
  const pub = await run(storage, post("/v1/editorial", { operation: "PUBLISH", instruction_id: `do_pub_${++seq}`, record_id: recordId }, TOKENS.chatgpt));
  assert.equal(pub.status, 403);
  assert.equal(pub.body.error.code, "PUBLICATION_DISABLED");
  const rec = (await readSnapshot(storage)).records.find((r) => r.id === recordId);
  assert.notEqual(rec.status, "PUBLISHED");
});

test("persistence refuses a state that would lose stored entries", async () => {
  const storage = memoryStorage();
  const before = { records: [{ id: "a", v: 1 }], instructions: [] };
  const after = { records: [], instructions: [] };
  await assert.rejects(() => commitDiff(storage, diffSnapshots(before, after)), /would be lost/);
  assert.equal(storage.commits, 0);
});

test("the Durable Object class serializes through blockConcurrencyWhile", async () => {
  const storage = memoryStorage();
  let gateCalls = 0;
  const gate = serialGate();
  const state = { storage, blockConcurrencyWhile: (fn) => { gateCalls += 1; return gate(fn); } };
  const obj = new EditorialLedger(state, await env());
  const res = await obj.fetch(new Request("https://ledger/v1/editorial", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKENS.chatgpt}`, "content-type": "application/json" },
    body: JSON.stringify(draft()),
  }));
  assert.equal(res.status, 200);
  assert.equal(gateCalls, 1);
  assert.equal((await readSnapshot(storage)).records.length, 1);
});

test("an Owner approval survives across requests and is consumed by the act it authorizes", async () => {
  /* Each handleWithLedger call builds a fresh corridor, exactly as the Worker
     does per request. Before approvals lived in the store, this was lost. */
  const storage = memoryStorage();
  const created = await run(storage, post("/v1/editorial", draft(), TOKENS.chatgpt));
  const recordId = created.body.record.id;
  await run(storage, post("/v1/owner/approve", { recordId }, TOKENS.owner));
  assert.ok([...storage.data.keys()].some((k) => k.startsWith("apr:")), "approval persisted");
  assert.ok([...storage.data.keys()].some((k) => k.startsWith("oau:")), "Owner audit persisted");

  const pub = await run(storage, post("/v1/editorial", { operation: "PUBLISH", instruction_id: `do_live_${++seq}`, record_id: recordId }, TOKENS.chatgpt), { SFL_CORRIDOR_MODE: "LIVE" });
  assert.equal(pub.status, 200, JSON.stringify(pub.body.error || {}));
  assert.equal(pub.body.state, "PUBLISHED");
  assert.ok(![...storage.data.keys()].some((k) => k.startsWith("apr:")), "a publication consumes its approval");

  const again = await run(storage, post("/v1/editorial", { operation: "UNPUBLISH", instruction_id: `do_un_${++seq}`, record_id: recordId }, TOKENS.chatgpt), { SFL_CORRIDOR_MODE: "LIVE" });
  assert.equal(again.status, 403, "withdrawal needs its own Owner authorization");
});

test("the rate limit holds across requests", async () => {
  const storage = memoryStorage();
  const e = await env();
  let limited = null;
  for (let i = 0; i < 200 && !limited; i++) {
    const r = await handleWithLedger({ storage, env: e, request: post("/v1/editorial", draft(), TOKENS.chatgpt), log: silent });
    if (r.status === 429) limited = i;
  }
  assert.ok(limited !== null, "a per-request corridor must still hit the hourly ceiling");
});
