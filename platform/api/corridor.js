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
 * THE EIGHT ASSISTANT ACTIONS: create_draft, update_draft, get_preview,
 * publish_approved, unpublish, archive, list_recent, get_record — plus
 * submit_review, and approve, which only the Owner's own credential may call.
 *
 * WHAT THIS ENDPOINT WILL NOT DO, AND WHY IT MATTERS MORE THAN WHAT IT DOES:
 *
 * 1. IT CANNOT PUBLISH SOMETHING NOBODY APPROVED. `publish_approved` only
 *    publishes a record already in APPROVED, or one covered by an Owner
 *    standing policy. An assistant holding a corridor credential cannot move
 *    a record from REVIEW to APPROVED: `approve` exists, but it is refused to
 *    every credential except the Owner's, before the record is even read.
 *    Self-approval is not rate-limited or discouraged here; it is unreachable.
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

/* The one way an editorial record may point at a Shop product, and the check
   that the Shop really publishes it. See server/shop-link.js. */
const { governEditorialCta, verifyShopProduct } = require("../server/shop-link.js");


/* The engine's closed type set. A type with no renderer is refused at the
   door rather than becoming a record nothing can display. */
const TYPES = ["MUSIC_RELEASE", "STORY", "GAME", "COURSE", "TEACHING", "SOFTWARE", "BOOK", "PODCAST", "BUNDLE"];

const ACTIONS = [
  "create_draft", "update_draft", "get_preview", "submit_review", "approve",
  "publish_approved", "unpublish", "archive", "list_recent", "get_record",
];

const WRITE_ACTIONS = [
  "create_draft", "update_draft", "submit_review", "approve",
  "publish_approved", "unpublish", "archive",
];

/* Only the Owner's own credential may do these. An assistant presenting its
   own token gets 403 — which is what keeps "an assistant cannot approve its
   own work" true now that approving is reachable at all. */
const OWNER_ONLY_ACTIONS = ["approve"];

/* THE WORKER BRIDGE. The Cloudflare editorial Worker (transport/) prepares and
   previews; THIS corridor is the only publication authority, because only its
   D1 reaches /api/feed. The Worker's credential may therefore hand a draft in
   and ask for review — the same "asking, not deciding" any assistant may do —
   and may never approve, publish, withdraw, or list other records. A second
   path that could publish would be a second publication authority. */
const BRIDGE_ACTIONS = ["create_draft", "submit_review", "get_record", "get_preview"];

/* Which transitions exist. Anything absent is not merely refused — it is not
   expressible, which is the difference between a rule and a hope. */
const TRANSITIONS = {
  /* Not PUBLISHED: editing live content would change what the public reads
     without an approval of that content. Unpublish, edit, re-approve. */
  update_draft:     ["DRAFT", "REVIEW", "APPROVED"],
  submit_review:    ["DRAFT"],
  approve:          ["DRAFT", "REVIEW"],
  publish_approved: ["APPROVED"],
  unpublish:        ["PUBLISHED"],
  archive:          ["DRAFT", "REVIEW", "APPROVED", "UNPUBLISHED"],
};

/* Each world's public path segment and the governed types it accepts, mirrored
 * from engine/identities.js. Two of these segments were WRONG in the first
 * version — "system" for lightnodesystems (it is "systems") and "drop" for
 * oglegacystore (it is "offer") — so every published URL for those two worlds
 * would have been a 404 handed back to the caller as a success. */
const WORLDS = {
  sentinelfortunerecords: { segment: "release", types: ["MUSIC_RELEASE", "PODCAST", "BUNDLE"] },
  codexworldtv:           { segment: "story",   types: ["STORY", "BOOK", "BUNDLE"] },
  lumengame:              { segment: "play",    types: ["GAME", "BUNDLE"] },
  lumenschoolacademy:     { segment: "learn",   types: ["COURSE", "BOOK", "SOFTWARE", "PODCAST", "BUNDLE"] },
  vibraflowmedia:         { segment: "reflect", types: ["TEACHING", "BOOK", "PODCAST", "BUNDLE"] },
  lightnodesystems:       { segment: "systems", types: ["SOFTWARE", "COURSE", "BOOK", "BUNDLE"] },
  oglegacystore:          { segment: "offer",   types: ["BUNDLE", "BOOK", "SOFTWARE", "MUSIC_RELEASE", "GAME", "STORY", "TEACHING"] },
};

