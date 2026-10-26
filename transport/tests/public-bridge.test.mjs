/* SFL EDITORIAL — Worker → public corridor bridge, end to end.
 *
 *   Worker (handleWithLedger, DO storage model)
 *     → POST /v1/owner/handoff
 *     → platform/api/corridor.js  (real handler, real D1 schema on node:sqlite)
 *     → Owner approve → publish_approved
 *     → platform/api/feed.js      (real handler)
 *     → platform/engine readEnvelope + selectPublic  (real ingestion gate)
 *
 * One publication authority: the public corridor. The Worker prepares,
 * previews and hands off; it never approves or publishes there, and with the
 * bridge configured it publishes nothing of its own.
 *
 * LOCAL ONLY. The public corridor URL is served in-process by the real
 * handler; D1 is node:sqlite behind the same HTTP shim the platform tests
 * use. Nothing reaches a network.
 *
 *   node --test transport/tests/public-bridge.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

import { handleWithLedger } from "../runtime/store-do.js";
import { sha256Hex } from "../core/auth.js";
import { readBridgeConfig, toPublicDraft } from "../core/bridge.js";

const require = createRequire(import.meta.url);

/* ── the real D1 schema (verbatim from platform/tests/corridor.*.cjs) ──── */

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE editorial_records (
  record_id TEXT PRIMARY KEY,
  identity TEXT NOT NULL CHECK (identity IN ('sentinelfortunerecords','codexworldtv','lumengame','lumenschoolacademy','vibraflowmedia','lightnodesystems','oglegacystore')),
  slug TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, summary TEXT, description TEXT,
  pricing_tier TEXT NOT NULL DEFAULT 'FREE' CHECK (pricing_tier = 'FREE'),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','REVIEW','APPROVED','PUBLISHED','UNPUBLISHED','ARCHIVED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  payload_json TEXT NOT NULL, created_by TEXT NOT NULL, source TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT,
  approval_mode TEXT CHECK (approval_mode IS NULL OR approval_mode IN ('EXPLICIT','STANDING_POLICY')),
  approved_at TEXT, published_at TEXT, unpublished_at TEXT, rollback_of TEXT,
  CHECK (status <> 'PUBLISHED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND published_at IS NOT NULL)),
  UNIQUE (identity, slug));
CREATE TABLE editorial_events (event_id INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT NOT NULL,
  action TEXT NOT NULL, from_status TEXT, to_status TEXT, actor TEXT NOT NULL, adapter TEXT,
  approval_mode TEXT, at TEXT NOT NULL, detail_json TEXT);
CREATE TABLE corridor_idempotency (idem_key TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
  record_id TEXT, response_json TEXT NOT NULL, at TEXT NOT NULL);
`);

/* ── the public corridor's environment ───────────────────────────────── */

const PUBLIC_URL = "https://onecompany.sentinelfortune.com/api/corridor";
const V = { claude: "v-claude-tok", chatgpt: "v-chatgpt-tok", owner: "v-owner-tok", worker: "v-worker-bridge-tok-6f1d" };
Object.assign(process.env, {
  CF_ACCOUNT_ID: "a", CF_D1_DATABASE_ID: "d", CF_D1_WRITE_TOKEN: "W", CF_API_TOKEN: "R",
  CORRIDOR_TOKEN_CLAUDE: V.claude, CORRIDOR_TOKEN_CHATGPT: V.chatgpt,
  CORRIDOR_TOKEN_OWNER: V.owner, CORRIDOR_TOKEN_EDITORIAL_WORKER: V.worker,
});
delete process.env.CORRIDOR_STANDING_POLICY;
delete process.env.SHOP_API_BASE;

const publicCorridor = require("../../platform/api/corridor.js");
const publicFeed = require("../../platform/api/feed.js");
const { readEnvelope } = await import("../../platform/engine/feed.js");
const { selectPublic } = await import("../../platform/engine/core.js");

function mockRes() {
  return { headers: {}, statusCode: 0, body: "", setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
}

/* Every request the Worker sends to the public corridor, for inspection. */
const outbound = [];
let corridorDown = null;   // null | "all" | "submit_review"
/* One D1 statement matching this fails once, as a real D1 can between two
   statements of one request. null = D1 healthy. */
let d1FailOnce = null;

globalThis.fetch = async (url, init = {}) => {
  if (String(url) === PUBLIC_URL) {
    const payload = JSON.parse(init.body);
    outbound.push({ action: payload.action, authorization: init.headers.Authorization });
    if (corridorDown === "all" || corridorDown === payload.action) throw new Error("connect ECONNREFUSED");
    const res = mockRes();
    await publicCorridor({ method: "POST", headers: { authorization: init.headers.Authorization }, body: payload }, res);
    const headers = new Map(Object.entries(res.headers));
    return { status: res.statusCode, ok: res.statusCode < 400, headers: { get: (k) => headers.get(k) ?? null }, json: async () => JSON.parse(res.body) };
  }
  if (!String(url).includes("/d1/database/")) throw new Error(`unexpected network call: ${url}`);
  const { sql, params } = JSON.parse(init.body);
  if (d1FailOnce && d1FailOnce.test(sql)) {
    d1FailOnce = null;
    return { ok: false, status: 503, json: async () => ({ success: false, errors: [{ message: "D1_ERROR: storage temporarily unavailable" }] }) };
  }
  const bound = (params || []).map((v) => (v === null ? null : String(v)));
  const order = [];
  const converted = sql.replace(/\?(\d+)/g, (_, n) => { order.push(Number(n) - 1); return "?"; });
  const args = order.length ? order.map((i) => bound[i]) : bound;
  try {
    const st = db.prepare(converted);
    const returnsRows = /^\s*select/i.test(sql) || /\breturning\b/i.test(sql);
    const results = returnsRows ? st.all(...args) : (st.run(...args), []);
    return { ok: true, json: async () => ({ success: true, result: [{ results }] }) };
  } catch (e) { return { ok: false, status: 400, json: async () => ({ success: false, errors: [{ message: e.message }] }) }; }
};

async function vercel(tok, payload) {
  const res = mockRes();
  await publicCorridor({ method: "POST", headers: { authorization: `Bearer ${tok}` }, body: payload }, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}
async function feedRecords() {
  const res = mockRes();
  await publicFeed({ method: "GET", headers: {} }, res);
  const env = readEnvelope(JSON.parse(res.body));
  assert.ok(env.ok, `the engine accepts the envelope: ${env.problems.join("; ")}`);
  return env.records;
}
const row = (id) => db.prepare("SELECT * FROM editorial_records WHERE record_id=?").get(id);
const rowBySlug = (identity, slug) => db.prepare("SELECT * FROM editorial_records WHERE identity=? AND slug=?").get(identity, slug);
const events = (id) => db.prepare("SELECT action, actor, adapter FROM editorial_events WHERE record_id=? ORDER BY event_id").all(id);

/* ── the Worker, on the Durable Object storage model ─────────────────── */

function memoryStorage() {
  const data = new Map();
  const clone = (v) => structuredClone(v);
  return {
    data,
    async list({ prefix = "" } = {}) {
      const out = new Map();
      for (const k of [...data.keys()].sort()) if (k.startsWith(prefix)) out.set(k, clone(data.get(k)));
      return out;
    },
    async get(key) { return data.has(key) ? clone(data.get(key)) : undefined; },
    async transaction(fn) {
      const staged = new Map();
      await fn({ put: async (k, v) => { staged.set(k, clone(v)); }, delete: async (k) => { staged.set(k, undefined); } });
      for (const [k, v] of staged) { if (v === undefined) data.delete(k); else data.set(k, v); }
    },
  };
}

const W = { claude: "w-claude-tok", chatgpt: "w-chatgpt-tok", owner: "w-owner-tok" };
const baseEnv = {
  SFL_CORRIDOR_CHATGPT_TOKEN_SHA256: await sha256Hex(W.chatgpt),
  SFL_CORRIDOR_CLAUDE_TOKEN_SHA256: await sha256Hex(W.claude),
  SFL_CORRIDOR_OWNER_TOKEN_SHA256: await sha256Hex(W.owner),
  SFL_CORRIDOR_MODE: "TEST_PREVIEW",
  SFL_PUBLIC_CORRIDOR_URL: PUBLIC_URL,
  SFL_PUBLIC_CORRIDOR_TOKEN: V.worker,
};
const silent = { error() {}, warn() {}, log() {}, info() {} };

const storage = memoryStorage();
const worker = (request, over = {}) => handleWithLedger({ storage, env: { ...baseEnv, ...over }, request, log: silent });
const post = (path, body, token) => ({ method: "POST", path, headers: token ? { authorization: `Bearer ${token}` } : {}, rawBody: JSON.stringify(body) });
const get = (path, token) => ({ method: "GET", path, headers: { authorization: `Bearer ${token}` }, rawBody: "" });

let seq = 0;
async function prepared({ branch = "VIBRAFLOW_MEDIA", type = "TEACHING", slug, preview = true, extra = {} } = {}) {
  seq += 1;
  const s = slug || `bridge-piece-${seq}`;
  const made = await worker(post("/v1/editorial", {
    operation: "PREPARE", instruction_id: `bridge_${seq}_prep`,
    branch, content_type: type, title: `Bridge Piece ${seq}`, slug: s,
    summary: "A piece used to prove the hand-off.",
    body: "There is a kind of strength that does not announce itself, and this piece sits with it.",
    language: "en",
    translations: { fr: { title: `Pièce passerelle ${seq}`, summary: "Une pièce de preuve.", body: "Il existe une force qui ne s'annonce pas, et cette pièce demeure avec elle." } },
    ...extra,
  }, W.chatgpt));
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.record.id;
  if (preview) {
    const pv = await worker(post("/v1/editorial", { operation: "PREVIEW", instruction_id: `bridge_${seq}_prev`, record_id: id }, W.chatgpt));
    assert.equal(pv.status, 200, JSON.stringify(pv.body));
  }
  return { id, slug: s };
}
const handoff = (recordId, token = W.owner, over) => worker(post("/v1/owner/handoff", { recordId }, token), over);
const workerRecord = (id) => storage.data.get(`rec:${id}`);

/* ═════════════════════════════════════════════════════════════════════════
   1. WORKER → PUBLIC FEED
   ═════════════════════════════════════════════════════════════════════════ */

test("1. a previewed Worker record reaches the public feed only through Owner approval in the public corridor", async () => {
  const { id, slug } = await prepared();
  const before = await feedRecords();

  const h = await handoff(id);
  assert.equal(h.status, 200, JSON.stringify(h.body));
  assert.equal(h.body.handoff.publicStatus, "REVIEW");
  assert.equal(h.body.handoff.next, "OWNER_APPROVAL_IN_PUBLIC_CORRIDOR");
  const pid = h.body.handoff.publicRecordId;

  const r = row(pid);
  assert.equal(r.identity, "vibraflowmedia");
  assert.equal(r.slug, slug);
  assert.equal(r.type, "TEACHING");
  assert.equal(r.status, "REVIEW");
  assert.equal(r.created_by, "editorial-worker", "provenance names the Worker bridge");
  assert.equal(r.pricing_tier, "FREE");
  assert.deepEqual(events(pid).map((e) => e.action), ["create_draft", "submit_review"]);

  assert.equal((await feedRecords()).length, before.length, "REVIEW is not public");

  const ap = await vercel(V.owner, { action: "approve", record_id: pid });
  assert.equal(ap.status, 200);
  assert.equal((await feedRecords()).length, before.length, "APPROVED is not public either");
  const pub = await vercel(V.claude, { action: "publish_approved", record_id: pid });
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  assert.equal(pub.body.approval_mode, "EXPLICIT");

  const fed = (await feedRecords()).find((x) => x.id === pid);
  assert.ok(fed, "the published record is in /api/feed");
  assert.equal(fed.identity, "vibraflowmedia");
  assert.equal(fed.type, "TEACHING");
  assert.equal(fed.metadata.translations.fr.title, `Pièce passerelle ${seq}`, "French travels with the record");
  assert.ok(selectPublic(await feedRecords(), "vibraflowmedia").accepted.some((x) => x.id === pid), "the engine's own gate selects it");
});

test("1b. the public feed carries the handed-off work and nothing about how it was handed off", async () => {
  const { id } = await prepared();
  const pid = (await handoff(id)).body.handoff.publicRecordId;
  assert.equal((await vercel(V.owner, { action: "approve", record_id: pid })).status, 200);
  assert.equal((await vercel(V.claude, { action: "publish_approved", record_id: pid })).status, 200);

  const res = mockRes();
  await publicFeed({ method: "GET", headers: {} }, res);
  const text = res.body;
  assert.ok(JSON.parse(text).records.some((x) => x.id === pid));
  for (const internal of [
    "editorial-worker", "worker-handoff", id, V.worker, W.owner, PUBLIC_URL,
    "CONVERSATION_ORIGINATED", "corridorVersion", "EDITORIAL_CORRIDOR", "d1_database", "House of Assets", "HOUSE_OF_ASSETS",
  ]) {
    assert.ok(!text.includes(internal), `the public feed leaks ${internal === V.worker || internal === W.owner ? "a credential" : internal}`);
  }
  assert.ok(!JSON.stringify(res.headers).includes("D1"), "headers name no storage");
  assert.equal(res.headers["X-SF-Feed-Withheld-Count"], "0", "nothing legitimate was withheld");
});

/* ═════════════════════════════════════════════════════════════════════════
   2. AUTH
   ═════════════════════════════════════════════════════════════════════════ */

test("2a. only the Owner can trigger a hand-off", async () => {
  const { id } = await prepared();
  const asClient = await handoff(id, W.chatgpt);
  assert.equal(asClient.status, 403);
  assert.equal(asClient.body.error.code, "OWNER_ROUTE");
  const anon = await worker(post("/v1/owner/handoff", { recordId: id }));
  assert.equal(anon.status, 401);
  assert.equal(anon.body.error.message, "Request refused.", "no detail before authentication");
  assert.equal(rowBySlug("vibraflowmedia", workerRecord(id).slug), undefined, "nothing reached the public corridor");
});

test("2b. the Worker's public-corridor credential can hand in and read, nothing else", async () => {
  const { id } = await prepared();
  const pid = (await handoff(id)).body.handoff.publicRecordId;
  const ap = await vercel(V.worker, { action: "approve", record_id: pid });
  assert.equal(ap.status, 403);
  assert.equal(ap.body.error, "OWNER_CREDENTIAL_REQUIRED");
  for (const action of ["publish_approved", "unpublish", "archive", "update_draft", "list_recent"]) {
    const r = await vercel(V.worker, { action, record_id: pid, title: "x" });
    assert.equal(r.status, 403, action);
    assert.equal(r.body.error, "BRIDGE_ACTION_NOT_PERMITTED", action);
  }
  assert.equal(row(pid).status, "REVIEW");
  assert.equal(row(pid).version, 1);
  const read = await vercel(V.worker, { action: "get_record", record_id: pid });
  assert.equal(read.status, 200);
});

test("2c. a Worker credential the public corridor does not know creates nothing", async () => {
  const { id, slug } = await prepared();
  const h = await handoff(id, W.owner, { SFL_PUBLIC_CORRIDOR_TOKEN: "not-the-registered-token" });
  assert.equal(h.status, 409);
  assert.equal(h.body.error.code, "PUBLIC_CORRIDOR_REFUSED");
  assert.equal(h.body.error.upstream.status, 401);
  assert.equal(rowBySlug("vibraflowmedia", slug), undefined);
});

test("2d. no credential appears in any Worker response, audit or stored state", async () => {
  const { id } = await prepared();
  const h = await handoff(id);
  const audit = await worker(get("/v1/owner/audit", W.owner));
  const health = await worker({ method: "GET", path: "/v1/health", headers: {}, rawBody: "" });
  const contract = await worker({ method: "GET", path: "/v1/contract", headers: {}, rawBody: "" });
  const everything = JSON.stringify([h.body, audit.body, health.body, contract.body, [...storage.data.entries()]]);
  for (const secret of [V.worker, ...Object.values(W), PUBLIC_URL]) {
    assert.ok(!everything.includes(secret), `leaked: ${secret === PUBLIC_URL ? "the bridge URL" : "a credential"}`);
  }
  assert.ok(audit.body.audit.some((e) => e.action === "handoff" && e.outcome === "HANDOFF:REVIEW"), "the hand-off is in the Owner audit");
});

/* ═════════════════════════════════════════════════════════════════════════
   3. IDEMPOTENCY
   ═════════════════════════════════════════════════════════════════════════ */

test("3a. repeating a hand-off replays it: one record, one create, one review", async () => {
  const { id } = await prepared();
  const first = await handoff(id);
  const again = await handoff(id);
  assert.equal(again.status, 200);
  assert.equal(again.body.handoff.replay, true);
  assert.equal(again.body.handoff.publicRecordId, first.body.handoff.publicRecordId);
  const pid = first.body.handoff.publicRecordId;
  assert.deepEqual(events(pid).map((e) => e.action), ["create_draft", "submit_review"]);
  assert.equal(row(pid).version, 1);
});

test("3b. a hand-off interrupted after create completes on retry without duplicating", async () => {
  const { id, slug } = await prepared();
  corridorDown = "submit_review";
  const broken = await handoff(id);
  corridorDown = null;
  assert.equal(broken.status, 503);
  assert.equal(broken.body.error.code, "PUBLIC_CORRIDOR_UNREACHABLE");
  assert.equal(broken.body.error.retryable, true);
  assert.equal(rowBySlug("vibraflowmedia", slug).status, "DRAFT");

  const retried = await handoff(id);
  assert.equal(retried.status, 200, JSON.stringify(retried.body));
  const pid = retried.body.handoff.publicRecordId;
  assert.equal(row(pid).status, "REVIEW");
  assert.deepEqual(events(pid).map((e) => e.action), ["create_draft", "submit_review"]);
});

test("3d. create committed but the request failed after it: the retry completes, it is not refused as a duplicate", async () => {
  const { id, slug } = await prepared();
  d1FailOnce = /INSERT INTO editorial_events/;          // the row is written, its event is not
  const broken = await handoff(id);
  d1FailOnce = null;
  assert.equal(broken.status, 503, JSON.stringify(broken.body));
  assert.equal(broken.body.error.code, "PUBLIC_CORRIDOR_UNREACHABLE");
  assert.equal(broken.body.error.retryable, true, "a 5xx is not a refusal");
  assert.equal(broken.body.error.upstream.status, 502);
  assert.equal(rowBySlug("vibraflowmedia", slug).status, "DRAFT", "the row did commit");

  const retried = await handoff(id);
  assert.equal(retried.status, 200, JSON.stringify(retried.body));
  const pid = retried.body.handoff.publicRecordId;
  assert.equal(row(pid).status, "REVIEW");
  assert.equal(row(pid).version, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM editorial_records WHERE slug=?").get(slug).n, 1, "one record");

  const third = await handoff(id);
  assert.equal(third.status, 200);
  assert.equal(third.body.handoff.replay, true, "and from now on it replays");
});

test("3e. the review step failing upstream is retryable, and the retry finishes it", async () => {
  const { id, slug } = await prepared();
  d1FailOnce = /SET status='REVIEW'/;
  const broken = await handoff(id);
  d1FailOnce = null;
  assert.equal(broken.status, 503, JSON.stringify(broken.body));
  assert.equal(broken.body.error.code, "PUBLIC_CORRIDOR_UNREACHABLE");
  assert.equal(broken.body.error.retryable, true);
  assert.ok(broken.body.error.publicRecordId);
  assert.equal(rowBySlug("vibraflowmedia", slug).status, "DRAFT");

  const retried = await handoff(id);
  assert.equal(retried.status, 200, JSON.stringify(retried.body));
  assert.equal(row(retried.body.handoff.publicRecordId).status, "REVIEW");
  assert.deepEqual(events(retried.body.handoff.publicRecordId).map((e) => e.action), ["create_draft", "submit_review"]);
});

test("3f. an identical create by ANOTHER principal is still RECORD_EXISTS; so is different content", async () => {
  const { id } = await prepared();
  const pid = (await handoff(id)).body.handoff.publicRecordId;
  const draft = toPublicDraft(workerRecord(id)).body;
  const other = await vercel(V.claude, { ...draft });
  assert.equal(other.status, 409);
  assert.equal(other.body.error, "RECORD_EXISTS");
  const changed = await vercel(V.worker, { ...draft, title: "Not the same piece" });
  assert.equal(changed.status, 409);
  assert.equal(changed.body.error, "RECORD_EXISTS");
  assert.equal(row(pid).version, 1);
  assert.equal(row(pid).created_by, "editorial-worker");
});

test("3c. the public corridor unreachable: nothing created, retryable", async () => {
  const { id, slug } = await prepared();
  corridorDown = "all";
  const h = await handoff(id);
  corridorDown = null;
  assert.equal(h.status, 503);
  assert.equal(h.body.error.retryable, true);
  assert.equal(rowBySlug("vibraflowmedia", slug), undefined);
});

/* ═════════════════════════════════════════════════════════════════════════
   4. APPROVALS
   ═════════════════════════════════════════════════════════════════════════ */

test("4a. a record the Owner rejected in the Worker cannot be handed off", async () => {
  const { id, slug } = await prepared();
  const rj = await worker(post("/v1/owner/reject", { recordId: id, reason: "not this one" }, W.owner));
  assert.equal(rj.status, 200, JSON.stringify(rj.body));
  const h = await handoff(id);
  assert.equal(h.status, 409);
  assert.equal(h.body.error.code, "HANDOFF_STATE");
  assert.equal(rowBySlug("vibraflowmedia", slug), undefined);
});

test("4b. a Worker approval does not carry over: the public record still waits for the Owner there", async () => {
  const { id } = await prepared();
  const ap = await worker(post("/v1/owner/approve", { recordId: id }, W.owner));
  assert.equal(ap.status, 200);
  const h = await handoff(id);
  assert.equal(h.status, 200);
  const pid = h.body.handoff.publicRecordId;
  assert.equal(row(pid).status, "REVIEW");
  assert.equal(row(pid).approved_by, null);
  const pub = await vercel(V.claude, { action: "publish_approved", record_id: pid });
  assert.equal(pub.status, 409);
  assert.equal(pub.body.error, "OWNER_REVIEW_REQUIRED");
});

test("4c. a newer Worker version of an already handed-off piece is refused, not half-applied", async () => {
  const { id } = await prepared();
  const pid = (await handoff(id)).body.handoff.publicRecordId;
  const upd = await worker(post("/v1/editorial", {
    operation: "UPDATE", instruction_id: `bridge_upd_${id}`, record_id: id,
    title: "A Swapped Title", body: "Text the Owner has not read in the public corridor, swapped in after hand-off.",
  }, W.chatgpt));
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  await worker(post("/v1/editorial", { operation: "PREVIEW", instruction_id: `bridge_upd_prev_${id}`, record_id: id }, W.chatgpt));
  assert.ok(workerRecord(id).version > 1);

  const again = await handoff(id);
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, "HANDOFF_ALREADY_EXISTS");
  assert.equal(row(pid).version, 1);
  assert.notEqual(row(pid).title, "A Swapped Title");
});

test("4d. a record the Worker published on its own (LIVE, no bridge) cannot then be handed off", async () => {
  const { id, slug } = await prepared();
  const live = { SFL_CORRIDOR_MODE: "LIVE", SFL_PUBLIC_CORRIDOR_URL: undefined, SFL_PUBLIC_CORRIDOR_TOKEN: undefined };
  await worker(post("/v1/owner/approve", { recordId: id }, W.owner), live);
  const pub = await worker(post("/v1/editorial", { operation: "PUBLISH", instruction_id: `bridge_solo_${id}`, record_id: id }, W.chatgpt), live);
  assert.equal(pub.body.state, "PUBLISHED", JSON.stringify(pub.body));
  const h = await handoff(id);
  assert.equal(h.status, 409);
  assert.equal(h.body.error.code, "HANDOFF_STATE");
  assert.equal(rowBySlug("vibraflowmedia", slug), undefined);
});

/* ═════════════════════════════════════════════════════════════════════════
   5. BRANCH ISOLATION
   ═════════════════════════════════════════════════════════════════════════ */

test("5a. a record lands in its own world and in no other", async () => {
  const { id } = await prepared({ branch: "LIGHTNODE_SYSTEMS", type: "TUTORIAL" });
  const pid = (await handoff(id)).body.handoff.publicRecordId;
  assert.equal(row(pid).identity, "lightnodesystems");
  assert.equal(row(pid).type, "COURSE");
  await vercel(V.owner, { action: "approve", record_id: pid });
  await vercel(V.chatgpt, { action: "publish_approved", record_id: pid });
  const all = await feedRecords();
  assert.ok(selectPublic(all, "lightnodesystems").accepted.some((x) => x.id === pid));
  for (const other of ["sentinelfortunerecords", "codexworldtv", "lumengame", "lumenschoolacademy", "vibraflowmedia", "oglegacystore"]) {
    const sel = selectPublic(all, other);
    assert.ok(!sel.accepted.some((x) => x.id === pid), `leaked into ${other}`);
    assert.ok(sel.rejected.some((x) => x.id === pid && x.reason === "OTHER_IDENTITY"), `${other} saw it as another house's`);
  }
});

