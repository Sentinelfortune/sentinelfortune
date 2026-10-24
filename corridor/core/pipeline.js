/* SFL EDITORIAL CORRIDOR — the pipeline.
 *
 *   AI CLIENT -> COMMAND VALIDATION -> OWNER AUTHORITY -> NORMALIZE
 *   -> IDENTITY VALIDATION -> EDITORIAL VALIDATION -> MEDIA/RIGHTS
 *   -> PREVIEW BUILD -> APPROVAL STATE -> PUBLISH -> PUBLIC FEED
 *
 * Every step appends an audit entry and every refusal names the step it failed
 * at, so "why did this not publish" always has a precise answer.
 *
 * The pipeline is the ONLY way a record changes state. The adapters below it
 * translate; the store beneath it persists; neither decides anything.
 */

import { resolveIntent } from "./intent.js";
import { authorize, auditEntry } from "./authority.js";
import { BRANCH_TOKENS, accepts, branch } from "./branches.js";
import { validate, normalize } from "../schema/record.js";
import { validateMedia } from "./media.js";
import { canTransition, canPublish, isPublic } from "../schema/states.js";
import { toPublicRecord } from "./publish.js";
import { checkEditorialFit } from "./editorial-policy.js";

const STEPS = Object.freeze([
  "COMMAND_VALIDATION", "OWNER_AUTHORITY", "NORMALIZE", "IDENTITY_VALIDATION",
  "EDITORIAL_VALIDATION", "MEDIA_RIGHTS", "PREVIEW_BUILD", "APPROVAL_STATE", "PUBLISH",
]);

export { STEPS };

function refuse(step, code, reason, audit) {
  return { ok: false, step, code, reason, audit };
}

/**
 * Run one normalized command.
 *
 * `command` is what an adapter produces — provider-neutral by the time it
 * arrives here, which is why there is exactly one pipeline rather than one per
 * client.
 */
export function run(command, { store, identity, ownerApproval = null, now = () => new Date().toISOString() }) {
  const audit = [];
  const log = (step, outcome, detail) => {
    audit.push(auditEntry({ action: command.action, client: identity && identity.client, intent: command.intent, outcome: `${step}:${outcome}`, detail, at: now() }));
  };

  /* ── idempotency, before anything is decided ─────────────────────────── */
  const replayed = store.replay(command.ownerInstructionId);
  if (replayed) {
    log("COMMAND_VALIDATION", "REPLAY", command.ownerInstructionId);
    return { ...replayed, replay: true, audit };
  }

  /* ── 1. command validation ───────────────────────────────────────────── */
  if (!command || !command.action) return refuse("COMMAND_VALIDATION", "NO_ACTION", "the command names no action", audit);
  if (!command.ownerInstructionId) {
    return refuse("COMMAND_VALIDATION", "NO_INSTRUCTION_ID", "every command needs an instruction id so a replay cannot duplicate a publication", audit);
  }
  log("COMMAND_VALIDATION", "OK");

  /* ── 2. owner authority ──────────────────────────────────────────────── */
  const existing = command.recordId ? store.get(command.recordId) : null;
  const auth = authorize({ identity, action: command.action, record: existing, ownerApproval });
  if (!auth.ok) {
    log("OWNER_AUTHORITY", "REFUSED", auth.code);
    return refuse("OWNER_AUTHORITY", auth.code, auth.reason, audit);
  }
  log("OWNER_AUTHORITY", "OK");

  switch (command.action) {
    case "create_draft":     return createDraft(command, { store, identity, audit, log, now });
    case "update_draft":     return updateDraft(command, { store, identity, audit, log, now, existing });
    case "get_preview":      return getPreview(command, { store, audit, log, existing });
    case "publish_approved": return publish(command, { store, audit, log, now, existing, ownerApproval });
    case "unpublish":        return setState(command, { store, audit, log, now, existing }, "UNPUBLISHED");
    case "archive":          return setState(command, { store, audit, log, now, existing }, "ARCHIVED");
    case "list_recent":      return { ok: true, step: "COMMAND_VALIDATION", records: store.recent(command.limit || 20, command.branch || null), audit };
    case "get_record":       return existing
      ? { ok: true, step: "COMMAND_VALIDATION", record: existing, audit }
      : refuse("COMMAND_VALIDATION", "NOT_FOUND", `no record ${command.recordId}`, audit);
    default:
      return refuse("COMMAND_VALIDATION", "NO_SUCH_ACTION", `${command.action} is not an editorial action`, audit);
  }
}

