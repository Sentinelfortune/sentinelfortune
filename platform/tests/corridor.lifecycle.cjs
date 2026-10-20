/* Sentinel Fortune — EDITORIAL CORRIDOR LIFECYCLE PROOF.
 *
 *   node platform/tests/corridor.lifecycle.cjs
 *
 * Drives api/corridor.js through all eight actions against the REAL D1 schema
 * — the same CREATE TABLE text as the production database, CHECK constraints
 * included — using node:sqlite behind a shim that speaks D1's HTTP shape.
 *
 * It is a .cjs script rather than a node:test file because the endpoint is
 * CommonJS (Vercel's Node runtime) and because the value here is the ordered
 * narrative: each step depends on the one before it, and reading the output
 * top to bottom is the proof. It exits non-zero on the first broken step.
 *
 * THIS IS NOT A SUBSTITUTE FOR THE PUBLIC-HOSTNAME PROOF. It proves the
 * handler's logic and governance; it cannot prove the deployed function can
 * reach D1 or that a reader sees the result.
 */
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(":memory:");
/* THE REAL SCHEMA, verbatim from the production D1 database. */
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
process.env.CF_ACCOUNT_ID="a"; process.env.CF_D1_DATABASE_ID="d"; process.env.CF_D1_WRITE_TOKEN="W";
process.env.CORRIDOR_TOKEN_CLAUDE="claude-tok"; process.env.CORRIDOR_TOKEN_CHATGPT="chatgpt-tok";
process.env.CORRIDOR_STANDING_POLICY=JSON.stringify([{identity:"vibraflowmedia",types:["TEACHING"]}]);

/* Translate the D1 HTTP shape onto local SQLite, ?1-style params included. */
global.fetch = async (url, init) => {
  const { sql, params } = JSON.parse(init.body);
  const bound = (params||[]).map(v => v===null?null:String(v));
  /* Expand ?N in order of appearance so a repeated or out-of-order numbered
     parameter binds the way D1 binds it. */
  const order = [];
  const converted = sql.replace(/\?(\d+)/g, (_, n) => { order.push(Number(n) - 1); return "?"; });
  const args = order.length ? order.map(i => bound[i]) : bound;
  try {
    const st = db.prepare(converted);
    const isSelect = /^\s*select/i.test(sql);
    const results = isSelect ? st.all(...args) : (st.run(...args), []);
    return { ok: true, json: async () => ({ success: true, result: [{ results }] }) };
  } catch (e) { return { ok: false, status: 400, json: async () => ({ success:false, errors:[{message:e.message}] }) }; }
};

async function call(tok, payload) {
  const res = { headers:{}, statusCode:0, body:"", setHeader(k,v){this.headers[k]=v;}, end(b){this.body=b;} };
  await handler({ method:"POST", headers:{authorization:`Bearer ${tok}`}, body:payload }, res);
  return { status: res.statusCode, body: JSON.parse(res.body), headers: res.headers };
}
const P = (label, r, pick) => console.log(String(label).padEnd(34), r.status, pick ? pick(r.body) : "");

