/* Sentinel Fortune — SHARED CORE.
 *
 * The rules all seven identities obey. Deliberately boring and deterministic:
 * no fetching, no DOM, no formatting, no identity-specific behaviour. Pure
 * functions over plain records, so every rule below is testable without a
 * browser and without a network.
 *
 * THE CORE IS THE ONLY PLACE THESE RULES LIVE. A branch that wanted its own
 * notion of "public" or its own price would have to go around this file, and
 * going around it is the bug.
 */

/** The seven identities. This list is closed: an unknown identity is refused,
 *  never defaulted, because defaulting would publish a record into a house
 *  that does not own it. */
export const IDENTITIES = Object.freeze([
  "sentinelfortunerecords",
  "codexworldtv",
  "lumengame",
  "lumenschoolacademy",
  "vibraflowmedia",
  "lightnodesystems",
  "oglegacystore",
]);

/** Content types the engine can present. Each maps to exactly one specialized
 *  renderer — see engine/renderers.js. An unknown type is refused rather than
 *  falling back to a generic detail page: a generic page for everything is the
 *  thing this architecture exists to avoid. */
export const TYPES = Object.freeze([
  "MUSIC_RELEASE",
  "STORY",
  "GAME",
  "COURSE",
  "TEACHING",
  "SOFTWARE",
  "BOOK",
  "PODCAST",
  "BUNDLE",
]);

/** Commercial actions a governed record may ask for. Closed set: a CTA the
 *  core does not know is refused, so House of Assets cannot be made to render
 *  an action this runtime has not implemented. */
export const CTA_KINDS = Object.freeze([
  "OPEN",      // use a hosted application / play / read on this site
  "LISTEN",    // play governed audio
  "WATCH",     // play governed video
  "READ",      // open governed long-form
  "BUY",       // hand off to the Digital Shop
  "DOWNLOAD",  // governed free download
  "LEARN",     // start a course / path
  "SUPPORT",   // voluntary support for free editorial work — NOT a purchase
]);

/** Hosts a governed destination may point at. Everything else is refused.
 *  This is what stops a feed — or a mistake — putting a localhost URL, or
 *  somebody else's domain, in front of the public. */
export const ALLOWED_DESTINATION_HOSTS = Object.freeze([
  "sentinelfortune.com",
  "sentinelfortunerecords.sentinelfortune.com",
  "codexworldtv.sentinelfortune.com",
  "lumengame.sentinelfortune.com",
  "lumenschoolacademy.sentinelfortune.com",
  "vibraflowmedia.sentinelfortune.com",
  "lightnodesystems.sentinelfortune.com",
  "oglegacystore.sentinelfortune.com",
  "sentinelfortune.github.io",
]);

export function isIdentity(value) {
  return IDENTITIES.includes(value);
}

export function isType(value) {
  return TYPES.includes(value);
}

/* ─────────────────────────────────────────────────────────────────────────
   PUBLIC READINESS
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Is this record allowed to be seen by the public?
 *
 * Three independent conditions, ALL required. They are separate because they
 * fail for different reasons and a caller may need to know which:
 *
 *   publicationStatus === "PUBLIC_SITE"   House of Assets routed it here
 *   publicReadiness.approved === true      a human approved the publication
 *   publicReadiness.withheld !== true      nothing has pulled it back since
 *
 * `approved` must be boolean true. A truthy "yes" or 1 is refused, exactly as
 * the shop publication bridge refuses them: a string is not a decision.
 */
export function publicReadiness(record) {
  const problems = [];
  if (!record || typeof record !== "object") return { public: false, problems: ["record is not an object"] };

  if (record.publicationStatus !== "PUBLIC_SITE") {
    problems.push(`publicationStatus is ${JSON.stringify(record.publicationStatus)}, not "PUBLIC_SITE"`);
  }
  const r = record.publicReadiness;
  if (!r || typeof r !== "object") {
    problems.push("publicReadiness block is missing");
  } else {
    if (r.approved !== true) problems.push("publicReadiness.approved is not boolean true");
    if (r.withheld === true) problems.push("publicReadiness.withheld is true");
  }
  if (!isIdentity(record.identity)) problems.push(`identity ${JSON.stringify(record.identity)} is not one of the seven`);
  if (!isType(record.type)) problems.push(`type ${JSON.stringify(record.type)} has no renderer`);
  if (!record.slug || typeof record.slug !== "string") problems.push("slug is missing");
  if (!record.title || typeof record.title !== "string") problems.push("title is missing");

  return { public: problems.length === 0, problems };
}

