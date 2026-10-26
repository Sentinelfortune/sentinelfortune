/* Sentinel Fortune — EDITORIAL CORRIDOR RACE REGRESSION.
 *
 *   node platform/tests/corridor.race.cjs
 *
 * Every corridor transition reads a record, decides, then writes. Between the
 * read and the write another caller can change the record. This harness puts
 * a second request EXACTLY in that window — the shim pauses the first
 * request's write, runs the competing request to completion, then lets the
 * first write go — and pins that the first write then refuses instead of
 * landing on a record it never inspected.
 *
 * The case that matters most is the first: an approved v1 being published
 * while an edit makes it v2. Before the version-bound write, v2 — content the
 * Owner never read — went public under the Owner's name.
 *
 * Same harness as corridor.owner-gate.cjs: the real D1 schema on node:sqlite
 * behind a shim that speaks D1's HTTP shape, RETURNING rows included (D1
 * returns them in `results` exactly as it does for a SELECT).
 * Exits non-zero on the first failed check.
 */
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(":memory:");
/* THE REAL SCHEMA, verbatim from corridor.lifecycle.cjs. */
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

const handler = require("../api/corridor.js");
process.env.CF_ACCOUNT_ID = "a"; process.env.CF_D1_DATABASE_ID = "d"; process.env.CF_D1_WRITE_TOKEN = "W";
process.env.CORRIDOR_TOKEN_CLAUDE = "claude-tok";
process.env.CORRIDOR_TOKEN_CHATGPT = "chatgpt-tok";
process.env.CORRIDOR_TOKEN_OWNER = "owner-tok";
delete process.env.CORRIDOR_STANDING_POLICY;

/* One armed interleaving at a time: when the next statement matching `match`
   is about to run, `run` executes to completion first. */
let interleave = null;
function arm(match, run) { interleave = { match, run }; }

