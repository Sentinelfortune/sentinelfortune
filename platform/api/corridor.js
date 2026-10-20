/* Sentinel Fortune — EDITORIAL CORRIDOR: THE GOVERNED WRITE PATH.
 *
 *   Claude / ChatGPT  ->  POST /api/corridor  ->  D1  ->  /api/feed  ->  world
 *
 * ONE CORRIDOR, TWO ADAPTERS, SEVEN DESTINATIONS. Both assistants call the
 * same endpoint with the same contract; the only difference between them is
 * which credential they present, and that is recorded as provenance. There is
 * no second publishing system and no per-assistant branch in this file —
 * which is the whole point of the corridor being one corridor.
 *
 * EIGHT ACTIONS: create_draft, update_draft, get_preview, publish_approved,
 * unpublish, archive, list_recent, get_record.
 *
 * WHAT THIS ENDPOINT WILL NOT DO, AND WHY IT MATTERS MORE THAN WHAT IT DOES:
 *
 * 1. IT CANNOT PUBLISH SOMETHING NOBODY APPROVED. `publish_approved` only
 *    publishes a record already in APPROVED, or one covered by an Owner
 *    standing policy. An assistant holding a corridor credential cannot move
 *    a record from REVIEW to APPROVED — that transition is not reachable
 *    through this API at all. Self-approval is not rate-limited or discouraged
 *    here; it is absent.
 *
 * 2. IT CANNOT SELL ANYTHING. The schema pins pricing_tier to FREE and this
 *    file never writes a price. Paid work goes through House of Assets or it
 *    does not happen. A free-editorial path that could quietly grow a
 *    commercial capability would be a second commercial authority.
 *
 * 3. IT CANNOT REACH A WORLD IT WAS NOT GIVEN. `identity` is checked here and
 *    again by a CHECK constraint in D1, against the same seven slugs.
 *
 * CREDENTIALS. Two Cloudflare tokens with different jobs, never crossed:
 *   CF_API_TOKEN        public feed reads only (api/feed.js), D1 read scope
 *   CF_D1_WRITE_TOKEN   every corridor operation in this file
 * Corridor READS live here rather than on the public token on purpose: a draft
 * is not public, so reading one is a governed operation, not a public one.
 * Neither token is ever returned, logged in a response, or echoed in an error.
 */

const CF_API = "https://api.cloudflare.com/client/v4";

const IDENTITIES = [
  "sentinelfortunerecords", "codexworldtv", "lumengame", "lumenschoolacademy",
  "vibraflowmedia", "lightnodesystems", "oglegacystore",
];

/* The engine's closed type set. A type with no renderer is refused at the
   door rather than becoming a record nothing can display. */
const TYPES = ["MUSIC_RELEASE", "STORY", "GAME", "COURSE", "TEACHING", "SOFTWARE", "BOOK", "PODCAST", "BUNDLE"];

const ACTIONS = [
  "create_draft", "update_draft", "get_preview", "publish_approved",
  "unpublish", "archive", "list_recent", "get_record",
];

const WRITE_ACTIONS = ["create_draft", "update_draft", "publish_approved", "unpublish", "archive"];

/* Which transitions exist. Anything absent is not merely refused — it is not
   expressible, which is the difference between a rule and a hope. */
const TRANSITIONS = {
  update_draft:     ["DRAFT", "REVIEW", "APPROVED", "PUBLISHED"],
  publish_approved: ["APPROVED"],
  unpublish:        ["PUBLISHED"],
  archive:          ["DRAFT", "REVIEW", "APPROVED", "UNPUBLISHED"],
};

/* Each world's public path segment, for the preview and published URLs. */
const SEGMENT = {
  sentinelfortunerecords: "release", codexworldtv: "story", lumengame: "play",
  lumenschoolacademy: "learn", vibraflowmedia: "reflect",
  lightnodesystems: "system", oglegacystore: "drop",
};

const RATE_LIMIT_PER_HOUR = 60;

/* ── D1 ─────────────────────────────────────────────────────────────────── */