test("5b. a world that does not present the type refuses it; nothing is redirected", async () => {
  /* The Worker accepts an ARTICLE for VibraFlow (presents as COURSE); the
     public VibraFlow world does not render COURSE. */
  const { id, slug } = await prepared({ branch: "VIBRAFLOW_MEDIA", type: "ARTICLE" });
  const h = await handoff(id);
  assert.equal(h.status, 409);
  assert.equal(h.body.error.code, "PUBLIC_CORRIDOR_REFUSED");
  assert.equal(h.body.error.upstream.error, "TYPE_NOT_ACCEPTED_BY_WORLD");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM editorial_records WHERE slug=?").get(slug).n, 0, "not created in any world");
});

test("5c. the same slug in two houses stays two records", async () => {
  const slug = `shared-slug-${Date.now()}`;
  const a = await prepared({ branch: "LUMEN_SCHOOL_ACADEMY", type: "LESSON", slug });
  const b = await prepared({ branch: "LIGHTNODE_SYSTEMS", type: "GUIDE", slug });
  const pa = (await handoff(a.id)).body.handoff.publicRecordId;
  const pb = (await handoff(b.id)).body.handoff.publicRecordId;
  assert.notEqual(pa, pb);
  assert.equal(row(pa).identity, "lumenschoolacademy");
  assert.equal(row(pb).identity, "lightnodesystems");
});

