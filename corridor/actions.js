/* SFL EDITORIAL CORRIDOR — THE ENTIRE SURFACE.
 *
 * ONE CORRIDOR · TWO ADAPTERS · SEVEN DESTINATIONS
 *
 * This file is the whole of what an AI client can reach. Everything an
 * integration is allowed to do is a method on the object `createCorridor()`
 * returns, and there are exactly two ways in:
 *
 *     corridor.chatgpt(request)   ChatGPT action / connector
 *     corridor.claude(request)    Claude tool call
 *
 * Both convert their provider-shaped request into the SAME command and hand it
 * to the SAME pipeline. No provider has an action, a default or a shortcut the
 * other lacks.
 *
 * WHAT IS DELIBERATELY ABSENT
 * ---------------------------
 * No client action writes a file, runs a command, touches Git, DNS, Cloudflare,
 * R2, Stripe, the Shop or House of Assets. There is no `deploy`, no `merge`, no
 * `set_price`, no `checkout`. Those are not refused at runtime — they are not
 * expressible, which is a stronger guarantee than a check.
 *
 * OWNER-ONLY OPERATIONS
 * ---------------------
 * `approve`, `reject` and `rollback` live on the corridor but are NOT in the
 * client action list, and the adapters cannot reach them. An AI client prepares
 * and previews; the Owner approves; only then can anything publish.
 */

import { fromChatGPT } from "./adapters/chatgpt.js";
import { fromClaude } from "./adapters/claude.js";
import { run } from "./core/pipeline.js";
import { createStore } from "./core/store.js";
import { clientIdentity, ACTIONS, OWNER_GATED, auditEntry } from "./core/authority.js";
import { buildFeed } from "./core/publish.js";
import { canTransition } from "./schema/states.js";

/** The client-facing action surface, restated here so an integration can read
 *  one list and know the whole of its authority. */
export const CLIENT_ACTIONS = ACTIONS;

/** Operations the Owner performs and no AI client can. */
export const OWNER_ACTIONS = Object.freeze(["approve", "authorizeWithdrawal", "reject", "rollback"]);

/* ─────────────────────────────────────────────────────────────────────────
   RATE LIMITING

   A rolling one-hour window per client. Not a performance measure: a runaway
   loop in a client must not be able to fill the editorial store, and a
   compromised credential must hit a ceiling before it does damage.
   ───────────────────────────────────────────────────────────────────────── */