/* ─────────────────────────────────────────────────────────────────────── */

function prepare(command, { store, identity, audit, log, now, base = null }) {
  /* ── 3. normalize ─────────────────────────────────────────────────────── */
  const draft = normalize({
    ...(base || {}),
    ...command.record,
    id: (base && base.id) || command.record.id,
    status: "DRAFT",
    sourceClient: identity.client,
    ownerInstructionId: command.ownerInstructionId,
    createdAt: base ? base.createdAt : now(),
    version: base ? base.version : 1,
    revisionHistory: base ? base.revisionHistory : [],
  }, { now });
  log("NORMALIZE", "OK", draft.id);

  /* ── 4. identity validation ───────────────────────────────────────────── */
  if (!BRANCH_TOKENS.includes(draft.branch)) {
    log("IDENTITY_VALIDATION", "REFUSED", draft.branch);
    return refuse("IDENTITY_VALIDATION", "UNKNOWN_BRANCH", `branch ${JSON.stringify(draft.branch)} is not one of the seven`, audit);
  }
  const fit = accepts(draft.branch, draft.contentType);
  if (!fit.ok) {
    log("IDENTITY_VALIDATION", "REFUSED", fit.reason);
    return refuse("IDENTITY_VALIDATION", "BRANCH_REJECTS_TYPE", fit.reason, audit);
  }
  /* A slug must be unique WITHIN a house. The same slug in two houses is two
     different things, and the identity router keeps them apart. */
  const clash = store.bySlug(draft.branch, draft.slug);
  if (clash && clash.id !== draft.id) {
    log("IDENTITY_VALIDATION", "REFUSED", "SLUG_TAKEN");
    return refuse("IDENTITY_VALIDATION", "SLUG_TAKEN", `${branch(draft.branch).name} already has ${draft.slug}`, audit);
  }
  log("IDENTITY_VALIDATION", "OK");

  /* ── 5. editorial validation ──────────────────────────────────────────── */
  const ed = validate(draft, { branches: BRANCH_TOKENS });
  if (!ed.ok) {
    log("EDITORIAL_VALIDATION", "REFUSED", ed.problems.join("; "));
    return refuse("EDITORIAL_VALIDATION", "INVALID_RECORD", ed.problems.join("; "), audit);
  }
  const fitPolicy = checkEditorialFit(draft);
  if (!fitPolicy.ok) {
    log("EDITORIAL_VALIDATION", "REFUSED", fitPolicy.code);
    return refuse("EDITORIAL_VALIDATION", fitPolicy.code, fitPolicy.reason || "Editorial world mismatch", audit);
  }
  if (fitPolicy.reviewRequired) log("EDITORIAL_VALIDATION", "WORLD_REVIEW_REQUIRED", fitPolicy.signals.join(","));
  log("EDITORIAL_VALIDATION", "OK");

  /* ── 6. media and rights ──────────────────────────────────────────────── */
  const media = validateMedia(draft);
  if (!media.ok) {
    log("MEDIA_RIGHTS", "REFUSED", media.problems.join("; "));
    return refuse("MEDIA_RIGHTS", "MEDIA_REFUSED", media.problems.join("; "), audit);
  }
  log("MEDIA_RIGHTS", "OK");

  return { ok: true, draft };
}

function createDraft(command, ctx) {
  const prepared = prepare(command, ctx);
  if (!prepared.ok) return prepared;
  const saved = ctx.store.put({ ...prepared.draft, audit: ctx.audit.slice() });
  const outcome = { ok: true, step: "APPROVAL_STATE", state: "DRAFT", record: saved };
  ctx.log("APPROVAL_STATE", "DRAFT");
  return ctx.store.remember(command.ownerInstructionId, { ...outcome, audit: ctx.audit });
}

