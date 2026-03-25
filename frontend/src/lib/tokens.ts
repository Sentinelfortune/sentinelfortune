export const gold = "#c9a227";
export const goldLight = "#e2c05a";
export const goldDim = "#8a6e17";
export const bg = "#0a0a0a";
export const surface = "#111111";
export const surface2 = "#141414";
export const border = "#1e1e1e";
export const border2 = "#252525";
export const text = "#f5f5f5";
export const muted = "#888888";
export const muted2 = "#555555";

export const DOMAINS = [
  { id: "sentinelfortune",    domain: "sentinelfortune.com",           label: "Sentinel Fortune",          category: "hub",         tier: "starter",   cta: "Enter the System" },
  { id: "records",            domain: "sentinelfortunerecords.one",    label: "Sentinel Fortune Records",  category: "music",       tier: "starter",   cta: "Stream Now" },
  { id: "codexworldtv",       domain: "codexworldtv.homes",            label: "Codex World TV",            category: "video",       tier: "pro",       cta: "Watch Now" },
  { id: "lumengame",          domain: "lumengame.vip",                 label: "Lumen Game",                category: "games",       tier: "pro",       cta: "Play Now" },
  { id: "lumenschoolacademy", domain: "lumenschoolacademy.online",     label: "Lumen School Academy",      category: "education",   tier: "starter",   cta: "Enroll" },
  { id: "vibraflowmedia",     domain: "vibraflowmedia.casa",           label: "VibraFlow Media",           category: "spirituality", tier: "oem",      cta: "Access" },
  { id: "lightnodesystems",   domain: "lightnodesystems.my",           label: "LightNode Systems",         category: "systems",     tier: "licensing", cta: "License" },
  { id: "oglegacystore",      domain: "oglegacystore.homes",           label: "OG Legacy Store",           category: "commerce",    tier: "starter",   cta: "Shop" },
];

export const TIERS = [
  { slug: "lite",      label: "Starter Lite",           price: "$2",         channel: "Teachings Vault",     desc: "First access. One payment. Immediate delivery." },
  { slug: "monthly",   label: "Monthly Reset",           price: "$25/mo",     channel: "Reset Channel",       desc: "Continuity tier. Built for sustained operation." },
  { slug: "starter",   label: "Starter Pack",            price: "$290",       channel: "Teachings Vault",     desc: "Full vault access. Structured content. No expiry." },
  { slug: "pro",       label: "Pro Access",              price: "$1,900",     channel: "Sentinel Engine",     desc: "Deep execution framework. Advanced systems." },
  { slug: "oem",       label: "OEM License",             price: "$7,500",     channel: "Sentinel Architect",  desc: "Integrate the engine into your own infrastructure." },
  { slug: "licensing", label: "Institutional License",   price: "$15,000",    channel: "Sentinel Architect",  desc: "Enterprise rights. Full system integration." },
];

export const BOT_LINK = "https://t.me/sentinelfortune_bot";
export const BOT_START = (ref: string) => `${BOT_LINK}?start=${ref}`;