function createLimiter(now, hits = new Map()) {   // hits: client -> [timestamps]
  return {
    check(client, perHour) {
      const t = now();
      const window = (hits.get(client) || []).filter((x) => t - x < 3600_000);
      if (window.length >= perHour) {
        hits.set(client, window);
        return { ok: false, code: "RATE_LIMITED", reason: `${client} has used its ${perHour} editorial commands for this hour`, retryAfterMs: 3600_000 - (t - window[0]) };
      }
      window.push(t);
      hits.set(client, window);
      return { ok: true, remaining: perHour - window.length };
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   THE CORRIDOR
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Build a corridor.
 *
 * `clients` registers the two identities. A credential is NEVER passed in and
 * never stored — an identity carries only the NAME of the secret it expects to
 * be presented with, so nothing here can print, log or leak one.
 */
export function createCorridor({
  store = createStore(),
  clients = {},
  clock = () => Date.now(),
  now = () => new Date(clock()).toISOString(),
} = {}) {
  const identities = {
    CLIENT_CHATGPT: clients.CLIENT_CHATGPT || clientIdentity("CLIENT_CHATGPT", { credentialRef: "SFL_CORRIDOR_CHATGPT_TOKEN" }),
    CLIENT_CLAUDE: clients.CLIENT_CLAUDE || clientIdentity("CLIENT_CLAUDE", { credentialRef: "SFL_CORRIDOR_CLAUDE_TOKEN" }),
  };
  const limiter = createLimiter(clock, store.rateHits);
  /**
   * Owner approvals, keyed by RECORD **and ACTION**. Held here rather than on
   * the record so an AI client's update cannot carry one in, and scoped to one
   * action so permission to withdraw a piece is not also permission to publish
   * it.
   */
  const approvals = store.approvals || new Map();
  const key = (recordId, action) => `${recordId}|${action}`;
  const ownerAudit = store.ownerAudit || [];

  function execute(command) {
    const identity = identities[command.client];
    if (!identity) {
      return { ok: false, step: "OWNER_AUTHORITY", code: "UNKNOWN_CLIENT", reason: "the calling client is not registered with this corridor", audit: [] };
    }

    const limit = limiter.check(identity.client, identity.rateLimitPerHour);
    if (!limit.ok) {
      return { ok: false, step: "COMMAND_VALIDATION", code: limit.code, reason: limit.reason, retryAfterMs: limit.retryAfterMs, audit: [auditEntry({ action: command.action, client: identity.client, intent: command.intent, outcome: "COMMAND_VALIDATION:RATE_LIMITED", at: now() })] };
    }

    /* An Owner-gated action is handed the approval the OWNER recorded, looked
       up by record id. A client cannot supply, forge or guess one: it never
       appears in any request shape either adapter accepts. */
    const ownerApproval = OWNER_GATED.includes(command.action)
      ? approvals.get(key(command.recordId, command.action)) || null
      : null;

    const result = run(command, { store, identity, ownerApproval, now });

    /* A publication consumes its approval. Publishing twice needs approving
       twice — an approval is permission for one act, not a standing grant. */
    if (result.ok && OWNER_GATED.includes(command.action) && !result.replay) {
      approvals.delete(key(command.recordId, command.action));
    }
    return { ...result, intent: command.intent, confident: command.confident, client: identity.client };
  }

  return {
    store,
    CLIENT_ACTIONS,
    OWNER_ACTIONS,

    /** The two provider entry points. Identical authority, different shape. */
    chatgpt(request) { return execute(fromChatGPT(request)); },
    claude(request) { return execute(fromClaude(request)); },

    /** Accepted for completeness so a transport can route by name rather than
     *  by method, without that becoming a third, differently-governed path. */
    request(provider, payload) {
      if (provider === "CLIENT_CHATGPT" || provider === "chatgpt") return this.chatgpt(payload);
      if (provider === "CLIENT_CLAUDE" || provider === "claude") return this.claude(payload);
      return { ok: false, step: "COMMAND_VALIDATION", code: "UNKNOWN_CLIENT", reason: `${provider} is not a corridor client`, audit: [] };
    },

    /* ── OWNER ONLY ──────────────────────────────────────────────────────── */

    /**
     * The Owner approves a specific VERSION of a specific record.
     *
     * The version is part of the approval. If a client then updates the record,
     * the approval goes stale and the publish is refused (APPROVAL_STALE) —
     * which closes the obvious attack: get approval for innocuous text, then
     * swap the text before publishing.
     */
    approve({ recordId, by = "OWNER" }) {
      const record = store.get(recordId);
      if (!record) return { ok: false, code: "NOT_FOUND", reason: `no record ${recordId}` };
      if (!canTransition(record.status, "APPROVED")) {
        return { ok: false, code: "ILLEGAL_TRANSITION", reason: `${record.status} -> APPROVED is not a legal transition` };
      }
      const saved = store.put({ ...record, status: "APPROVED", updatedAt: now() });
      const approval = Object.freeze({ approved: true, recordId, action: "publish_approved", version: saved.version, by, at: now() });
      approvals.set(key(recordId, "publish_approved"), approval);
      ownerAudit.push(auditEntry({ action: "approve", client: "OWNER", intent: "APPROVE", outcome: "APPROVAL_STATE:APPROVED", detail: `${recordId} v${saved.version}`, at: now() }));
      return { ok: true, record: saved, approval };
    },

    /**
     * The Owner authorizes a WITHDRAWAL — unpublish or archive.
     *
     * Separate from `approve()` because it changes no state and grants nothing
     * else: an authorization to take something down can never be spent on
     * putting something up.
     */
    authorizeWithdrawal({ recordId, action, by = "OWNER" }) {
      if (!["unpublish", "archive"].includes(action)) {
        return { ok: false, code: "NOT_A_WITHDRAWAL", reason: `${action} is not a withdrawal — use approve() for publication` };
      }
      const record = store.get(recordId);
      if (!record) return { ok: false, code: "NOT_FOUND", reason: `no record ${recordId}` };
      const approval = Object.freeze({ approved: true, recordId, action, version: record.version, by, at: now() });
      approvals.set(key(recordId, action), approval);
      ownerAudit.push(auditEntry({ action, client: "OWNER", intent: "AUTHORIZE_WITHDRAWAL", outcome: `APPROVAL_STATE:AUTHORIZED_${action.toUpperCase()}`, detail: `${recordId} v${record.version}`, at: now() }));
      return { ok: true, approval };
    },

    reject({ recordId, by = "OWNER", reason = null }) {
      const record = store.get(recordId);
      if (!record) return { ok: false, code: "NOT_FOUND", reason: `no record ${recordId}` };
      if (!canTransition(record.status, "REJECTED")) {
        return { ok: false, code: "ILLEGAL_TRANSITION", reason: `${record.status} -> REJECTED is not a legal transition` };
      }
      for (const a of OWNER_GATED) approvals.delete(key(recordId, a));
      const saved = store.put({ ...record, status: "REJECTED", updatedAt: now() });
      ownerAudit.push(auditEntry({ action: "reject", client: "OWNER", intent: "REJECT", outcome: "APPROVAL_STATE:REJECTED", detail: reason, at: now() }));
      return { ok: true, record: saved };
    },

    /** Restore an earlier version as a NEW version. Owner only, because it
     *  changes published text. */
    rollback({ recordId, toVersion }) {
      const result = store.rollback(recordId, toVersion);
      if (result.ok) {
        /* Rolling back invalidates any approval: what was approved is no
           longer what the record says. */
        for (const a of OWNER_GATED) approvals.delete(key(recordId, a));
        ownerAudit.push(auditEntry({ action: "rollback", client: "OWNER", intent: "ROLLBACK", outcome: `APPROVAL_STATE:ROLLED_BACK_TO_V${toVersion}`, detail: recordId, at: now() }));
      }
      return result;
    },

    /** What the Owner has currently approved, as data — never a credential. */
    pendingApprovals() {
      return [...approvals.values()];
    },

    /* ── OUTPUT ──────────────────────────────────────────────────────────── */

    /** The public editorial feed, in the engine's existing envelope. */
    feed(options = {}) { return buildFeed(store, { now: clock, ...options }); },

    /** The feed as one branch sees it — used to prove no cross-branch leakage. */
    feedForBranch(identitySlug, options = {}) {
      const full = this.feed(options);
      return { ...full, records: full.records.filter((r) => r.identity === identitySlug) };
    },

    /** The full audit trail: every pipeline step and every Owner act. */
    auditTrail() {
      const fromRecords = store.all().flatMap((r) => r.audit || []);
      return [...fromRecords, ...ownerAudit].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    },
  };
}
