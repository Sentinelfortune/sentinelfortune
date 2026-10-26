/* Sentinel Fortune — PUBLIC REDACTION: WHAT A VISITOR MAY READ.
 *
 *   D1 row / static fixture  ->  publicEnvelope()  ->  /api/feed  ->  world
 *
 * Every feed the public engine receives passes through here, the dynamic one
 * and the static fallback alike. The feed is read by anyone, so it may carry
 * the Sentinel Fortune brand, the seven worlds and the published work — and
 * nothing about how that work was produced, stored or approved.
 *
 * FAIL CLOSED, IN TWO LAYERS:
 *
 * 1. STRIP what is known to be internal: fixture annotations (any key that
 *    starts with "_"), the corridor's bookkeeping in `metadata`, and the
 *    envelope's infrastructure identifiers. The envelope is rebuilt from an
 *    allow-list, never copied, so a new internal field cannot ride along.
 *
 * 2. SCAN what is left. A record that still names a private system, an
 *    internal agent identifier, a private path, a credential shape or a
 *    piece of corridor plumbing is WITHHELD — not trimmed — because a record
 *    that was supposed to be clean and is not is a record nobody has
 *    actually reviewed. The caller is told which records were withheld and
 *    by which rule, never the matched text.
 */

/* The one source label the public sees. engine/feed.js accepts it alongside
   the legacy labels, so a cached feed still loads during the switch. */
const PUBLIC_SOURCE_SYSTEM = "SENTINEL_FORTUNE";

/* Corridor bookkeeping a renderer never reads. */
const INTERNAL_METADATA_KEYS = Object.freeze([
  "corridor", "corridorVersion", "channel", "source", "sourceClient",
  "ownerInstructionId", "ownerApproval", "audit", "provenance", "revisionHistory",
]);

/* `metadata.evidence` is a public preview marker when it says TEST_PREVIEW.
   CONVERSATION_ORIGINATED describes how a draft was produced, which is not. */
const INTERNAL_EVIDENCE = Object.freeze(["CONVERSATION_ORIGINATED"]);

/**
 * [label, pattern]. Deliberately specific: the brand, the seven worlds and
 * ordinary words a published piece may use ("secret", "worker", "AI") must
 * not trip these. Each label is safe to log and to return.
 */
