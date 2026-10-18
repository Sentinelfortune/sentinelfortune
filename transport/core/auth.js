/* SFL EDITORIAL TRANSPORT — authentication and principals.
 *
 * THREE PRINCIPALS, THREE CREDENTIALS, NO SHARING
 * -----------------------------------------------
 *   CLIENT_CHATGPT   an AI client. The eight editorial actions.
 *   CLIENT_CLAUDE    an AI client. The same eight, and only those.
 *   OWNER            approve / authorize withdrawal / reject / rollback.
 *
 * Each has its own credential. Revoking one does not touch the others, and no
 * credential can be used as another: the ADAPTER IS CHOSEN BY THE CREDENTIAL,
 * not by a field in the body. A ChatGPT token always runs the ChatGPT adapter.
 * There is no field a caller can set to change which identity it acts as.
 *
 * NO SECRET IS IN THIS REPOSITORY, AND NONE IS IN THIS PROCESS
 * ------------------------------------------------------------
 * The environment supplies the SHA-256 DIGEST of each token, never the token:
 *
 *   SFL_CORRIDOR_CHATGPT_TOKEN_SHA256   64 hex characters
 *   SFL_CORRIDOR_CLAUDE_TOKEN_SHA256    64 hex characters
 *   SFL_CORRIDOR_OWNER_TOKEN_SHA256     64 hex characters
 *
 * A digest cannot be replayed as a credential, so even a full dump of the
 * Worker's configuration grants nothing. The presented bearer is hashed and
 * compared against the digest in constant time.
 *
 * WebCrypto is used rather than node:crypto so that ONE implementation runs
 * unchanged in a Cloudflare Worker and in Node — the two runtimes this
 * transport targets.
 */

export const PRINCIPALS = Object.freeze(["CLIENT_CHATGPT", "CLIENT_CLAUDE", "OWNER"]);

/** Which env var holds each principal's token digest. */
export const DIGEST_VARS = Object.freeze({
  CLIENT_CHATGPT: "SFL_CORRIDOR_CHATGPT_TOKEN_SHA256",
  CLIENT_CLAUDE: "SFL_CORRIDOR_CLAUDE_TOKEN_SHA256",
  OWNER: "SFL_CORRIDOR_OWNER_TOKEN_SHA256",
});

const HEX64 = /^[0-9a-f]{64}$/;

/* ─────────────────────────────────────────────────────────────────────────
   PRIMITIVES
   ───────────────────────────────────────────────────────────────────────── */

const encoder = new TextEncoder();

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time comparison of two equal-length hex strings.
 *
 * A `===` on a secret-derived value leaks its prefix through timing. These are
 * digests rather than secrets, so the leak is mild — but a comparison that is
 * only safe because of what it happens to be comparing is a comparison someone
 * will later reuse on something else.
 */
export function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ─────────────────────────────────────────────────────────────────────────
   CONFIGURATION
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Read the principal configuration out of an environment.
 *
 * A principal with no digest configured DOES NOT EXIST — it is not "disabled",
 * it has no credential that can match, so the route is simply unavailable.
 * That is the safe default for a fresh deployment: nothing works until the
 * Owner deliberately sets a digest.
 */
