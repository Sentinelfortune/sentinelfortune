/* Public redaction — nothing internal in what a visitor can read.
 *
 * Run: node --test platform/tests/public-redaction.test.mjs
 *
 * Covers every public read surface of the platform: the static feed file as
 * Vercel serves it, the corridor's committed public feed, /api/feed on both its
 * dynamic and fallback paths, and the error bodies of /api/corridor and
 * /api/chatgpt-corridor. No network: D1 is a stub.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { readEnvelope } from "../engine/feed.js";
import { selectPublic } from "../engine/core.js";
import { buildFeed } from "../../corridor/core/publish.js";

const require = createRequire(import.meta.url);
const { findPrivate, publicRecord, publicEnvelope, PUBLIC_SOURCE_SYSTEM } = require("../server/public-redact.js");
const feedHandler = require("../api/feed.js");
const corridorHandler = require("../api/corridor.js");
const chatgptHandler = require("../api/chatgpt-corridor.js");

const STATIC_TEXT = readFileSync(new URL("../feed/public-site.json", import.meta.url), "utf8");
const STATIC = JSON.parse(STATIC_TEXT);
const CORRIDOR_FEED_TEXT = readFileSync(new URL("../../corridor/editorial/public-feed.json", import.meta.url), "utf8");

const DB_ID = "d1-db-0f3c9a7e-private-id";
const ACCOUNT = "acct-7b21-private";

/* Text that must never be served, whatever path a response took. */
const NEVER_PUBLIC = [
  /house[\s_-]*of[\s_-]*assets/i, /product[\s_-]*factory/i, /EDITORIAL_CORRIDOR/, /corridorVersion/,
  /d1_database/, /\bD1\b/, /CONVERSATION_ORIGINATED/, /editorial-worker/, /CLIENT_(CHATGPT|CLAUDE)/,
  new RegExp(DB_ID), new RegExp(ACCOUNT), /_evidence_note|_why_invalid/,
];
function assertNothingInternal(text, where) {
  for (const re of NEVER_PUBLIC) assert.ok(!re.test(text), `${where} leaks ${re}`);
}

/* ── stubs ─────────────────────────────────────────────────────────────── */

