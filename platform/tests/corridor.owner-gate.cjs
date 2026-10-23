/* Sentinel Fortune — EDITORIAL CORRIDOR OWNER-GATE REGRESSION.
 *
 *   node platform/tests/corridor.owner-gate.cjs
 *
 * Pins one rule: nothing reaches PUBLISHED without either an explicit Owner
 * approval or a standing policy the Owner configured in
 * CORRIDOR_STANDING_POLICY. No assistant holds a default publishing grant,
 * and the ChatGPT manifest adapter cannot publish on its own authority.
 *
 * Same harness as corridor.lifecycle.cjs: the real D1 schema on node:sqlite
 * behind a shim that speaks D1's HTTP shape. The ChatGPT adapter's outbound
 * call to /api/corridor is routed to the real corridor handler in-process.
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

const corridorHandler = require("../api/corridor.js");
const chatgptAdapter = require("../api/chatgpt-corridor.js");
process.env.CF_ACCOUNT_ID = "a"; process.env.CF_D1_DATABASE_ID = "d"; process.env.CF_D1_WRITE_TOKEN = "W";
process.env.CORRIDOR_TOKEN_CLAUDE = "claude-tok";
process.env.CORRIDOR_TOKEN_CHATGPT = "chatgpt-tok";
process.env.CORRIDOR_TOKEN_OWNER = "owner-tok";

function mockRes() {
  return { headers: {}, statusCode: 0, body: "", setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
}

global.fetch = async (url, init) => {
  /* The adapter's call to the production corridor URL, served in-process. */
  if (String(url).endsWith("/api/corridor")) {
    const res = mockRes();
    await corridorHandler({ method: "POST", headers: { authorization: init.headers.Authorization }, body: JSON.parse(init.body) }, res);
    return { status: res.statusCode, json: async () => JSON.parse(res.body) };
  }
  const { sql, params } = JSON.parse(init.body);
  const bound = (params || []).map((v) => (v === null ? null : String(v)));
  const order = [];
  const converted = sql.replace(/\?(\d+)/g, (_, n) => { order.push(Number(n) - 1); return "?"; });
  const args = order.length ? order.map((i) => bound[i]) : bound;
  try {
    const st = db.prepare(converted);
    const results = /^\s*select/i.test(sql) ? st.all(...args) : (st.run(...args), []);
    return { ok: true, json: async () => ({ success: true, result: [{ results }] }) };
  } catch (e) { return { ok: false, status: 400, json: async () => ({ success: false, errors: [{ message: e.message }] }) }; }
};

