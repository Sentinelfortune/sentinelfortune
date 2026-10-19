/* Sentinel Fortune — THE SEVEN SPECIALIZED WORLDS.
 *
 * Configuration only. Every world runs the SAME engine, the SAME core and the
 * SAME commercial heart; what differs is declared here:
 *
 *   job          the one sentence that says what this world does
 *   role         the short public role, as it reads on the Sentinel Fortune
 *                homepage board — shorter and more concrete than `job`
 *   cta          the ONE canonical public action for this world
 *   focus        what its imagery must show: people, technology, real work
 *   nav          small, obvious, specific to the work
 *   rails        the ORDERED living-discovery composition for this world —
 *                which shelves it presents and what each one is called in its
 *                own language. An empty rail never renders, so a world with
 *                little governed content shows fewer shelves rather than a
 *                page of empty ones.
 *   types        the content types this world owns
 *   segment      the public path segment for a detail route
 *   theme        the atmosphere tokens — one family, seven worlds
 *   lead         the primary interaction a visitor should reach first
 *
 * ONE FAMILY, SEVEN WORLDS. Shared: typography, spacing, component quality,
 * accessibility, mobile behaviour. Different: atmosphere, hierarchy, media
 * behaviour, and the lead interaction.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BRAND FOUNDATION IS DEEP DARK BLUE.
 *
 * Every `theme.bg`, `theme.surface` and `theme.line` below sits in one deep
 * blue family. A world expresses its personality through ACCENT and MOOD, not
 * by abandoning the foundation — which is what produced the near-black,
 * gold-dominant treatment this configuration previously carried (#07060d,
 * #0b0806, #0a0a0c) and which read as a generic black-and-gold luxury
 * template rather than as Sentinel Fortune.
 *
 * Gold is an ACCENT, used on the two worlds where premium craft is the subject
 * (Records, Academy) and as a warm accent on OG Legacy. It is never the field.
 * Luminous blue and cyan carry technology and runtime. Black survives only as
 * depth inside media treatment, never as the page.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nothing here contains business truth. No prices, no products, no checkout.
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
    role: "Original music, artists and listening sessions.",
    cta: "Listen / Discover",
    focus: Object.freeze(["artists", "studios", "releases", "audio waveform", "music culture"]),
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
    readiness: Object.freeze({ experienceReady: false, hubVisible: false, subdomainLive: false }),
    theme: Object.freeze({
      bg: "#070f24", surface: "#101a38", accent: "#c9a227", accentSoft: "rgba(201,162,39,.10)",
      ink: "#f3f1fb", inkSoft: "#b8bed8", line: "#1c2a4e",
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
    role: "Cinematic stories, episodes and story worlds.",
    cta: "Watch / Explore story",
    focus: Object.freeze(["cinematic scenes", "characters", "story worlds", "episodes"]),
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
    readiness: Object.freeze({ experienceReady: false, hubVisible: false, subdomainLive: false }),
    theme: Object.freeze({
      bg: "#060d1f", surface: "#0d1830", accent: "#6fb3d9", accentSoft: "rgba(111,179,217,.10)",
      ink: "#eaf1f8", inkSoft: "#a9bccd", line: "#16253f",
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
    role: "Playable challenges and interactive worlds.",
    cta: "Play",
    focus: Object.freeze(["interaction", "game art", "challenges", "playable worlds"]),
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
    readiness: Object.freeze({ experienceReady: false, hubVisible: false, subdomainLive: false }),
    theme: Object.freeze({
      bg: "#061024", surface: "#0c1a33", accent: "#3fd9b4", accentSoft: "rgba(63,217,180,.10)",
      ink: "#e9fbf7", inkSoft: "#9fc0c8", line: "#14283f",
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
    role: "Practical business, finance and AI learning.",
    cta: "Learn",
    focus: Object.freeze(["learners", "teachers", "practical knowledge", "outcomes", "modern learning"]),
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
    readiness: Object.freeze({ experienceReady: true, hubVisible: false, subdomainLive: false }),
    theme: Object.freeze({
      bg: "#070f22", surface: "#0d1730", accent: "#c8a84b", accentSoft: "rgba(200,168,75,.10)",
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
    role: "Teachings, reflections and contemplative audio.",
    cta: "Read / Listen / Reflect",
    focus: Object.freeze(["human reflection", "reading", "teachings", "contemplative audio", "emotional depth"]),
    /* The only world whose job includes letting you stop. No carousel, no
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
    readiness: Object.freeze({ experienceReady: false, hubVisible: false, subdomainLive: false }),
    theme: Object.freeze({
      bg: "#080e1d", surface: "#111a2c", accent: "#d8c9a8", accentSoft: "rgba(216,201,168,.08)",
      ink: "#f4f2ee", inkSoft: "#b6b8bd", line: "#1b2438",
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
    role: "AI, software and systems you can actually run.",
    cta: "Explore / Try / Request",
    focus: Object.freeze(["AI", "software interfaces", "systems", "enterprise technology", "automation", "code"]),
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
    readiness: Object.freeze({ experienceReady: false, hubVisible: false, subdomainLive: false }),
    theme: Object.freeze({
      bg: "#050d1c", surface: "#0b1628", accent: "#7fa8c9", accentSoft: "rgba(127,168,201,.10)",
      ink: "#e8eef4", inkSoft: "#a3b4c4", line: "#142231",
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
    role: "Curated digital products and collections.",
    cta: "Discover / Buy",
    focus: Object.freeze(["premium product imagery", "collections", "curated commerce", "product storytelling"]),
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
    readiness: Object.freeze({ experienceReady: false, hubVisible: false, subdomainLive: false }),
    theme: Object.freeze({
      bg: "#080e20", surface: "#121a30", accent: "#d9a66c", accentSoft: "rgba(217,166,108,.10)",
      ink: "#f7f1ea", inkSoft: "#c0b6ad", line: "#1f2840",
      display: "'Cinzel',Georgia,serif", mood: "boutique",
    }),
  }),
});

/**
 * THE SENTINEL FORTUNE BRAND LAYER.
 *
 * The homepage is not an eighth world. It is the company, and it carries the
 * deepest blue in the family plus the restrained gold accent — so that moving
 * from the homepage into any world feels like going deeper into one place
 * rather than leaving for another site.
 */
