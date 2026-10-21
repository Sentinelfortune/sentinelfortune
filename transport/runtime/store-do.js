/* SFL EDITORIAL TRANSPORT — Durable Object persistence (PREPARED FOR LIVE).
 *
 * STATUS: PREPARED, NOT ACTIVE. Nothing in `wrangler.toml` binds this class.
 * The TEST_PREVIEW deployment keeps using `store-kv.js`. Activation is a
 * deliberate Owner step, described in `transport/LIVE-PERSISTENCE.md`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `store-kv.js` documents the limitation that blocks LIVE: KV has no
 * compare-and-set, so two concurrent commands can both read snapshot N and
 * both write N+1, losing one — possibly an Owner approval or a state change.
 *
 * This file removes that failure mode with two guarantees, both provided by
 * the Durable Object runtime rather than by anything clever here:
 *
 *   1. SERIALIZATION. Every request is processed inside
 *      `blockConcurrencyWhile`, so one command runs load → corridor → write
 *      to completion before the next one is even delivered. There is exactly
 *      one object (`idFromName(LEDGER_NAME)`), so there is exactly one queue.
 *
 *   2. ATOMICITY. Everything a command changed is written in ONE
 *      `storage.transaction`. Either every changed record and ledger entry is
 *      committed, or none is. A failed write leaves the previous state intact
 *      and the caller receives an error, never a success it does not have.
 *
 * Together: an approval, a version bump or a state transition is either fully
 * recorded or not recorded at all, and two of them can never interleave.
 *
 * WHAT THIS FILE DOES NOT DO
 * --------------------------
 * No editorial logic. It persists the corridor store through the same two
 * methods `store-kv.js` uses — `snapshot()` and `restore()` — and nothing
 * else. The corridor and the request handler are unchanged.
 *
 * STORAGE LAYOUT (per-entry keys, not one blob)
 *   rec:<recordId>        one corridor record
 *   ins:<instructionId>   one instruction-ledger entry (idempotency / replay)
 *   meta:schema           STORAGE_SCHEMA
 * Per-entry keys keep each value small, and let a command write only what it
 * changed instead of rewriting the whole corpus.
 */

import { createStore } from "../../corridor/core/store.js";
import { createCorridor } from "../../corridor/actions.js";
import { createApi } from "../core/http.js";

export const LEDGER_NAME = "sfl-editorial-ledger";
export const STORAGE_SCHEMA = "sfl.editorial.do/1";

const REC = "rec:";
const INS = "ins:";
const META_SCHEMA = "meta:schema";

/* Values are compared as JSON, so a write happens only when an entry really
   changed. Stable within one process, which is all a diff needs. */
const encode = (v) => JSON.stringify(v);

/** Read the whole corpus out of Durable Object storage into a snapshot the
 *  corridor store can `restore()`. */
export async function readSnapshot(storage) {
  const [recs, ins] = await Promise.all([
    storage.list({ prefix: REC }),
    storage.list({ prefix: INS }),
  ]);
  return {
    records: [...recs.values()],
    instructions: [...ins.entries()].map(([k, v]) => [k.slice(INS.length), v]),
  };
}

/** Compute the minimal set of puts between two snapshots. The corridor never
 *  deletes (it archives), so a diff of puts is complete; a key present before
 *  and absent after is reported, not silently dropped. */
export function diffSnapshots(before, after) {
  const prior = new Map();
  for (const r of before.records || []) prior.set(REC + r.id, encode(r));
  for (const [k, v] of before.instructions || []) prior.set(INS + k, encode(v));

  const puts = {};
  const seen = new Set();
  for (const r of after.records || []) {
    const key = REC + r.id;
    seen.add(key);
    if (prior.get(key) !== encode(r)) puts[key] = r;
  }
  for (const [k, v] of after.instructions || []) {
    const key = INS + k;
    seen.add(key);
    if (prior.get(key) !== encode(v)) puts[key] = v;
  }
  const vanished = [...prior.keys()].filter((k) => !seen.has(k));
  return { puts, vanished };
}

/** Write a diff in ONE transaction. Throws if the transaction fails, so the
 *  caller can refuse rather than report a success that was not stored. */
export async function commitDiff(storage, { puts, vanished }) {
  if (vanished.length) {
    /* The corridor's contract is append/version, never delete. A vanished
       key means that contract was broken somewhere; refuse to persist a
       state that lost data rather than quietly deleting it. */
    throw new Error(`refusing to persist: ${vanished.length} stored entr${vanished.length === 1 ? "y" : "ies"} would be lost`);
  }
  const keys = Object.keys(puts);
  if (!keys.length) return { written: 0 };
  await storage.transaction(async (txn) => {
    for (const key of keys) await txn.put(key, puts[key]);
    await txn.put(META_SCHEMA, STORAGE_SCHEMA);
  });
  return { written: keys.length };
}

const PERSIST_FAILED = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "INTERNAL",
    step: null,
    message: "The change could not be stored and was not applied. Retry with the same instruction id.",
    retryable: true,
  }),
});

/** Run one already-parsed request against the ledger: load, handle, commit.
 *  Exported so the tests exercise exactly what the Durable Object runs. */
export async function handleWithLedger({ storage, env, request, log = console }) {
  const store = createStore();
  const before = await readSnapshot(storage);
  store.restore(before);

  const corridor = createCorridor({ store });
  const api = createApi({ env, corridor, log });
  const result = await api.handle(request);

  try {
    await commitDiff(storage, diffSnapshots(before, store.snapshot()));
  } catch (err) {
    log.error(`[sfl-editorial-api] ledger commit failed: ${err && err.message}`);
    /* Nothing was committed (the transaction is all-or-nothing), so the
       honest answer is a retryable failure — never the success body. */
    return { status: 500, headers: {}, body: PERSIST_FAILED };
  }
  return result;
}

/** The Durable Object. One instance, addressed by `LEDGER_NAME`. */
export class EditorialLedger {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const rawBody = request.method !== "GET" && request.method !== "HEAD" ? await request.text() : "";

    /* The whole command — read, decide, write — runs with no other request
       delivered to this object. That is the serialization guarantee. */
    const result = await this.state.blockConcurrencyWhile(() =>
      handleWithLedger({
        storage: this.state.storage,
        env: this.env,
        request: { method: request.method, path: url.pathname, headers: request.headers, rawBody },
      }));

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...result.headers },
    });
  }
}