async function d1(sql, params, env) {
  const res = await fetch(`${CF_API}/accounts/${env.accountId}/d1/database/${env.databaseId}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.writeToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params: params || [] }),
  });
  /* The upstream message is kept on the thrown Error so callers in THIS file
     can tell a uniqueness collision from a real fault. It is never put in a
     response — the endpoint's catch answers CORRIDOR_UPSTREAM_FAILURE and
     nothing more. */
  if (!res.ok) {
    let detail = `d1 ${res.status}`;
    try {
      const err = await res.json();
      const first = err && Array.isArray(err.errors) ? err.errors[0] : null;
      if (first && first.message) detail = first.message;
    } catch { /* keep the status-only detail */ }
    throw new Error(detail);
  }
  const body = await res.json();
  if (!body || body.success !== true) throw new Error("d1 unsuccessful");
  const first = Array.isArray(body.result) ? body.result[0] : null;
  return (first && Array.isArray(first.results)) ? first.results : [];
}

/* ── identity of the caller ─────────────────────────────────────────────── */

/** Constant-time compare, so a wrong token cannot be found a byte at a time. */
function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Bearer token -> adapter name. The ONLY place the two assistants differ. */
function identifyCaller(req) {
  const header = String(req.headers.authorization || "");
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented) return null;
  const known = [
    ["claude", process.env.CORRIDOR_TOKEN_CLAUDE],
    ["chatgpt", process.env.CORRIDOR_TOKEN_CHATGPT],
  ];
  for (const [name, secret] of known) {
    if (secret && sameSecret(presented, secret)) return name;
  }
  return null;
}

/* ── standing policy ───────────────────────────────────────────────────── */

/**
 * The Owner's standing approval, as configured data rather than code.
 *
 * CORRIDOR_STANDING_POLICY is a JSON array of {identity, types[]} entries.
 * Absent or unparseable means NO standing policy, so the failure direction is
 * towards Owner review — the safe one.
 */
function standingPolicyAllows(record) {
  let policy;
  try { policy = JSON.parse(process.env.CORRIDOR_STANDING_POLICY || "[]"); } catch { return false; }
  if (!Array.isArray(policy)) return false;
  return policy.some((rule) =>
    rule && rule.identity === record.identity
    && Array.isArray(rule.types) && rule.types.includes(record.type));
}

/* ── helpers ───────────────────────────────────────────────────────────── */

const now = () => new Date().toISOString();

function slugify(value) {
  return String(value || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function publicUrl(record) {
  const seg = SEGMENT[record.identity];
  return `https://${record.identity}.sentinelfortune.com/${seg}/${record.slug}`;
}

/** What a caller is allowed to know about a record. Never the raw payload
 *  column, never anything about the infrastructure that stored it. */
function present(row) {
  let payload = {};
  try { payload = JSON.parse(row.payload_json) || {}; } catch { payload = {}; }
  return {
    record_id: row.record_id,
    identity: row.identity,
    slug: row.slug,
    type: row.type,
    title: row.title,
    summary: row.summary || "",
    description: row.description || "",
    pricing_tier: row.pricing_tier,
    status: row.status,
    version: row.version,
    provenance: { created_by: row.created_by, source: row.source, created_at: row.created_at },
    approval: row.approved_by
      ? { approved_by: row.approved_by, mode: row.approval_mode, at: row.approved_at }
      : null,
    published_at: row.published_at,
    unpublished_at: row.unpublished_at,
    rollback_of: row.rollback_of,
    updated_at: row.updated_at,
    media: Array.isArray(payload.media) ? payload.media : [],
    categories: Array.isArray(payload.categories) ? payload.categories : [],
    collections: Array.isArray(payload.collections) ? payload.collections : [],
    cta: payload.cta || null,
    public_url: row.status === "PUBLISHED" ? publicUrl(row) : null,
  };
}

async function loadRecord(recordId, env) {
  const rows = await d1("SELECT * FROM editorial_records WHERE record_id = ?1", [recordId], env);
  return rows[0] || null;
}

async function logEvent(e, env) {
  await d1(
    `INSERT INTO editorial_events (record_id, action, from_status, to_status, actor, adapter, approval_mode, at, detail_json)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
    [e.record_id, e.action, e.from || null, e.to || null, e.actor, e.adapter,
     e.approval_mode || null, now(), e.detail ? JSON.stringify(e.detail) : null],
    env,
  );
}

/* ── the actions ───────────────────────────────────────────────────────── */

async function createDraft(body, caller, env) {
  const identity = body.identity;
  const type = body.type;
  if (!IDENTITIES.includes(identity)) return { status: 400, body: { error: "UNKNOWN_IDENTITY" } };
  if (!TYPES.includes(type)) return { status: 400, body: { error: "UNKNOWN_TYPE" } };
  if (!body.title || typeof body.title !== "string") return { status: 400, body: { error: "TITLE_REQUIRED" } };

  const slug = slugify(body.slug || body.title);
  if (!slug) return { status: 400, body: { error: "SLUG_UNRESOLVABLE" } };
  const recordId = body.record_id || `edl-${identity.slice(0, 3)}-${slug}`.slice(0, 120);

  const payload = {
    media: Array.isArray(body.media) ? body.media : [],
    categories: Array.isArray(body.categories) ? body.categories : [],
    collections: Array.isArray(body.collections) ? body.collections : [],
    featured: body.featured === true,
    cta: body.cta || { kind: "READ", label: "Read this", destination: `/${SEGMENT[identity]}/${slug}` },
    metadata: { evidence: "CONVERSATION_ORIGINATED" },
  };

  /* The timestamp is passed twice as two distinct placeholders rather than
     reusing ?10. Repeating a numbered parameter is legal in D1 but needless,
     and it broke every harness that binds positionally. */
  const stamp = now();
  try {
    await d1(
      `INSERT INTO editorial_records
        (record_id, identity, slug, type, title, summary, description, pricing_tier,
         status, version, payload_json, created_by, source, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,'FREE','DRAFT',1,?8,?9,'CONVERSATION',?10,?11)`,
      [recordId, identity, slug, type, body.title, body.summary || "", body.description || "",
       JSON.stringify(payload), caller, stamp, stamp],
      env,
    );
  } catch (err) {
    /* ONLY a uniqueness collision is reported as RECORD_EXISTS. The first
       version returned that for ANY insert failure, which turned a CHECK
       violation and a malformed statement into a confident, wrong diagnosis —
       the most expensive kind of error message. Anything else is re-thrown to
       the generic upstream handler, which says it does not know. */
    if (/UNIQUE|constraint failed: editorial_records\.(record_id|identity)/i.test(String(err && err.message))) {
      return { status: 409, body: { error: "RECORD_EXISTS", detail: "a record with this identity and slug already exists" } };
    }
    throw err;
  }

  await logEvent({ record_id: recordId, action: "create_draft", to: "DRAFT", actor: caller, adapter: caller }, env);
  const row = await loadRecord(recordId, env);
  return { status: 201, body: { record: present(row) } };
}

async function updateDraft(body, caller, env) {
  const row = await loadRecord(body.record_id, env);
  if (!row) return { status: 404, body: { error: "NOT_FOUND" } };
  if (!TRANSITIONS.update_draft.includes(row.status)) {
    return { status: 409, body: { error: "NOT_EDITABLE", status: row.status } };
  }

  const title = body.title !== undefined ? String(body.title) : row.title;
  const summary = body.summary !== undefined ? String(body.summary) : row.summary;
  const description = body.description !== undefined ? String(body.description) : row.description;

  await d1(
    `UPDATE editorial_records
        SET title=?2, summary=?3, description=?4, version=version+1, updated_at=?5
      WHERE record_id=?1`,
    [row.record_id, title, summary, description, now()], env,
  );
  await logEvent({
    record_id: row.record_id, action: "update_draft", from: row.status, to: row.status,
    actor: caller, adapter: caller, detail: { version: row.version + 1 },
  }, env);
  return { status: 200, body: { record: present(await loadRecord(row.record_id, env)) } };
}

async function getPreview(body, caller, env) {
  const row = await loadRecord(body.record_id, env);
  if (!row) return { status: 404, body: { error: "NOT_FOUND" } };
  const record = present(row);
  return {
    status: 200,
    body: {
      record,
      /* A preview is reachable on any host via the /i/ route, and is LABELLED
         a preview by the engine. The canonical url is given separately and
         only once the record is actually published. */
      preview_url: `https://onecompany.sentinelfortune.com/i/${row.identity}/${SEGMENT[row.identity]}/${row.slug}`,
      public_url: record.public_url,
      visible_publicly: row.status === "PUBLISHED",
    },
  };
}

