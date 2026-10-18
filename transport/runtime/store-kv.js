/* SFL EDITORIAL TRANSPORT — KV-backed persistence.
 *
 * The corridor's store exposes exactly two persistence methods, `snapshot()`
 * and `restore()`. This file implements them against a Cloudflare KV
 * namespace and adds nothing else. No editorial logic lives here.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * KNOWN LIMITATION — READ THIS BEFORE RELYING ON IT
 * ──────────────────────────────────────────────────────────────────────────
 * KV is eventually consistent and has no compare-and-set. Two Worker isolates
 * handling two commands at the same moment can both read snapshot N and both
 * write snapshot N+1, and one of the two writes wins. That is a LOST WRITE.
 *
 * What that costs, honestly:
 *
 *   • A lost write means the command's record is absent, so the client's
 *     retry (same instruction id) finds no ledger entry and RE-RUNS the
 *     command. Because the record id is derived from branch + slug, the
 *     re-run produces the same record rather than a duplicate. So the
 *     failure mode is "a command may need retrying", not "content was
 *     duplicated" and not "something was published twice".
 *
 *   • It is still not good enough for publication under concurrency, because
 *     a lost write could drop an Owner approval or a state change.
 *
 * THEREFORE: KV is sufficient for the PHASE 1 TEST_PREVIEW deployment, where
 * one Owner drives one client at a time and nothing becomes public. Before
 * LIVE publication, this must be replaced by a Durable Object (single-threaded
 * per object, so reads and writes serialize) or by D1 with a transaction.
 * That replacement touches this file and `wrangler.toml` only — the corridor
 * and the API handler do not change, because the seam is already here.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { createStore } from "../../corridor/core/store.js";

export const SNAPSHOT_KEY = "sfl:editorial:snapshot:v1";

/** Load a corridor store from KV. Absent or unreadable state yields an empty
 *  store rather than an error — a first request on a fresh namespace is
 *  normal, not a failure. */
export async function loadStore(kv, { log = console } = {}) {
  const store = createStore();
  if (!kv) return store;

  try {
    const raw = await kv.get(SNAPSHOT_KEY, "json");
    if (raw && Array.isArray(raw.records)) store.restore(raw);
  } catch (err) {
    /* Detail to the log only. A corrupt snapshot must not be echoed to a
       caller, and must not take the API down — it degrades to empty. */
    log.error(`[sfl-editorial-api] snapshot restore failed: ${err && err.message}`);
  }
  return store;
}

/** Persist a store back to KV. */
export async function saveStore(kv, store, { log = console } = {}) {
  if (!kv) return { ok: false, reason: "no KV binding" };
  try {
    await kv.put(SNAPSHOT_KEY, JSON.stringify(store.snapshot()));
    return { ok: true };
  } catch (err) {
    log.error(`[sfl-editorial-api] snapshot save failed: ${err && err.message}`);
    return { ok: false, reason: "snapshot save failed" };
  }
}

/** True when a request changed state and the snapshot must be written back.
 *  A read (`list_recent`, `get_record`, a preview, any refusal) changes
 *  nothing, so it does not pay for a write. */
export function mutated(responseBody) {
  if (!responseBody || responseBody.ok !== true) return false;
  if (responseBody.replay === true) return false;          // the ledger already holds it
  if (responseBody.preview) return false;
  return Boolean(responseBody.record || responseBody.approval);
}