function updateDraft(command, ctx) {
  const { existing } = ctx;
  if (!existing) return refuse("NORMALIZE", "NOT_FOUND", `no record ${command.recordId}`, ctx.audit);
  if (isPublic(existing.status) && !canTransition(existing.status, "PUBLISHED")) {
    return refuse("APPROVAL_STATE", "ILLEGAL_TRANSITION", `cannot edit a record in state ${existing.status}`, ctx.audit);
  }
  const prepared = prepare(command, { ...ctx, base: existing });
  if (!prepared.ok) return prepared;

  /* A new version. The previous text is pushed into history — never lost. */
  const saved = ctx.store.putVersion(existing, { ...prepared.draft, status: existing.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT", audit: ctx.audit.slice() });
  ctx.log("APPROVAL_STATE", "VERSIONED", `v${saved.version}`);
  return ctx.store.remember(command.ownerInstructionId, { ok: true, step: "APPROVAL_STATE", state: saved.status, record: saved, audit: ctx.audit });
}

/**
 * A preview. Builds exactly what the public would see, and labels it
 * unmistakably as a preview — `preview: true`, state PREVIEW, and never
 * written into the public feed.
 */
function getPreview(command, ctx) {
  const { existing } = ctx;
  if (!existing) return refuse("PREVIEW_BUILD", "NOT_FOUND", `no record ${command.recordId}`, ctx.audit);

  const languages = [existing.language, ...Object.keys(existing.translations)];
  const renderings = {};
  for (const lang of languages) renderings[lang] = toPublicRecord(existing, { language: lang });

  ctx.log("PREVIEW_BUILD", "OK", existing.id);
  return {
    ok: true,
    step: "PREVIEW_BUILD",
    preview: true,                 // never a publication
    isLive: false,
    state: existing.status,
    branch: existing.branch,
    branchName: branch(existing.branch).name,
    route: `/${existing.slug}`,
    languages,
    renderings,
    record: existing,
    audit: ctx.audit,
  };
}

function publish(command, ctx) {
  const { existing, ownerApproval } = ctx;
  if (!existing) return refuse("PUBLISH", "NOT_FOUND", `no record ${command.recordId}`, ctx.audit);

  const publishFit = checkEditorialFit(existing);
  if (!publishFit.ok) {
    ctx.log("EDITORIAL_VALIDATION", "REFUSED", publishFit.code);
    return refuse("EDITORIAL_VALIDATION", publishFit.code, publishFit.reason || "Editorial world mismatch", ctx.audit);
  }
  if (!canPublish(existing.status)) {
    ctx.log("APPROVAL_STATE", "REFUSED", existing.status);
    return refuse("APPROVAL_STATE", "NOT_APPROVED",
      `a record in state ${existing.status} cannot be published — it must be APPROVED by the Owner first`, ctx.audit);
  }
  if (!canTransition(existing.status, "PUBLISHED")) {
    return refuse("APPROVAL_STATE", "ILLEGAL_TRANSITION", `${existing.status} -> PUBLISHED is not a legal transition`, ctx.audit);
  }
  ctx.log("APPROVAL_STATE", "APPROVED", ownerApproval && ownerApproval.by);

  const published = ctx.store.put({
    ...existing,
    status: "PUBLISHED",
    publishedAt: existing.publishedAt || ctx.now(),
    updatedAt: ctx.now(),
    audit: [...(existing.audit || []), ...ctx.audit],
  });
  ctx.log("PUBLISH", "OK", published.id);
  return ctx.store.remember(command.ownerInstructionId, { ok: true, step: "PUBLISH", state: "PUBLISHED", record: published, audit: ctx.audit });
}

function setState(command, ctx, target) {
  const { existing } = ctx;
  if (!existing) return refuse("APPROVAL_STATE", "NOT_FOUND", `no record ${command.recordId}`, ctx.audit);
  if (!canTransition(existing.status, target)) {
    ctx.log("APPROVAL_STATE", "REFUSED", `${existing.status}->${target}`);
    return refuse("APPROVAL_STATE", "ILLEGAL_TRANSITION", `${existing.status} -> ${target} is not a legal transition`, ctx.audit);
  }
  /* State changes only. The record, its history and its text all survive. */
  const saved = ctx.store.put({ ...existing, status: target, updatedAt: ctx.now(), audit: [...(existing.audit || []), ...ctx.audit] });
  ctx.log("APPROVAL_STATE", target);
  return ctx.store.remember(command.ownerInstructionId, { ok: true, step: "APPROVAL_STATE", state: target, record: saved, audit: ctx.audit });
}

/** Resolve an Owner utterance into an intent, then map it onto an action.
 *  Exposed so an adapter never has to invent this mapping itself. */
export function intentToAction(utterance, explicit) {
  const resolved = resolveIntent({ explicit, utterance });
  const action = {
    PREPARE: "create_draft",
    UPDATE: "update_draft",
    REPLACE: "update_draft",
    PREVIEW: "get_preview",
    PUBLISH: "publish_approved",
    UNPUBLISH: "unpublish",
    ARCHIVE: "archive",
    LIST: "list_recent",
    GET: "get_record",
  }[resolved.intent];
  return { ...resolved, action };
}
