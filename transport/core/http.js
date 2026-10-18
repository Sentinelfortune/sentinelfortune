/* SFL EDITORIAL TRANSPORT — the one request handler.
 *
 *   OWNER
 *     ↓
 *   ChatGPT / Claude
 *     ↓
 *   ONE AUTHENTICATED EDITORIAL API      ← this file
 *     ↓
 *   ONE SFL EDITORIAL CORRIDOR
 *     ↓
 *   ONE PUBLIC ENGINE → ONE CORE → ONE COMMERCIAL HEART
 *     → ONE IDENTITY ROUTER → SEVEN SPECIALIZED BRANCHES
 *
 * WHAT THIS FILE IS
 * -----------------
 * A pure function of a request-like object. It parses, authenticates, routes,
 * and serializes. It is runtime-agnostic on purpose: `runtime/worker.js` and
 * `runtime/node.mjs` are thin shims over this, so a Cloudflare Worker and a
 * local Node server cannot drift apart in behaviour.
 *
 * WHAT THIS FILE IS NOT
 * ---------------------
 * It contains NO editorial logic. It does not validate a record, choose a
 * branch, resolve an intent, decide a state transition, check an approval or
 * build a feed. Every one of those already exists in the corridor and is
 * called, never reimplemented. The transport's only judgements are about HTTP.
 *
 * THE ADAPTER IS CHOSEN BY THE CREDENTIAL
 * ---------------------------------------
 * There is no `provider` field in any request body. A ChatGPT token always
 * runs the ChatGPT adapter; a Claude token always runs the Claude adapter. A
 * caller cannot state which identity it is acting as, so it cannot lie.
 */

import { createCorridor } from "../../corridor/actions.js";
import { intentToAction } from "../../corridor/core/pipeline.js";
import { readAuthConfig, authenticate, verifySignature } from "./auth.js";
import { errorBody, statusFor, GENERIC } from "./errors.js";
import { projectOutcome, projectRecord } from "./project.js";

export const API_VERSION = "sfl.editorial-api/1.0";

/** The transport's own ceiling. A body larger than this is refused before it
 *  is parsed, so a malformed giant payload costs nothing to reject. */
export const MAX_BODY_BYTES = 256 * 1024;

/** Deployment modes. TEST_PREVIEW is the default so that a deployment which
 *  forgot to set a mode cannot publish anything. */
export const MODES = Object.freeze(["TEST_PREVIEW", "LIVE"]);

const CLIENT_PRINCIPALS = Object.freeze(["CLIENT_CHATGPT", "CLIENT_CLAUDE"]);

/* ─────────────────────────────────────────────────────────────────────────
   THE API
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Build a handler.
 *
 * `corridor` is injected so that a runtime can supply a persisted store; when
 * omitted a fresh in-memory corridor is created, which is what the local
 * server and the tests use.
 */
