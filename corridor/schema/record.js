/* SFL EDITORIAL CORRIDOR — the governed editorial record.
 *
 * ONE schema for free editorial content, whichever AI client prepared it.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not a product. The corridor publishes FREE editorial work — sessions,
 * teachings, articles, stories, lessons. Sellable digital products stay with
 * House of Assets and checkout stays with the Shop. A record here may POINT at
 * an approved product; it may never state its price or carry its checkout.
 * `assertNoCommercialAuthority()` below enforces that, because the boundary is
 * only real if something refuses to cross it.
 *
 * PRESENTATION WITHOUT A SECOND ENGINE
 * ------------------------------------
 * Editorial content types are a publishing vocabulary, not a storage format.
 * Each maps onto a presentation type the existing public engine ALREADY
 * renders, so publishing an editorial record needs no new renderer, no new
 * feed shape and no hand-written page. The editorial type is kept in metadata
 * so a branch can still say "Teaching" or "Challenge" on the card.
 */

/** The editorial vocabulary an AI client may use. Closed set. */
export const CONTENT_TYPES = Object.freeze([
  "ARTICLE", "TEACHING", "SESSION", "REFLECTION", "RHAPSODY",
  "STORY", "EPISODE", "AUDIO", "PODCAST", "LESSON",
  "GUIDE", "TUTORIAL", "CHALLENGE", "ANNOUNCEMENT", "EDITORIAL_COLLECTION",
]);

/**
 * Editorial type -> the presentation type the public engine already renders.
 *
 * This single table is what keeps "one engine" true. Adding an editorial type
 * is a row here, never a new renderer and never a new public surface.
 */
export const PRESENTATION = Object.freeze({
  ARTICLE: "COURSE",
  LESSON: "COURSE",
  GUIDE: "COURSE",
  TUTORIAL: "COURSE",
  ANNOUNCEMENT: "COURSE",
  TEACHING: "TEACHING",
  REFLECTION: "TEACHING",
  RHAPSODY: "TEACHING",
  SESSION: "PODCAST",
  AUDIO: "PODCAST",
  PODCAST: "PODCAST",
  STORY: "STORY",
  EPISODE: "STORY",
  CHALLENGE: "GAME",
  EDITORIAL_COLLECTION: "BUNDLE",
});

/** The public word a visitor reads. Never the internal token. */
export const TYPE_LABEL = Object.freeze({
  ARTICLE: "Article", TEACHING: "Teaching", SESSION: "Session",
  REFLECTION: "Reflection", RHAPSODY: "Rhapsody", STORY: "Story",
  EPISODE: "Episode", AUDIO: "Audio", PODCAST: "Episode", LESSON: "Lesson",
  GUIDE: "Guide", TUTORIAL: "Tutorial", CHALLENGE: "Challenge",
  ANNOUNCEMENT: "Announcement", EDITORIAL_COLLECTION: "Collection",
});

/** Editorial calls to action. Deliberately NO purchase action.
 *
 *  SUPPORT_THE_WORK is voluntary support for free editorial work and is a
 *  different thing from buying a product: different wording, different
 *  destination, different authority. Keeping them as separate kinds is what
 *  stops one quietly becoming the other. */
export const CTA_TYPES = Object.freeze([
  "READ_MORE", "LISTEN", "WATCH", "OPEN", "SUPPORT_THE_WORK", "VIEW_PRODUCT",
]);

export const LANGUAGES = Object.freeze(["en", "fr"]);

/* ─────────────────────────────────────────────────────────────────────────
   VALIDATION
   ───────────────────────────────────────────────────────────────────────── */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate an editorial record. Returns `{ ok, problems }`.
 *
 * Every problem is reported at once rather than failing on the first, so one
 * round trip tells an AI client everything it has to change.
 */
export function validate(record, { branches }) {
  const p = [];
  if (!record || typeof record !== "object") return { ok: false, problems: ["record is not an object"] };

  if (!record.branch) p.push("branch is required — the corridor never infers a destination");
  else if (!branches.includes(record.branch)) p.push(`branch ${JSON.stringify(record.branch)} is not one of the seven`);

  if (!CONTENT_TYPES.includes(record.contentType)) p.push(`contentType ${JSON.stringify(record.contentType)} is not an editorial type`);
  if (!record.title || String(record.title).trim().length < 3) p.push("title is required");
  if (!record.slug) p.push("slug is required");
  else if (!SLUG_RE.test(record.slug)) p.push(`slug ${JSON.stringify(record.slug)} must be lowercase words joined by single hyphens`);
  if (!record.body || String(record.body).trim().length < 20) p.push("body is required (at least 20 characters)");
  if (!LANGUAGES.includes(record.language || "en")) p.push(`language must be one of ${LANGUAGES.join(", ")}`);

  if (record.cta) {
    if (!CTA_TYPES.includes(record.cta.type)) p.push(`cta.type ${JSON.stringify(record.cta.type)} is not an editorial CTA`);
    if (!record.cta.destination) p.push("cta.destination is required when a cta is present");
  }

  for (const problem of assertNoCommercialAuthority(record)) p.push(problem);
  for (const problem of validateTranslations(record)) p.push(problem);

  return { ok: p.length === 0, problems: p };
}