/* ═════════════════════════════════════════════════════════════════════════
   6. ROLLBACK
   ═════════════════════════════════════════════════════════════════════════ */

test("6a. unpublish in the public corridor takes it down; restore puts the approved version back", async () => {
  const { id } = await prepared();
  const pid = (await handoff(id)).body.handoff.publicRecordId;
  await vercel(V.owner, { action: "approve", record_id: pid });
  await vercel(V.claude, { action: "publish_approved", record_id: pid });
  assert.ok((await feedRecords()).some((x) => x.id === pid));

  const down = await vercel(V.claude, { action: "unpublish", record_id: pid });
  assert.equal(down.status, 200);
  assert.ok(!(await feedRecords()).some((x) => x.id === pid), "gone from the feed");
  const back = await vercel(V.claude, { action: "publish_approved", record_id: pid });
  assert.equal(back.status, 200);
  assert.equal(back.body.approval_mode, "EXPLICIT");
  assert.ok((await feedRecords()).some((x) => x.id === pid), "restored");
  assert.equal(workerRecord(id).status, "DRAFT", "the Worker ledger is untouched by public-side rollback");
});

test("6b. removing the bridge configuration disables hand-off and restores the TEST_PREVIEW lock", async () => {
  const { id, slug } = await prepared();
  const off = { SFL_PUBLIC_CORRIDOR_URL: undefined, SFL_PUBLIC_CORRIDOR_TOKEN: undefined };
  const h = await handoff(id, W.owner, off);
  assert.equal(h.status, 503);
  assert.equal(h.body.error.code, "BRIDGE_NOT_CONFIGURED");
  assert.equal(rowBySlug("vibraflowmedia", slug), undefined);
  const pub = await worker(post("/v1/editorial", { operation: "PUBLISH", instruction_id: `bridge_off_pub_${id}`, record_id: id }, W.chatgpt), off);
  assert.equal(pub.body.error.code, "PUBLICATION_DISABLED");
});