/* ─────────────────────────────────────────────────────────────────────────
   PRICING AUTHORITY
   ───────────────────────────────────────────────────────────────────────── */

/**
 * The governed price, or null.
 *
 * There is NO local default and NO fallback. A record that does not carry a
 * price has no price, and the commercial heart renders that honestly rather
 * than inventing "Free" or "Contact us". Inventing either would be a
 * commercial claim this runtime has no authority to make.
 *
 * `amount` is in major units with at most two decimals, matching
 * hoa.shop-publication/1.0. It is read through the string form, so a value
 * with no exact cents representation is refused rather than silently rounded.
 */
export function governedPrice(record) {
  const p = record && record.price;
  if (p === null || p === undefined) return null;
  if (typeof p !== "object") return null;

  const { amount, currency } = p;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
  if (currency !== "USD") return null;               // only what the storefront can format
  const cents = Math.round(amount * 100);
  if (String(cents / 100) !== String(amount)) return null;  // 224.999 → refused
  return { amount, currency, cents };
}

/** A compare-at price only counts when it is governed AND strictly above the
 *  real price. A "was" that is not higher is not a saving, it is decoration. */
export function governedCompareAt(record) {
  const price = governedPrice(record);
  if (!price) return null;
  const c = record.compareAtPrice;
  if (!c || typeof c !== "object") return null;
  if (typeof c.amount !== "number" || !Number.isFinite(c.amount)) return null;
  if (c.currency !== price.currency) return null;
  if (!(c.amount > price.amount)) return null;
  return { amount: c.amount, currency: c.currency };
}

/* ─────────────────────────────────────────────────────────────────────────
   DESTINATIONS
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Validate a governed destination.
 *
 * Accepts a site-relative path, or an absolute https URL on an allowed host.
 * Refuses everything else — notably http, and notably any localhost or
 * 127.0.0.1 address, which must never reach a public link no matter how it
 * got into the feed.
 */
export function governedDestination(value) {
  if (typeof value !== "string" || value.length === 0) return null;

  if (value.startsWith("/") && !value.startsWith("//")) return { href: value, external: false };

  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (!ALLOWED_DESTINATION_HOSTS.includes(url.hostname)) return null;
  return { href: url.toString(), external: true };
}

/* ─────────────────────────────────────────────────────────────────────────
   NORMALIZATION + SELECTION
   ───────────────────────────────────────────────────────────────────────── */

/** One canonical public record. Unknown keys are dropped rather than carried
 *  through: a field the engine does not understand cannot be rendered, and
 *  letting it ride along invites someone to render it later without a rule. */
export function normalize(record) {
  const price = governedPrice(record);
  return Object.freeze({
    id: String(record.id),
    slug: String(record.slug),
    identity: record.identity,
    type: record.type,
    title: String(record.title),
    summary: record.summary ? String(record.summary) : "",
    description: record.description ? String(record.description) : "",
    media: Object.freeze(Array.isArray(record.media) ? record.media.map(normalizeMedium).filter(Boolean) : []),
    price,
    compareAtPrice: governedCompareAt(record),
    pricingTier: record.pricingTier === "FREE" || record.pricingTier === "PAID" ? record.pricingTier : null,
    cta: normalizeCta(record.cta),
    featured: record.featured === true,
    categories: Object.freeze(stringList(record.categories)),
    collections: Object.freeze(stringList(record.collections)),
    bundleMembership: Object.freeze(stringList(record.bundleMembership)),
    /* Governed publication date. A "New" or "Recently added" rail is an
       ordering CLAIM, so it may only come from a real date House of Assets
       supplied. When this is null the rail does not render at all rather than
       falling back to feed order, which would be an invented recency. */
    publishedAt: isoDate(record.publishedAt),
    publicationStatus: record.publicationStatus,
    publicReadiness: Object.freeze({ ...record.publicReadiness }),
    metadata: Object.freeze(record.metadata && typeof record.metadata === "object" ? { ...record.metadata } : {}),
  });
}