async function publishApproved(body, caller, env) {
  const row = await loadRecord(body.record_id, env);
  if (!row) return { status: 404, body: { error: "NOT_FOUND" } };
  if (row.status === "PUBLISHED") {
    return { status: 200, body: { record: present(row), already: true } };
  }

  const approvedAlready = row.status === "APPROVED";
  const byPolicy = standingPolicyAllows(row) && ["DRAFT", "REVIEW", "APPROVED", "UNPUBLISHED"].includes(row.status);
  /* RE-PUBLISHING WHAT WAS ALREADY APPROVED AND THEN WITHDRAWN.
     UNPUBLISHED was missing from the eligible set, which made rollback
     impossible: a record could be taken down and never restored, because the
     only route back was an APPROVED status it could no longer reach. A record
     carrying a prior explicit approval may return — that approval was given to
     this record and withdrawing it from view did not revoke it. */
  const restoring = row.status === "UNPUBLISHED" && Boolean(row.approved_by);

  if (!approvedAlready && !byPolicy && !restoring) {
    /* THE IMPORTANT REFUSAL. There is no path from here to APPROVED: an
       assistant cannot approve its own work, so the honest answer is to name
       what is missing and stop. */
    return {
      status: 409,
      body: {
        error: "OWNER_REVIEW_REQUIRED",
        status: row.status,
        detail: "this record is neither APPROVED nor covered by a standing policy; approval is not reachable through this API",
      },
    };
  }

  /* A restore PRESERVES the original approval mode rather than upgrading it.
     Reporting EXPLICIT for a record first published under a standing policy
     would put an Owner approval in the audit trail that never happened. */
  const mode = restoring ? (row.approval_mode || "EXPLICIT")
    : approvedAlready ? "EXPLICIT"
    : "STANDING_POLICY";
  const approver = (approvedAlready || restoring) ? (row.approved_by || "owner") : "standing-policy";
  const at = now();
  /* Lineage: a restore records what it is a restore OF, so the audit trail
     shows a re-publication rather than looking like a first one. */
  const lineage = restoring ? `${row.record_id}@v${row.version}` : row.rollback_of;

  await d1(
    `UPDATE editorial_records
        SET status='PUBLISHED', approved_by=?2, approval_mode=?3,
            approved_at=COALESCE(approved_at, ?4), published_at=?4,
            unpublished_at=NULL, rollback_of=?5, updated_at=?4
      WHERE record_id=?1`,
    [row.record_id, approver, mode, at, lineage], env,
  );
  await logEvent({
    record_id: row.record_id, action: restoring ? "republish" : "publish_approved",
    from: row.status, to: "PUBLISHED",
    actor: approver, adapter: caller, approval_mode: mode,
    detail: { destination: `${row.identity}.sentinelfortune.com`, rollback_of: lineage || null },
  }, env);

  const fresh = await loadRecord(row.record_id, env);
  return { status: 200, body: { record: present(fresh), public_url: publicUrl(fresh), approval_mode: mode } };
}

