/* SFL EDITORIAL CORRIDOR — intent resolution.
 *
 * THE SAFETY RULE OF THE WHOLE CORRIDOR:
 *
 *   An unclear instruction resolves to PREPARE. Never to PUBLISH.
 *
 * Publishing is the only irreversible-feeling step in this system, so it is
 * the one step that must never be reached by inference. An AI client that
 * wants to publish has to say so, and the Owner has to have approved the
 * record first.
 */

export const INTENTS = Object.freeze([
  "PREPARE", "PREVIEW", "PUBLISH", "UNPUBLISH", "UPDATE", "REPLACE", "ARCHIVE",
  /* Read-only. EXPLICIT ONLY — see below. */
  "LIST", "GET",
]);

/**
 * Intents that may only ever be stated outright, never inferred from the
 * Owner's words.
 *
 * Reading is harmless, but guessing is not: if "show me the recent ones" could
 * resolve to LIST, then PREVIEW and LIST compete over the same phrasing and
 * one of them starts losing. A client that wants to read says so in the
 * envelope.
 */
export const EXPLICIT_ONLY = Object.freeze(["LIST", "GET"]);

export const DEFAULT_INTENT = "PREPARE";

/* Phrases that genuinely mean "make this public". Deliberately narrow: a
   near-miss costs one clarifying round trip, a false positive publishes
   something nobody approved. */
const PUBLISH_RE = /\b(publish|publier|mets?[- ]le en ligne|go live|make (it|this) (public|live))\b/i;
const PREVIEW_RE = /\b(preview|aperçu|show me|montre[- ]moi|how (would|will) it look|à quoi (ça|cela) ressemble)\b/i;
const UNPUBLISH_RE = /\b(unpublish|dépublier|take (it|this) down|retire[rz]?|remove (yesterday|the|this)|retirer)\b/i;
const ARCHIVE_RE = /\b(archive|archiver)\b/i;
const UPDATE_RE = /\b(update|mettre à jour|revise|corrige|fix the)\b/i;
const REPLACE_RE = /\b(replace|remplace)\b/i;

/**
 * Resolve an intent.
 *
 * `explicit` is an intent the client states in the command envelope and is
 * trusted when valid. `utterance` is what the Owner actually typed, used only
 * when no explicit intent was supplied.
 *
 * Returns `{ intent, source, confident }`. `confident` is false whenever the
 * corridor fell back to the default, which is what a caller should surface to
 * the Owner as "I prepared it, say the word to publish".
 */
export function resolveIntent({ explicit = null, utterance = "" } = {}) {
  if (explicit && INTENTS.includes(explicit)) {
    return { intent: explicit, source: "EXPLICIT", confident: true };
  }
  if (explicit && !INTENTS.includes(explicit)) {
    /* An unrecognised intent is NOT a reason to guess from the text —
       something is wrong with the client, so fall all the way back. */
    return { intent: DEFAULT_INTENT, source: "UNKNOWN_EXPLICIT", confident: false };
  }

  const text = String(utterance || "");
  /* Order matters: unpublish and archive are checked before publish, because
     "unpublish" contains "publish". */
  if (UNPUBLISH_RE.test(text)) return { intent: "UNPUBLISH", source: "UTTERANCE", confident: true };
  if (ARCHIVE_RE.test(text))   return { intent: "ARCHIVE",   source: "UTTERANCE", confident: true };
  if (REPLACE_RE.test(text))   return { intent: "REPLACE",   source: "UTTERANCE", confident: true };
  if (UPDATE_RE.test(text))    return { intent: "UPDATE",    source: "UTTERANCE", confident: true };
  if (PREVIEW_RE.test(text))   return { intent: "PREVIEW",   source: "UTTERANCE", confident: true };
  if (PUBLISH_RE.test(text))   return { intent: "PUBLISH",   source: "UTTERANCE", confident: true };

  return { intent: DEFAULT_INTENT, source: "DEFAULT", confident: false };
}