/** An ISO date, or null. A malformed date is refused rather than coerced:
 *  "soon" must never sort as a timestamp. */
function isoDate(v) {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? v : null;
}

function stringList(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.length > 0) : [];
}

function normalizeMedium(m) {
  if (!m || typeof m !== "object") return null;
  const kind = ["IMAGE", "AUDIO", "VIDEO", "EMBED"].includes(m.kind) ? m.kind : null;
  if (!kind) return null;
  const src = governedDestination(m.src);
  if (!src) return null;
  /* THE THREE PUBLICATION ROLES.
     ATTENTION the cover that earns a look
     VALUE     the human or real-use scene that says why this matters
     DISCOVERY the collection visual that invites going deeper
     An unknown or absent role is null rather than guessed, so a record with
     unroled media behaves exactly as it did before roles existed. */
  const role = ["ATTENTION", "VALUE", "DISCOVERY"].includes(m.role) ? m.role : null;
  return Object.freeze({
    kind, role,
    src: src.href,
    alt: m.alt ? String(m.alt) : "",
    poster: m.poster ? String(m.poster) : "",
  });
}

/** A CTA survives only if its kind is known AND its destination is allowed.
 *  A half-valid CTA becomes null, and the commercial heart then says plainly
 *  that there is no action rather than rendering a button that goes nowhere. */
function normalizeCta(cta) {
  if (!cta || typeof cta !== "object") return null;
  if (!CTA_KINDS.includes(cta.kind)) return null;
  const dest = governedDestination(cta.destination);
  if (!dest) return null;
  return Object.freeze({
    kind: cta.kind,
    label: cta.label ? String(cta.label) : null,
    destination: dest.href,
    external: dest.external,
  });
}

/**
 * The one ingestion gate. Everything public passes through here.
 *
 * Returns the records that are public AND owned by `identity`, plus the ones
 * that were rejected and why. The rejects are not thrown away because they are
 * the evidence that governance is working — a test asserts on them, and the
 * acceptance gate for "wrong identity data is hidden" reads them.
 */
export function selectPublic(records, identity) {
  if (!isIdentity(identity)) throw new Error(`selectPublic: unknown identity ${JSON.stringify(identity)}`);
  const accepted = [];
  const rejected = [];
  for (const raw of Array.isArray(records) ? records : []) {
    const readiness = publicReadiness(raw);
    if (!readiness.public) {
      rejected.push({ id: raw && raw.id, reason: "NOT_PUBLIC", problems: readiness.problems });
      continue;
    }
    if (raw.identity !== identity) {
      // Not an error — it belongs to another house. Recorded so a test can
      // prove no cross-identity leakage rather than assuming it.
      rejected.push({ id: raw.id, reason: "OTHER_IDENTITY", identity: raw.identity });
      continue;
    }
    accepted.push(normalize(raw));
  }
  return { accepted, rejected };
}

/**
 * The SAME gate, for the Sentinel Fortune homepage.
 *
 * The homepage is the one surface that legitimately shows all seven worlds at
 * once, so it needs selection WITHOUT the identity filter — but it must not get
 * that by relaxing readiness. This calls `publicReadiness()` exactly as
 * `selectPublic()` does; the only difference is that belonging to another world
 * is not a rejection here, because every world is this surface's subject.
 *
 * Returns `{ accepted, rejected, byIdentity }`. `byIdentity` is keyed by all
 * seven identities and is always complete — a world with nothing published maps
 * to an empty array rather than being absent, so the homepage renders seven
 * boards whatever the feed happens to contain.
 */
export function selectAllPublic(records) {
  const accepted = [];
  const rejected = [];
  const byIdentity = Object.fromEntries(IDENTITIES.map((id) => [id, []]));

  for (const raw of Array.isArray(records) ? records : []) {
    const readiness = publicReadiness(raw);
    if (!readiness.public) {
      rejected.push({ id: raw && raw.id, reason: "NOT_PUBLIC", problems: readiness.problems });
      continue;
    }
    const record = normalize(raw);
    accepted.push(record);
    byIdentity[record.identity].push(record);
  }
  return { accepted, rejected, byIdentity };
}