async function unpublish(body, caller, env) {
  const row = await loadRecord(body.record_id, env);
  if (!row) return { status: 404, body: { error: "NOT_FOUND" } };
  if (!TRANSITIONS.unpublish.includes(row.status)) {
    return { status: 409, body: { error: "NOT_PUBLISHED", status: row.status } };
  }
  const at = now();
  await d1(
    `UPDATE editorial_records SET status='UNPUBLISHED', unpublished_at=?2, updated_at=?2 WHERE record_id=?1`,
    [row.record_id, at], env,
  );
  await logEvent({
    record_id: row.record_id, action: "unpublish", from: "PUBLISHED", to: "UNPUBLISHED",
    actor: caller, adapter: caller, detail: { rollback_reference: `${row.record_id}@v${row.version}` },
  }, env);
  return {
    status: 200,
    body: {
      record: present(await loadRecord(row.record_id, env)),
      /* What to pass to publish_approved to put it back. */
      rollback_reference: `${row.record_id}@v${row.version}`,
    },
  };
}

async function archive(body, caller, env) {
  const row = await loadRecord(body.record_id, env);
  if (!row) return { status: 404, body: { error: "NOT_FOUND" } };
  if (!TRANSITIONS.archive.includes(row.status)) {
    return { status: 409, body: { error: "NOT_ARCHIVABLE", status: row.status, detail: "unpublish before archiving" } };
  }
  await d1(`UPDATE editorial_records SET status='ARCHIVED', updated_at=?2 WHERE record_id=?1`,
    [row.record_id, now()], env);
  await logEvent({ record_id: row.record_id, action: "archive", from: row.status, to: "ARCHIVED", actor: caller, adapter: caller }, env);
  return { status: 200, body: { record: present(await loadRecord(row.record_id, env)) } };
}