global.fetch = async (url, init) => {
  const { sql, params } = JSON.parse(init.body);
  if (interleave && interleave.match.test(sql)) {
    const { run } = interleave;
    interleave = null;
    await run();
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

async function call(tok, payload) {
  const res = { headers: {}, statusCode: 0, body: "", setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await handler({ method: "POST", headers: { authorization: `Bearer ${tok}` }, body: payload }, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}
const rec = (id) => db.prepare("SELECT * FROM editorial_records WHERE record_id=?").get(id);
const events = (id, action) => db.prepare("SELECT COUNT(*) n FROM editorial_events WHERE record_id=? AND action=?").get(id, action).n;

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

let n = 0;
async function draft() {
  n += 1;
  const r = await call("chatgpt-tok", {
    action: "create_draft", type: "TEACHING", identity: "vibraflowmedia",
    title: `Race Teaching ${n}`, summary: "Version one.", body: "Body.",
  });
  if (r.status !== 201) throw new Error(`create_draft failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.record.record_id;
}

const PUBLISH_WRITE = /SET status='PUBLISHED'/;
const APPROVE_WRITE = /SET status='APPROVED'/;
const EDIT_WRITE = /SET title=/;
const ARCHIVE_WRITE = /SET status='ARCHIVED'/;

(async () => {
  console.log("=== 1. publish of approved v1 races an edit to v2 ===");
  {
    const id = await draft();
    await call("chatgpt-tok", { action: "submit_review", record_id: id });
    await call("owner-tok", { action: "approve", record_id: id });
    arm(PUBLISH_WRITE, () => call("claude-tok", { action: "update_draft", record_id: id, summary: "Version two, never approved." }));
    const pub = await call("chatgpt-tok", { action: "publish_approved", record_id: id });
    const row = rec(id);
    check("the publish is refused as a concurrent modification",
      pub.status === 409 && pub.body.error === "CONCURRENT_MODIFICATION", `${pub.status} ${pub.body.error || pub.body.approval_mode}`);
    check("the unapproved v2 is NOT public", row.status !== "PUBLISHED", `${row.status} v${row.version}`);
    check("the edit withdrew the approval (REVIEW, approver cleared)", row.status === "REVIEW" && row.approved_by === null, `${row.status} by=${row.approved_by}`);
    check("no publication event was logged", events(id, "publish_approved") === 0, String(events(id, "publish_approved")));
    await call("owner-tok", { action: "approve", record_id: id });
    const again = await call("chatgpt-tok", { action: "publish_approved", record_id: id });
    check("once the Owner approves v2 it publishes", again.status === 200 && rec(id).status === "PUBLISHED" && rec(id).version === 2, `${again.status} v${rec(id).version}`);
  }

  console.log("=== 2. Owner approval of v1 races an edit to v2 ===");
  {
    const id = await draft();
    await call("chatgpt-tok", { action: "submit_review", record_id: id });
    arm(APPROVE_WRITE, () => call("claude-tok", { action: "update_draft", record_id: id, summary: "Edited while the Owner was reading v1." }));
    const appr = await call("owner-tok", { action: "approve", record_id: id });
    const row = rec(id);
    check("the approval is refused as a concurrent modification",
      appr.status === 409 && appr.body.error === "CONCURRENT_MODIFICATION", `${appr.status} ${appr.body.error || appr.body.approval_mode}`);
    check("v2 is not marked APPROVED on the strength of reading v1", row.status === "REVIEW" && row.approved_by === null, `${row.status} v${row.version} by=${row.approved_by}`);
    check("no approval event was logged", events(id, "approve") === 0, String(events(id, "approve")));
  }

  console.log("=== 3. standing-policy publish races an edit ===");
  {
    process.env.CORRIDOR_STANDING_POLICY = JSON.stringify([{ identity: "vibraflowmedia", types: ["TEACHING"] }]);
    const id = await draft();
    arm(PUBLISH_WRITE, () => call("claude-tok", { action: "update_draft", record_id: id, summary: "Changed mid-publish." }));
    const pub = await call("chatgpt-tok", { action: "publish_approved", record_id: id });
    check("a policy publish of a record that changed underneath it is refused",
      pub.status === 409 && pub.body.error === "CONCURRENT_MODIFICATION" && rec(id).status === "DRAFT", `${pub.status} → ${rec(id).status}`);
    delete process.env.CORRIDOR_STANDING_POLICY;
  }

  console.log("=== 4. two edits from the same version: no lost update ===");
  {
    const id = await draft();
    arm(EDIT_WRITE, () => call("claude-tok", { action: "update_draft", record_id: id, summary: "Claude's edit." }));
    const outer = await call("chatgpt-tok", { action: "update_draft", record_id: id, summary: "ChatGPT's edit." });
    const row = rec(id);
    check("the second writer is refused rather than overwriting", outer.status === 409 && outer.body.error === "CONCURRENT_MODIFICATION", `${outer.status} ${outer.body.error || ""}`);
    check("the first edit survives at v2", row.version === 2 && row.summary === "Claude's edit.", `v${row.version} "${row.summary}"`);
  }

  console.log("=== 5. archive races a publish ===");
  {
    const id = await draft();
    await call("chatgpt-tok", { action: "submit_review", record_id: id });
    await call("owner-tok", { action: "approve", record_id: id });
    arm(ARCHIVE_WRITE, () => call("claude-tok", { action: "publish_approved", record_id: id }));
    const arc = await call("chatgpt-tok", { action: "archive", record_id: id });
    check("a record published mid-archive is not silently archived",
      arc.status === 409 && rec(id).status === "PUBLISHED", `${arc.status} → ${rec(id).status}`);
  }

  console.log("=== 6. the uncontended paths are unchanged ===");
  {
    const id = await draft();
    const e = await call("chatgpt-tok", { action: "update_draft", record_id: id, summary: "plain edit" });
    const s = await call("chatgpt-tok", { action: "submit_review", record_id: id });
    const a = await call("owner-tok", { action: "approve", record_id: id });
    const p = await call("chatgpt-tok", { action: "publish_approved", record_id: id });
    const u = await call("chatgpt-tok", { action: "unpublish", record_id: id });
    const r = await call("chatgpt-tok", { action: "publish_approved", record_id: id });
    check("edit → review → approve → publish → unpublish → restore",
      [e, s, a, p, u, r].every((x) => x.status === 200) && rec(id).status === "PUBLISHED" && rec(id).version === 2,
      [e, s, a, p, u, r].map((x) => x.status).join("/"));
  }

  console.log(failures ? `\nRACE: ${failures} check(s) FAILED` : "\nRACE: all checks passed.");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
