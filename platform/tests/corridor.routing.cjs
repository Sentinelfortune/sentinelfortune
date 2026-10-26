/* Sentinel Fortune — SEVEN-DESTINATION ROUTING + RICH CONTENT PROOF.
 *
 *   node platform/tests/corridor.routing.cjs
 *
 * Proves the Corridor accepts every editorial type the Owner uses, routes each
 * to its correct canonical world, refuses the wrong world rather than guessing,
 * and carries a cover image, inline images, media references and a free
 * attachment through to a governed record.
 *
 * Runs against the REAL production schema via node:sqlite. It proves the
 * handler, not the deployment.
 */
const { DatabaseSync } = require("node:sqlite");
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

const handler = require("../api/corridor.js");
process.env.CF_ACCOUNT_ID="a"; process.env.CF_D1_DATABASE_ID="d"; process.env.CF_D1_WRITE_TOKEN="W";
process.env.CORRIDOR_TOKEN_CLAUDE="claude-tok"; process.env.CORRIDOR_TOKEN_CHATGPT="chatgpt-tok"; process.env.CORRIDOR_TOKEN_OWNER="owner-tok";
process.env.CORRIDOR_STANDING_POLICY="[]";

global.fetch = async (url, init) => {
  const { sql, params } = JSON.parse(init.body);
  const bound = (params||[]).map(v => v===null?null:String(v));
  const order = [];
  const converted = sql.replace(/\?(\d+)/g, (_, n) => { order.push(Number(n)-1); return "?"; });
  const args = order.length ? order.map(i => bound[i]) : bound;
  try {
    const st = db.prepare(converted);
    /* D1 returns RETURNING rows in `results`, exactly as for a SELECT. */
    const returnsRows = /^\s*select/i.test(sql) || /\breturning\b/i.test(sql);
    const results = returnsRows ? st.all(...args) : (st.run(...args), []);
    return { ok: true, json: async () => ({ success: true, result: [{ results }] }) };
  } catch (e) { return { ok: false, status: 400, json: async () => ({ success:false, errors:[{message:e.message}] }) }; }
};
async function call(tok, payload) {
  const res = { headers:{}, statusCode:0, body:"", setHeader(k,v){this.headers[k]=v;}, end(b){this.body=b;} };
  await handler({ method:"POST", headers:{authorization:`Bearer ${tok}`}, body:payload }, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}
let fails = 0;
const ok = (label, cond, detail="") => { if(!cond) fails++; console.log(`  ${cond?"PASS":"FAIL"}  ${label}${detail?"  — "+detail:""}`); };

/* editorial type -> expected world and governed type */
const ROUTES = [
  ["TEACHING",             "vibraflowmedia",         "TEACHING",      "reflect"],
  ["LESSON",               "lumenschoolacademy",     "COURSE",        "learn"],
  ["TECHNICAL_NOTE",       "lightnodesystems",       "SOFTWARE",      "systems"],
  ["STORY",                "codexworldtv",           "STORY",         "story"],
  ["MUSIC_RELEASE_NOTE",   "sentinelfortunerecords", "MUSIC_RELEASE", "release"],
  ["GAME_UPDATE",          "lumengame",              "GAME",          "play"],
  ["EDITORIAL_COLLECTION", "oglegacystore",          "BUNDLE",        "offer"],
];

(async () => {
  console.log("\n── SEVEN DESTINATIONS, routed from the editorial vocabulary ──");
  const ids = [];
  for (const [editorial, world, governed, segment] of ROUTES) {
    const r = await call("claude-tok", {
      action: "create_draft", type: editorial,
      title: `${editorial} routing proof`,
      body: "Governed editorial body.",
      cover_image: { src: `https://${world}.sentinelfortune.com/assets/cover.webp`, alt: "Cover" },
    });
    const rec = r.body.record;
    ok(`${editorial.padEnd(20)} -> ${world}`,
      r.status === 201 && rec && rec.identity === world && rec.type === governed,
      rec ? `${rec.identity}/${rec.type}` : JSON.stringify(r.body));
    if (rec) {
      ids.push(rec.record_id);
      /* publish it so the public url can be checked against the real segment */
      /* Through the real Owner approval, which records the approved version —
         a status forced by SQL is not an approval and is refused as stale. */
      await call("owner-tok", { action: "approve", record_id: rec.record_id });
      const p = await call("claude-tok", { action: "publish_approved", record_id: rec.record_id });
      ok(`   public url uses /${segment}/`, p.body.public_url === `https://${world}.sentinelfortune.com/${segment}/${rec.slug}`, p.body.public_url || JSON.stringify(p.body));
    }
  }

  console.log("\n── NEVER SILENTLY INTO THE WRONG WORLD ──");
  let r = await call("claude-tok", { action:"create_draft", identity:"lumengame", type:"TEACHING", title:"wrong world" });
  ok("a TEACHING is refused by Lumen Game", r.status===400 && r.body.error==="TYPE_NOT_ACCEPTED_BY_WORLD", `${r.body.error} ${r.body.detail||""}`);
  r = await call("claude-tok", { action:"create_draft", type:"NOT_A_TYPE", title:"x" });
  ok("an unknown type is refused with the choices named", r.status===400 && r.body.error==="UNKNOWN_TYPE" && Array.isArray(r.body.editorial_types));
  r = await call("claude-tok", { action:"create_draft", title:"no type at all" });
  ok("no type at all is reported as an unknown type", r.status===400 && r.body.error==="UNKNOWN_TYPE", r.body.error);
  /* BOOK is a governed type that four worlds present, so it implies no single
     destination. This is the case DESTINATION_REQUIRED exists for. */
  r = await call("claude-tok", { action:"create_draft", type:"BOOK", title:"ambiguous destination" });
  ok("a type that implies no world requires a destination", r.status===400 && r.body.error==="DESTINATION_REQUIRED", r.body.error);
  r = await call("claude-tok", { action:"create_draft", identity:"vibraflowmedia", type:"LESSON", title:"explicit identity wins" });
  ok("an explicit identity overrides the alias default", r.status===400 && r.body.error==="TYPE_NOT_ACCEPTED_BY_WORLD", r.body.error);

  console.log("\n── RICH CONTENT: cover, inline images, media ref, free PDF + ebook ──");
  r = await call("chatgpt-tok", {
    action:"create_draft", type:"TEACHING", title:"Rich editorial proof",
    summary:"Carries every media kind the MVP promises.",
    body:"Paragraph one.\n\nParagraph two.",
    cover_image:{ src:"https://vibraflowmedia.sentinelfortune.com/assets/cover.webp", alt_text:"A quiet desk at dawn" },
    inline_images:[
      { src:"https://vibraflowmedia.sentinelfortune.com/assets/inline-1.webp", alt:"Diagram of the loop" },
      { src:"/assets/inline-2.webp", alt:"Second figure" },
    ],
    media_refs:[{ kind:"AUDIO", src:"https://vibraflowmedia.sentinelfortune.com/assets/read-aloud.mp3", alt:"Read aloud" }],
    attachments:[
      { src:"https://vibraflowmedia.sentinelfortune.com/assets/worksheet.pdf", title:"Free worksheet (PDF)", format:"pdf" },
      { src:"https://vibraflowmedia.sentinelfortune.com/assets/companion.epub", title:"Free ebook", format:"epub" },
    ],
  });
  const rich = r.body.record;
  ok("created with rich content", r.status===201, JSON.stringify(r.body).slice(0,110));
  if (rich) {
    ok("cover image present with alt text", Boolean(rich.cover_image) && rich.cover_image.alt==="A quiet desk at dawn", JSON.stringify(rich.cover_image));
    ok("two inline images preserved", rich.inline_images.length===2, String(rich.inline_images.length));
    ok("audio media reference preserved", rich.media_refs.some(m=>m.kind==="AUDIO"));
    ok("free PDF attachment preserved", rich.attachments.some(a=>a.format==="PDF"));
    ok("free ebook attachment preserved", rich.attachments.some(a=>a.format==="EPUB"));
    ok("attachment becomes a DOWNLOAD action", rich.cta && rich.cta.kind==="DOWNLOAD", JSON.stringify(rich.cta));
    ok("structured body preserved", rich.body.includes("Paragraph two"));
    ok("still FREE — no price field anywhere", rich.pricing_tier==="FREE" && !JSON.stringify(rich).includes("price_cents"));
  }

  console.log("\n── UNGOVERNED MEDIA IS REFUSED, NOT SILENTLY DROPPED ──");
  r = await call("claude-tok", { action:"create_draft", type:"TEACHING", title:"Bad cover",
    cover_image:{ src:"https://evil.example.com/tracker.gif", alt:"x" } });
  ok("off-host cover image refused", r.status===400 && r.body.error==="UNGOVERNED_MEDIA_SRC", (r.body.rejected||[]).join(","));
  r = await call("claude-tok", { action:"create_draft", type:"TEACHING", title:"Bad attachment",
    attachments:[{ src:"http://insecure.example.com/book.pdf", title:"x" }] });
  ok("non-https attachment refused", r.status===400 && r.body.error==="UNGOVERNED_MEDIA_SRC");

  console.log("\n── CROSS-WORLD ISOLATION, through the engine's own gate ──");
  const payload = db.prepare("SELECT record_id,identity,slug,type,title,summary,description,pricing_tier,payload_json FROM editorial_records WHERE status='PUBLISHED'").all();
  const asFeed = payload.map(row => {
    const p = JSON.parse(row.payload_json);
    return { id: row.record_id, slug: row.slug, identity: row.identity, type: row.type, title: row.title,
      summary: row.summary, description: row.description, pricingTier: "FREE", media: p.media || [],
      cta: p.cta, publicationStatus: "PUBLIC_SITE", publicReadiness: { approved: true, withheld: false }, realArtefact: true };
  });
  const { selectPublic } = await import("../engine/core.js");
  let leaks = 0;
  for (const [, world] of ROUTES.map(r => [r[0], r[1]])) {
    const sel = selectPublic(asFeed, world);
    const foreign = sel.accepted.filter(rec => rec.identity !== world);
    if (foreign.length) leaks++;
    ok(`${world.padEnd(22)} sees only its own (${sel.accepted.length})`, foreign.length === 0, foreign.map(f=>f.id).join(","));
  }
  ok("zero cross-world leakage across all seven", leaks === 0);

  console.log(`\n${fails === 0 ? "ALL ROUTING + CONTENT CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
  process.exit(fails === 0 ? 0 : 1);
})();