export const HUB = Object.freeze({
  slug: "sentinelfortune",
  name: "Sentinel Fortune",
  tag: "One company",
  mark: "✦",
  /* §5: ONE unified story first. The seven worlds come after it. */
  promise: "Original experiences across technology, music, learning, stories, interactive worlds and digital culture.",
  direction: "Choose your world",
  job: "One company. One connected ecosystem. Seven specialized worlds.",
  /* Same nav anatomy as a world, but the destinations are sections of this one
     page rather than routes — so the shell does not need a second
     implementation to render it. */
  nav: Object.freeze([
    { label: "Worlds", href: "#worlds" },
    { label: "Latest", href: "#latest" },
    { label: "Products", href: "#products" },
    { label: "Support", href: "#support" },
    { label: "Business", href: "#business" },
  ]),
  /* The company's accent is LUMINOUS BLUE, not gold.
     Gold is carried separately as `--gold` and spent only where premium
     emphasis is earned — a governed price, the support edge, the monogram.
     Making gold the accent is what turned the previous treatment into a
     black-and-gold template: every kicker, every arrow, every generated
     stroke inherited it, and "restrained accent" became the whole palette. */
  theme: Object.freeze({
    bg: "#050b1a", surface: "#0b1530", accent: "#7fb4e8", accentSoft: "rgba(127,180,232,.10)",
    gold: "#c8a84b",
    ink: "#eef2fa", inkSoft: "#aab6d0", line: "#1a2748",
    display: "'Cormorant Garamond',Georgia,serif", mood: "company",
  }),
});

/** The order the seven worlds appear in on the homepage. Declared, not derived
 *  from object order, so a config edit cannot silently reshuffle the boards. */
export const WORLD_ORDER = Object.freeze([
  "sentinelfortunerecords",
  "codexworldtv",
  "lumengame",
  "lumenschoolacademy",
  "vibraflowmedia",
  "lightnodesystems",
  "oglegacystore",
]);

/* ─────────────────────────────────────────────────────────────────────────
   WORLD READINESS

   The SAME three-dimensional contract the institutional site already uses
   (`_data/identities.yml` → `_includes/identity-state.html`). It is reproduced
   here because the platform is a static runtime and cannot read that YAML, and
   `tests/engine.test.mjs` asserts the two match — so this is a mirror whose
   drift is a test failure, not a second source of truth.

       subdomainLive  =>  hubVisible  =>  experienceReady

   A flag raised out of order is IGNORED rather than obeyed, and the world
   renders one step down. The cheapest way to guarantee the homepage never
   links to an unvalidated experience or an address that does not resolve is to
   make that impossible to express.
   ───────────────────────────────────────────────────────────────────────── */

export const WORLD_STATES = Object.freeze(["BUILD", "READY", "HUB", "LIVE"]);

/**
 * Resolve one world's public state from its readiness flags.
 *
 *   BUILD  in build. Not clickable publicly.
 *   READY  built and validated, but the Owner has not surfaced it. Not
 *          clickable publicly — this is the deliberate gap between "passes its
 *          gates" and "the Owner chose to publish it".
 *   HUB    the homepage may link to the world's experience on this platform.
 *   LIVE   the world's canonical subdomain is actually serving.
 */
export function worldState(cfg) {
  const r = (cfg && cfg.readiness) || {};
  const ready = r.experienceReady === true;
  const linked = ready && r.hubVisible === true;
  const remote = linked && r.subdomainLive === true;
  if (remote) return "LIVE";
  if (linked) return "HUB";
  if (ready) return "READY";
  return "BUILD";
}

/** The public word for a world's state. Never invented, never optimistic. */
export const STATE_LABEL = Object.freeze({
  BUILD: "In build",
  READY: "Ready — not yet published",
  HUB: "Open",
  LIVE: "Live",
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

/** The seven worlds in declared homepage order. */
export function orderedBranches() {
  return WORLD_ORDER.map((slug) => BRANCHES[slug]);
}