function mockRes() {
  return { headers: {}, statusCode: 0, body: "", setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
}
let d1 = { rows: [], fail: null };
globalThis.fetch = async (url) => {
  if (!String(url).includes("/d1/database/")) throw new Error(`unexpected network call: ${url}`);
  if (d1.fail) return { ok: false, status: 500, json: async () => ({ success: false, errors: [{ message: d1.fail }] }) };
  return { ok: true, json: async () => ({ success: true, result: [{ results: d1.rows }] }) };
};
const quiet = console.warn;
async function getFeed(env) {
  for (const k of ["CF_ACCOUNT_ID", "CF_D1_DATABASE_ID", "CF_API_TOKEN"]) delete process.env[k];
  Object.assign(process.env, env);
  const res = mockRes();
  const warned = [];
  console.warn = (m) => warned.push(String(m));
  try { await feedHandler({ method: "GET", headers: {} }, res); } finally { console.warn = quiet; }
  return { status: res.statusCode, headers: res.headers, text: res.body, json: JSON.parse(res.body), warned };
}
const CONFIGURED = { CF_ACCOUNT_ID: ACCOUNT, CF_D1_DATABASE_ID: DB_ID, CF_API_TOKEN: "read-token-xyz" };

function row(over = {}) {
  return {
    record_id: "edl-vib-a-quiet-strength", identity: "vibraflowmedia", slug: "a-quiet-strength", type: "TEACHING",
    title: "A Quiet Strength", summary: "A short teaching.", description: "There is a kind of strength that does not announce itself.",
    pricing_tier: "FREE", version: 3, published_at: "2026-10-25T10:00:00Z", updated_at: "2026-10-25T10:00:00Z",
    payload_json: JSON.stringify({
      body: "There is a kind of strength that does not announce itself.",
      media: [], attachments: [], categories: ["Reflection"], collections: [], featured: false,
      cta: { kind: "READ", label: "Read this", destination: "/reflect/a-quiet-strength" },
      metadata: {
        evidence: "CONVERSATION_ORIGINATED", locale: "en", editorial_type: "REFLECTION", corridor: true,
        translations: { fr: { title: "Une force tranquille", summary: "Un court enseignement.", description: "Il existe une force qui ne s'annonce pas." } },
      },
    }),
    ...over,
  };
}

/* ═════════════════════════════════════════════════════════════════════════
   1. THE FILES VERCEL AND PAGES SERVE AS-IS
   ═════════════════════════════════════════════════════════════════════════ */

test("1a. the static feed file, served raw, names no private system and no internal mechanics", () => {
  assert.equal(findPrivate(STATIC), null, "every key and string of the raw file, annotations included");
  assert.ok(!/house[\s_-]*of[\s_-]*assets/i.test(STATIC_TEXT));
  assert.equal(STATIC.source.system, PUBLIC_SOURCE_SYSTEM);
  assert.ok(readEnvelope(STATIC).ok, "the engine still accepts it");
});

test("1aa. no sample catalogue ships as a public static fallback", () => {
  assert.ok(STATIC.records.every(r => r.publicReadiness?.approved === true && r.publicationStatus === "PUBLIC_SITE"));
  assert.ok(STATIC.records.every(r => !/^(test-|v2-preview-)/.test(r.id)));
  assert.ok(STATIC.records.some(r => r.id === "vibraflow-legacy-365-day-001"));
  assert.equal(STATIC.evidence, "LIVE");
});

test("1b. the corridor's committed public feed names no private system or channel", () => {
  const feed = JSON.parse(CORRIDOR_FEED_TEXT);
  assert.equal(findPrivate(feed), null);
  assert.equal(feed.source.system, PUBLIC_SOURCE_SYSTEM);
  assert.equal(feed.source.channel, undefined);
  for (const r of feed.records) assert.equal(r.metadata.corridor, undefined);
  assert.ok(readEnvelope(feed).ok);
});

test("1c. the corridor's feed builder emits the public label and no channel", () => {
  const feed = buildFeed({ all: () => [] }, { now: () => Date.parse("2026-10-26T00:00:00Z") });
  assert.deepEqual(Object.keys(feed.source).sort(), ["generated_at", "system"]);
  assert.equal(feed.source.system, PUBLIC_SOURCE_SYSTEM);
});

test("1d. the engine accepts the public label and still refuses an unknown source", () => {
  assert.ok(readEnvelope({ schema: "sf.public-site/1.0", source: { system: "SENTINEL_FORTUNE" }, records: [] }).ok);
  assert.ok(readEnvelope({ schema: "sf.public-site/1.0", source: { system: "HOUSE_OF_ASSETS" }, records: [] }).ok, "legacy label still loads");
  assert.equal(readEnvelope({ schema: "sf.public-site/1.0", source: { system: "SOMEONE_ELSE" }, records: [] }).ok, false);
});

/* ═════════════════════════════════════════════════════════════════════════
   2. /api/feed
   ═════════════════════════════════════════════════════════════════════════ */

test("2a. dynamic: no database id, no corridor bookkeeping, neutral headers; the work itself survives", async () => {
  d1 = { rows: [row()], fail: null };
  const r = await getFeed(CONFIGURED);
  assert.equal(r.status, 200);
  assertNothingInternal(r.text, "dynamic body");
  assertNothingInternal(JSON.stringify(r.headers), "dynamic headers");
  assert.deepEqual(Object.keys(r.json.source).sort(), ["generated_at", "system"]);
  assert.equal(r.json.source.system, PUBLIC_SOURCE_SYSTEM);
  assert.equal(r.headers["X-SF-Feed-Source"], "DYNAMIC+STATIC");
  assert.equal(r.headers["X-SF-Feed-Withheld-Count"], "0");

  const env = readEnvelope(r.json);
  assert.ok(env.ok, env.problems.join("; "));
  const fed = env.records.find((x) => x.id === "edl-vib-a-quiet-strength");
  assert.ok(fed, "the published record is served");
  assert.equal(fed.metadata.translations.fr.title, "Une force tranquille", "the French travels");
  assert.equal(fed.metadata.editorial_type, "REFLECTION");
  assert.ok(selectPublic(env.records, "vibraflowmedia").accepted.some((x) => x.id === fed.id), "the engine still selects it");
  for (const x of env.records) assert.ok(!Object.keys(x).some((k) => k.startsWith("_")), `${x.id} keeps a fixture annotation`);
});

test("2b. a record carrying a private name, path, credential or agent id is withheld, and its text never served", async () => {
  const leaks = [
    ["edl-1", { description: "Produced in House of Assets before release." }],
    ["edl-2", { summary: "Draft saved at D:\\Sentinel-Fortune-Workspace\\governance\\x.json" }],
    ["edl-3", { title: "Bearer abcdefghijklmnop123" }],
    ["edl-4", { payload_json: JSON.stringify({ metadata: { note: "handed in by editorial-worker" } }) }],
    ["edl-5", { payload_json: JSON.stringify({ categories: ["sk_live_51Habcdefghijkl"] }) }],
  ];
  d1 = { rows: [row(), ...leaks.map(([id, over], i) => row({ record_id: id, slug: `leak-${i}`, ...over }))], fail: null };
  const r = await getFeed(CONFIGURED);
  assert.equal(r.status, 200);
  const ids = r.json.records.map((x) => x.id);
  assert.ok(ids.includes("edl-vib-a-quiet-strength"), "the clean record is unaffected");
  for (const [id] of leaks) assert.ok(!ids.includes(id), `${id} withheld`);
  assert.equal(r.headers["X-SF-Feed-Withheld-Count"], String(leaks.length));
  for (const needle of ["House of Assets", "Sentinel-Fortune-Workspace", "abcdefghijklmnop123", "editorial-worker", "sk_live_"]) {
    assert.ok(!r.text.includes(needle), `served: ${needle}`);
  }
  assert.ok(r.warned.every((w) => !/House of Assets|abcdefghijklmnop123|sk_live_/.test(w)), "the log names the rule, not the text");
  assert.ok(r.warned.some((w) => w.includes("edl-3") && w.includes("CREDENTIAL")));
});

test("2c. D1 down: the fallback is redacted the same way and the headers name no storage", async () => {
  d1 = { rows: [], fail: `D1_ERROR: no such table editorial_records in ${DB_ID}` };
  const r = await getFeed(CONFIGURED);
  assert.equal(r.status, 200);
  assert.equal(r.headers["X-SF-Feed-Source"], "STATIC_FALLBACK");
  assert.equal(r.headers["X-SF-Feed-Degraded"], "UPSTREAM_UNAVAILABLE");
  assertNothingInternal(r.text, "fallback body");
  assertNothingInternal(JSON.stringify(r.headers), "fallback headers");
  assert.ok(!r.text.includes("no such table"));
  assert.equal(r.json.records.length, STATIC.records.length, "every fixture record is still served for the engine to judge");
  assert.ok(readEnvelope(r.json).ok);
});

test("2d. unconfigured: same redacted fallback", async () => {
  const r = await getFeed({});
  assert.equal(r.headers["X-SF-Feed-Degraded"], "UNCONFIGURED");
  assertNothingInternal(r.text, "unconfigured body");
  assert.equal(r.json.source.system, PUBLIC_SOURCE_SYSTEM);
});

/* ═════════════════════════════════════════════════════════════════════════
   3. THE REDACTOR ITSELF
   ═════════════════════════════════════════════════════════════════════════ */

test("3a. the public brand, the seven worlds and ordinary words are not withheld", () => {
  const ok = publicRecord({
    id: "x", title: "Sentinel Fortune Records presents", summary: "Lumen School Academy · Codex World TV · OG Legacy Store",
    description: "Secrets kept as digests rather than values. Shipping one edge Worker. Using ChatGPT safely in a licensed trade.",
    cta: { kind: "OPEN", destination: "https://sentinelfortune.github.io/sentinelfortune/shop/" },
    metadata: { evidence: "TEST_PREVIEW" },
  });
  assert.ok(ok.ok, ok.rule);
  assert.equal(ok.record.metadata.evidence, "TEST_PREVIEW", "the public preview marker stays");
});

test("3b. internal keys are stripped, not merely scanned", () => {
  const p = publicRecord({ id: "x", _why_invalid: "fixture note", metadata: { corridor: true, corridorVersion: 4, channel: "x", evidence: "CONVERSATION_ORIGINATED", series: "S" } });
  assert.ok(p.ok);
  assert.deepEqual(p.record, { id: "x", metadata: { series: "S" } });
});

test("3c. the envelope is rebuilt from an allow-list: unknown envelope fields never pass", () => {
  const { envelope } = publicEnvelope({ schema: "sf.public-site/1.0", evidence: "LIVE", generatedAt: "2026-10-26T00:00:00Z", records: [], d1_database: DB_ID });
  assert.deepEqual(Object.keys(envelope).sort(), ["evidence", "records", "schema", "source"]);
  assert.equal(publicEnvelope({ records: [] }).envelope.evidence, "TEST_PREVIEW", "anything not LIVE stays preview");
});

test("3d. unscannably deep or malformed records are withheld", () => {
  let deep = { v: "x" };
  for (let i = 0; i < 20; i++) deep = { n: deep };
  assert.equal(publicRecord({ id: "deep", metadata: deep }).ok, false);
  assert.equal(publicRecord(null).ok, false);
  assert.equal(publicRecord(["x"]).ok, false);
});

/* ═════════════════════════════════════════════════════════════════════════
   4. PUBLIC ERROR RESPONSES
   ═════════════════════════════════════════════════════════════════════════ */

async function corridorCall({ method = "POST", token, body }) {
  const res = mockRes();
  await corridorHandler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
  return { status: res.statusCode, text: res.body, json: JSON.parse(res.body) };
}

test("4a. /api/corridor refuses the public with a bare code and nothing else", async () => {
  Object.assign(process.env, { CORRIDOR_TOKEN_CLAUDE: "claude-tok-1", CORRIDOR_TOKEN_EDITORIAL_WORKER: "worker-tok-1" });
  const anon = await corridorCall({ body: { action: "list_recent" } });
  assert.equal(anon.status, 401);
  assert.deepEqual(anon.json, { error: "UNAUTHORIZED" });
  const wrong = await corridorCall({ token: "guess", body: { action: "list_recent" } });
  assert.deepEqual(wrong.json, { error: "UNAUTHORIZED" });
  const get = await corridorCall({ method: "GET" });
  assert.deepEqual(get.json, { error: "METHOD_NOT_ALLOWED" });
});

test("4b. an upstream failure reaches the caller as one code: no database message, id or account", async () => {
  Object.assign(process.env, { CF_ACCOUNT_ID: ACCOUNT, CF_D1_DATABASE_ID: DB_ID, CF_D1_WRITE_TOKEN: "write-tok-1" });
  d1 = { rows: [], fail: `D1_ERROR: SQLITE_BUSY on editorial_records in ${DB_ID}` };
  const r = await corridorCall({ token: "claude-tok-1", body: { action: "get_record", record_id: "x" } });
  assert.equal(r.status, 502);
  assert.deepEqual(r.json, { error: "CORRIDOR_UPSTREAM_FAILURE" });
  assertNothingInternal(r.text, "upstream failure body");
});

test("4c. the ChatGPT adapter's configuration error names no agent", async () => {
  const saved = process.env.CORRIDOR_TOKEN_CHATGPT;
  delete process.env.CORRIDOR_TOKEN_CHATGPT;
  const res = mockRes();
  await chatgptHandler({ method: "POST", headers: { host: "sfl-platform-abc.vercel.app" }, query: { id: "legacy-365-day-001" } }, res);
  if (saved !== undefined) process.env.CORRIDOR_TOKEN_CHATGPT = saved;
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), { error: "ADAPTER_UNCONFIGURED" });
  assert.ok(!/chatgpt|claude/i.test(res.body));
});
