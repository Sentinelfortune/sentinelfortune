/* Sentinel Fortune — ChatGPT -> Editorial Corridor adapter.
 *
 * PURPOSE
 * This endpoint gives the connected ChatGPT/Vercel control plane a governed
 * publication surface without exposing CORRIDOR_TOKEN_CHATGPT to the chat,
 * the browser, a client bundle, or SFL-ZBOOK.
 *
 * AUTHORITY
 * - The endpoint is only usable on Vercel-owned deployment hosts.
 * - Vercel Authentication protects those deployment hosts.
 * - The request can only name a pre-committed manifest. It cannot supply
 *   arbitrary editorial content.
 * - The manifest is a reviewed DRAFTING instruction, not a publication
 *   authority. The adapter creates the draft and submits it for review, and
 *   stops there: publication needs the Owner's explicit approval of that
 *   version, given through /api/corridor with the Owner credential.
 * - It writes only on POST. A GET is answered 405, so a link, a prefetch or
 *   an image tag can never cause a write.
 * - The actual write still goes through /api/corridor and therefore through
 *   the same D1 governance, rate limits, idempotency and audit trail.
 */

const MANIFESTS = require("../editorial/chatgpt-manifests.json");

const CORRIDOR_URL = "https://onecompany.sentinelfortune.com/api/corridor";
const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

function isVercelControlHost(req) {
  const host = String(req.headers.host || "").toLowerCase().split(":")[0];
  return host.endsWith(".vercel.app");
}

async function corridor(token, payload) {
  const response = await fetch(CORRIDOR_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  let body = {};
  try { body = await response.json(); } catch { body = { error: "INVALID_CORRIDOR_RESPONSE" }; }
  return { status: response.status, body };
}

module.exports = async function handler(req, res) {
  const send = (status, body) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };

  if (req.method !== "POST") return send(405, { error: "METHOD_NOT_ALLOWED" });
  if (!isVercelControlHost(req)) return send(404, { error: "NOT_FOUND" });

  const id = String((req.query && req.query.id) || "").toLowerCase();
  if (!ID_RE.test(id)) return send(400, { error: "MANIFEST_ID_REQUIRED" });

  const manifest = MANIFESTS && MANIFESTS.manifests ? MANIFESTS.manifests[id] : null;
  if (!manifest) return send(404, { error: "MANIFEST_NOT_FOUND" });
  if (manifest.adapter !== "chatgpt" || manifest.state !== "READY_FOR_REVIEW") {
    return send(409, { error: "MANIFEST_NOT_AUTHORIZED" });
  }

  const token = process.env.CORRIDOR_TOKEN_CHATGPT;
  /* A neutral code: an error body is no place to name an agent. */
  if (!token) return send(503, { error: "ADAPTER_UNCONFIGURED" });

  const record = manifest.record || {};
  const recordId = record.record_id;
  if (!recordId) return send(500, { error: "MANIFEST_RECORD_ID_MISSING" });

  const create = await corridor(token, {
    action: "create_draft",
    ...record,
    idempotency_key: `${id}:create:v1`,
  });

  if (![200, 201, 409].includes(create.status)) {
    return send(502, { error: "CREATE_FAILED", corridor_status: create.status, corridor: create.body });
  }

  if (create.status === 409 && create.body && create.body.error !== "RECORD_EXISTS") {
    return send(409, { error: "CREATE_CONFLICT", corridor: create.body });
  }

  const review = await corridor(token, {
    action: "submit_review",
    record_id: recordId,
    idempotency_key: `${id}:review:v1`,
  });
  if (review.status >= 400 && !(review.status === 409 && review.body && review.body.status === "PUBLISHED")) {
    return send(review.status, { error: "REVIEW_FAILED", corridor: review.body });
  }

  /* No publish step. The record now waits in REVIEW for the Owner. */
  return send(200, {
    ok: true,
    manifest_id: id,
    record_id: recordId,
    identity: record.identity,
    status: (review.body && review.body.record && review.body.record.status) || "REVIEW",
    next: "OWNER_APPROVAL_REQUIRED",
  });
};
