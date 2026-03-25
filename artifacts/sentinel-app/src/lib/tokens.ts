// ── Midnight Blue Design System ────────────────────────────────────────────
export const bg       = "#070c18";   // deepest bg
export const surface  = "#0d1528";   // card surface
export const surface2 = "#111e36";   // elevated surface
export const surface3 = "#152244";   // hover / accent surface
export const border   = "#1a2640";   // standard border
export const border2  = "#1e2d4a";   // slightly lighter border
export const gold     = "#c9a34f";   // muted premium gold
export const goldLight= "#e2bb6e";   // light gold
export const goldDim  = "#7a6130";   // dim gold (labels)
export const text     = "#e8edf5";   // primary text
export const muted    = "#6b7d9a";   // secondary text
export const muted2   = "#3d4f6a";   // tertiary / placeholder
export const mono     = "'JetBrains Mono', 'Fira Code', monospace";

// ── Brand Identity ─────────────────────────────────────────────────────────
export const LOGO_PATH    = "/assets/branding/sf-logo.svg";
export const OG_IMAGE     = "/assets/branding/og-image.png";
export const BRAND_NAME   = "SENTINEL FORTUNE LLC";

// ── Commercial Brands ──────────────────────────────────────────────────────
export const BRANDS = [
  { id: "mob-area",     label: "MOB AREA",    category: "lifestyle",    domain: "oglegacystore.homes" },
  { id: "izzz",         label: "IZZZ",         category: "audio",        domain: "sentinelfortunerecords.one" },
  { id: "dude-stunna",  label: "DUDE STUNNA",  category: "lifestyle",    domain: "oglegacystore.homes" },
  { id: "og",           label: "O.G",          category: "legacy",       domain: "sentinelfortune.com" },
  { id: "oos",          label: "O.O'$",        category: "finance",      domain: "sentinelfortune.com" },
  { id: "grand",        label: "GRAND",        category: "premium",      domain: "sentinelfortune.com" },
  { id: "knis",         label: "KNI$",         category: "street",       domain: "oglegacystore.homes" },
  { id: "aura-board",   label: "AURA BOARD",   category: "spiritual",    domain: "vibraflowmedia.casa" },
];

// ── IP Universe ────────────────────────────────────────────────────────────
export const IP_UNIVERSE = [
  {
    id:      "ratou",
    label:   "RATOU",
    sub:     "Universe",
    desc:    "The RATOU universe spans visual storytelling, interactive worlds, and coded intelligence. Active across Codex World TV and Lumen Game.",
    domains: ["codexworldtv.homes", "lumengame.vip"],
    color:   "#7c3aed",
  },
  {
    id:      "codex-shards",
    label:   "CODEX SHARDS",
    sub:     "Intelligence Layer",
    desc:    "Fragments of the Codex intelligence network. Each shard carries operational data from within the RATOU universe.",
    domains: ["codexworldtv.homes"],
    color:   "#0ea5e9",
  },
];

// ── Domain Corridors ───────────────────────────────────────────────────────
export const DOMAINS = [
  {
    id: "sentinelfortune",    domain: "sentinelfortune.com",           label: "Sentinel Fortune",          category: "hub",         tier: "starter",   cta: "Enter the System",
    desc: "Institutional command hub. The primary entry point to the SFL operating framework.",
    brands: ["O.G", "O.O'$", "GRAND"],
    ip: [],
  },
  {
    id: "records",            domain: "sentinelfortunerecords.one",    label: "Sentinel Fortune Records",  category: "music",       tier: "starter",   cta: "Stream Now",
    desc: "Music, artists, releases. The sound layer of the Sentinel Fortune network.",
    brands: ["IZZZ"],
    ip: [],
  },
  {
    id: "codexworldtv",       domain: "codexworldtv.homes",            label: "Codex World TV",            category: "film & series", tier: "pro",    cta: "Watch Now",
    desc: "Films, series, and the RATOU visual storytelling universe. Cinematic content as access signal.",
    brands: [],
    ip: ["RATOU", "CODEX SHARDS"],
  },
  {
    id: "lumengame",          domain: "lumengame.vip",                 label: "Lumen Game",                category: "games",       tier: "pro",       cta: "Play Now",
    desc: "Interactive worlds and the RATOU interactive universe. Strategy games built on the execution framework.",
    brands: [],
    ip: ["RATOU"],
  },
  {
    id: "lumenschoolacademy", domain: "lumenschoolacademy.online",     label: "Lumen School Academy",      category: "education",   tier: "starter",   cta: "Enroll",
    desc: "Education, teachings, and ebooks. The structured learning arm of the Sentinel Fortune network.",
    brands: [],
    ip: [],
  },
  {
    id: "vibraflowmedia",     domain: "vibraflowmedia.casa",           label: "VibraFlow Media",           category: "spirituality", tier: "oem",      cta: "Access",
    desc: "Spirituality, mysteries, voice, teachings, and media. The frequency layer.",
    brands: ["AURA BOARD"],
    ip: [],
  },
  {
    id: "lightnodesystems",   domain: "lightnodesystems.my",           label: "LightNode Systems",         category: "systems",     tier: "licensing", cta: "License",
    desc: "Systems, tools, security, and infrastructure. The technical backbone of the network.",
    brands: [],
    ip: [],
  },
  {
    id: "oglegacystore",      domain: "oglegacystore.homes",           label: "OG Legacy Store",           category: "commerce",    tier: "starter",   cta: "Shop",
    desc: "Commerce, brands, store, showcase. Home of MOB AREA, DUDE STUNNA, and KNI$.",
    brands: ["MOB AREA", "DUDE STUNNA", "KNI$"],
    ip: [],
  },
];

// ── Access Tiers ───────────────────────────────────────────────────────────
export const TIERS = [
  { slug: "lite",      label: "Starter Lite",         price: "$2",       channel: "Teachings Vault",    desc: "First access. One payment. Immediate delivery." },
  { slug: "monthly",   label: "Monthly Reset",         price: "$25/mo",   channel: "Reset + Quick Access", desc: "Continuity tier. Built for sustained operation." },
  { slug: "starter",   label: "Starter Pack",          price: "$290",     channel: "Teachings Vault",    desc: "Full vault access. Structured content. No expiry." },
  { slug: "pro",       label: "Pro Access",            price: "$1,900",   channel: "Sentinel Engine",    desc: "Deep execution framework. Advanced systems." },
  { slug: "oem",       label: "OEM License",           price: "$7,500",   channel: "Sentinel Architect", desc: "Integrate the engine into your own infrastructure." },
  { slug: "licensing", label: "Institutional License", price: "$15,000",  channel: "Sentinel Architect", desc: "Enterprise rights. Full system integration." },
];

// ── Bot Links ──────────────────────────────────────────────────────────────
export const BOT_LINK  = "https://t.me/sentinelfortune_bot";
export const BOT_START = (ref: string) => `${BOT_LINK}?start=${ref}`;

// ── R2 Namespace Map (governance) ─────────────────────────────────────────
export const R2_NAMESPACES = {
  public:   "originus/public/",
  hub:      "originus/hub/",
  users:    "originus/users/",
  payments: "originus/payments/",
  access:   "originus/access/",
  finance:  "originus/finance/",
  private:  "originus/private/",
  canon:    "originus/_canon/",  // READ ONLY — NEVER WRITE
};
