/* SFL EDITORIAL TRANSPORT — what goes back over the wire.
 *
 * SERIALIZATION, NOT RULES. Nothing here decides anything. The corridor has
 * already decided; this chooses which of its fields an AI client is handed
 * back. If you find yourself wanting a condition in this file that changes an
 * outcome, it belongs in the corridor.
 *
 * WHAT IS WITHHELD, AND WHY
 * -------------------------
 *   revisionHistory bodies  the client gets the version LIST, not every past
 *                           draft text — history exists, it is not re-sent
 *   per-record audit        returned as a short step:outcome trail instead of
 *                           the full governance log
 *   media rights detail     reduced to `rightsCleared` — a licence record is
 *                           governance data, not something a client needs back
 *
 * The record's own text IS returned. The client wrote it; echoing it is how a
 * client confirms what the corridor actually stored after normalization.
 */

import { availableLanguages } from "../../corridor/schema/record.js";
import { branch as branchOf } from "../../corridor/core/branches.js";
import { TYPE_LABEL } from "../../corridor/schema/record.js";

function projectMedium(m) {
  if (!m || typeof m !== "object") return null;
  return {
    kind: m.kind,
    src: m.src,
    altText: m.altText || "",
    source: m.source,
    /* A licence record is governance data. Whether it cleared is not. */
    rightsCleared: m.source === "APPROVED_PUBLIC"
      ? Boolean(m.rights && m.rights.licence && m.rights.approved === true)
      : m.source !== undefined,
  };
}

/** One editorial record as an AI client sees it. */
export function projectRecord(record) {
  if (!record) return null;
  const house = branchOf(record.branch);

  return {
    id: record.id,
    version: record.version,
    status: record.status,

    branch: record.branch,
    branchName: house ? house.name : null,
    identity: house ? house.identity : null,

    contentType: record.contentType,
    contentTypeLabel: TYPE_LABEL[record.contentType] || null,
    presentationType: record.presentationType,

    title: record.title,
    slug: record.slug,
    summary: record.summary,
    body: record.body,
    language: record.language,
    translations: record.translations,
    availableLanguages: availableLanguages(record),

    topics: record.topics,
    tags: record.tags,
    authorDisplay: record.authorDisplay,
    collection: record.collection,
    relatedContent: record.relatedContent,

    heroMedia: projectMedium(record.heroMedia),
    media: (record.media || []).map(projectMedium).filter(Boolean),

    featured: record.featured,
    cta: record.cta,

    publishAt: record.publishAt,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    publishedAt: record.publishedAt,

    /* Correlation, so a client can match a response to the command it sent. */
    ownerInstructionId: record.ownerInstructionId,
    sourceClient: record.sourceClient,

    /* The history EXISTS and is listed. Its texts are not re-sent. */
    versions: (record.revisionHistory || []).map((h) => ({ version: h.version, at: h.at, status: h.status })),
  };
}

/** The pipeline trail, short enough to read in a log line. */
export function projectAudit(audit) {
  return (audit || []).map((a) => ({ at: a.at, outcome: a.outcome, detail: a.detail || null }));
}

/**
 * One corridor outcome as an HTTP response body.
 *
 * `isLive` is stated on EVERY successful response, not only on previews: a
 * client should never have to infer whether what it is holding is public.
 */
export function projectOutcome(result, { mode, principal }) {
  const body = {
    ok: true,
    mode,
    client: principal,
    action: result.action || null,
    intent: result.intent || null,
    /* False whenever the corridor fell back to PREPARE. A client should tell
       the Owner "prepared — say the word to publish" rather than stay silent. */
    confident: result.confident === true,
    replay: result.replay === true,
    step: result.step,
    state: result.state || (result.record && result.record.status) || null,
    isLive: Boolean(result.record && result.record.status === "PUBLISHED"),
    audit: projectAudit(result.audit),
  };

  if (result.record) body.record = projectRecord(result.record);

  /* A preview carries its renderings and says, twice, that it is not live. */
  if (result.preview === true) {
    body.preview = {
      preview: true,
      isLive: false,
      branchName: result.branchName,
      route: result.route,
      languages: result.languages,
      renderings: result.renderings,
    };
    body.isLive = false;
  }

  /* list_recent */
  if (Array.isArray(result.records)) body.records = result.records.map(projectRecord);

  return body;
}