/**
 * EDITORIAL TYPE NAMES, mapped onto the governed types that already exist.
 *
 * The Owner speaks in editorial terms — a LESSON, a TECHNICAL_NOTE, a
 * GAME_UPDATE. The engine has a CLOSED type set because each type maps to
 * exactly one renderer, and inventing five more types would mean inventing
 * five more renderers: new architecture, which this mission forbids.
 *
 * So the editorial vocabulary is an ALIAS LAYER, resolved here at the door.
 * Nothing downstream learns a new type, no renderer is added, and a request
 * phrased the natural way still lands in the right world with a type that
 * already knows how to display itself.
 */
const EDITORIAL_TYPES = {
  TEACHING:             { type: "TEACHING",      identity: "vibraflowmedia" },
  REFLECTION:           { type: "TEACHING",      identity: "vibraflowmedia" },
  ARTICLE:              { type: "TEACHING",      identity: "vibraflowmedia" },
  LESSON:               { type: "COURSE",        identity: "lumenschoolacademy" },
  TECHNICAL_NOTE:       { type: "SOFTWARE",      identity: "lightnodesystems" },
  STORY:                { type: "STORY",         identity: "codexworldtv" },
  EDITORIAL_EPISODE:    { type: "PODCAST",       identity: "vibraflowmedia" },
  MUSIC_RELEASE_NOTE:   { type: "MUSIC_RELEASE", identity: "sentinelfortunerecords" },
  GAME_UPDATE:          { type: "GAME",          identity: "lumengame" },
  EDITORIAL_COLLECTION: { type: "BUNDLE",        identity: "oglegacystore" },
  ANNOUNCEMENT:         { type: "TEACHING",      identity: "vibraflowmedia" },
  FREE_EBOOK:           { type: "BOOK",          identity: "vibraflowmedia" },
};

/** Hosts a governed media or attachment URL may point at. Mirrors
 *  ALLOWED_DESTINATION_HOSTS in engine/core.js. A src outside this set is
 *  REFUSED here rather than silently dropped later by normalizeMedium — a
 *  caller that supplied a cover image deserves to be told it was rejected. */
/** Derived from WORLDS so the two can never disagree about how many worlds
 *  there are. There are seven, and an eighth is not expressible. */
const IDENTITIES = Object.keys(WORLDS);

const ALLOWED_MEDIA_HOSTS = [
  "sentinelfortune.com", "onecompany.sentinelfortune.com", "floor.sentinelfortune.com",
  "sentinelfortune.github.io",
  ...Object.keys(WORLDS).map((slug) => `${slug}.sentinelfortune.com`),
];

function governedSrc(value) {
  if (typeof value !== "string" || !value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (!ALLOWED_MEDIA_HOSTS.includes(url.hostname)) return null;
  return url.toString();
}

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
    /* The Owner's own credential. It is a THIRD value, never one of the
       assistants' — approval authority that an assistant also holds is not
       approval authority. */
    ["owner", process.env.CORRIDOR_TOKEN_OWNER],
    /* The Cloudflare editorial Worker's hand-off credential. A FOURTH value.
       See BRIDGE_ACTIONS: it can put a draft up for review and read it back,
       and nothing else. Absent means the principal does not exist. */
    ["editorial-worker", process.env.CORRIDOR_TOKEN_EDITORIAL_WORKER],
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
 *
 * There is deliberately NO built-in default. A policy compiled into the code
 * is a publishing grant no Owner can see or withdraw from configuration, and
 * an absent variable would silently mean "publish" rather than "review".
 * Pinned by tests/corridor.owner-gate.cjs.
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
  const seg = WORLDS[record.identity].segment;
  return `https://${record.identity}.sentinelfortune.com/${seg}/${record.slug}`;
}

/** What a caller is allowed to know about a record. Never the raw payload
 *  column, never anything about the infrastructure that stored it. */
function parsePayload(row) {
  try { return JSON.parse(row.payload_json) || {}; } catch { return {}; }
}