export function createApi({ env = {}, corridor = createCorridor(), now = () => Date.now(), log = console } = {}) {
  const auth = readAuthConfig(env);
  const mode = MODES.includes(env.SFL_CORRIDOR_MODE) ? env.SFL_CORRIDOR_MODE : "TEST_PREVIEW";

  for (const problem of auth.problems) log.error(`[sfl-editorial-api] configuration: ${problem}`);

  /** A refusal, with the detail withheld from callers who have not proved who
   *  they are. The full reason always reaches the log. */
  function refuse(code, reason, { step = null, authenticated = false, headers = {} } = {}) {
    if (!authenticated) log.warn(`[sfl-editorial-api] ${code}: ${reason}`);
    return {
      status: statusFor(code),
      headers,
      body: errorBody(code, authenticated ? reason : GENERIC, { step }),
    };
  }

  return {
    mode,
    corridor,
    authConfigured: auth.configured,

    /**
     * Handle one request.
     *
     * `request` is `{ method, path, headers, rawBody }` — `headers` may be a
     * `Headers` instance or a plain object.
     */
    async handle({ method = "GET", path = "/", headers = {}, rawBody = "" } = {}) {
      try {
        return await route({ method: method.toUpperCase(), path: normalizePath(path), headers, rawBody });
      } catch (err) {
        /* Detail to the log, never to the caller — an exception message can
           carry a fragment of whatever caused it. */
        log.error(`[sfl-editorial-api] unhandled: ${err && err.stack ? err.stack : err}`);
        return refuse("INTERNAL", "an unexpected error occurred");
      }
    },
  };

  /* ───────────────────────────────────────────────────────────────────── */

  async function route({ method, path, headers, rawBody }) {
    /* ── unauthenticated, read-only, no editorial data ─────────────────── */
    if (path === "/v1/health") {
      if (method !== "GET") return refuse("METHOD_NOT_ALLOWED", `${method} is not allowed on ${path}`);
      return {
        status: 200,
        headers: {},
        body: {
          ok: true,
          api: API_VERSION,
          mode,
          configured: auth.configured,
          /* Which principals EXIST is deliberately not disclosed. */
          publicationEnabled: mode === "LIVE",
        },
      };
    }

    if (path === "/v1/contract") {
      if (method !== "GET") return refuse("METHOD_NOT_ALLOWED", `${method} is not allowed on ${path}`);
      return { status: 200, headers: {}, body: contractDescriptor(mode) };
    }

    /* ── everything below needs a credential ───────────────────────────── */
    const identified = await authenticate(headers, auth);
    if (!identified.ok) {
      return refuse(identified.code, identified.reason, {
        headers: identified.code === "NO_CREDENTIAL" || identified.code === "BAD_CREDENTIAL"
          ? { "WWW-Authenticate": 'Bearer realm="sfl-editorial"' }
          : {},
      });
    }
    const principal = identified.principal;

    const signed = await verifySignature({ headers, method, path, rawBody }, auth, now);
    if (!signed.ok) return refuse(signed.code, signed.reason, { authenticated: true });

    if (method !== "POST" && method !== "GET") {
      return refuse("METHOD_NOT_ALLOWED", `${method} is not allowed on ${path}`, { authenticated: true });
    }

    /* ── body ──────────────────────────────────────────────────────────── */
    let payload = {};
    if (method === "POST") {
      if (byteLength(rawBody) > MAX_BODY_BYTES) {
        return refuse("BODY_TOO_LARGE", `the request body exceeds ${MAX_BODY_BYTES} bytes`, { authenticated: true });
      }
      try {
        payload = rawBody && rawBody.trim() ? JSON.parse(rawBody) : {};
      } catch {
        return refuse("MALFORMED_JSON", "the request body is not valid JSON", { authenticated: true });
      }
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        return refuse("MALFORMED_JSON", "the request body must be a JSON object", { authenticated: true });
      }
    }

    /* ── the one client endpoint ───────────────────────────────────────── */
    if (path === "/v1/editorial") {
      if (!CLIENT_PRINCIPALS.includes(principal)) {
        return refuse("CLIENT_ROUTE", "this endpoint is for the AI clients; the Owner uses /v1/owner/*", { authenticated: true });
      }
      if (method !== "POST") return refuse("METHOD_NOT_ALLOWED", `${method} is not allowed on ${path}`, { authenticated: true });
      return editorial(principal, payload, headers);
    }

    /* ── the Owner's own endpoints ─────────────────────────────────────── */
    if (path.startsWith("/v1/owner/")) {
      if (principal !== "OWNER") {
        /* An AI client asking for an Owner route is told plainly that this is
           not delegated to it. The corridor would refuse anyway; refusing at
           the edge means the attempt never reaches the editorial store. */
        return refuse("OWNER_ROUTE", "approval, rejection, withdrawal authorization and rollback are Owner-only and are not delegated to an AI client", { authenticated: true });
      }
      return owner(path, method, payload);
    }

    return refuse("UNKNOWN_ROUTE", `${path} is not an endpoint of this API`, { authenticated: true });
  }

  /* ───────────────────────────────────────────────────────────────────────
     CLIENT: one normalized action endpoint
     ─────────────────────────────────────────────────────────────────────── */

  function editorial(principal, payload, headers) {
    /* An Idempotency-Key, when sent, must agree with the instruction id in the
       body. Two different notions of "the same request" is how a duplicate
       publication eventually happens. */
    const key = headers.get ? headers.get("idempotency-key") : headers["idempotency-key"];
    const instructionId = payload.instruction_id || payload.instructionId || null;
    if (key && instructionId && key !== instructionId) {
      return refuse("IDEMPOTENCY_KEY_MISMATCH",
        "the Idempotency-Key header and the instruction id in the body must be the same value",
        { authenticated: true });
    }

    /* TEST_PREVIEW refuses publication at the edge. This does not replace the
       corridor's Owner-approval gate — that gate is unconditional and still
       runs in LIVE mode. This is a second, deployment-level lock so that a
       test deployment cannot make anything public even if an approval exists. */
    const requested = intentToAction(
      payload.user_message || payload.ownerUtterance,
      payload.operation || payload.intent,
    );
    if (mode === "TEST_PREVIEW" && requested.action === "publish_approved") {
      return refuse("PUBLICATION_DISABLED",
        "this deployment runs in TEST_PREVIEW mode and cannot publish; prepare and preview are available",
        { step: "OWNER_AUTHORITY", authenticated: true });
    }

    const result = principal === "CLIENT_CHATGPT"
      ? corridor.chatgpt(payload)
      : corridor.claude(payload);

    if (!result.ok) {
      const headersOut = result.code === "RATE_LIMITED" && result.retryAfterMs
        ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
        : {};
      return refuse(result.code || "INTERNAL", result.reason || "the corridor refused the command",
        { step: result.step, authenticated: true, headers: headersOut });
    }

    /* The action is recovered through the corridor's OWN intent→action table,
       so the transport never keeps a second copy of that mapping. */
    const action = intentToAction(null, result.intent).action;
    return { status: 200, headers: {}, body: projectOutcome({ ...result, action }, { mode, principal }) };
  }

  /* ───────────────────────────────────────────────────────────────────────
     OWNER: the approval flow the corridor already defines
     ─────────────────────────────────────────────────────────────────────── */

  function owner(path, method, payload) {
    const action = path.slice("/v1/owner/".length);

    if (method === "GET") {
      switch (action) {
        case "approvals":
          return ok({ approvals: corridor.pendingApprovals() });
        case "feed":
          /* The TEST_PREVIEW feed. Reading it is how the Owner sees what the
             public engine would be handed, without anything being deployed. */
          return ok({ feed: corridor.feed({ evidence: mode === "LIVE" ? "LIVE" : "TEST_PREVIEW" }) });
        case "audit":
          return ok({ audit: corridor.auditTrail() });
        case "records":
          return ok({ records: corridor.store.recent(50).map(projectRecord) });
        default:
          return refuse("UNKNOWN_ROUTE", `/v1/owner/${action} is not an endpoint of this API`, { authenticated: true });
      }
    }

    if (!payload.recordId) {
      return refuse("NO_ACTION", "recordId is required", { authenticated: true });
    }

    switch (action) {
      case "approve": {
        const r = corridor.approve({ recordId: payload.recordId, by: payload.by || "OWNER" });
        return r.ok
          ? ok({ approval: r.approval, record: projectRecord(r.record) })
          : refuse(r.code, r.reason, { step: "APPROVAL_STATE", authenticated: true });
      }
      case "withdrawal": {
        const r = corridor.authorizeWithdrawal({ recordId: payload.recordId, action: payload.action, by: payload.by || "OWNER" });
        return r.ok
          ? ok({ approval: r.approval })
          : refuse(r.code, r.reason, { step: "APPROVAL_STATE", authenticated: true });
      }
      case "reject": {
        const r = corridor.reject({ recordId: payload.recordId, by: payload.by || "OWNER", reason: payload.reason || null });
        return r.ok
          ? ok({ record: projectRecord(r.record) })
          : refuse(r.code, r.reason, { step: "APPROVAL_STATE", authenticated: true });
      }
      case "rollback": {
        const r = corridor.rollback({ recordId: payload.recordId, toVersion: payload.toVersion });
        return r.ok
          ? ok({ record: projectRecord(r.record), restoredFrom: r.restoredFrom })
          : refuse("NOT_FOUND", r.reason, { step: "APPROVAL_STATE", authenticated: true });
      }
      default:
        return refuse("UNKNOWN_ROUTE", `/v1/owner/${action} is not an endpoint of this API`, { authenticated: true });
    }
  }

  function ok(body) {
    return { status: 200, headers: {}, body: { ok: true, mode, client: "OWNER", ...body } };
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────────────────── */

/** Strip the query and any trailing slash, so /v1/editorial/ and
 *  /v1/editorial?x=1 are the same endpoint rather than a 404. */
function normalizePath(path) {
  const clean = String(path).split("?")[0].split("#")[0];
  return clean.length > 1 && clean.endsWith("/") ? clean.slice(0, -1) : clean;
}

function byteLength(text) {
  return new TextEncoder().encode(String(text || "")).length;
}

/** The self-describing contract, served unauthenticated so an integration can
 *  discover the surface without holding a credential. It names the actions and
 *  the error codes; it exposes no editorial data and no principal list. */
function contractDescriptor(mode) {
  return {
    ok: true,
    api: API_VERSION,
    mode,
    corridor: "sf.public-site/1.0",
    auth: { scheme: "Bearer", header: "Authorization", perClientCredential: true },
    endpoints: {
      health: { method: "GET", path: "/v1/health", auth: false },
      contract: { method: "GET", path: "/v1/contract", auth: false },
      editorial: { method: "POST", path: "/v1/editorial", auth: "CLIENT" },
      owner: { method: "POST", path: "/v1/owner/{approve|withdrawal|reject|rollback}", auth: "OWNER" },
      ownerRead: { method: "GET", path: "/v1/owner/{approvals|feed|audit|records}", auth: "OWNER" },
    },
    actions: [
      "create_draft", "update_draft", "get_preview", "publish_approved",
      "unpublish", "archive", "list_recent", "get_record",
    ],
    intents: ["PREPARE", "PREVIEW", "UPDATE", "REPLACE", "PUBLISH", "UNPUBLISH", "ARCHIVE", "LIST", "GET"],
    defaults: { intent: "PREPARE" },
    rules: [
      "an unclear instruction resolves to PREPARE, never to PUBLISH",
      "publish_approved requires an Owner approval recorded through /v1/owner/approve",
      "an approval names a record AND a version AND an action, and is spent on use",
      "every command requires an instruction id; a replay returns the original outcome and writes nothing",
      "the corridor cannot state a price, a pricing tier other than FREE, or a checkout",
      mode === "TEST_PREVIEW"
        ? "this deployment is TEST_PREVIEW: publication is refused at the edge"
        : "this deployment is LIVE: publication requires Owner approval",
    ],
    errorSchema: { ok: false, error: { code: "string", step: "string|null", message: "string", retryable: "boolean" } },
  };
}