/**
 * THE COMMERCIAL BOUNDARY.
 *
 * The corridor publishes free work. It may reference an approved product, but
 * it may not price one and may not carry a checkout. These are refusals rather
 * than silent strips so a client learns the boundary instead of wondering why
 * its field vanished.
 */
export function assertNoCommercialAuthority(record) {
  const p = [];
  if (record.price !== undefined && record.price !== null) p.push("price is not editorial authority — product pricing belongs to House of Assets");
  if (record.compareAtPrice !== undefined && record.compareAtPrice !== null) p.push("compareAtPrice is not editorial authority");
  if (record.pricingTier && record.pricingTier !== "FREE") p.push('pricingTier may only be "FREE" in the editorial corridor');
  if (record.checkoutUrl) p.push("checkoutUrl is not editorial authority — checkout belongs to the Shop");
  if (record.cta && record.cta.type === "VIEW_PRODUCT") {
    if (record.cta.price !== undefined) p.push("a VIEW_PRODUCT cta may not carry a price");
    if (/\/checkout|\/cart|stripe\.com/i.test(String(record.cta.destination || ""))) {
      p.push("a VIEW_PRODUCT cta may not link straight into a checkout");
    }
  }
  return p;
}

/** One canonical record plus translations — never a duplicate record per
 *  language, which is how two languages drift apart. */
function validateTranslations(record) {
  const p = [];
  const t = record.translations;
  if (t === undefined || t === null) return p;
  if (typeof t !== "object" || Array.isArray(t)) return ["translations must be an object keyed by language"];
  for (const [lang, body] of Object.entries(t)) {
    if (!LANGUAGES.includes(lang)) p.push(`translation language ${JSON.stringify(lang)} is not supported`);
    else if (lang === (record.language || "en")) p.push(`translation ${lang} duplicates the canonical language`);
    else if (!body || !body.title || !body.body) p.push(`translation ${lang} needs at least a title and a body`);
  }
  return p;
}

/* ─────────────────────────────────────────────────────────────────────────
   NORMALIZATION
   ───────────────────────────────────────────────────────────────────────── */

/**
 * One normalized editorial record.
 *
 * Audit and security fields live on the record but are stripped before
 * anything public is produced — see publish.js. Keeping them here is what
 * makes the pipeline auditable; stripping them there is what keeps them
 * private.
 */
export function normalize(input, { now = () => new Date().toISOString() } = {}) {
  const lang = LANGUAGES.includes(input.language) ? input.language : "en";
  return {
    id: String(input.id),
    version: Number.isInteger(input.version) ? input.version : 1,
    branch: input.branch,
    contentType: input.contentType,
    presentationType: PRESENTATION[input.contentType] || "COURSE",

    title: String(input.title).trim(),
    slug: String(input.slug),
    summary: input.summary ? String(input.summary).trim() : "",
    body: String(input.body),
    language: lang,
    translations: freezeTranslations(input.translations),

    topics: list(input.topics),
    tags: list(input.tags),
    authorDisplay: input.authorDisplay ? String(input.authorDisplay) : "Sentinel Fortune",
    collection: input.collection ? String(input.collection) : null,
    relatedContent: list(input.relatedContent),

    heroMedia: input.heroMedia || null,
    media: Array.isArray(input.media) ? input.media : [],

    featured: input.featured === true,
    cta: input.cta ? { ...input.cta } : null,

    publishAt: input.publishAt || null,
    expiresAt: input.expiresAt || null,
    status: input.status,
    visibility: input.visibility || "PUBLIC",

    /* Provenance and audit. Never published. */
    sourceClient: input.sourceClient,
    ownerInstructionId: input.ownerInstructionId,
    createdAt: input.createdAt || now(),
    updatedAt: now(),
    publishedAt: input.publishedAt || null,
    revisionHistory: Array.isArray(input.revisionHistory) ? input.revisionHistory : [],
    rights: input.rights || null,
    audit: Array.isArray(input.audit) ? input.audit : [],
  };
}

function list(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];
}

function freezeTranslations(t) {
  if (!t || typeof t !== "object") return {};
  const out = {};
  for (const [lang, body] of Object.entries(t)) {
    if (!LANGUAGES.includes(lang)) continue;
    out[lang] = { title: String(body.title), summary: body.summary ? String(body.summary) : "", body: String(body.body) };
  }
  return out;
}

/** The record as one language would read it. Falls back to the canonical
 *  language rather than showing an empty page in a missing translation. */
export function inLanguage(record, lang) {
  if (lang === record.language || !record.translations[lang]) {
    return { language: record.language, title: record.title, summary: record.summary, body: record.body };
  }
  const t = record.translations[lang];
  return { language: lang, title: t.title, summary: t.summary || record.summary, body: t.body };
}

/** Which languages a visitor can actually read this in. */
export function availableLanguages(record) {
  return [record.language, ...Object.keys(record.translations)].filter((v, i, a) => a.indexOf(v) === i);
}