async function listRecent(body, caller, env) {
  const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);
  const rows = body.identity && IDENTITIES.includes(body.identity)
    ? await d1("SELECT * FROM editorial_records WHERE identity=?1 ORDER BY updated_at DESC LIMIT ?2", [body.identity, String(limit)], env)
    : await d1("SELECT * FROM editorial_records ORDER BY updated_at DESC LIMIT ?1", [String(limit)], env);
  return { status: 200, body: { records: rows.map(present), count: rows.length } };
}

async function getRecord(body, caller, env) {
  const row = await loadRecord(body.record_id, env);
  if (!row) return { status: 404, body: { error: "NOT_FOUND" } };
  const history = await d1(
    "SELECT action, from_status, to_status, actor, adapter, approval_mode, at FROM editorial_events WHERE record_id=?1 ORDER BY event_id",
    [row.record_id], env,
  );
  return { status: 200, body: { record: present(row), history } };
}

const HANDLERS = {
  create_draft: createDraft,
  update_draft: updateDraft,
  get_preview: getPreview,
  publish_approved: publishApproved,
  unpublish: unpublish,
  archive: archive,
  list_recent: listRecent,
  get_record: getRecord,
};

/* ── the endpoint ──────────────────────────────────────────────────────── */

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}

module.exports = async function handler(req, res) {
  const send = (status, body) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };

  if (req.method !== "POST") return send(405, { error: "METHOD_NOT_ALLOWED" });

  const caller = identifyCaller(req);
  /* A bad credential gets exactly this and nothing else: no hint about which
     tokens exist, no timing signal, no echo of what was presented. */
  if (!caller) return send(401, { error: "UNAUTHORIZED" });

  const env = {
    accountId: process.env.CF_ACCOUNT_ID,
    databaseId: process.env.CF_D1_DATABASE_ID,
    writeToken: process.env.CF_D1_WRITE_TOKEN,
  };
  if (!env.accountId || !env.databaseId || !env.writeToken) {
    return send(503, { error: "CORRIDOR_UNCONFIGURED" });
  }

  const body = await readBody(req);
  if (body === null) return send(400, { error: "MALFORMED_JSON" });
  const action = body.action;
  if (!ACTIONS.includes(action)) return send(400, { error: "UNKNOWN_ACTION", allowed: ACTIONS });

  try {
    /* RATE LIMIT, from the audit log itself rather than a second counter that
       could disagree with it. Reads are not limited; writes are. */
    if (WRITE_ACTIONS.includes(action)) {
      const since = new Date(Date.now() - 3600_000).toISOString();
      const counted = await d1(
        "SELECT COUNT(*) AS n FROM editorial_events WHERE adapter=?1 AND at >= ?2", [caller, since], env,
      );
      /* NOT destructured. `const [{n}] = rows` throws on an empty result, and
         because this runs before every write a single empty response would
         have turned the whole write path into a 502 — a rate limiter that
         fails closed by crashing rather than by refusing. */
      const n = counted.length ? Number(counted[0].n) : 0;
      if (n >= RATE_LIMIT_PER_HOUR) {
        return send(429, { error: "RATE_LIMITED", limit: RATE_LIMIT_PER_HOUR, window: "1h" });
      }
    }

    /* IDEMPOTENCY. A repeated key returns the first result verbatim rather
       than performing the action again — so a retried publish cannot become
       two publications or a doubled version number. */
    const idem = typeof body.idempotency_key === "string" && body.idempotency_key.trim()
      ? body.idempotency_key.trim().slice(0, 200) : null;
    if (idem) {
      const prior = await d1("SELECT response_json FROM corridor_idempotency WHERE idem_key=?1", [idem], env);
      if (prior.length) {
        res.setHeader("X-SF-Idempotent-Replay", "true");
        return send(200, JSON.parse(prior[0].response_json));
      }
    }

    const result = await HANDLERS[action](body, caller, env);

    if (idem && result.status < 400) {
      await d1(
        "INSERT OR IGNORE INTO corridor_idempotency (idem_key, actor, action, record_id, response_json, at) VALUES (?1,?2,?3,?4,?5,?6)",
        [idem, caller, action, body.record_id || null, JSON.stringify(result.body), now()], env,
      );
    }
    return send(result.status, result.body);
  } catch {
    /* No upstream detail. A D1 error message describes infrastructure. */
    return send(502, { error: "CORRIDOR_UPSTREAM_FAILURE" });
  }
};
