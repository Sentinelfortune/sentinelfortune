/* Sentinel Fortune — GOVERNED FEED INGESTION.
 *
 * House of Assets is the source of truth. This module is the ONE place the
 * public runtime reads it, and the only place a network call happens.
 *
 * THE FEED CONTRACT — `sf.public-site/1.0`
 * ----------------------------------------
 * Derived from `hoa.shop-publication/1.0`, the contract House of Assets
 * already satisfies when it publishes to the Digital Shop (see
 * HOA_SHOP_PUBLICATION_CONTRACT.md). The same governance discipline applies
 * here, for the same reason: the envelope is what authorizes publication, so
 * a malformed envelope is refused rather than partially trusted.
 *
 *   {
 *     "schema": "sf.public-site/1.0",
 *     "source": { "system": "HOUSE_OF_ASSETS", "generated_at": "…" },
 *     "records": [ … ]
 *   }
 *
 * WHERE THE FEED COMES FROM is configuration, not code: `window.SF_FEED_URL`,
 * defaulting to a ROOT-ABSOLUTE path. Root-absolute matters: a relative path
 * resolves against the current route, so on /learn/floor the browser would ask
 * for /learn/feed/public-site.json and get the SPA fallback instead. Pointing the runtime at a live
 * House of Assets export is a one-line change and no rebuild of the engine.
 *
 * WHAT SHIPS TODAY. The House of Assets connector is not authorized in the
 * build session, so no live export could be read. The file in feed/ is marked
 * `"evidence": "TEST_PREVIEW"` and the runtime renders a visible preview
 * notice whenever it loads a feed so marked. A test fixture that cannot be
 * told apart from real inventory is the one thing worse than having none.
 */

const FEED_SCHEMA = "sf.public-site/1.0";
/* THE GOVERNED DYNAMIC SOURCE, FIRST. `/api/feed` serves PUBLISHED records
   from the Editorial Corridor's D1 database merged over the static base, so a
   conversation-originated publication reaches a world without a commit.
   The static file remains in the repository as the fallback and the rollback:
   if the endpoint is unconfigured or D1 is unreachable it answers 503, and
   `loadFeed` drops to STATIC_FEED_URL rather than showing an empty catalogue.
   A degraded read path must never look like a world with nothing in it. */
/** The only systems allowed to author a public feed. Closed set. */
const GOVERNED_SOURCES = Object.freeze(["HOUSE_OF_ASSETS", "EDITORIAL_CORRIDOR"]);

const DEFAULT_FEED_URL = "/api/feed";
const STATIC_FEED_URL = "/feed/public-site.json";

/* ─────────────────────────────────────────────────────────────────────────
   ENVELOPE
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Validate the envelope and hand back its records.
 *
 * Returns `{ ok, records, evidence, generatedAt, problems }`. A bad envelope
 * yields `ok: false` with an EMPTY record list — never a partial read. Half a
 * governed feed is not a smaller feed, it is an unknown one.
 */
export function readEnvelope(payload) {
  const problems = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, records: [], evidence: null, generatedAt: null, problems: ["feed is not an object"] };
  }
  if (payload.schema !== FEED_SCHEMA) {
    problems.push(`schema is ${JSON.stringify(payload.schema)}, expected ${JSON.stringify(FEED_SCHEMA)}`);
  }
  /* TWO GOVERNED WRITE PATHS, AND ONLY TWO.
     House of Assets is the commercial source of truth; the Editorial Corridor
     is the free-editorial path and deliberately does NOT pass through it. So
     the envelope has to name both — the alternative was an endpoint that
     claimed to be House of Assets in order to pass validation, which is the
     kind of small lie that destroys the value of having a source block at all.
     The set stays CLOSED: any other system is still refused. */
  const src = payload.source;
  if (!src || typeof src !== "object") problems.push("source block is missing");
  else if (!GOVERNED_SOURCES.includes(src.system)) {
    problems.push(`source.system is ${JSON.stringify(src.system)}, expected one of ${GOVERNED_SOURCES.join(", ")}`);
  }

  if (!Array.isArray(payload.records)) problems.push("records is not an array");

  /* TEST_PREVIEW vs LIVE. Anything that is not explicitly LIVE is treated as
     preview evidence, so forgetting the marker fails safe — it shows the
     notice rather than silently presenting fixtures as real inventory. */
  const evidence = payload.evidence === "LIVE" ? "LIVE" : "TEST_PREVIEW";

  if (problems.length) {
    return { ok: false, records: [], evidence, generatedAt: null, problems };
  }
  return {
    ok: true,
    records: payload.records,
    evidence,
    generatedAt: src.generated_at || null,
    problems: [],
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   LOADING
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Fetch and validate the feed.
 *
 * `fetchImpl` is injectable so the tests exercise this exact function against
 * stubbed responses — including the failure paths, which are the ones a real
 * visitor is most likely to meet and the ones least likely to be tried by
 * hand.
 *
 * Never throws. Returns `{ ok: false, error }` so the caller renders an honest
 * error state instead of a blank page and a console trace.
 */
/**
 * Load the feed, preferring the governed dynamic source.
 *
 * When no explicit `url` is given this tries `/api/feed` and, if that attempt
 * does not yield a usable envelope, falls back ONCE to the static file. The
 * fallback is deliberately broad — network error, 503, bad JSON, bad envelope
 * all take it — because every one of those failure shapes has the same right
 * answer: serve the catalogue that is known to be in the repository.
 *
 * An explicit `url` is never second-guessed. The tests and the e2e harnesses
 * pass one, and silently redirecting a caller's chosen source would make the
 * harness stop testing what it names.
 */
export async function loadFeed({ url, fetchImpl, cache = "no-store" } = {}) {
  if (!url) {
    const dynamic = await fetchFeed(DEFAULT_FEED_URL, fetchImpl, cache);
    if (dynamic.ok) return { ...dynamic, feedSource: "DYNAMIC" };
    const fallback = await fetchFeed(STATIC_FEED_URL, fetchImpl, cache);
    return { ...fallback, feedSource: fallback.ok ? "STATIC_FALLBACK" : "NONE", dynamicError: dynamic.error };
  }
  return fetchFeed(url, fetchImpl, cache);
}

async function fetchFeed(target, fetchImpl, cache) {
  const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!doFetch) return { ok: false, records: [], error: "NO_FETCH", detail: "no fetch implementation available" };

  let response;
  try {
    response = await doFetch(target, { cache });
  } catch (err) {
    return { ok: false, records: [], error: "NETWORK", detail: String(err && err.message || err) };
  }
  if (!response || !response.ok) {
    return { ok: false, records: [], error: "HTTP", detail: `HTTP ${response ? response.status : "?"}` };
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    return { ok: false, records: [], error: "PARSE", detail: String(err && err.message || err) };
  }

  const envelope = readEnvelope(payload);
  if (!envelope.ok) {
    return { ok: false, records: [], error: "ENVELOPE", detail: envelope.problems.join("; "), evidence: envelope.evidence };
  }
  return {
    ok: true,
    records: envelope.records,
    evidence: envelope.evidence,
    generatedAt: envelope.generatedAt,
    error: null,
  };
}

export { FEED_SCHEMA, DEFAULT_FEED_URL, STATIC_FEED_URL };
