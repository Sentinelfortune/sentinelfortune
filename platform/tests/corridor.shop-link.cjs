/* Sentinel Fortune — EDITORIAL -> SHOP POINTER REGRESSION.
 *
 *   node platform/tests/corridor.shop-link.cjs
 *
 * Pins server/shop-link.js through the whole free-editorial path:
 *   create_draft -> Owner approve -> publish_approved (asks the Shop)
 *   -> /api/feed -> engine normalize + ctaState
 *
 * Same harness as corridor.race.cjs: the real D1 schema on node:sqlite behind
 * a shim that speaks D1's HTTP shape. The Shop's PUBLIC catalogue
 * (GET /shop/products/:slug) is a second shim on a non-routable test origin;
 * nothing here reaches a network.
 *
 * Before the fix, sections 1 and 4 FAIL: the corridor stored a caller's
 * { kind: "OPEN", label: "Buy now · $49" } verbatim and the engine rendered it.
 * Exits non-zero on the first failed check.
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

const corridor = require("../api/corridor.js");
const feed = require("../api/feed.js");
const { SHOP_PRODUCT_PAGE } = require("../server/shop-link.js");
process.env.CF_ACCOUNT_ID = "a"; process.env.CF_D1_DATABASE_ID = "d";
process.env.CF_D1_WRITE_TOKEN = "W"; process.env.CF_API_TOKEN = "R";
process.env.CORRIDOR_TOKEN_CLAUDE = "claude-tok";
process.env.CORRIDOR_TOKEN_CHATGPT = "chatgpt-tok";
process.env.CORRIDOR_TOKEN_OWNER = "owner-tok";
delete process.env.CORRIDOR_STANDING_POLICY;

/* The Shop's public catalogue, as the Shop Worker answers it
   (shop-worker/src/routes/products.ts handleGetProduct). */
const SHOP = "https://shop.invalid.test";
const catalogue = new Map();
let shopDown = false;
let shopCalls = 0;

global.fetch = async (url, init = {}) => {
  if (String(url).startsWith(SHOP)) {
    shopCalls += 1;
    if (shopDown) throw new Error("connect ECONNREFUSED");
    const slug = decodeURIComponent(String(url).split("/shop/products/")[1] || "");
    const p = catalogue.get(slug);
    if (!p) return { ok: false, status: 404, json: async () => ({ ok: false, error: "Product not found." }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, product: p }) };
  }
  const { sql, params } = JSON.parse(init.body);
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
  await corridor({ method: "POST", headers: { authorization: `Bearer ${tok}` }, body: payload }, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}