export function readAuthConfig(env = {}) {
  const revoked = String(env.SFL_CORRIDOR_REVOKED || "")
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  const principals = {};
  const problems = [];
  for (const principal of PRINCIPALS) {
    const raw = env[DIGEST_VARS[principal]];
    if (!raw) continue;                                   // not configured → absent
    const digest = String(raw).trim().toLowerCase();
    if (!HEX64.test(digest)) {
      /* A malformed digest is a configuration error, not a credential that
         "nearly works". Refuse the principal and say so in the log. */
      problems.push(`${DIGEST_VARS[principal]} is not 64 hex characters — ${principal} is unavailable`);
      continue;
    }
    principals[principal] = { principal, digest, revoked: revoked.includes(principal) };
  }

  return {
    principals,
    revokedList: revoked,
    problems,
    signingSecret: env.SFL_CORRIDOR_SIGNING_SECRET || null,
    timestampToleranceMs: Number(env.SFL_CORRIDOR_TIMESTAMP_TOLERANCE_MS || 300_000),
    configured: Object.keys(principals).length > 0,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   AUTHENTICATION
   ───────────────────────────────────────────────────────────────────────── */

function bearerFrom(headers) {
  const raw = headers.get ? headers.get("authorization") : headers.authorization;
  if (!raw) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(String(raw).trim());
  return match ? match[1] : null;
}

/**
 * Resolve a request to a principal.
 *
 * Returns `{ ok: true, principal }` or `{ ok: false, code, reason }`.
 *
 * EVERY configured digest is compared even once a match is found, so the time
 * taken does not reveal which principal matched or how many exist.
 */
export async function authenticate(headers, config) {
  if (!config.configured) {
    return { ok: false, code: "NOT_CONFIGURED", reason: "no credential digest is configured for this deployment" };
  }

  const token = bearerFrom(headers);
  if (!token) {
    return { ok: false, code: "NO_CREDENTIAL", reason: "an Authorization: Bearer credential is required" };
  }

  const presented = await sha256Hex(token);
  let matched = null;
  for (const entry of Object.values(config.principals)) {
    if (timingSafeEqualHex(presented, entry.digest)) matched = entry;
  }

  if (!matched) {
    return { ok: false, code: "BAD_CREDENTIAL", reason: "the presented credential is not recognised" };
  }
  if (matched.revoked) {
    return { ok: false, code: "REVOKED_CREDENTIAL", reason: `${matched.principal} has been revoked` };
  }
  return { ok: true, principal: matched.principal };
}

/* ─────────────────────────────────────────────────────────────────────────
   OPTIONAL REQUEST SIGNING
   ───────────────────────────────────────────────────────────────────────── */

/**
 * HMAC-SHA256 request signing, verified only when a signing secret is
 * configured.
 *
 * WHAT ACTUALLY PROTECTS AGAINST REPLAY
 * -------------------------------------
 * The corridor's instruction-id ledger, always, in every deployment: a
 * replayed command returns the original outcome and writes nothing. That is
 * the protection that matters, and it does not depend on this.
 *
 * A timestamp header on its own would be security theatre — anyone who can
 * replay a request can edit a header. So the timestamp is only honoured as
 * part of a signature, never alone. With no signing secret configured, this
 * layer is absent and says so, rather than pretending.
 *
 * Signed material:  <timestamp>.<METHOD>.<path>.<sha256(body)>
 * Headers:          X-SFL-Timestamp (ms since epoch), X-SFL-Signature (hex)
 */
export async function verifySignature({ headers, method, path, rawBody }, config, now = () => Date.now()) {
  if (!config.signingSecret) return { ok: true, verified: false, reason: "signing not configured" };

  const get = (name) => (headers.get ? headers.get(name) : headers[name]);
  const timestamp = get("x-sfl-timestamp");
  const signature = get("x-sfl-signature");
  if (!timestamp || !signature) {
    return { ok: false, code: "SIGNATURE_REQUIRED", reason: "X-SFL-Timestamp and X-SFL-Signature are required on this deployment" };
  }

  const skew = Math.abs(now() - Number(timestamp));
  if (!Number.isFinite(skew) || skew > config.timestampToleranceMs) {
    return { ok: false, code: "STALE_TIMESTAMP", reason: "the request timestamp is outside the accepted window" };
  }

  const expected = await hmacHex(config.signingSecret, `${timestamp}.${method.toUpperCase()}.${path}.${await sha256Hex(rawBody || "")}`);
  if (!timingSafeEqualHex(String(signature).trim().toLowerCase(), expected)) {
    return { ok: false, code: "BAD_SIGNATURE", reason: "the request signature does not verify" };
  }
  return { ok: true, verified: true };
}

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
