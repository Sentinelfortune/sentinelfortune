// The problem router.
//
// Deterministic on purpose. A model would give better prose and worse
// reliability, and this is the first screen of the product — if it fails or
// stalls, nothing after it happens. Rules run offline, in about a millisecond,
// return the same answer twice, and can be read and corrected by a person.
//
// How it scores: each dimension owns a set of weighted signals. A signal is a
// word stem matched on a word boundary, so "record" hits "records" and
// "recording" but not "unrecorded" mid-word. Scores are summed, the field is
// normalised, and anything at or above THRESHOLD is recommended, capped at
// MAX_RECOMMENDED so the answer stays a shortlist rather than "all seven".
//
// The recommendation is never binding. The UI lets the user add or remove any
// dimension afterwards, which is also the escape hatch when the rules are wrong.

import { DIMENSIONS } from "./dimensions.js";

const THRESHOLD = 0.28;
const MAX_RECOMMENDED = 4;
const MIN_RECOMMENDED = 2;

/**
 * Signals per dimension. Weight 3 = the goal is plainly about this; 2 = strong
 * association; 1 = a hint that only matters alongside others.
 */
const SIGNALS = {
  records: [
    [3, ["album", "ep", "song", "songs", "track", "tracks", "music", "musician", "artist", "band",
         "release", "releasing", "single", "podcast", "audio", "record", "recording", "mixtape",
         "beat", "beats", "producer", "sound", "audiobook", "voice", "narration"]],
    [2, ["listener", "listeners", "streaming", "spotify", "playlist", "master", "mastering", "studio"]],
    [1, ["launch", "drop", "publish"]],
  ],
  lumengame: [
    [3, ["game", "games", "gamify", "gamified", "gamification", "challenge", "challenges", "quiz",
         "puzzle", "playable", "player", "players", "leaderboard", "quest"]],
    [2, ["engage", "engagement", "interactive", "participation", "streak", "points", "badge", "level",
         "levels", "compete", "competition"]],
    [1, ["fun", "motivate", "motivation", "habit"]],
  ],
  vibraflow: [
    [3, ["reflection", "reflect", "reflective", "meditation", "meditate", "spiritual", "spirituality",
         "journal", "journaling", "inner", "purpose", "meaning", "mindful", "mindfulness",
         "contemplative", "devotional"]],
    [2, ["values", "clarity", "alignment", "stuck", "overwhelmed", "burnout", "burned", "calm",
         "intention", "presence"]],
    [1, ["why", "honest", "confidence", "fear", "doubt"]],
  ],
  codexworld: [
    [3, ["story", "stories", "storytelling", "narrative", "documentary", "film", "video", "script",
         "screenplay", "series", "episode", "episodes", "novel", "book", "chapter", "plot",
         "character", "characters"]],
    [2, ["message", "messaging", "pitch", "explain", "communicate", "audience", "arc", "scene"]],
    [1, ["write", "writing", "content"]],
  ],
  lumenschool: [
    [3, ["learn", "learning", "teach", "teaching", "course", "courses", "curriculum", "masterclass",
         "training", "student", "students", "education", "educational", "workshop", "lesson",
         "lessons", "skill", "skills", "study"]],
    [2, ["business", "entrepreneur", "entrepreneurship", "startup", "strategy", "coaching", "mentor",
         "expertise", "consulting", "ai", "finance", "financial"]],
    [1, ["plan", "grow", "growth", "improve"]],
  ],
  lightnode: [
    [3, ["workflow", "workflows", "process", "processes", "sop", "automation", "automate", "automated",
         "system", "systems", "operations", "operational", "pipeline", "checklist", "procedure",
         "software", "app", "tool", "integration"]],
    [2, ["repeatable", "efficiency", "scale", "delegate", "handoff", "template", "documentation",
         "consistent", "manual", "organise", "organize"]],
    [1, ["time", "faster", "messy", "chaos"]],
  ],
  oglegacy: [
    [3, ["sell", "selling", "sale", "sales", "offer", "offers", "bundle", "bundles", "product",
         "products", "price", "pricing", "monetise", "monetize", "monetisation", "monetization",
         "store", "shop", "commerce", "merch", "catalogue", "catalog", "package", "packaging"]],
    [2, ["revenue", "income", "customer", "customers", "buyer", "buyers", "market", "launch",
         "checkout", "commercial", "client", "clients"]],
    [1, ["money", "paid", "business"]],
  ],
};

/** Why a dimension was suggested — written for the user, not the developer. */
const REASONS = {
  records: "your goal mentions audio or a release, and this turns that into a dated sequence",
  lumengame: "there is an engagement or challenge element here that benefits from being designed rather than improvised",
  vibraflow: "this goal has a personal dimension worth getting clear on before the practical work",
  codexworld: "you need people to follow and understand something, which is a structure problem",
  lumenschool: "there is a skill or business objective here that needs a sequence and a first move",
  lightnode: "something here should be repeatable rather than done from memory each time",
  oglegacy: "you are heading toward something someone can buy, which needs shaping as an offer",
};

/** Used when nothing scores — a general-purpose starting pair. */
const FALLBACK = ["lumenschool", "lightnode"];
const FALLBACK_REASON = {
  lumenschool: "a broad goal usually resolves fastest by naming the objective and the first action",
  lightnode: "and by turning whatever you decide into steps you can actually repeat",
};

function normalise(text) {
  return String(text ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

/** Word-boundary stem match, so "record" hits "records" but not "prerecorded". */
function countStem(words, stem) {
  let n = 0;
  for (const w of words) {
    if (w === stem || (w.startsWith(stem) && w.length - stem.length <= 3)) n++;
  }
  return n;
}

export function scoreGoal(goalText) {
  const words = normalise(goalText).split(/\s+/).filter(Boolean);
  const raw = {};
  for (const d of DIMENSIONS) {
    let score = 0;
    for (const [weight, stems] of SIGNALS[d.id] ?? []) {
      for (const stem of stems) score += weight * countStem(words, stem);
    }
    raw[d.id] = score;
  }
  const max = Math.max(0, ...Object.values(raw));
  const normalised = {};
  for (const id of Object.keys(raw)) normalised[id] = max === 0 ? 0 : raw[id] / max;
  return { raw, normalised, max };
}

/**
 * Recommend dimensions for a stated goal.
 *
 * Always returns at least MIN_RECOMMENDED so the user is never handed an empty
 * screen, and never more than MAX_RECOMMENDED so the answer stays a decision
 * rather than a menu.
 */
export function recommend(goalText) {
  const { raw, normalised, max } = scoreGoal(goalText);

  if (max === 0) {
    return {
      matched: false,
      recommended: FALLBACK.map((id) => ({ id, reason: FALLBACK_REASON[id], score: 0 })),
    };
  }

  const ranked = Object.keys(normalised)
    .map((id) => ({ id, score: normalised[id], raw: raw[id] }))
    .filter((x) => x.raw > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  let picked = ranked.filter((x) => x.score >= THRESHOLD).slice(0, MAX_RECOMMENDED);
  if (picked.length < MIN_RECOMMENDED) picked = ranked.slice(0, MIN_RECOMMENDED);

  return {
    matched: true,
    recommended: picked.map((x) => ({ id: x.id, reason: REASONS[x.id], score: Number(x.score.toFixed(3)) })),
  };
}

export const ROUTER_CONSTANTS = { THRESHOLD, MAX_RECOMMENDED, MIN_RECOMMENDED };
