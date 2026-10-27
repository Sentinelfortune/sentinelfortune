/* Sentinel Fortune — GOVERNED DYNAMIC FEED ENDPOINT.
 *
 *   Editorial Corridor -> D1 -> THIS ENDPOINT -> Public Experience
 *
 * The public feed was a static file in the repository, which meant a
 * conversation-originated publication could only reach a world by way of a
 * commit and a redeploy. This endpoint is the server-side half of moving that
 * to a durable governed source, so a published record appears because the
 * database says it is published.
 *
 * WHY THIS RUNS ON VERCEL AND NOT A WORKER. The corridor's natural home is a
 * Cloudflare Worker with a native D1 binding. No Worker deployment capability
 * is available through the current connector, so for the MVP the smallest
 * server-side adapter lives inside the EXISTING platform project and reaches
 * D1 over Cloudflare's HTTP API. One project, one engine, one corridor.
 *
 * FOUR RULES THIS FILE EXISTS TO ENFORCE:
 *
 * 1. THE BROWSER NEVER SEES A CREDENTIAL. The Cloudflare token is read from
 *    the server environment and never leaves it. Nothing here is echoed into
 *    a response, not even in an error.
 *
 * 2. ONLY PUBLISHED RECORDS LEAVE THE DATABASE. The filter is in the SQL, not
 *    in the mapping, so a draft cannot leak by way of a forgotten branch.
 *    Destination filtering stays where it already lived — the engine selects
 *    by identity — but every row served here has passed the publication gate
 *    and the schema's own CHECK that a PUBLISHED row carries an approval.
 *
 * 3. IT FAILS SAFE AND LOUDLY ENOUGH. If the environment is unconfigured or
 *    D1 is unreachable, it answers 503 with no detail, and the engine falls
 *    back to the static feed that is still in the repository. A degraded read
 *    path must never become a silent empty catalogue.
 *
 * 4. IT IS ADDITIVE DURING THE MVP. The static feed remains the base layer and
 *    the rollback. Dynamic records are merged on top, keyed by id, so the
 *    seventeen existing records keep working and the corridor's output joins
 *    them rather than replacing them.
 *
 * 5. NOTHING INTERNAL REACHES THE PUBLIC. Both the dynamic response and the
 *    static fallback are rebuilt by server/public-redact.js: no database id,
 *    no private system name, no corridor bookkeeping, and a record that still
 *    carries one is withheld rather than served. Headers name the path in
 *    neutral terms (DYNAMIC / STATIC), never the storage behind it.
 */

const CF_API = "https://api.cloudflare.com/client/v4";
const { publicEnvelope } = require("../server/public-redact.js");

/* Only ever PUBLISHED. The ORDER BY makes the newest publication first so the
   engine's "new" rails have a governed ordering to read. */
const PUBLISHED_SQL = `
  SELECT record_id, identity, slug, type, title, summary, description,
         pricing_tier, version, payload_json, published_at, updated_at
    FROM editorial_records
   WHERE status = 'PUBLISHED'
   ORDER BY published_at DESC
   LIMIT 500
`;

