/* SFL EDITORIAL CORRIDOR — the one command both adapters build.
 *
 * This file exists so neither provider can quietly acquire a field, a default
 * or a shortcut the other lacks. Both adapters call `toCommand()`; the
 * pipeline only ever sees its output.
 */

/** Deterministic id from the branch and slug, so the same editorial piece
 *  keeps the same id across clients and across retries. */
export function recordId(branch, slug) {
  return `ed_${String(branch || "").toLowerCase()}_${String(slug || "")}`.replace(/[^a-z0-9_-]+/g, "_");
}

/**
 * Drop keys the client did not send.
 *
 * Both adapters build their record object with every field listed, so an
 * absent field arrives as `undefined`. Those keys must not survive into the
 * command: the pipeline merges the command's record OVER the stored one, and
 * an `undefined` that survived would erase a title on a partial update.
 */
function present(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

export function toCommand(input) {
  const rec = present(input.record || {});
  const id = rec.id || (rec.branch && rec.slug ? recordId(rec.branch, rec.slug) : undefined);

  return Object.freeze({
    client: input.client,
    intent: input.intent,
    action: input.action,
    /* False when the corridor fell back to PREPARE. A caller should tell the
       Owner "prepared — say the word to publish" rather than stay silent. */
    confident: input.confident === true,
    intentSource: input.intentSource,
    ownerInstructionId: input.ownerInstructionId,
    recordId: input.recordId || id,
    limit: input.limit,
    branch: input.branchFilter || null,
    record: Object.freeze({ ...rec, id }),
  });
}