function present(row) {
  const payload = parsePayload(row);
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
    body: typeof payload.body === "string" ? payload.body : (row.description || ""),
    media: Array.isArray(payload.media) ? payload.media : [],
    cover_image: (Array.isArray(payload.media) ? payload.media : []).find((m) => m.role === "ATTENTION") || null,
    inline_images: (Array.isArray(payload.media) ? payload.media : []).filter((m) => m.kind === "IMAGE" && m.role !== "ATTENTION"),
    media_refs: (Array.isArray(payload.media) ? payload.media : []).filter((m) => m.kind !== "IMAGE"),
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    editorial_type: (payload.metadata && payload.metadata.editorial_type) || null,
    categories: Array.isArray(payload.categories) ? payload.categories : [],
    collections: Array.isArray(payload.collections) ? payload.collections : [],
    cta: payload.cta || null,
    product_ref: payload.product_ref || null,
    public_url: row.status === "PUBLISHED" ? publicUrl(row) : null,
  };
}

async function loadRecord(recordId, env) {
  const rows = await d1("SELECT * FROM editorial_records WHERE record_id = ?1", [recordId], env);
  return rows[0] || null;
}

/**
 * A TRANSITION WRITES ONLY THE ROW IT INSPECTED.
 *
 * Every handler reads a record, decides, then writes — two round trips to D1
 * with nothing holding the row in between. The first version wrote with
 * `WHERE record_id=?1` alone, so a decision taken on one row landed on
 * whatever the row had become: an approved v1 being published while an edit
 * made it v2 published v2 — content the Owner never read — under the Owner's
 * name. Pinned by tests/corridor.race.cjs.
 *
 * The caller's SQL must therefore end in `AND status=? AND version=?` naming
 * the values it read. D1 executes one statement atomically, so the guard and
 * the write cannot be separated; RETURNING says whether a row matched. No
 * match means someone else got there first, and the honest answer is to say
 * so, not to retry on the caller's behalf with a decision it did not make.
 */
async function writeIfUnchanged(sql, params, env) {
  const rows = await d1(`${sql} RETURNING record_id`, params, env);
  return rows.length > 0;
}