/* ═════════════════════════════════════════════════════════════════════════
   7. NO ACCIDENTAL LIVE PUBLISHING
   ═════════════════════════════════════════════════════════════════════════ */

test("7a. with the bridge configured the Worker publishes nothing, even in LIVE with an Owner approval", async () => {
  const { id } = await prepared();
  await worker(post("/v1/owner/approve", { recordId: id }, W.owner), { SFL_CORRIDOR_MODE: "LIVE" });
  const pub = await worker(post("/v1/editorial", { operation: "PUBLISH", instruction_id: `bridge_live_pub_${id}`, record_id: id }, W.chatgpt), { SFL_CORRIDOR_MODE: "LIVE" });
  assert.equal(pub.status, 403);
  assert.equal(pub.body.error.code, "PUBLICATION_DELEGATED");
  assert.notEqual(workerRecord(id).status, "PUBLISHED");

  const health = await worker({ method: "GET", path: "/v1/health", headers: {}, rawBody: "" }, { SFL_CORRIDOR_MODE: "LIVE" });
  assert.equal(health.body.publicationEnabled, false);
  assert.equal(health.body.publicationAuthority, "PUBLIC_CORRIDOR");
});

test("7b. the bridge only ever asks for create_draft and submit_review", async () => {
  const asked = new Set(outbound.map((o) => o.action));
  assert.ok(outbound.length > 0);
  for (const a of asked) assert.ok(["create_draft", "submit_review"].includes(a), `bridge sent ${a}`);
  /* Its own configured credential (2c deliberately configures a bogus one),
     and never an assistant's or the Owner's. */
  const humanOrAssistant = [V.owner, V.claude, V.chatgpt].map((t) => `Bearer ${t}`);
  assert.ok(outbound.every((o) => !humanOrAssistant.includes(o.authorization)), "the bridge never holds an Owner or assistant credential");
  assert.ok(outbound.some((o) => o.authorization === `Bearer ${V.worker}`));
  const published = db.prepare("SELECT record_id FROM editorial_records WHERE status='PUBLISHED' AND created_by='editorial-worker'").all();
  for (const p of published) {
    const ev = events(p.record_id);
    assert.ok(ev.some((e) => e.action === "approve" && e.actor === "owner" && e.adapter === "owner"), `${p.record_id} published without an Owner approval`);
    assert.ok(!ev.some((e) => e.adapter === "editorial-worker" && !["create_draft", "submit_review"].includes(e.action)));
  }
});

