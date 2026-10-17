/* Sentinel Fortune — THE SEVEN SPECIALIZED BRANCHES.
 *
 * Configuration only. Every branch runs the SAME engine, the SAME core and the
 * SAME commercial heart; what differs is declared here:
 *
 *   job          the one sentence that says what this house does
 *   nav          small, obvious, specific to the work
 *   rails        the ORDERED living-discovery composition for this house —
 *                which shelves it presents and what each one is called in its
 *                own language. An empty rail never renders, so a house with
 *                little governed content shows fewer shelves rather than a
 *                page of empty ones.
 *   types        the content types this house owns
 *   segment      the public path segment for a detail route
 *   theme        the atmosphere tokens — one family, seven worlds
 *   lead         the primary interaction a visitor should reach first
 *
 * ONE FAMILY, SEVEN WORLDS. Shared: typography, spacing, component quality,
 * accessibility, mobile behaviour. Different: atmosphere, hierarchy, media
 * behaviour, and the lead interaction.
 *
 * Nothing here contains business truth. No prices, no products, no CTAs.
 */

export const BRANCHES = Object.freeze({

  sentinelfortunerecords: Object.freeze({
    slug: "sentinelfortunerecords",
    host: "sentinelfortunerecords.sentinelfortune.com",
    name: "Sentinel Fortune Records",
    tag: "Sound",
    mark: "♪",
    job: "Turn governed audio into a listening and discovery experience.",
    promise: "Releases, artists and sound worlds you can hear now.",
    /* A record label leads with sound. The hero is a player, not a paragraph. */
    lead: "LISTEN",
    nav: Object.freeze([
      { label: "Home", view: "home" },
      { label: "Releases", view: "browse", type: "MUSIC_RELEASE" },
      { label: "Listen", view: "browse", filter: "free" },
      { label: "Podcasts", view: "browse", type: "PODCAST" },
    ]),
  rails: Object.freeze([
    { kind: "continue" },
    { kind: "new",        title: "New releases" },
    { kind: "featured",   title: "Selected releases" },
    { kind: "type",       type: "PODCAST", title: "Listen" },
    { kind: "recommended" },
    { kind: "free",       title: "Free to hear" },
    { kind: "paid",       title: "Premium offers" },
    { kind: "collections" },
  ]),
    types: Object.freeze(["MUSIC_RELEASE", "PODCAST", "BUNDLE"]),
    segment: "release",
    theme: Object.freeze({
      bg: "#07060d", surface: "#140f1f", accent: "#c9a227", accentSoft: "rgba(201,162,39,.10)",
      ink: "#f2eefb", inkSoft: "#bdb4d4", line: "#241b38",
      display: "'Cormorant Garamond',Georgia,serif", mood: "nocturne",
    }),
  }),

  codexworldtv: Object.freeze({
    slug: "codexworldtv",
    host: "codexworldtv.sentinelfortune.com",
    name: "Codex World TV",
    tag: "Cinema",
    mark: "◈",
    job: "Turn governed narrative assets into stories, series and worlds you can enter.",
    promise: "Stories, episodes and the worlds they belong to.",
    /* Narrative leads with the world, not the catalogue: a series first, then
       its episodes in order. */
    lead: "READ",
    nav: Object.freeze([
      { label: "Home", view: "home" },
      { label: "Stories", view: "browse", type: "STORY" },
      { label: "Series", view: "collections" },
      { label: "Explore", view: "browse" },
    ]),
  rails: Object.freeze([
    { kind: "continue",   title: "Continue exploring" },
    { kind: "featured",   title: "Featured story" },
    { kind: "new",        title: "New stories" },
    { kind: "type",       type: "STORY", title: "Stories" },
    { kind: "recommended" },
    { kind: "collections", title: "Series and worlds" },
    { kind: "paid",       title: "Premium offers" },
  ]),
    types: Object.freeze(["STORY", "BOOK", "BUNDLE"]),
    segment: "story",
    theme: Object.freeze({
      bg: "#06080f", surface: "#0e1420", accent: "#6fb3d9", accentSoft: "rgba(111,179,217,.10)",
      ink: "#eaf1f8", inkSoft: "#a9bccd", line: "#182435",
      display: "'Cormorant Garamond',Georgia,serif", mood: "widescreen",
    }),
  }),

  lumengame: Object.freeze({
    slug: "lumengame",
    host: "lumengame.sentinelfortune.com",
    name: "Lumen Game",
    tag: "Interactive",
    mark: "⬡",
    job: "Turn governed interactive assets into experiences you can play now.",
    promise: "Playable now, in the browser, nothing to install.",
    /* An arcade leads with one enormous launch target. */
    lead: "OPEN",
    nav: Object.freeze([
      { label: "Home", view: "home" },
      { label: "Play", view: "browse", type: "GAME" },
      { label: "Challenges", view: "collections" },
      { label: "All", view: "browse" },
    ]),
  rails: Object.freeze([
    { kind: "continue",   title: "Continue playing" },
    { kind: "featured",   title: "Play now" },
    { kind: "new",        title: "New challenges" },
    { kind: "type",       type: "GAME", title: "All games" },
    { kind: "recommended" },
    { kind: "collections" },
  ]),
    types: Object.freeze(["GAME", "BUNDLE"]),
    segment: "play",
    theme: Object.freeze({
      bg: "#050a0b", surface: "#0c1718", accent: "#3fd9b4", accentSoft: "rgba(63,217,180,.10)",
      ink: "#e9fbf7", inkSoft: "#9fc5bd", line: "#13282a",
      display: "'Jost',system-ui,sans-serif", mood: "arcade",
    }),
  }),

  lumenschoolacademy: Object.freeze({
    slug: "lumenschoolacademy",
    host: "lumenschoolacademy.sentinelfortune.com",
    name: "Lumen School Academy",
    tag: "Knowledge",
    mark: "◎",
    job: "Turn governed educational and business assets into learning journeys and working tools.",
    promise: "Learn it, then use the tool that does it.",
    /* Education leads with a path — order carries information a grid throws
       away — and with the tools that make the learning operational. */
    lead: "LEARN",
    nav: Object.freeze([
      { label: "Home", view: "home" },
      { label: "Learn", view: "collections" },
      { label: "Courses", view: "browse", type: "COURSE" },
      { label: "Tools", view: "browse", type: "SOFTWARE" },
    ]),
  rails: Object.freeze([
    { kind: "continue",   title: "Continue learning" },
    { kind: "featured",   title: "Start here" },
    { kind: "new",        title: "New courses" },
    { kind: "type",       type: "COURSE", title: "Courses" },
    { kind: "type",       type: "SOFTWARE", title: "Business tools" },
    { kind: "recommended" },
    { kind: "free",       title: "Free to learn" },
    { kind: "paid",       title: "Premium" },
    { kind: "collections", title: "Learning paths" },
  ]),
    types: Object.freeze(["COURSE", "BOOK", "SOFTWARE", "PODCAST", "BUNDLE"]),
    segment: "learn",
    theme: Object.freeze({
      bg: "#070b18", surface: "#0d1428", accent: "#c8a84b", accentSoft: "rgba(200,168,75,.10)",
      ink: "#eef1f7", inkSoft: "#b4bfd4", line: "#1e2a48",
      display: "'Cormorant Garamond',Georgia,serif", mood: "institutional",
    }),
  }),

  vibraflowmedia: Object.freeze({
    slug: "vibraflowmedia",
    host: "vibraflowmedia.sentinelfortune.com",
    name: "VibraFlow Media",
    tag: "Reflection",
    mark: "▣",
    job: "Turn governed reflective content into a calm reading and listening experience.",
    promise: "One thing at a time, at the pace you brought with you.",
    /* The only branch whose job includes letting you stop. No carousel, no
       onward pressure, one passage at a time. */
    lead: "READ",
    nav: Object.freeze([
      { label: "Home", view: "home" },
      { label: "Teachings", view: "browse", type: "TEACHING" },
      { label: "Listen", view: "browse", type: "PODCAST" },
      { label: "Explore", view: "collections" },
    ]),
  rails: Object.freeze([
    { kind: "continue",   title: "Continue your journey" },
    { kind: "featured",   title: "Begin here" },
    { kind: "new",        title: "New reflections" },
    { kind: "type",       type: "TEACHING", title: "Teachings" },
    { kind: "type",       type: "PODCAST", title: "Listen" },
    { kind: "collections", title: "Themes" },
    { kind: "recommended" },
  ]),
    types: Object.freeze(["TEACHING", "BOOK", "PODCAST", "BUNDLE"]),
    segment: "reflect",
    theme: Object.freeze({
      bg: "#0a0a0c", surface: "#141418", accent: "#d8c9a8", accentSoft: "rgba(216,201,168,.08)",
      ink: "#f4f2ee", inkSoft: "#b9b5ad", line: "#21211f",
      display: "'Cormorant Garamond',Georgia,serif", mood: "quiet",
    }),
  }),

  lightnodesystems: Object.freeze({
    slug: "lightnodesystems",
    host: "lightnodesystems.sentinelfortune.com",
    name: "LightNode Systems",
    tag: "Systems",
    mark: "⊕",
    job: "Turn governed technical assets into tools, systems and technical learning you can run.",
    promise: "What it does, what it needs, what it returns — then run it.",
    /* A product lab leads with the contract: every system states its job,
       inputs and outputs before it can be opened. */
    lead: "OPEN",
    nav: Object.freeze([
      { label: "Home", view: "home" },
      { label: "Tools", view: "browse", type: "SOFTWARE" },
      { label: "Learn", view: "browse", type: "COURSE" },
      { label: "All", view: "browse" },
    ]),
  rails: Object.freeze([
    { kind: "continue",   title: "Continue where you left off" },
    { kind: "featured",   title: "Try these" },
    { kind: "new",        title: "New tools" },
    { kind: "type",       type: "SOFTWARE", title: "Systems and tools" },
    { kind: "type",       type: "COURSE", title: "Guides" },
    { kind: "recommended", title: "Related solutions" },
    { kind: "free",       title: "Free to use" },
    { kind: "paid",       title: "Premium" },
  ]),
    types: Object.freeze(["SOFTWARE", "COURSE", "BOOK", "BUNDLE"]),
    segment: "systems",
    theme: Object.freeze({
      bg: "#06090c", surface: "#0d1319", accent: "#7fa8c9", accentSoft: "rgba(127,168,201,.10)",
      ink: "#e8eef4", inkSoft: "#a3b4c4", line: "#152029",
      display: "'Jost',system-ui,sans-serif", mood: "lab",
    }),
  }),

  oglegacystore: Object.freeze({
    slug: "oglegacystore",
    host: "oglegacystore.sentinelfortune.com",
    name: "OG Legacy Store",
    tag: "Culture",
    mark: "◇",
    job: "Turn governed commercial assets into curated collections, bundles and offers.",
    promise: "Curated, not catalogued.",
    /* Commerce leads with the collection, then one object at a time. Checkout
       is never reimplemented here — the Digital Shop owns it. */
    lead: "BUY",
    nav: Object.freeze([
      { label: "Home", view: "home" },
      { label: "Shop", view: "browse" },
      { label: "Collections", view: "collections" },
      { label: "Bundles", view: "browse", type: "BUNDLE" },
    ]),
  rails: Object.freeze([
    { kind: "continue",   title: "Recently viewed" },
    { kind: "new",        title: "New arrivals" },
    { kind: "featured",   title: "Featured" },
    { kind: "type",       type: "BUNDLE", title: "Bundles" },
    { kind: "collections" },
    { kind: "recommended", title: "Related products" },
    { kind: "paid",       title: "Premium offers" },
  ]),
    types: Object.freeze(["BUNDLE", "BOOK", "SOFTWARE", "MUSIC_RELEASE", "GAME", "STORY", "TEACHING"]),
    segment: "offer",
    theme: Object.freeze({
      bg: "#0b0806", surface: "#171210", accent: "#d9a66c", accentSoft: "rgba(217,166,108,.10)",
      ink: "#f7f1ea", inkSoft: "#c4b5a6", line: "#271d16",
      display: "'Cinzel',Georgia,serif", mood: "boutique",
    }),
  }),
});

/** Host → identity. Built from BRANCHES so the two can never disagree. */
export const HOST_MAP = Object.freeze(
  Object.fromEntries(Object.values(BRANCHES).map((b) => [b.host, b.slug])),
);

export function branch(slug) {
  return BRANCHES[slug] || null;
}

export function allBranches() {
  return Object.values(BRANCHES);
}
