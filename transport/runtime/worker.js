/* SFL EDITORIAL TRANSPORT — Cloudflare Worker runtime.
 *
 * A shim. It turns a `Request` into the handler's plain object and the
 * handler's plain object back into a `Response`, and persists the corridor
 * store through the KV seam. It makes no decisions.
 *
 * Deploy:  wrangler deploy --config transport/wrangler.toml
 * Secrets: wrangler secret put SFL_CORRIDOR_CHATGPT_TOKEN_SHA256  (etc.)
 *
 * WHY A WORKER AND NOT THE EXISTING VERCEL PROJECT
 * ------------------------------------------------
 * The Vercel project serves the seven public hostnames and holds no
 * credentials. This API holds three. Putting a credentialed write surface
 * inside the project that serves the public site widens that project's blast
 * radius for no benefit. Cloudflare Workers is already a Sentinel Fortune
 * deployment path (shop-worker/, cloudflare/), runs the corridor's
 * zero-dependency ES modules with no build step, and keeps secrets in Worker
 * secret storage rather than anywhere near the repository.
 */

import { createCorridor } from "../../corridor/actions.js";
import { createApi } from "../core/http.js";
import { loadStore, saveStore, mutated } from "./store-kv.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* Per-request store, restored from KV. The corridor is cheap to build and
       holds no connections, so a fresh one per request is simpler than —
       and safer than — a module-scope one shared across an isolate's
       concurrent requests. */
    const kv = env.EDITORIAL_KV || null;
    const store = await loadStore(kv);
    const corridor = createCorridor({ store });
    const api = createApi({ env, corridor });

    let rawBody = "";
    if (request.method !== "GET" && request.method !== "HEAD") {
      rawBody = await request.text();
    }

    const result = await api.handle({
      method: request.method,
      path: url.pathname,
      headers: request.headers,
      rawBody,
    });

    /* Write back only when something actually changed. A read or a refusal
       costs no KV write. */
    if (mutated(result.body)) {
      const persist = saveStore(kv, store);
      if (ctx && ctx.waitUntil) ctx.waitUntil(persist); else await persist;
    }

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        /* A credentialed API is never cached and never framed. */
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        ...result.headers,
      },
    });
  },
};
