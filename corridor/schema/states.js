/* SFL EDITORIAL CORRIDOR — lifecycle states.
 *
 * The states are explicit and the legal transitions are a closed table,
 * because the two mistakes that matter most in a publishing system are both
 * state mistakes: a draft becoming public, and a preview being mistaken for a
 * publication.
 */

export const STATES = Object.freeze([
  "DRAFT",        // being prepared. NEVER public.
  "PREVIEW",      // rendered for the Owner to look at. NEVER public.
  "APPROVED",     // the Owner said yes. Still not public until PUBLISH runs.
  "PUBLISHED",    // in the public editorial feed.
  "UNPUBLISHED",  // withdrawn from the feed. History kept.
  "ARCHIVED",     // retired. History kept.
  "REJECTED",     // the Owner said no.
]);

/** The ONLY states whose records may appear in the public feed. */
export const PUBLIC_STATES = Object.freeze(["PUBLISHED"]);

/** Legal transitions. Anything absent is refused — a corridor where any state
 *  can become any other is not a corridor. */
const TRANSITIONS = Object.freeze({
  DRAFT:       ["DRAFT", "PREVIEW", "APPROVED", "REJECTED", "ARCHIVED"],
  PREVIEW:     ["DRAFT", "PREVIEW", "APPROVED", "REJECTED", "ARCHIVED"],
  APPROVED:    ["PUBLISHED", "DRAFT", "REJECTED", "ARCHIVED"],
  PUBLISHED:   ["UNPUBLISHED", "ARCHIVED", "PUBLISHED"],
  UNPUBLISHED: ["PUBLISHED", "ARCHIVED", "DRAFT"],
  ARCHIVED:    [],
  REJECTED:    ["DRAFT", "ARCHIVED"],
});

export function canTransition(from, to) {
  if (!STATES.includes(from) || !STATES.includes(to)) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

export function isPublic(state) {
  return PUBLIC_STATES.includes(state);
}

/** A record may only be published from APPROVED. There is no path that turns
 *  a DRAFT public in one step, which is the point. */
export function canPublish(state) {
  return state === "APPROVED" || state === "UNPUBLISHED";
}