const PRIVATE_PATTERNS = Object.freeze([
  /* private systems */
  ["PRIVATE_SYSTEM", /house[\s_-]*of[\s_-]*assets/i],
  ["PRIVATE_SYSTEM", /\bhoa[._-][a-z]/i],
  ["PRIVATE_SYSTEM", /product[\s_-]*factory/i],
  ["PRIVATE_SYSTEM", /\bORIGINUS\b/i],
  ["PRIVATE_SYSTEM", /\bORsFlow\b/i],
  /* internal agent and principal identifiers */
  ["AGENT_IDENTIFIER", /\bCLIENT_(CHATGPT|CLAUDE)\b/],
  ["AGENT_IDENTIFIER", /\beditorial-worker\b/i],
  ["AGENT_IDENTIFIER", /\bDANI[-_][A-Za-z]/],
  ["AGENT_IDENTIFIER", /\bdani-local@/i],
  /* private paths */
  ["PRIVATE_PATH", /\b[A-Za-z]:\\[^\s"]/],
  ["PRIVATE_PATH", /(^|[\s"'(=])\/(Users|home|root)\/[^\s"]/],
  ["PRIVATE_PATH", /Sentinel-Fortune-Workspace/i],
  ["PRIVATE_PATH", /(^|[\s"'(/\\])\.(claude|backups|dev\.vars)\b/],
  /* credentials and their names */
  ["CREDENTIAL", /\bBearer\s+[A-Za-z0-9._~+/-]{8,}/],
  ["CREDENTIAL", /\b(sk|rk)_(live|test)_[A-Za-z0-9]{8,}/],
  ["CREDENTIAL", /\bwhsec_[A-Za-z0-9]{8,}/],
  ["CREDENTIAL", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["CREDENTIAL", /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ["CREDENTIAL", /\bAKIA[0-9A-Z]{16}\b/],
  ["CREDENTIAL", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./],
  ["CREDENTIAL", /\b(CORRIDOR_TOKEN|SFL_PUBLIC_CORRIDOR|SFL_CORRIDOR)_[A-Z0-9_]+/],
  ["CREDENTIAL", /\bCF_(API_TOKEN|D1_WRITE_TOKEN|ACCOUNT_ID|D1_DATABASE_ID)\b/],
  /* corridor plumbing */
  ["CORRIDOR_INTERNAL", /\b(SFL_)?EDITORIAL_CORRIDOR\b/],
  ["CORRIDOR_INTERNAL", /\b(editorial_records|editorial_events|corridor_idempotency|payload_json|d1_database)\b/],
  ["CORRIDOR_INTERNAL", /\bworker-handoff:/],
  ["CORRIDOR_INTERNAL", /\/api\/corridor\b/],
  ["CORRIDOR_INTERNAL", /api\.cloudflare\.com\/client|\/d1\/database\//],
]);

/** The first rule a string breaks, or null. */
function privateMatch(text) {
  for (const [label, re] of PRIVATE_PATTERNS) if (re.test(text)) return label;
  return null;
}

/** Every key and string value in `value`, depth-first. */
function* strings(value, depth = 0) {
  if (depth > 12) { yield "\u0000TOO_DEEP"; return; }
  if (typeof value === "string") { yield value; return; }
  if (!value || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value)) {
    yield k;
    yield* strings(v, depth + 1);
  }
}

/** The first rule anything in `value` breaks, or null. Nesting beyond any
 *  real record is itself refused: it cannot be scanned with confidence. */
function findPrivate(value) {
  for (const s of strings(value)) {
    if (s === "\u0000TOO_DEEP") return "TOO_DEEP";
    const label = privateMatch(s);
    if (label) return label;
  }
  return null;
}

/** Layer 1: drop what is known to be internal. Returns a new object. */
function stripInternal(record) {
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (!k.startsWith("_")) out[k] = v;
  }
  if (out.metadata && typeof out.metadata === "object" && !Array.isArray(out.metadata)) {
    const meta = {};
    for (const [k, v] of Object.entries(out.metadata)) {
      if (k.startsWith("_") || INTERNAL_METADATA_KEYS.includes(k)) continue;
      if (k === "evidence" && INTERNAL_EVIDENCE.includes(v)) continue;
      meta[k] = v;
    }
    out.metadata = meta;
  }
  return out;
}

/**
 * One record as the public may read it, or a refusal.
 *
 * -> { ok: true, record }  or  { ok: false, id, rule }
 */
function publicRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { ok: false, id: null, rule: "NOT_A_RECORD" };
  }
  const clean = stripInternal(record);
  const rule = findPrivate(clean);
  if (rule) return { ok: false, id: typeof record.id === "string" ? record.id : null, rule };
  return { ok: true, record: clean };
}

/**
 * The whole public envelope, rebuilt from an allow-list.
 *
 * -> { envelope, withheld: [{ id, rule }] }
 */
function publicEnvelope({ schema, evidence, generatedAt, records }) {
  const kept = [];
  const withheld = [];
  for (const r of Array.isArray(records) ? records : []) {
    const p = publicRecord(r);
    if (p.ok) kept.push(p.record);
    else withheld.push({ id: p.id, rule: p.rule });
  }
  return {
    envelope: {
      schema: schema || "sf.public-site/1.0",
      evidence: evidence === "LIVE" ? "LIVE" : "TEST_PREVIEW",
      source: { system: PUBLIC_SOURCE_SYSTEM, generated_at: generatedAt || new Date().toISOString() },
      records: kept,
    },
    withheld,
  };
}

module.exports = { PUBLIC_SOURCE_SYSTEM, PRIVATE_PATTERNS, findPrivate, publicRecord, publicEnvelope };
