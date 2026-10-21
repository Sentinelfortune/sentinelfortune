/* SFL EDITORIAL TRANSPORT — Cloudflare Worker runtime, Durable Object backed.
 *
 * STATUS: PREPARED, NOT ACTIVE. `wrangler.toml` still points `main` at
 * `runtime/worker.js` (KV, TEST_PREVIEW). This entry is selected only by
 * `wrangler.live.example.toml`, which is an example and is never read by
 * wrangler unless passed explicitly with --config.
 *
 * A shim, like worker.js: it forwards every request to the single
 * `EditorialLedger` Durable Object, which serializes and atomically persists
 * each command (see store-do.js). It makes no decisions.
 */

import { EditorialLedger, LEDGER_NAME } from "./store-do.js";

export { EditorialLedger };

const SECURITY_HEADERS = Object.freeze({
  /* A credentialed API is never cached and never framed. */
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
});

export default {
  async fetch(request, env) {
    if (!env.EDITORIAL_LEDGER) {
      return new Response(JSON.stringify({
        ok: false,
        error: { code: "NOT_CONFIGURED", step: null, message: "Request refused.", retryable: true },
      }), { status: 503, headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS } });
    }

    const stub = env.EDITORIAL_LEDGER.get(env.EDITORIAL_LEDGER.idFromName(LEDGER_NAME));
    const inner = await stub.fetch(request);

    const headers = new Headers(inner.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    return new Response(inner.body, { status: inner.status, headers });
  },
};
