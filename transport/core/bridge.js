/* SFL EDITORIAL TRANSPORT — the hand-off to the PUBLIC corridor.
 *
 *   Worker ledger (prepare, preview)
 *     ↓  Owner: POST /v1/owner/handoff
 *   POST <SFL_PUBLIC_CORRIDOR_URL>   create_draft → submit_review
 *     ↓
 *   Vercel corridor + D1 (REVIEW)  →  Owner approve  →  publish_approved
 *     ↓
 *   /api/feed  →  the seven worlds
 *
 * ONE PUBLICATION AUTHORITY
 * -------------------------
 * Only the Vercel corridor's D1 reaches /api/feed, so it is the publication
 * authority. This Worker prepares and previews. The hand-off delivers a draft
 * to the public corridor's REVIEW queue and STOPS: it never approves, never
 * publishes, never withdraws. The credential it holds there is refused every
 * other action (`BRIDGE_ACTION_NOT_PERMITTED`, platform/api/corridor.js).
 *
 * Once a version is handed off, the public record is the canonical one.
 * Handing off a different version of a piece that is already there is
 * refused (`HANDOFF_ALREADY_EXISTS`) rather than half-applied: the public
 * corridor's update_draft cannot carry translations or media, so a partial
 * overwrite would let the English and French drift apart under one approval.
 *
 * TRANSLATION, NOT RULES
 * ----------------------
 * The field mapping below is the only thing this file decides. World/type
 * acceptance, media hosts, CTA governance and every state transition are
 * decided by the public corridor and are surfaced verbatim — a world that
 * does not present a type REFUSES it; nothing here redirects it elsewhere.
 */

import { identityOf } from "../../corridor/core/branches.js";
import { bestHero, publicMedium } from "../../corridor/core/media.js";

/** Worker states a hand-off may start from. The corridor's preview is a
 *  rendering, not a stored state, so a previewed record is still DRAFT here.
 *  REJECTED, ARCHIVED and anything that was ever public are refused. */
export const HANDOFF_FROM_STATES = Object.freeze(["DRAFT", "PREVIEW", "APPROVED"]);

/* Worker CTA vocabulary → the public corridor's editorial CTA kinds.
   VIEW_PRODUCT is absent on purpose: a Shop pointer there is product_ref,
   which the Worker record does not carry. */
const CTA_KIND = Object.freeze({
  READ_MORE: "READ", LISTEN: "LISTEN", WATCH: "WATCH", OPEN: "OPEN", SUPPORT_THE_WORK: "SUPPORT",
});

const TIMEOUT_MS = 10_000;

const refusal = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });

/** Read the bridge configuration. Unset or malformed means "not configured",
 *  never "configured with a guess". */
export function readBridgeConfig(env = {}) {
  const raw = env.SFL_PUBLIC_CORRIDOR_URL;
  const token = env.SFL_PUBLIC_CORRIDOR_TOKEN;
  if (!raw && !token) return { configured: false, problem: null };
  let url = null;
  try { url = new URL(raw); } catch { url = null; }
  if (!url || url.protocol !== "https:" || !url.hostname.endsWith(".sentinelfortune.com") || url.pathname !== "/api/corridor") {
    return { configured: false, problem: "SFL_PUBLIC_CORRIDOR_URL must be https://<host>.sentinelfortune.com/api/corridor" };
  }
  if (!token) return { configured: false, problem: "SFL_PUBLIC_CORRIDOR_TOKEN is not set" };
  return { configured: true, url: url.toString(), token, problem: null };
}

/**
 * A Worker record → the public corridor's `create_draft` body.
 *
 * -> { ok: true, body }  or  { ok: false, code, message }
 */
