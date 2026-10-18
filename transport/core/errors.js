/* SFL EDITORIAL TRANSPORT — the error schema.
 *
 * ONE error shape for every refusal, whatever layer produced it:
 *
 *   { "ok": false,
 *     "error": { "code", "step", "message", "retryable" } }
 *
 * WHY THE MESSAGE IS DETAILED FOR AN AUTHENTICATED CALLER
 * -------------------------------------------------------
 * The shop Worker's rule is "generic customer errors, detailed safe server
 * logs", because its callers are the public. This API's callers are two AI
 * clients the Owner controls, and the corridor's refusals are WRITTEN to teach
 * a client what to change — "VibraFlow Media does not publish TUTORIAL" is the
 * whole value of the refusal.
 *
 * So the rule here is the same rule applied honestly to a different caller:
 *
 *   BEFORE authentication  → generic message, detail to the log only
 *   AFTER  authentication  → the corridor's own reason, verbatim
 *
 * An unauthenticated caller learns nothing about what exists. An authenticated
 * client learns exactly what to fix.
 */

/** Transport-level codes. Corridor codes pass through unchanged. */
export const TRANSPORT_CODES = Object.freeze([
  "UNKNOWN_ROUTE", "METHOD_NOT_ALLOWED", "MALFORMED_JSON", "BODY_TOO_LARGE",
  "NO_CREDENTIAL", "BAD_CREDENTIAL", "REVOKED_CREDENTIAL", "NOT_CONFIGURED",
  "OWNER_ROUTE", "CLIENT_ROUTE", "PUBLICATION_DISABLED",
  "IDEMPOTENCY_KEY_MISMATCH", "STALE_TIMESTAMP", "BAD_SIGNATURE", "SIGNATURE_REQUIRED",
  "INTERNAL",
]);

/**
 * HTTP status per code. Anything unlisted is a 400 — a refusal the caller
 * caused — rather than a 500, because the corridor refusing something is not
 * the server failing.
 */
const STATUS = Object.freeze({
  /* authentication */
  NO_CREDENTIAL: 401,
  BAD_CREDENTIAL: 401,
  SIGNATURE_REQUIRED: 401,
  BAD_SIGNATURE: 401,
  STALE_TIMESTAMP: 401,
  REVOKED_CREDENTIAL: 403,
  REVOKED: 403,
  UNKNOWN_CLIENT: 403,

  /* authority */
  NOT_PERMITTED: 403,
  NO_SUCH_ACTION: 403,
  OWNER_APPROVAL_REQUIRED: 403,
  APPROVAL_MISMATCH: 403,
  APPROVAL_STALE: 403,
  OWNER_ROUTE: 403,
  CLIENT_ROUTE: 403,
  PUBLICATION_DISABLED: 403,

  /* the caller's request */
  MALFORMED_JSON: 400,
  NO_ACTION: 400,
  NO_INSTRUCTION_ID: 400,
  INVALID_RECORD: 400,
  MEDIA_REFUSED: 400,
  UNKNOWN_BRANCH: 400,
  BRANCH_REJECTS_TYPE: 400,
  NOT_A_WITHDRAWAL: 400,
  IDEMPOTENCY_KEY_MISMATCH: 400,
  METHOD_NOT_ALLOWED: 405,
  BODY_TOO_LARGE: 413,

  /* state */
  NOT_FOUND: 404,
  UNKNOWN_ROUTE: 404,
  SLUG_TAKEN: 409,
  ILLEGAL_TRANSITION: 409,
  NOT_APPROVED: 409,

  /* pressure */
  RATE_LIMITED: 429,

  /* us */
  NOT_CONFIGURED: 503,
  INTERNAL: 500,
});

/** Codes worth retrying unchanged. Everything else needs the request changed,
 *  and telling a client to retry an unretryable call wastes its quota. */
const RETRYABLE = Object.freeze(["RATE_LIMITED", "INTERNAL", "NOT_CONFIGURED"]);

export function statusFor(code) {
  return STATUS[code] || 400;
}

export function errorBody(code, message, { step = null } = {}) {
  return {
    ok: false,
    error: {
      code,
      step,
      message,
      retryable: RETRYABLE.includes(code),
    },
  };
}

/** The generic message an UNAUTHENTICATED caller gets, whatever happened. */
export const GENERIC = "Request refused.";
