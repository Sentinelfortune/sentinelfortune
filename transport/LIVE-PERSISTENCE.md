# LIVE PERSISTENCE — Durable Object ledger (PREPARED, NOT ACTIVE)

The KV store used by the TEST_PREVIEW Worker cannot guarantee that an Owner
approval, a version bump or a state transition survives two concurrent
commands (`runtime/store-kv.js`, header). This is the replacement, prepared in
advance so that LIVE never runs on KV.

**Nothing here is active.** `wrangler.toml` still deploys `runtime/worker.js`
on KV in TEST_PREVIEW. No migration has been run. No resource exists.

## 1. Files

| File | Role |
| --- | --- |
| `runtime/store-do.js` | `EditorialLedger` Durable Object + `handleWithLedger` |
| `runtime/worker-live.js` | Worker entry that forwards every request to the one ledger object |
| `wrangler.live.example.toml` | example config — separate Worker name, still `TEST_PREVIEW` |
| `tests/store-do.test.mjs` | 10 tests on a strict local model of DO storage |

The corridor (`corridor/`) and the request handler (`core/http.js`) are
unchanged. The ledger persists through the same `snapshot()` / `restore()`
seam as the KV store.

## 2. Guarantees, and where each comes from

| Guarantee | Mechanism |
| --- | --- |
| One command at a time | one object (`idFromName("sfl-editorial-ledger")`) and `blockConcurrencyWhile` around load → corridor → write |
| All-or-nothing writes | every changed `rec:*` / `ins:*` key written in **one** `storage.transaction` |
| No false success | a failed transaction returns `500 INTERNAL retryable`, never the success body; nothing is committed |
| No silent data loss | a state in which a stored key disappeared is refused (`would be lost`) — the corridor never deletes |
| Replay costs nothing | a replayed instruction produces an empty diff and no commit |
| Small values | per-entry keys, not one snapshot blob |

The control test `WITHOUT the gate the same load loses writes` demonstrates
the hazard: two acknowledged updates race, one is lost without the gate, both
are kept with it.

## 3. Why a Durable Object rather than D1

D1 already hosts `sfl-editorial-corridor` for the **Vercel** corridor
(`platform/api/corridor.js`). Pointing this Worker at the same database would
merge two write paths that are currently independent — a governance decision,
not a persistence one. A Durable Object keeps this transport isolated, needs no
schema migration and serializes by construction. If the Owner decides to unify
the two corridors on D1, that is a separate, explicit change.

## 4. Activation (Owner, later — not part of TEST_PREVIEW)

1. `wrangler deploy --dry-run --config transport/wrangler.live.example.toml`
   (verified in this session: 70.17 KiB / gzip 18.98 KiB, binding `EDITORIAL_LEDGER`).
2. Set the three digests on the ledger Worker with
   `wrangler secret put … --config transport/wrangler.live.example.toml`
   (new values — do not reuse TEST_PREVIEW credentials).
3. Deploy it **still in TEST_PREVIEW** and run
   `transport/scripts/validate-remote.mjs` against its own hostname, both passes.
4. Only then consider `SFL_CORRIDOR_MODE = "LIVE"` — a separate Owner decision.
   The corridor's Owner-approval gate applies regardless of mode.

State in the KV TEST_PREVIEW Worker is test data and is **not** migrated.
