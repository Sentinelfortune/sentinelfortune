/* SFL EDITORIAL CORRIDOR — the seven destinations.
 *
 * Canonical tokens, the public identity slug each maps to in the existing
 * engine, and the editorial subject matter each house accepts.
 *
 * A branch is ALWAYS explicit on a publication. The corridor never infers one,
 * and never re-infers after the Owner has chosen — silently moving a teaching
 * from VibraFlow to the Academy because it mentioned business would be the
 * corridor overruling the Owner.
 */

export const BRANCHES = Object.freeze({
  SENTINEL_FORTUNE_RECORDS: Object.freeze({
    token: "SENTINEL_FORTUNE_RECORDS",
    identity: "sentinelfortunerecords",
    name: "Sentinel Fortune Records",
    accepts: Object.freeze(["SESSION", "AUDIO", "PODCAST", "ARTICLE", "ANNOUNCEMENT", "EDITORIAL_COLLECTION", "LESSON"]),
    subject: "music culture, artist stories, release and listening sessions, music education",
  }),
  CODEX_WORLD_TV: Object.freeze({
    token: "CODEX_WORLD_TV",
    identity: "codexworldtv",
    name: "Codex World TV",
    accepts: Object.freeze(["STORY", "EPISODE", "ARTICLE", "ANNOUNCEMENT", "EDITORIAL_COLLECTION"]),
    subject: "stories, episodes, serial narrative, characters, worlds, cinematic editorial",
  }),
  LUMEN_GAME: Object.freeze({
    token: "LUMEN_GAME",
    identity: "lumengame",
    name: "Lumen Game",
    accepts: Object.freeze(["CHALLENGE", "SESSION", "ARTICLE", "ANNOUNCEMENT", "TUTORIAL", "EDITORIAL_COLLECTION"]),
    subject: "challenges, playable sessions, game discoveries, interactive editorial",
  }),
  LUMEN_SCHOOL_ACADEMY: Object.freeze({
    token: "LUMEN_SCHOOL_ACADEMY",
    identity: "lumenschoolacademy",
    name: "Lumen School Academy",
    accepts: Object.freeze(["LESSON", "GUIDE", "TUTORIAL", "ARTICLE", "SESSION", "ANNOUNCEMENT", "EDITORIAL_COLLECTION"]),
    subject: "business, entrepreneurship, finance, AI, education, free masterclass sessions",
  }),
  VIBRAFLOW_MEDIA: Object.freeze({
    token: "VIBRAFLOW_MEDIA",
    identity: "vibraflowmedia",
    name: "VibraFlow Media",
    accepts: Object.freeze(["TEACHING", "REFLECTION", "RHAPSODY", "SESSION", "AUDIO", "PODCAST", "ARTICLE", "EDITORIAL_COLLECTION"]),
    subject: "teachings, reflections, rhapsodies, contemplative sessions, reading and listening",
  }),
  LIGHTNODE_SYSTEMS: Object.freeze({
    token: "LIGHTNODE_SYSTEMS",
    identity: "lightnodesystems",
    name: "LightNode Systems",
    accepts: Object.freeze(["TUTORIAL", "GUIDE", "ARTICLE", "LESSON", "ANNOUNCEMENT", "EDITORIAL_COLLECTION"]),
    subject: "AI, software, systems, automation, technical guides and tutorials",
  }),
  OG_LEGACY_STORE: Object.freeze({
    token: "OG_LEGACY_STORE",
    identity: "oglegacystore",
    name: "OG Legacy Store",
    accepts: Object.freeze(["EDITORIAL_COLLECTION", "ARTICLE", "ANNOUNCEMENT", "STORY"]),
    subject: "editorial collections, product stories, curated releases and offer editorial",
  }),
});

export const BRANCH_TOKENS = Object.freeze(Object.keys(BRANCHES));

export function branch(token) {
  return BRANCHES[token] || null;
}

/** The public identity slug the engine routes by. */
export function identityOf(token) {
  const b = BRANCHES[token];
  return b ? b.identity : null;
}

/**
 * Does this house accept this kind of editorial work?
 *
 * A refusal, not a redirection. Being told "VibraFlow does not take tutorials"
 * is useful; being silently moved to LightNode is not.
 */
export function accepts(token, contentType) {
  const b = BRANCHES[token];
  if (!b) return { ok: false, reason: `unknown branch ${JSON.stringify(token)}` };
  if (!b.accepts.includes(contentType)) {
    return { ok: false, reason: `${b.name} does not publish ${contentType} — it covers ${b.subject}` };
  }
  return { ok: true };
}
