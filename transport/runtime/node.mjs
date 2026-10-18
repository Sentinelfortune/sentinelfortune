/* SFL EDITORIAL TRANSPORT — Node runtime.
 *
 * A shim over the same handler the Worker uses, so the local proof exercises
 * the real transport rather than a stand-in. It exists for two reasons:
 *
 *   1. the end-to-end test can make REAL HTTP requests, over a socket, with
 *      real headers and real status codes — not a function call pretending to
 *      be a request;
 *   2. the Owner can run the API locally before deploying anything.
 *
 * It binds to 127.0.0.1 by default. This process must never listen on a
 * public interface: it is a credentialed write surface, and the deployment
 * target for that is the Worker, behind Cloudflare.
 *
 *   node transport/runtime/node.mjs           # reads credentials from the env
 */

import { createServer } from "node:http";
import { createCorridor } from "../../corridor/actions.js";
import { createApi } from "../core/http.js";
import { MAX_BODY_BYTES } from "../core/http.js";

export function createNodeServer({ env = process.env, corridor = createCorridor(), log = console } = {}) {
  const api = createApi({ env, corridor, log });

  const server = createServer((req, res) => {
    const chunks = [];
    let bytes = 0;
    let aborted = false;

    req.on("data", (chunk) => {
      bytes += chunk.length;
      /* Stop reading a body that is already over the ceiling rather than
         buffering all of it just to refuse it. */
      if (bytes > MAX_BODY_BYTES) {
        aborted = true;
        send(res, 413, { ok: false, error: { code: "BODY_TOO_LARGE", step: null, message: `the request body exceeds ${MAX_BODY_BYTES} bytes`, retryable: false } });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", async () => {
      if (aborted) return;
      const result = await api.handle({
        method: req.method,
        path: req.url,
        headers: req.headers,
        rawBody: Buffer.concat(chunks).toString("utf8"),
      });
      send(res, result.status, result.body, result.headers);
    });

    req.on("error", () => { /* the socket went away; nothing to answer */ });
  });

  return { server, api, corridor };
}

function send(res, status, body, extra = {}) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    ...extra,
  });
  res.end(JSON.stringify(body));
}

/* Run directly: node transport/runtime/node.mjs */
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8787);
  const { server, api } = createNodeServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`[sfl-editorial-api] listening on http://127.0.0.1:${port}`);
    console.log(`[sfl-editorial-api] mode: ${api.mode}   credentials configured: ${api.authConfigured}`);
    if (!api.authConfigured) {
      console.log("[sfl-editorial-api] no credential digest configured — every authenticated route will refuse.");
      console.log("[sfl-editorial-api] set SFL_CORRIDOR_CHATGPT_TOKEN_SHA256 / _CLAUDE_ / _OWNER_ to the SHA-256 hex digest of each token.");
    }
  });
}
