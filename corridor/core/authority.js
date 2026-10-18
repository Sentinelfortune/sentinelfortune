/* SFL EDITORIAL CORRIDOR — authority and least privilege.
 *
 * What an AI client may do, and nothing else.
 *
 * NO CLIENT HAS INFRASTRUCTURE AUTHORITY. There is no action here that
 * touches the filesystem outside the corridor's own store, Git, DNS,
 * Cloudflare, R2, Stripe, the Shop Worker or House of Assets. The eight
 * actions below are the entire surface; anything not on this list does not
 * exist as far as a client is concerned.
 */

export const CLIENTS = Object.freeze(["CLIENT_CHATGPT", "CLIENT_CLAUDE"]);

/** The complete action surface. Both clients get the same one — there is no
 *  Claude-only bypass and no ChatGPT-only shortcut. */
export const ACTIONS = Object.freeze([
  "create_draft", "update_draft", "get_preview", "publish_approved",
  "unpublish", "archive", "list_recent", "get_record",
]);

/** Actions that change what the public can see. They carry the extra
 *  requirement of an Owner approval on the record itself. */
export const OWNER_GATED = Object.freeze(["publish_approved", "unpublish", "archive"]);

/**
 * A client identity. Credentials are NEVER stored here and never printed —
 * this carries only a reference to where the secret lives and a revocation
 * flag, so the corridor can be reasoned about without handling a secret.
 */
export function clientIdentity(client, { credentialRef, revoked = false, rateLimitPerHour = 60 } = {}) {
  if (!CLIENTS.includes(client)) throw new Error(`unknown client ${JSON.stringify(client)}`);
  return Object.freeze({
    client,
    credentialRef: credentialRef || `${client}_CREDENTIAL`,  // a NAME, never a value
    revoked,
    rateLimitPerHour,
    actions: ACTIONS,
  });
}

/**
 * May this client perform this action on this record?
 *
 * Three independent gates, each with its own refusal reason:
 *   1. the client is known and not revoked
 *   2. the action is on the allow-list
 *   3. an Owner-gated action has a real Owner approval on the record
 */
export function authorize({ identity, action, record = null, ownerApproval = null }) {
  if (!identity || !CLIENTS.includes(identity.client)) {
    return { ok: false, code: "UNKNOWN_CLIENT", reason: "the calling client is not recognised" };
  }
  if (identity.revoked) {
    return { ok: false, code: "REVOKED", reason: `${identity.client} credentials have been revoked` };
  }
  if (!ACTIONS.includes(action)) {
    return { ok: false, code: "NO_SUCH_ACTION", reason: `${action} is not an editorial action` };
  }
  if (!identity.actions.includes(action)) {
    return { ok: false, code: "NOT_PERMITTED", reason: `${identity.client} may not ${action}` };
  }

  if (OWNER_GATED.includes(action)) {
    if (!ownerApproval || ownerApproval.approved !== true) {
      return {
        ok: false, code: "OWNER_APPROVAL_REQUIRED",
        reason: `${action} requires explicit Owner approval — an AI client cannot approve its own publication`,
      };
    }
    if (record && ownerApproval.recordId !== record.id) {
      return {
        ok: false, code: "APPROVAL_MISMATCH",
        reason: "the Owner approval refers to a different record",
      };
    }
    if (record && ownerApproval.version !== undefined && ownerApproval.version !== record.version) {
      return {
        ok: false, code: "APPROVAL_STALE",
        reason: `the Owner approved version ${ownerApproval.version}; this record is now version ${record.version}`,
      };
    }
  }
  return { ok: true };
}

/** An audit entry. Appended at every pipeline step; never published. */
export function auditEntry({ action, client, intent, outcome, detail = null, at = new Date().toISOString() }) {
  return Object.freeze({ at, action, client, intent, outcome, detail });
}