test("7c. a scheduled piece and a Shop pointer are refused rather than published early or unverified", async () => {
  const sched = await prepared({ extra: { publish_at: "2099-01-01T00:00:00Z" } });
  const h1 = await handoff(sched.id);
  assert.equal(h1.body.error.code, "HANDOFF_SCHEDULE_UNSUPPORTED");
  const product = await prepared({ extra: { cta: { type: "VIEW_PRODUCT", destination: "https://sentinelfortune.com/products/x" } } });
  const h2 = await handoff(product.id);
  assert.equal(h2.body.error.code, "HANDOFF_CTA_UNSUPPORTED");
  assert.equal(rowBySlug("vibraflowmedia", sched.slug), undefined);
  assert.equal(rowBySlug("vibraflowmedia", product.slug), undefined);
});

test("7d. only an https *.sentinelfortune.com /api/corridor target is accepted", () => {
  for (const url of [
    "http://onecompany.sentinelfortune.com/api/corridor",
    "https://evil.example.com/api/corridor",
    "https://sentinelfortune.com.evil.example/api/corridor",
    "https://onecompany.sentinelfortune.com/api/feed",
    "not a url",
  ]) {
    assert.equal(readBridgeConfig({ SFL_PUBLIC_CORRIDOR_URL: url, SFL_PUBLIC_CORRIDOR_TOKEN: "t" }).configured, false, url);
  }
  assert.equal(readBridgeConfig({ SFL_PUBLIC_CORRIDOR_URL: PUBLIC_URL }).configured, false, "no token, no bridge");
  assert.equal(readBridgeConfig({}).configured, false);
  assert.equal(readBridgeConfig({ SFL_PUBLIC_CORRIDOR_URL: PUBLIC_URL, SFL_PUBLIC_CORRIDOR_TOKEN: "t" }).configured, true);
});

test("7e. the translated draft carries no price, tier or approval field", () => {
  const d = toPublicDraft({
    id: "x", version: 1, branch: "VIBRAFLOW_MEDIA", presentationType: "TEACHING", slug: "x-piece",
    title: "X", summary: "", body: "b".repeat(30), translations: {}, media: [], heroMedia: null, cta: null,
  });
  assert.ok(d.ok);
  for (const k of ["price", "pricing_tier", "pricingTier", "status", "approved_by", "approval_mode", "record_id", "checkoutUrl"]) {
    assert.ok(!(k in d.body), k);
  }
});