async function call(tok, payload) {
  const res = mockRes();
  await corridorHandler({ method: "POST", headers: { authorization: `Bearer ${tok}` }, body: payload }, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}
const status = (id) => db.prepare("SELECT status FROM editorial_records WHERE record_id=?").get(id)?.status;

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

let n = 0;
async function draft(tok, over = {}) {
  n += 1;
  const r = await call(tok, {
    action: "create_draft", type: "TEACHING", identity: "vibraflowmedia",
    title: `Owner Gate Teaching ${n}`, summary: "A teaching used to pin the Owner gate.",
    body: "Paragraph one.\n\nParagraph two.", idempotency_key: `gate-${n}`, ...over,
  });
  if (r.status !== 201) throw new Error(`create_draft failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.record.record_id;
}

(async () => {
  console.log("=== 1. no standing policy configured: ChatGPT cannot publish ===");
  for (const [label, value] of [["unset", undefined], ["empty array", "[]"], ["malformed", "{not json"]]) {
    if (value === undefined) delete process.env.CORRIDOR_STANDING_POLICY; else process.env.CORRIDOR_STANDING_POLICY = value;
    for (const from of ["DRAFT", "REVIEW"]) {
      const id = await draft("chatgpt-tok");
      if (from === "REVIEW") await call("chatgpt-tok", { action: "submit_review", record_id: id });
      const pub = await call("chatgpt-tok", { action: "publish_approved", record_id: id });
      check(`policy ${label}, ChatGPT publish from ${from} is refused`,
        pub.status === 409 && pub.body.error === "OWNER_REVIEW_REQUIRED" && status(id) === from,
        `${pub.status} ${pub.body.error || pub.body.approval_mode} → ${status(id)}`);
    }
  }

  console.log("=== 2. no standing policy configured: Claude cannot publish either ===");
  delete process.env.CORRIDOR_STANDING_POLICY;
  {
    const id = await draft("claude-tok");
    const pub = await call("claude-tok", { action: "publish_approved", record_id: id });
    check("Claude publish without approval is refused", pub.status === 409 && status(id) === "DRAFT", `${pub.status}`);
  }

  console.log("=== 3. explicit Owner approval still publishes ===");
  {
    const id = await draft("chatgpt-tok");
    await call("chatgpt-tok", { action: "submit_review", record_id: id });
    const approved = await call("owner-tok", { action: "approve", record_id: id });
    const pub = await call("chatgpt-tok", { action: "publish_approved", record_id: id });
    check("Owner approves, then ChatGPT publishes (EXPLICIT)",
      approved.status === 200 && pub.status === 200 && pub.body.approval_mode === "EXPLICIT" && status(id) === "PUBLISHED",
      `${approved.status}/${pub.status} ${pub.body.approval_mode}`);
  }

  console.log("=== 4. a standing policy the Owner configured still applies ===");
  process.env.CORRIDOR_STANDING_POLICY = JSON.stringify([{ identity: "vibraflowmedia", types: ["TEACHING"] }]);
  const policyId = await draft("chatgpt-tok");
  {
    const pub = await call("chatgpt-tok", { action: "publish_approved", record_id: policyId });
    check("configured policy publishes (STANDING_POLICY)", pub.status === 200 && pub.body.approval_mode === "STANDING_POLICY", `${pub.status}`);
  }

  console.log("=== 5. withdrawing a policy withdraws its re-publication authority ===");
  await call("chatgpt-tok", { action: "unpublish", record_id: policyId });
  delete process.env.CORRIDOR_STANDING_POLICY;
  {
    const pub = await call("chatgpt-tok", { action: "publish_approved", record_id: policyId });
    check("policy-published record cannot be restored once the policy is gone",
      pub.status === 409 && status(policyId) === "UNPUBLISHED", `${pub.status} → ${status(policyId)}`);
  }
  {
    const id = await draft("chatgpt-tok");
    await call("chatgpt-tok", { action: "submit_review", record_id: id });
    await call("owner-tok", { action: "approve", record_id: id });
    await call("chatgpt-tok", { action: "publish_approved", record_id: id });
    await call("chatgpt-tok", { action: "unpublish", record_id: id });
    const again = await call("chatgpt-tok", { action: "publish_approved", record_id: id });
    check("an explicitly approved record can still be restored after unpublish",
      again.status === 200 && again.body.approval_mode === "EXPLICIT", `${again.status} ${again.body.approval_mode}`);
  }

  console.log("=== 6. the ChatGPT manifest adapter never writes on GET and never publishes ===");
  delete process.env.CORRIDOR_STANDING_POLICY;
  const host = { host: "platform-git-x-sentinelfortune.vercel.app" };
  {
    const res = mockRes();
    await chatgptAdapter({ method: "GET", headers: host, query: { id: "legacy-365-day-001" } }, res);
    check("GET is refused 405 and writes nothing",
      res.statusCode === 405 && status("edl-vfm-legacy-365-day-001") === undefined, `${res.statusCode}`);
  }
  for (const prodHost of ["onecompany.sentinelfortune.com", "vibraflowmedia.sentinelfortune.com"]) {
    const res = mockRes();
    await chatgptAdapter({ method: "POST", headers: { host: prodHost }, query: { id: "legacy-365-day-001" } }, res);
    check(`the adapter is unreachable on the production host ${prodHost}`, res.statusCode === 404 && status("edl-vfm-legacy-365-day-001") === undefined, `${res.statusCode}`);
  }
  {
    const res = mockRes();
    await chatgptAdapter({ method: "POST", headers: host, query: { id: "legacy-365-day-001" } }, res);
    const body = JSON.parse(res.body);
    const st = status("edl-vfm-legacy-365-day-001");
    check("POST drafts Day 001 and stops at REVIEW", res.statusCode === 200 && st === "REVIEW" && body.next === "OWNER_APPROVAL_REQUIRED", `${res.statusCode} → ${st}`);
    check("Day 001 is NOT published", st !== "PUBLISHED");
  }

  console.log("=== 7. an approval covers one exact version ===");
  {
    const id = await draft("chatgpt-tok");
    await call("chatgpt-tok", { action: "submit_review", record_id: id });
    await call("owner-tok", { action: "approve", record_id: id });
    const edit = await call("chatgpt-tok", { action: "update_draft", record_id: id, summary: "changed after approval" });
    check("editing an APPROVED record withdraws the approval (→ REVIEW)", edit.status === 200 && status(id) === "REVIEW", `${edit.status} → ${status(id)}`);
    const pub = await call("chatgpt-tok", { action: "publish_approved", record_id: id });
    check("the edited version cannot be published on the old approval", pub.status === 409 && status(id) === "REVIEW", `${pub.status} ${pub.body.error}`);
    await call("owner-tok", { action: "approve", record_id: id });
    const pub2 = await call("chatgpt-tok", { action: "publish_approved", record_id: id });
    check("re-approved version publishes", pub2.status === 200 && pub2.body.approval_mode === "EXPLICIT", `${pub2.status}`);
    const live = await call("chatgpt-tok", { action: "update_draft", record_id: id, title: "live edit" });
    check("a PUBLISHED record cannot be edited in place", live.status === 409 && live.body.error === "NOT_EDITABLE", `${live.status}`);
  }
  {
    /* An approval recorded with no version (before this rule) is not proof. */
    const id = await draft("chatgpt-tok");
    db.prepare("UPDATE editorial_records SET status='APPROVED', approved_by='owner', approval_mode='EXPLICIT', approved_at='2026-01-01T00:00:00Z' WHERE record_id=?").run(id);
    db.prepare("INSERT INTO editorial_events (record_id, action, from_status, to_status, actor, adapter, approval_mode, at) VALUES (?, 'approve', 'REVIEW', 'APPROVED', 'owner', 'owner', 'EXPLICIT', '2026-01-01T00:00:00Z')").run(id);
    const pub = await call("chatgpt-tok", { action: "publish_approved", record_id: id });
    check("an approval without a recorded version is stale", pub.status === 409 && pub.body.error === "APPROVAL_STALE", `${pub.status} ${pub.body.error}`);
  }

  console.log("=== 8. idempotency keys are scoped to the caller ===");
  {
    const id = await draft("chatgpt-tok");
    await call("chatgpt-tok", { action: "submit_review", record_id: id });
    const ownerKey = `owner-approve-${id}`;
    const byOwner = await call("owner-tok", { action: "approve", record_id: id, idempotency_key: ownerKey });
    const replayAttempt = await call("chatgpt-tok", { action: "approve", record_id: id, idempotency_key: ownerKey });
    check("an assistant reusing the Owner's key is still refused 403", byOwner.status === 200 && replayAttempt.status === 403, `${byOwner.status}/${replayAttempt.status}`);
    const k = `shared-key-${id}`;
    await call("owner-tok", { action: "get_record", record_id: id, idempotency_key: k });
    const other = await call("chatgpt-tok", { action: "update_draft", record_id: id, summary: "x", idempotency_key: k });
    check("one caller's key never replays another caller's response", other.status === 200 && other.body.record && other.body.record.version === 2, `${other.status} v${other.body.record && other.body.record.version}`);
  }

  console.log(failures ? `\nOWNER GATE: ${failures} check(s) FAILED` : "\nOWNER GATE: all checks passed.");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
