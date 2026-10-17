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
const DEFAULT_FEED_URL = "/feed/public-site.json";

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
  const src = payload.source;
  if (!src || typeof src !== "object") problems.push("source block is missing");
  else if (src.system !== "HOUSE_OF_ASSETS") problems.push(`source.system is ${JSON.stringify(src.system)}, expected "HOUSE_OF_ASSETS"`);

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
export async function loadFeed({ url, fetchImpl, cache = "no-store" } = {}) {
  const target = url || DEFAULT_FEED_URL;
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

export { FEED_SCHEMA, DEFAULT_FEED_URL };
