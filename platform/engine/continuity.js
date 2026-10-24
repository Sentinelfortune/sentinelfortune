/* Sentinel Fortune — CONTINUITY.
 *
 * "Continue listening / reading / learning / playing", and the recently-viewed
 * history that seeds rule-based suggestions.
 *
 * THIS IS A DEVICE, NOT AN ACCOUNT.
 * ---------------------------------
 * There is no authentication anywhere in this platform, so there is nothing to
 * sync and nothing that follows a visitor between devices. Everything below
 * lives in this browser's localStorage and the UI says so wherever it surfaces.
 * Presenting local history as "your account" would be the exact fabricated
 * personalisation this module must not create.
 *
 * Every access is wrapped: private windows and blocked site data throw on
 * access rather than returning null, and a thrown error in a convenience
 * feature must not take the page down with it.
 */

const KEY = "sf.continuity.v1";
const MAX = 24;

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && parsed.entries && Array.isArray(parsed.entries)
      ? parsed
      : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function write(state) {
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { /* storage unavailable — the session still works, nothing persists */ }
}

/**
 * Record that this visitor opened something.
 *
 * Stores the identity, the slug and a timestamp — nothing else. No titles, no
 * prices, no identifiers that outlive the catalogue: the record is looked up
 * fresh from the governed feed on every read, so a withdrawn record disappears
 * from history automatically rather than lingering as a stale copy.
 */
export function noteOpened(identity, record) {
  if (!identity || !record || !record.slug) return;
  const state = read();
  const entries = state.entries.filter((e) => !(e.i === identity && e.s === record.slug));
  entries.unshift({ i: identity, s: record.slug, t: Date.now() });
  state.entries = entries.slice(0, MAX);
  write(state);
}

/** Slugs this visitor opened in this house, most recent first. */
export function recentSlugs(identity, limit = 12) {
  return read().entries
    .filter((e) => e.i === identity)
    .sort((a, b) => b.t - a.t)
    .slice(0, limit)
    .map((e) => e.s);
}

/**
 * Recently opened records, resolved against the CURRENT governed pool.
 *
 * Resolving rather than storing is what keeps this honest: a record that is no
 * longer published simply is not found, so it silently leaves the rail. A
 * cached title would have kept advertising something that was withdrawn.
 */
export function recentRecords(identity, pool, limit = 12) {
  const order = recentSlugs(identity, MAX);
  const out = [];
  for (const slug of order) {
    const rec = pool.find((r) => r.slug === slug);
    if (rec) out.push(rec);
    if (out.length >= limit) break;
  }
  return out;
}

/** True when this visitor has any history in this house. Used to decide
 *  whether the continue rail and the suggestion rail exist at all. */
export function hasHistory(identity) {
  return recentSlugs(identity, 1).length > 0;
}

/** Forget everything. Offered in the UI beside the continue rail, because a
 *  visitor who can see their history must be able to clear it. */
export function forget() {
  write({ entries: [] });
}

/**
 * The verb this house uses to resume.
 *
 * "Continue listening" in a record label and "Continue learning" in an academy
 * are the same mechanic wearing the branch's own language — which is the point
 * of a shared engine with specialized branches.
 */
export function continueLabel(lead) {
  switch (lead) {
    case "LISTEN": return "Continue listening";
    case "READ":   return "Continue reading";
    case "OPEN":   return "Continue where you left off";
    case "LEARN":  return "Continue learning";
    case "BUY":    return "Recently viewed";
    default:       return "Recently viewed";
  }
}