async function readFeed() {
  const res = { headers: {}, statusCode: 0, body: "", setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await feed({ method: "GET", headers: {} }, res);
  return JSON.parse(res.body);
}
const rec = (id) => db.prepare("SELECT * FROM editorial_records WHERE record_id=?").get(id);

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

let n = 0;
const draft = (extra) => { n += 1; return call("claude-tok", {
  action: "create_draft", type: "TEACHING", identity: "vibraflowmedia",
  title: `Shop Link Teaching ${n}`, summary: "Free teaching.", body: "Body of a free teaching.", ...extra,
}); };
async function approveAndPublish(id) {
  await call("claude-tok", { action: "submit_review", record_id: id });
  await call("owner-tok", { action: "approve", record_id: id });
  return call("claude-tok", { action: "publish_approved", record_id: id });
}

(async () => {
  console.log("=== 1. an invented price cannot ride on an editorial CTA ===");
  for (const [label, cta] of [
    ["OPEN with a price in the label", { kind: "OPEN", label: "Buy now · $49", destination: "/reflect/x" }],
    ["OPEN with French purchase wording", { kind: "OPEN", label: "Acheter le guide", destination: "/reflect/x" }],
    ["BUY on a free record", { kind: "BUY", label: "Get it", destination: "/reflect/x" }],
    ["a cta that carries a price field", { kind: "OPEN", label: "Open", destination: "/reflect/x", price: 49 }],
    ["a direct link into the Shop", { kind: "OPEN", label: "See it", destination: `${SHOP_PRODUCT_PAGE}?slug=ledger-watch` }],
    ["a link into a checkout", { kind: "OPEN", label: "Open", destination: "https://sentinelfortune.com/checkout" }],
    ["an off-host destination", { kind: "OPEN", label: "Open", destination: "https://evil.example.com/x" }],
  ]) {
    const r = await draft({ cta });
    check(`refused: ${label}`, r.status === 400 && /CTA|PRODUCT_REF/.test(r.body.error || ""), `${r.status} ${r.body.error}`);
  }
  const plain = await draft({ cta: { kind: "LISTEN", label: "Listen to the session", destination: "/reflect/session-audio" } });
  check("an honest editorial CTA is still accepted", plain.status === 201 && plain.body.record.cta.kind === "LISTEN", `${plain.status}`);
  const none = await draft({});
  check("no cta still defaults to READ on the record's own page", none.status === 201 && none.body.record.cta.kind === "READ");

  console.log("=== 2. product_ref is the only Shop pointer, and carries only a slug ===");
  for (const [label, extra] of [
    ["product_ref with a price", { product_ref: { shop_slug: "ledger-watch", price: 49 } }],
    ["product_ref with a malformed slug", { product_ref: { shop_slug: "Ledger Watch!" } }],
    ["product_ref and cta together", { product_ref: { shop_slug: "ledger-watch" }, cta: { kind: "READ", destination: "/x" } }],
    ["product_ref and attachments together", { product_ref: { shop_slug: "ledger-watch" }, attachments: [{ src: "/assets/a.pdf", title: "A" }] }],
  ]) {
    const r = await draft(extra);
    check(`refused: ${label}`, r.status === 400 && /CTA_CONFLICT|PRODUCT_REF_INVALID/.test(r.body.error || ""), `${r.status} ${r.body.error}`);
  }
  const linked = await draft({ product_ref: { shop_slug: "ledger-watch" } });
  const L = linked.body.record;
  check("product_ref builds the corridor's own CTA", linked.status === 201
    && L.cta.kind === "OPEN" && L.cta.label === "See the product"
    && L.cta.destination === `${SHOP_PRODUCT_PAGE}?slug=ledger-watch`
    && L.product_ref.shop_slug === "ledger-watch", JSON.stringify(L.cta));
  const id = L.record_id;

  console.log("=== 3. publication asks the Shop, and fails closed ===");
  delete process.env.SHOP_API_BASE;
  let p = await approveAndPublish(id);
  check("no Shop catalogue configured: refused, nothing published",
    p.status === 409 && p.body.error === "SHOP_PRODUCT_UNVERIFIED" && rec(id).status === "APPROVED", `${p.status} ${p.body.error} → ${rec(id).status}`);

  process.env.SHOP_API_BASE = "http://shop.invalid.test";
  p = await call("claude-tok", { action: "publish_approved", record_id: id });
  check("a plain-http Shop origin is not trusted", p.status === 409 && p.body.error === "SHOP_PRODUCT_UNVERIFIED");

  process.env.SHOP_API_BASE = SHOP;
  p = await call("claude-tok", { action: "publish_approved", record_id: id });
  check("product not published in the Shop: refused", p.status === 409 && p.body.error === "SHOP_PRODUCT_NOT_PUBLISHED" && rec(id).status === "APPROVED", `${p.status} ${p.body.error}`);

  shopDown = true;
  p = await call("claude-tok", { action: "publish_approved", record_id: id });
  check("Shop unreachable: 503, nothing published", p.status === 503 && p.body.error === "SHOP_UNREACHABLE" && rec(id).status === "APPROVED", `${p.status} ${p.body.error}`);
  shopDown = false;

  catalogue.set("ledger-watch", { slug: "other-product", title: "Other", buyable: true });
  p = await call("claude-tok", { action: "publish_approved", record_id: id });
  check("a Shop answer naming a different product does not confirm this one", p.status === 409 && p.body.error === "SHOP_PRODUCT_NOT_PUBLISHED");

  catalogue.set("ledger-watch", { slug: "ledger-watch", title: "Ledger Watch", priceCents: 4900, buyable: true });
  const before = shopCalls;
  p = await call("claude-tok", { action: "publish_approved", record_id: id });
  check("Shop confirms the product: published", p.status === 200 && rec(id).status === "PUBLISHED" && shopCalls === before + 1, `${p.status} → ${rec(id).status}`);
  const ev = db.prepare("SELECT detail_json FROM editorial_events WHERE record_id=? AND action='publish_approved'").get(id);
  const detail = JSON.parse(ev.detail_json);
  check("the audit trail records which product the Shop confirmed", detail.shop_product && detail.shop_product.slug === "ledger-watch" && detail.shop_product.verified_at, ev.detail_json);
  check("the Shop's price was NOT copied into the editorial record", !/4900|49\.00|\$49/.test(rec(id).payload_json + ev.detail_json));

  console.log("=== 4. what the public engine renders ===");
  const envelope = await readFeed();
  const fed = envelope.records.find((r) => r.id === id);
  const { normalize } = await import("../engine/core.js");
  const { ctaState, priceState } = await import("../engine/commerce.js");
  const view = normalize(fed);
  const action = ctaState(view);
  check("the feed carries the record", Boolean(fed));
  check("the engine renders an OPEN to the Shop's product page, not a BUY",
    action.enabled && action.kind === "OPEN" && action.href === `${SHOP_PRODUCT_PAGE}?slug=ledger-watch` && action.label === "See the product",
    JSON.stringify(action));
  check("the editorial record shows no price", priceState(view).state === "FREE" && !/\$|€/.test(action.label));

  console.log("=== 5. withdrawn from the Shop after approval: restore is refused ===");
  await call("claude-tok", { action: "unpublish", record_id: id });
  catalogue.delete("ledger-watch");
  p = await call("claude-tok", { action: "publish_approved", record_id: id });
  check("a product the Shop no longer publishes is not re-advertised", p.status === 409 && p.body.error === "SHOP_PRODUCT_NOT_PUBLISHED" && rec(id).status === "UNPUBLISHED", `${p.status} → ${rec(id).status}`);

  console.log("=== 6. records with no product_ref never ask the Shop ===");
  delete process.env.SHOP_API_BASE;
  const calls = shopCalls;
  const r6 = await approveAndPublish(plain.body.record.record_id);
  check("plain editorial publishes with no Shop configured", r6.status === 200 && shopCalls === calls, `${r6.status}`);

  console.log(failures ? `\nSHOP LINK: ${failures} check(s) FAILED` : "\nSHOP LINK: all checks passed.");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