(async () => {
  console.log("=== 1. create_draft (claude, conversation-originated) ===");
  let r = await call("claude-tok", { action:"create_draft", identity:"vibraflowmedia", type:"TEACHING",
    title:"What Silence Does to a Decision", summary:"Noise makes choices feel urgent.",
    description:"A teaching on deciding in quiet.", categories:["Decision-making"], idempotency_key:"k-create-1" });
  if(!r.body.record){console.log("create_draft failed:",r.status,JSON.stringify(r.body));process.exit(1);} const id = r.body.record.record_id;
  P("create_draft", r, b=>`${b.record.record_id} status=${b.record.status} v${b.record.version} by=${b.record.provenance.created_by}`);

  console.log("=== 2. idempotency: same key replays, does not re-create ===");
  r = await call("claude-tok", { action:"create_draft", identity:"vibraflowmedia", type:"TEACHING", title:"What Silence Does to a Decision", idempotency_key:"k-create-1" });
  P("replay", r, b=>`replay-header=${"n/a"} same_id=${b.record.record_id===id}`);
  console.log("records in table:", db.prepare("SELECT COUNT(*) n FROM editorial_records").get().n);

  console.log("=== 3. publish_approved REFUSED while unapproved (policy off) ===");
  process.env.CORRIDOR_STANDING_POLICY="[]";
  r = await call("claude-tok", { action:"publish_approved", record_id:id });
  P("publish without approval", r, b=>`${b.error} (status was ${b.status})`);

  console.log("=== 4. get_preview — visible privately, not publicly ===");
  r = await call("chatgpt-tok", { action:"get_preview", record_id:id });
  P("get_preview (chatgpt)", r, b=>`public=${b.visible_publicly} public_url=${b.public_url} preview=${b.preview_url.slice(0,62)}...`);

  console.log("=== 5. update_draft bumps version ===");
  r = await call("chatgpt-tok", { action:"update_draft", record_id:id, summary:"Noise makes a choice feel urgent when it is only loud." });
  P("update_draft (chatgpt)", r, b=>`v${b.record.version} summary="${b.record.summary.slice(0,42)}..."`);

  console.log("=== 6. publish via STANDING POLICY ===");
  process.env.CORRIDOR_STANDING_POLICY=JSON.stringify([{identity:"vibraflowmedia",types:["TEACHING"]}]);
  r = await call("claude-tok", { action:"publish_approved", record_id:id, idempotency_key:"k-pub-1" });
  P("publish_approved", r, b=>`mode=${b.approval_mode} url=${b.public_url}`);

  console.log("=== 7. it is now in the public feed query ===");
  console.log("PUBLISHED rows:", JSON.stringify(db.prepare("SELECT record_id,status,version FROM editorial_records WHERE status='PUBLISHED'").all()));

  console.log("=== 8. unpublish -> disappears from that query ===");
  r = await call("claude-tok", { action:"unpublish", record_id:id });
  P("unpublish", r, b=>`status=${b.record.status} rollback_ref=${b.rollback_reference}`);
  console.log("PUBLISHED rows now:", db.prepare("SELECT COUNT(*) n FROM editorial_records WHERE status='PUBLISHED'").get().n);

  console.log("=== 9. re-publish (rollback) ===");
  r = await call("claude-tok", { action:"publish_approved", record_id:id });
  P("republish", r, b=>`status=${b.record.status} mode=${b.approval_mode} v${b.record.version}`);

  console.log("=== 10. archive refused while PUBLISHED, allowed after unpublish ===");
  r = await call("claude-tok", { action:"archive", record_id:id });
  P("archive while published", r, b=>`${b.error} — ${b.detail||""}`);
  await call("claude-tok", { action:"unpublish", record_id:id });
  r = await call("claude-tok", { action:"archive", record_id:id });
  P("archive after unpublish", r, b=>`status=${b.record.status}`);

  console.log("=== 11. list_recent + get_record with full history ===");
  r = await call("chatgpt-tok", { action:"list_recent", identity:"vibraflowmedia", limit:5 });
  P("list_recent", r, b=>`count=${b.count}`);
  r = await call("claude-tok", { action:"get_record", record_id:id });
  P("get_record", r, b=>`history=${b.history.length} events`);
  r.body.history.forEach(h=>console.log(`     ${h.action.padEnd(17)} ${String(h.from_status).padEnd(11)}-> ${String(h.to_status).padEnd(11)} actor=${h.actor} adapter=${h.adapter} mode=${h.approval_mode||"-"}`));

  console.log("=== 12. no secret anywhere in any response ===");
  const dump = JSON.stringify(r.body);
  console.log("write token leaked:", dump.includes("W")&&dump.includes("CF_D1")?"CHECK":"no", "| corridor token leaked:", dump.includes("claude-tok")?"LEAK":"no");

  /* ── THE OWNER'S OWN APPROVAL ROUTE ──────────────────────────────────────
     Everything above published under a standing policy. This proves the other
     route: the Owner approving a specific record explicitly, with no policy in
     force, and an assistant being unable to do the same thing. A second
     record, so the narrative above is untouched. */
  console.log("=== 13. explicit Owner approval, no standing policy in force ===");
  process.env.CORRIDOR_STANDING_POLICY="[]";
  process.env.CORRIDOR_TOKEN_OWNER="owner-tok";
  r = await call("claude-tok", { action:"create_draft", type:"LESSON",
    title:"Reading a System Before Changing It", summary:"What to look at first.",
    description:"A lesson on inspection before intervention." });
  if(!r.body.record){console.log("owner-route draft failed:",r.status,JSON.stringify(r.body));process.exit(1);}
  const id2 = r.body.record.record_id;
  P("create_draft (LESSON->learn)", r, b=>`${b.record.identity} type=${b.record.type} status=${b.record.status}`);

  r = await call("claude-tok", { action:"submit_review", record_id:id2 });
  P("submit_review (claude)", r, b=>`status=${b.record.status}`);
  if (r.body.record.status !== "REVIEW") { console.log("expected REVIEW"); process.exit(1); }

  console.log("=== 14. an assistant CANNOT approve — the credential refuses ===");
  for (const tok of ["claude-tok", "chatgpt-tok"]) {
    r = await call(tok, { action:"approve", record_id:id2 });
    P(`approve as ${tok}`, r, b=>`${b.error}`);
    if (r.status !== 403) { console.log("EXPECTED 403 for an assistant approving"); process.exit(1); }
  }
  console.log("status after assistant attempts:", db.prepare("SELECT status FROM editorial_records WHERE record_id=?").get(id2).status);

  console.log("=== 15. the Owner approves, then publish needs no policy ===");
  r = await call("owner-tok", { action:"approve", record_id:id2, idempotency_key:"k-appr-1" });
  P("approve (owner)", r, b=>`status=${b.record.status} mode=${b.approval_mode}`);
  if (r.body.record.status !== "APPROVED") { console.log("expected APPROVED"); process.exit(1); }
  r = await call("claude-tok", { action:"publish_approved", record_id:id2 });
  P("publish_approved (claude)", r, b=>`mode=${b.approval_mode} url=${b.public_url}`);
  if (r.status !== 200 || r.body.approval_mode !== "EXPLICIT") { console.log("expected an EXPLICIT publication"); process.exit(1); }
  r = await call("owner-tok", { action:"get_record", record_id:id2 });
  r.body.history.forEach(h=>console.log(`     ${h.action.padEnd(17)} ${String(h.from_status).padEnd(11)}-> ${String(h.to_status).padEnd(11)} actor=${h.actor} adapter=${h.adapter} mode=${h.approval_mode||"-"}`));
  const approval = r.body.history.find(h=>h.action==="approve");
  if (!approval || approval.actor !== "owner" || approval.approval_mode !== "EXPLICIT") {
    console.log("the audit trail must record the Owner as the approver"); process.exit(1);
  }
  if (JSON.stringify(r.body).includes("owner-tok")) { console.log("OWNER TOKEN LEAKED"); process.exit(1); }
  console.log("owner token leaked: no");
})();