export function toPublicDraft(record) {
  const identity = identityOf(record.branch);
  if (!identity) return refusal("HANDOFF_UNMAPPABLE", `branch ${record.branch} has no public identity`);

  /* The public corridor has no scheduling: an approved record goes public on
     publication. Handing over a dated piece would publish it early. */
  if (record.publishAt || record.expiresAt) {
    return refusal("HANDOFF_SCHEDULE_UNSUPPORTED", "the public corridor cannot honour publishAt / expiresAt; clear them, or publish on the day");
  }

  let cta;
  if (record.cta) {
    const kind = CTA_KIND[record.cta.type];
    if (!kind) return refusal("HANDOFF_CTA_UNSUPPORTED", `cta ${record.cta.type} has no public-corridor equivalent; a Shop pointer is made there with product_ref`);
    cta = { kind, destination: record.cta.destination, ...(record.cta.label ? { label: String(record.cta.label) } : {}) };
  }

  /* The corridor's own hero choice and public media shape, so the public
     record shows what the Worker's preview showed. */
  const hero = bestHero(record);
  const rest = [record.heroMedia, ...(record.media || [])].filter((m) => m && m !== hero).map(publicMedium);
  const cover = hero ? publicMedium(hero) : null;
  const inline = rest.filter((m) => m.kind === "IMAGE");
  const refs = rest.filter((m) => m.kind !== "IMAGE");

  const fr = record.translations && record.translations.fr;
  return {
    ok: true,
    body: {
      action: "create_draft",
      /* Explicit identity + the type the engine renders, so the public
         corridor's alias layer never chooses a world on the Worker's behalf. */
      identity,
      type: record.presentationType,
      slug: record.slug,
      title: record.title,
      summary: record.summary || "",
      body: record.body,
      ...(cover ? { cover_image: { src: cover.src, alt: cover.alt } } : {}),
      ...(inline.length ? { inline_images: inline.map((m) => ({ src: m.src, alt: m.alt })) } : {}),
      ...(refs.length ? { media_refs: refs } : {}),
      ...(Array.isArray(record.topics) && record.topics.length ? { categories: record.topics } : {}),
      ...(cta ? { cta } : {}),
      ...(fr ? { translation_fr: { title: fr.title, summary: fr.summary || "", body: fr.body } } : {}),
    },
  };
}

/** Idempotency keys name the Worker record AND version, so a retry of one
 *  hand-off replays, and a different version is a different request. */
export function handoffKeys(record) {
  const base = `worker-handoff:${record.id}@v${record.version}`;
  return { create: `${base}:create`, review: `${base}:review` };
}

/**
 * Hand one Worker record to the public corridor.
 *
 * -> { ok: true, publicRecordId, publicStatus, replay }
 * -> { ok: false, code, message, upstream? }
 */
export async function handoff(record, config, { fetchImpl = globalThis.fetch } = {}) {
  if (!config.configured) return refusal("BRIDGE_NOT_CONFIGURED", config.problem || "the public corridor hand-off is not configured");
  if (!HANDOFF_FROM_STATES.includes(record.status)) {
    return refusal("HANDOFF_STATE", `a ${record.status} record cannot be handed off; only ${HANDOFF_FROM_STATES.join(", ")} can`);
  }
  const draft = toPublicDraft(record);
  if (!draft.ok) return draft;
  const keys = handoffKeys(record);

  const call = async (payload) => {
    let res;
    try {
      const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
      res = await fetchImpl(config.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
    } catch {
      return { status: 0, body: null };
    }
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    const replay = res.headers && typeof res.headers.get === "function" && res.headers.get("X-SF-Idempotent-Replay") === "true";
    return { status: res.status, body, replay };
  };

  /* Only the public corridor's error code and detail are passed back — never
     a header, never the request, never the credential. */
  const upstream = (r) => (r.body && typeof r.body === "object"
    ? { status: r.status, error: r.body.error || null, detail: r.body.detail || null }
    : { status: r.status, error: null, detail: null });

  const created = await call({ ...draft.body, idempotency_key: keys.create });
  if (created.status === 0) return refusal("PUBLIC_CORRIDOR_UNREACHABLE", "the public corridor did not answer; nothing was handed off. Retry the same hand-off.");
  if (created.status === 409 && created.body && created.body.error === "RECORD_EXISTS") {
    return refusal("HANDOFF_ALREADY_EXISTS",
      "the public corridor already holds this piece under a different hand-off; edit it there, or unpublish and archive it there first",
      { upstream: upstream(created) });
  }
  if (created.status !== 201 && created.status !== 200) {
    return refusal("PUBLIC_CORRIDOR_REFUSED", "the public corridor refused the draft", { upstream: upstream(created) });
  }
  const publicRecordId = created.body && created.body.record && created.body.record.record_id;
  if (!publicRecordId) return refusal("PUBLIC_CORRIDOR_REFUSED", "the public corridor answered without a record id", { upstream: upstream(created) });

  const reviewed = await call({ action: "submit_review", record_id: publicRecordId, idempotency_key: keys.review });
  if (reviewed.status === 0) return refusal("PUBLIC_CORRIDOR_UNREACHABLE", "the draft was created but review was not requested; retry the same hand-off", { publicRecordId });
  if (reviewed.status !== 200) {
    return refusal("PUBLIC_CORRIDOR_REFUSED", "the public corridor refused the review request", { publicRecordId, upstream: upstream(reviewed) });
  }
  return {
    ok: true,
    publicRecordId,
    publicStatus: (reviewed.body && reviewed.body.record && reviewed.body.record.status) || "REVIEW",
    replay: Boolean(created.replay && reviewed.replay),
  };
}