function concurrentModification(row) {
  return {
    status: 409,
    body: {
      error: "CONCURRENT_MODIFICATION",
      status: row.status,
      version: row.version,
      detail: "the record changed while this action was in flight; read it again and decide on what it is now",
    },
  };
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

/**
 * Resolve the editorial request into a governed (identity, type) pair.
 *
 * An editorial alias may carry its own destination, so "publish this teaching"
 * needs no identity at all. An explicit identity always wins over the alias's
 * default — the Owner naming a world is not a suggestion.
 *
 * NOTHING IS GUESSED. If the pair does not resolve, or the world does not
 * accept that type, the request is refused with the choices named. Publishing
 * into the wrong world silently is the one outcome this must never produce.
 */
function resolveDestination(body) {
  const alias = typeof body.type === "string" ? EDITORIAL_TYPES[body.type] : null;
  const identity = body.identity || (alias && alias.identity) || null;
  const type = alias ? alias.type : body.type;

  /* THE TYPE IS CHECKED FIRST, and the order matters. A request carrying an
     unrecognised type and no identity used to be told DESTINATION_REQUIRED,
     which sent the caller hunting for an identity when the actual mistake was
     the type — a correct refusal pointing at the wrong thing. */
  if (!TYPES.includes(type)) {
    return {
      error: "UNKNOWN_TYPE",
      requested_type: body.type === undefined ? null : body.type,
      governed_types: TYPES,
      editorial_types: Object.keys(EDITORIAL_TYPES),
    };
  }
  if (!identity) {
    return { error: "DESTINATION_REQUIRED", detail: "give an identity, or a type that implies one", identities: IDENTITIES };
  }
  if (!IDENTITIES.includes(identity)) {
    return { error: "UNKNOWN_IDENTITY", identities: IDENTITIES };
  }
  if (!WORLDS[identity].types.includes(type)) {
    /* The world exists and the type exists, but this world does not present
       this type — it has no rail for it, so the record would be invisible.
       Refusing is kinder than publishing something nobody can reach. */
    return {
      error: "TYPE_NOT_ACCEPTED_BY_WORLD",
      detail: `${identity} presents ${WORLDS[identity].types.join(", ")}`,
      requested_type: type,
    };
  }
  return { identity, type, editorial_type: alias ? body.type : null };
}

/**
 * Build the governed media list and the action from the editorial fields.
 *
 * `cover_image` becomes the ATTENTION medium, `inline_images` become VALUE
 * media, `media_refs` carry audio and video. Every src is checked HERE: the
 * engine's own normalizer silently DROPS a medium whose src is not governed,
 * which for a caller who supplied a cover image is indistinguishable from
 * having supplied nothing. A refusal names the offending URL instead.
 */
function buildMedia(body) {
  const media = [];
  const rejected = [];

  const add = (src, kind, role, alt, poster) => {
    const governed = governedSrc(src);
    if (!governed) { rejected.push(src); return; }
    media.push({ kind, role, src: governed, alt: String(alt || ""), ...(poster ? { poster } : {}) });
  };

  if (body.cover_image) {
    const c = typeof body.cover_image === "string" ? { src: body.cover_image } : body.cover_image;
    add(c.src, "IMAGE", "ATTENTION", c.alt || c.alt_text);
  }
  for (const img of Array.isArray(body.inline_images) ? body.inline_images : []) {
    const i = typeof img === "string" ? { src: img } : img;
    add(i.src, "IMAGE", "VALUE", i.alt || i.alt_text);
  }
  for (const ref of Array.isArray(body.media_refs) ? body.media_refs : []) {
    if (!ref || typeof ref !== "object") continue;
    const kind = ["AUDIO", "VIDEO", "EMBED", "IMAGE"].includes(ref.kind) ? ref.kind : null;
    if (!kind) { rejected.push(ref.src); continue; }
    add(ref.src, kind, ref.role === "DISCOVERY" ? "DISCOVERY" : "VALUE", ref.alt || ref.alt_text, governedSrc(ref.poster) || undefined);
  }
  return { media, rejected };
}

/**
 * A free attachment — a PDF, an ebook — becomes a governed DOWNLOAD action.
 *
 * It is NOT a new storage system and NOT a price. The file is referenced by a
 * governed public URL, so there is no secret link to leak and no credential
 * involved. Several attachments are recorded, and the first becomes the
 * record's action, because a record has one action by design.
 */
function buildAttachments(body) {
  const attachments = [];
  const rejected = [];
  for (const att of Array.isArray(body.attachments) ? body.attachments : []) {
    const a = typeof att === "string" ? { src: att } : att;
    if (!a || !a.src) continue;
    const governed = governedSrc(a.src);
    if (!governed) { rejected.push(a.src); continue; }
    attachments.push({
      src: governed,
      title: String(a.title || "Download"),
      format: String(a.format || "").toUpperCase() || null,
      alt: String(a.alt || a.alt_text || ""),
    });
  }
  return { attachments, rejected };
}

async function createDraft(body, caller, env) {
  const dest = resolveDestination(body);
  if (dest.error) return { status: 400, body: dest };
  const { identity, type } = dest;
  if (!body.title || typeof body.title !== "string") return { status: 400, body: { error: "TITLE_REQUIRED" } };

  const slug = slugify(body.slug || body.title);
  if (!slug) return { status: 400, body: { error: "SLUG_UNRESOLVABLE" } };
  const recordId = body.record_id || `edl-${identity.slice(0, 3)}-${slug}`.slice(0, 120);

  const { media, rejected: badMedia } = buildMedia(body);
  const { attachments, rejected: badAttachments } = buildAttachments(body);
  const bad = [...badMedia, ...badAttachments].filter(Boolean);
  if (bad.length) {
    return {
      status: 400,
      body: {
        error: "UNGOVERNED_MEDIA_SRC",
        detail: "every image, media reference and attachment must be site-relative or https on an allowed Sentinel Fortune host",
        rejected: bad,
        allowed_hosts: ALLOWED_MEDIA_HOSTS,
      },
    };
  }

  /* `body` is the editorial long form. It is stored intact AND mapped to the
     record's `description`, which is what the detail renderer already shows —
     so a structured body needs no new renderer to become readable prose. */
  const prose = typeof body.body === "string" && body.body ? body.body : (body.description || "");

  /* The caller's cta used to be stored verbatim. It is now governed: no BUY,
     no commercial wording, no Shop link except through product_ref. */
  const action = governEditorialCta(body, {
    governedSrc,
    hasAttachments: attachments.length > 0,
    fallback: { kind: "READ", label: "Read this", destination: `/${WORLDS[identity].segment}/${slug}` },
  });
  if (action.error) return { status: 400, body: action };

  const payload = {
    body: prose,
    media,
    attachments,
    categories: Array.isArray(body.categories) ? body.categories : [],
    collections: Array.isArray(body.collections) ? body.collections : [],
    featured: body.featured === true,
    cta: attachments.length
      ? { kind: "DOWNLOAD", label: attachments[0].title, destination: attachments[0].src }
      : action.cta,
    ...(action.product_ref ? { product_ref: action.product_ref } : {}),
    metadata: {
      evidence: "CONVERSATION_ORIGINATED",
      locale: "en",
      ...(dest.editorial_type ? { editorial_type: dest.editorial_type } : {}),
      ...(body.translation_fr && typeof body.translation_fr === "object" ? {
        translations: {
          fr: {
            title: String(body.translation_fr.title || ""),
            summary: String(body.translation_fr.summary || ""),
            description: String(body.translation_fr.description || body.translation_fr.body || ""),
          },
        },
      } : {}),
    },
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
      [recordId, identity, slug, type, body.title, body.summary || "", prose,
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
      /* A RETRY OF THE SAME CREATE IS NOT A COLLISION. The insert, the event
         and the idempotency entry are separate statements; if the request
         failed after the insert, its retry found no idempotency entry and was
         refused here for ever — the Worker hand-off reported it as
         HANDOFF_ALREADY_EXISTS. The same principal sending byte-identical
         content for an untouched v1 draft is that retry: answer it with the
         existing record and write nothing. Any difference at all, another
         principal, or a record that has moved on is still RECORD_EXISTS. */
      const existing = await loadRecord(recordId, env);
      if (existing && existing.created_by === caller && Number(existing.version) === 1
          && ["DRAFT", "REVIEW"].includes(existing.status)
          && existing.identity === identity && existing.slug === slug && existing.type === type
          && existing.title === body.title && (existing.summary || "") === (body.summary || "")
          && (existing.description || "") === prose && existing.payload_json === JSON.stringify(payload)) {
        return { status: 200, body: { record: present(existing), already: true } };
      }
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

  /* An approval covers the version the Owner read. Changing an APPROVED
     record therefore withdraws its approval and returns it to REVIEW. */
  const to = row.status === "APPROVED" ? "REVIEW" : row.status;
  const written = await writeIfUnchanged(
    `UPDATE editorial_records
        SET title=?2, summary=?3, description=?4, version=version+1, updated_at=?5, status=?6,
            approved_by=CASE WHEN ?6='REVIEW' AND status='APPROVED' THEN NULL ELSE approved_by END,
            approval_mode=CASE WHEN ?6='REVIEW' AND status='APPROVED' THEN NULL ELSE approval_mode END,
            approved_at=CASE WHEN ?6='REVIEW' AND status='APPROVED' THEN NULL ELSE approved_at END
      WHERE record_id=?1 AND status=?7 AND version=?8`,
    [row.record_id, title, summary, description, now(), to, row.status, row.version], env,
  );
  if (!written) return concurrentModification(row);
  await logEvent({
    record_id: row.record_id, action: "update_draft", from: row.status, to,
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
      preview_url: `https://onecompany.sentinelfortune.com/i/${row.identity}/${WORLDS[row.identity].segment}/${row.slug}`,
      public_url: record.public_url,
      visible_publicly: row.status === "PUBLISHED",
    },
  };
}

/** The version named by the most recent explicit Owner approval, or null. */
async function latestApprovedVersion(recordId, env) {
  const rows = await d1(
    "SELECT detail_json FROM editorial_events WHERE record_id=?1 AND action='approve' ORDER BY event_id DESC LIMIT 1",
    [recordId], env,
  );
  if (!rows.length) return null;
  try {
    const v = JSON.parse(rows[0].detail_json || "null");
    return v && Number.isInteger(v.version) ? v.version : null;
  } catch { return null; }
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
     this record and withdrawing it from view did not revoke it.
     A record first published under a standing policy is NOT restored on that
     history alone: it is restored only while the policy still covers it; if
     the Owner has withdrawn the policy, it needs an explicit approval. */
  const restoring = row.status === "UNPUBLISHED" && Boolean(row.approved_by)
    && (row.approval_mode !== "STANDING_POLICY" || byPolicy);

  /* AN EXPLICIT APPROVAL IS FOR ONE VERSION. Publishing on it requires that
     the Owner's latest approval names the version about to go public. A
     record approved before versions were recorded has no such proof and
     must be approved again. */
  if ((approvedAlready || restoring) && !byPolicy && (row.approval_mode || "EXPLICIT") === "EXPLICIT") {
    const approvedVersion = await latestApprovedVersion(row.record_id, env);
    if (approvedVersion !== row.version) {
      return {
        status: 409,
        body: {
          error: "APPROVAL_STALE",
          status: row.status,
          version: row.version,
          detail: "the Owner's approval does not name this version; the Owner must approve it again",
        },
      };
    }
  }

  if (!approvedAlready && !byPolicy && !restoring) {
    /* THE IMPORTANT REFUSAL. An assistant cannot approve its own work, so the
       honest answer is to name what is missing and who can supply it. */
    return {
      status: 409,
      body: {
        error: "OWNER_REVIEW_REQUIRED",
        status: row.status,
        detail: "this record is neither APPROVED nor covered by a standing policy; the Owner must call approve, which an assistant credential cannot",
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

  /* A POINTER AT A PRODUCT IS PUBLISHED ONLY IF THE SHOP SAYS IT EXISTS.
     Asked at publication, restore included: a product withdrawn from the Shop
     since the Owner approved must not be advertised on the strength of that
     approval. Refused before the write, so a refusal changes nothing. */
  let shopProduct = null;
  const payload = parsePayload(row);
  if (payload.product_ref && payload.product_ref.shop_slug) {
    const check = await verifyShopProduct(payload.product_ref.shop_slug, { apiBase: process.env.SHOP_API_BASE });
    if (!check.verified) {
      return { status: check.error === "SHOP_UNREACHABLE" ? 503 : 409, body: { error: check.error, detail: check.detail, status: row.status } };
    }
    shopProduct = { slug: check.product.slug, buyable: check.product.buyable, verified_at: now() };
  }

  /* Bound to the status and version every check above was made against —
     including the APPROVAL_STALE check, which proved the approval names
     row.version and would prove nothing if a different version were written. */
  const written = await writeIfUnchanged(
    `UPDATE editorial_records
        SET status='PUBLISHED', approved_by=?2, approval_mode=?3,
            approved_at=COALESCE(approved_at, ?4), published_at=?4,
            unpublished_at=NULL, rollback_of=?5, updated_at=?4
      WHERE record_id=?1 AND status=?6 AND version=?7`,
    [row.record_id, approver, mode, at, lineage, row.status, row.version], env,
  );
  if (!written) return concurrentModification(row);
  await logEvent({
    record_id: row.record_id, action: restoring ? "republish" : "publish_approved",
    from: row.status, to: "PUBLISHED",
    actor: approver, adapter: caller, approval_mode: mode,
    detail: {
      destination: `${row.identity}.sentinelfortune.com`, rollback_of: lineage || null,
      ...(shopProduct ? { shop_product: shopProduct } : {}),
    },
  }, env);

  const fresh = await loadRecord(row.record_id, env);
  return { status: 200, body: { record: present(fresh), public_url: publicUrl(fresh), approval_mode: mode } };
}

/**
 * DRAFT -> REVIEW. Any caller may put its own work up for review; that is
 * asking, not deciding, so it needs no special credential.
 */
async function submitReview(body, caller, env) {
  const row = await loadRecord(body.record_id, env);
  if (!row) return { status: 404, body: { error: "NOT_FOUND" } };
  if (row.status === "REVIEW") return { status: 200, body: { record: present(row), already: true } };
  if (!TRANSITIONS.submit_review.includes(row.status)) {
    return { status: 409, body: { error: "NOT_SUBMITTABLE", status: row.status } };
  }
  const written = await writeIfUnchanged(
    "UPDATE editorial_records SET status='REVIEW', updated_at=?2 WHERE record_id=?1 AND status=?3 AND version=?4",
    [row.record_id, now(), row.status, row.version], env);
  if (!written) return concurrentModification(row);
  await logEvent({
    record_id: row.record_id, action: "submit_review", from: row.status, to: "REVIEW",
    actor: caller, adapter: caller,
  }, env);
  return { status: 200, body: { record: present(await loadRecord(row.record_id, env)) } };
}

/**
 * REVIEW (or DRAFT) -> APPROVED. The Owner's decision, and ONLY the Owner's.
 *
 * This action exists because its absence was a hole, not a safeguard. The
 * corridor refused to publish anything unapproved and offered no way to
 * approve, so the only routes to a public page were a standing policy or the
 * Owner writing to D1 by hand — and writing to D1 by hand is precisely what
 * the Owner must never have to do. The safeguard was never "nobody can
 * approve"; it was "an assistant cannot approve its own work", and that is
 * enforced here by the credential rather than by the absence of a door.
 */
async function approve(body, caller, env) {
  const row = await loadRecord(body.record_id, env);
  if (!row) return { status: 404, body: { error: "NOT_FOUND" } };
  if (row.status === "APPROVED") {
    return { status: 200, body: { record: present(row), already: true } };
  }
  if (!TRANSITIONS.approve.includes(row.status)) {
    return { status: 409, body: { error: "NOT_APPROVABLE", status: row.status } };
  }
  const at = now();
  /* The Owner approves the version they read. If it changed while they were
     reading, the approval does not silently transfer to the new text. */
  const written = await writeIfUnchanged(
    `UPDATE editorial_records
        SET status='APPROVED', approved_by='owner', approval_mode='EXPLICIT',
            approved_at=?2, updated_at=?2
      WHERE record_id=?1 AND status=?3 AND version=?4`,
    [row.record_id, at, row.status, row.version], env,
  );
  if (!written) return concurrentModification(row);
  await logEvent({
    record_id: row.record_id, action: "approve", from: row.status, to: "APPROVED",
    /* actor is the Owner because the Owner decided; adapter records which
       surface carried the decision. */
    actor: "owner", adapter: caller, approval_mode: "EXPLICIT",
    /* The exact version approved. publish_approved checks it. */
    detail: { version: row.version },
  }, env);
  return {
    status: 200,
    body: { record: present(await loadRecord(row.record_id, env)), approval_mode: "EXPLICIT" },
  };
}

async function unpublish(body, caller, env) {
  const row = await loadRecord(body.record_id, env);
  if (!row) return { status: 404, body: { error: "NOT_FOUND" } };
  if (!TRANSITIONS.unpublish.includes(row.status)) {
    return { status: 409, body: { error: "NOT_PUBLISHED", status: row.status } };
  }
  const at = now();
  const written = await writeIfUnchanged(
    `UPDATE editorial_records SET status='UNPUBLISHED', unpublished_at=?2, updated_at=?2
      WHERE record_id=?1 AND status=?3 AND version=?4`,
    [row.record_id, at, row.status, row.version], env,
  );
  if (!written) return concurrentModification(row);
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
  const written = await writeIfUnchanged(
    `UPDATE editorial_records SET status='ARCHIVED', updated_at=?2 WHERE record_id=?1 AND status=?3 AND version=?4`,
    [row.record_id, now(), row.status, row.version], env);
  if (!written) return concurrentModification(row);
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
  submit_review: submitReview,
  approve: approve,
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

  /* THE ONE PRIVILEGE BOUNDARY. Checked here, before anything is read or
     written, so no handler has to remember it. */
  if (OWNER_ONLY_ACTIONS.includes(action) && caller !== "owner") {
    return send(403, {
      error: "OWNER_CREDENTIAL_REQUIRED",
      detail: "approval requires the Owner credential; an assistant cannot approve editorial work",
    });
  }
  if (caller === "editorial-worker" && !BRIDGE_ACTIONS.includes(action)) {
    return send(403, {
      error: "BRIDGE_ACTION_NOT_PERMITTED",
      detail: "the editorial Worker may hand drafts in for review; approval, publication and withdrawal happen in this corridor only",
      allowed: BRIDGE_ACTIONS,
    });
  }

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
    /* Scoped to the caller: one principal's key can never replay another
       principal's response (an Owner approval included). */
    const idem = typeof body.idempotency_key === "string" && body.idempotency_key.trim()
      ? `${caller}:${body.idempotency_key.trim().slice(0, 200)}` : null;
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