async function queryD1({ accountId, databaseId, token }) {
  const res = await fetch(`${CF_API}/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql: PUBLISHED_SQL }),
  });
  if (!res.ok) throw new Error(`d1 ${res.status}`);
  const body = await res.json();
  if (!body || body.success !== true) throw new Error("d1 unsuccessful");
  const first = Array.isArray(body.result) ? body.result[0] : null;
  return (first && Array.isArray(first.results)) ? first.results : [];
}

/**
 * A D1 row becomes a governed feed record.
 *
 * `payload_json` is the record the corridor stored. The columns are the
 * governed truth, so they WIN over anything the payload claims — a payload
 * that disagreed with its own row about which world it belongs to would
 * otherwise be able to publish itself into the wrong one.
 */
function toRecord(row) {
  let payload = {};
  try { payload = JSON.parse(row.payload_json) || {}; } catch { payload = {}; }
  return {
    ...payload,
    id: row.record_id,
    slug: row.slug,
    identity: row.identity,
    type: row.type,
    title: row.title,
    summary: row.summary || payload.summary || "",
    description: row.description || payload.description || "",
    pricingTier: row.pricing_tier || "FREE",
    publishedAt: row.published_at,
    publicationStatus: "PUBLIC_SITE",
    publicReadiness: { approved: true, withheld: false },
    media: Array.isArray(payload.media) ? payload.media : [],
    /* Corridor output is real editorial work, not a fixture, so it carries no
       Demo chip. The flag is explicit rather than assumed. */
    realArtefact: true,
    /* The corridor's version number stays in the corridor; public-redact.js
       strips the rest of its bookkeeping from metadata. */
    metadata: { ...(payload.metadata || {}) },
  };
}

/** Rebuild, redact, and say how many records were withheld — by id and rule
 *  in the server log, by count only in the response. */
function sendEnvelope(res, input) {
  const { envelope, withheld } = publicEnvelope(input);
  for (const w of withheld) console.warn(`[api/feed] withheld ${w.id || "(no id)"}: ${w.rule}`);
  res.setHeader("X-SF-Feed-Withheld-Count", String(withheld.length));
  res.statusCode = 200;
  res.end(JSON.stringify(envelope));
}

/** The static feed, fetched from this same deployment. It is the base layer
 *  and the rollback; if it cannot be read the dynamic records still serve. */
/* READ FROM DISK, NOT OVER THE NETWORK.
 *
 * The first version fetched `https://${host}/feed/public-site.json` — the
 * deployment asking itself for one of its own static files. That was wrong in
 * three ways at once, and each one showed up: it hardcoded the scheme, so the
 * fallback could not read its own feed over a plain-http origin; it invented
 * a network dependency for data already sitting on the filesystem; and it
 * made the degraded path depend on the very server that was degrading.
 *
 * A static require is resolved at build time, so the bundler includes the
 * JSON and this cannot fail at runtime for any reason except the file being
 * genuinely absent. The fallback is now the most reliable path in the file,
 * which is the correct ordering for a fallback.
 */
function staticFeed() {
  try {
    return require("../feed/public-site.json");
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const databaseId = process.env.CF_D1_DATABASE_ID;
  const token = process.env.CF_API_TOKEN;

  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  /* FAIL SAFE BY SERVING THE STATIC FEED, NOT BY FAILING.
     The first version answered 503 and let the engine fall back client-side.
     It worked — pages rendered — but it put a 503 in the console of every
     visitor on every page load, which is both noise and a false alarm. A
     degraded read path should be invisible to the public and visible to us,
     so the fallback moved server-side: 200 with the known-good catalogue,
     and the reason in a response header.
     The engine KEEPS its own client-side fallback, which now covers a
     different failure — this endpoint not existing at all. */
  async function serveStaticFallback(reason) {
    const base = staticFeed();
    res.setHeader("X-SF-Feed-Source", "STATIC_FALLBACK");
    res.setHeader("X-SF-Feed-Degraded", reason);
    if (!base) {
      /* Nothing left to serve. Now 503 is the honest answer. */
      res.statusCode = 503;
      res.end(JSON.stringify({ error: "FEED_UNAVAILABLE" }));
      return;
    }
    /* Redacted like the dynamic path: the static file carries fixture
       annotations that were never meant to be served as data. */
    sendEnvelope(res, {
      schema: base.schema,
      evidence: base.evidence,
      generatedAt: base.source && base.source.generated_at,
      records: base.records,
    });
  }

  if (!accountId || !databaseId || !token) {
    await serveStaticFallback("UNCONFIGURED");
    return;
  }

  let rows;
  try {
    rows = await queryD1({ accountId, databaseId, token });
  } catch {
    /* No detail in the body: an upstream error message is exactly the kind of
       thing that leaks infrastructure shape to the public. The header names
       no storage either. */
    await serveStaticFallback("UPSTREAM_UNAVAILABLE");
    return;
  }

  const dynamic = rows.map(toRecord);
  const base = staticFeed();

  /* Merge by id, dynamic winning, so a corridor record can supersede a
     fixture of the same id without the static file having to be edited. */
  const merged = new Map();
  if (base && Array.isArray(base.records)) for (const r of base.records) merged.set(r.id, r);
  for (const r of dynamic) merged.set(r.id, r);

  res.setHeader("X-SF-Feed-Source", base ? "DYNAMIC+STATIC" : "DYNAMIC");
  res.setHeader("X-SF-Feed-Dynamic-Count", String(dynamic.length));
  sendEnvelope(res, {
    schema: (base && base.schema) || "sf.public-site/1.0",
    /* Demo fixtures are test-only. With an empty governed static fallback,
       LIVE means all emitted records came from PUBLISHED database rows.
       Never set LIVE when the database returned no published records. */
    evidence: dynamic.length > 0 ? "LIVE" : "TEST_PREVIEW",
    /* The source block carries the public label only (public-redact.js). It
       used to name the write path and the D1 database id; neither is the
       public's business, and an identifier is infrastructure shape. */
    generatedAt: new Date().toISOString(),
    records: [...merged.values()],
  });
};
