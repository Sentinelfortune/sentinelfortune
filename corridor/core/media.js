/* SFL EDITORIAL CORRIDOR — media and rights.
 *
 * Every image, audio file and video that reaches the public must be able to
 * answer: where did this come from, and who said we could use it?
 *
 * SOURCE PRIORITY, highest first:
 *   OWNER_PROVIDED    the Owner supplied or approved it
 *   GOVERNED_GENERATED  produced by Sentinel Fortune's own generator
 *   APPROVED_PUBLIC   a public-licence asset with its licence recorded
 *   PREMIUM_FALLBACK  the engine's deterministic generated artwork
 *
 * SCRAPING A BENCHMARK SITE IS NEVER A SOURCE. There is no code path that
 * accepts an asset without a declared source, and `SCRAPED` is refused by
 * name so that a client cannot even describe one.
 */

export const MEDIA_KINDS = Object.freeze([
  "HERO", "COVER", "THUMBNAIL", "GALLERY", "AUDIO", "VIDEO_PREVIEW", "POSTER", "ILLUSTRATION",
]);

export const SOURCES = Object.freeze([
  "OWNER_PROVIDED", "GOVERNED_GENERATED", "APPROVED_PUBLIC", "PREMIUM_FALLBACK",
]);

const PRIORITY = Object.freeze({
  OWNER_PROVIDED: 4, GOVERNED_GENERATED: 3, APPROVED_PUBLIC: 2, PREMIUM_FALLBACK: 1,
});

/** Sources that cannot be published without a recorded licence or approval. */
const RIGHTS_REQUIRED = Object.freeze(["APPROVED_PUBLIC"]);

/**
 * Validate one medium. Returns `{ ok, problems }`.
 *
 * Alt text is required on every visual medium, not as an accessibility
 * nicety but because a publishing system that cannot describe its own image
 * does not know what it is publishing.
 */
export function validateMedium(m) {
  const p = [];
  if (!m || typeof m !== "object") return { ok: false, problems: ["medium is not an object"] };
  if (!MEDIA_KINDS.includes(m.kind)) p.push(`media kind ${JSON.stringify(m.kind)} is not supported`);
  if (!m.src) p.push("media src is required");
  if (String(m.source || "").toUpperCase() === "SCRAPED") {
    p.push("SCRAPED is not a permitted media source — benchmark imagery is never reused");
  } else if (!SOURCES.includes(m.source)) {
    p.push(`media source ${JSON.stringify(m.source)} must be one of ${SOURCES.join(", ")}`);
  }
  const visual = ["HERO", "COVER", "THUMBNAIL", "GALLERY", "POSTER", "ILLUSTRATION"].includes(m.kind);
  if (visual && !m.altText) p.push(`${m.kind} media requires altText`);

  if (RIGHTS_REQUIRED.includes(m.source)) {
    if (!m.rights || !m.rights.licence) p.push(`${m.source} media requires rights.licence`);
    if (!m.rights || m.rights.approved !== true) p.push(`${m.source} media requires rights.approved === true`);
  }
  if (m.source === "OWNER_PROVIDED" && m.rights && m.rights.approved === false) {
    p.push("owner-provided media marked rights.approved === false cannot be published");
  }
  return { ok: p.length === 0, problems: p };
}

export function validateMedia(record) {
  const problems = [];
  const all = [];
  if (record.heroMedia) all.push(record.heroMedia);
  for (const m of record.media || []) all.push(m);
  all.forEach((m, i) => {
    const r = validateMedium(m);
    if (!r.ok) problems.push(...r.problems.map((x) => `media[${i}]: ${x}`));
  });
  return { ok: problems.length === 0, problems };
}

/** The best available hero, by source priority. Returns null when the record
 *  carries none — the public engine then draws its own premium fallback, which
 *  is a deliberate outcome rather than a missing image. */
export function bestHero(record) {
  const candidates = [record.heroMedia, ...(record.media || [])]
    .filter(Boolean)
    .filter((m) => ["HERO", "COVER", "ILLUSTRATION", "POSTER"].includes(m.kind));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => (PRIORITY[b.source] || 0) - (PRIORITY[a.source] || 0))[0];
}

/** The public shape of a medium: what it is, where it is, what it shows.
 *  Licence and approval detail stay internal. */
export function publicMedium(m) {
  if (!m) return null;
  const kind = ["AUDIO"].includes(m.kind) ? "AUDIO"
    : ["VIDEO_PREVIEW"].includes(m.kind) ? "VIDEO" : "IMAGE";
  return { kind, src: m.src, alt: m.altText || "" };
}
