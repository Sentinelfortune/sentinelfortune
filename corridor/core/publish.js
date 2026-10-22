/* SFL EDITORIAL CORRIDOR — the public editorial feed.
 *
 * ONE feed for all seven branches, in the SAME envelope the existing public
 * engine already reads (`sf.public-site/1.0`). The engine's identity router
 * decides which house displays a record; the corridor only states which house
 * owns it.
 *
 * That choice is what keeps "one engine" literally true: publishing editorial
 * content needs no new renderer, no new feed shape, no second website and no
 * hand-written page.
 *
 * WHAT NEVER CROSSES INTO THE PUBLIC FEED
 * ---------------------------------------
 *   audit, revisionHistory, rights, sourceClient, ownerInstructionId,
 *   ownerApproval, internal state
 *
 * Those are how the corridor is governed and audited. A visitor has no use
 * for them and a competitor has no business reading them.
 */

import { isPublic } from "../schema/states.js";
import { identityOf } from "./branches.js";
import { TYPE_LABEL, inLanguage, availableLanguages } from "../schema/record.js";
import { bestHero, publicMedium } from "./media.js";

export const FEED_SCHEMA = "sf.public-site/1.0";

/** Editorial CTA -> the engine's CTA vocabulary.
 *
 *  SUPPORT_THE_WORK maps to SUPPORT, which the engine treats as a free action.
 *  It is NOT mapped to BUY, and VIEW_PRODUCT is NOT mapped to BUY either — the
 *  corridor has no authority to put a price on anything, so it may never emit
 *  the action that implies one. */
const CTA_MAP = Object.freeze({
  READ_MORE: "READ",
  LISTEN: "LISTEN",
  WATCH: "WATCH",
  OPEN: "OPEN",
  SUPPORT_THE_WORK: "SUPPORT",
  VIEW_PRODUCT: "OPEN",
});

const CTA_LABEL = Object.freeze({
  READ_MORE: "Read", LISTEN: "Listen", WATCH: "Watch", OPEN: "Open",
  SUPPORT_THE_WORK: "Support the work", VIEW_PRODUCT: "See the product",
});

/**
 * One editorial record as the public engine consumes it.
 *
 * `pricingTier` is hardcoded FREE and no `price` key is ever emitted. The
 * corridor cannot express a price, so it cannot leak one.
 */
/** Every language other than the one rendered, in the engine's shape. */
function publicTranslations(record, renderedLang) {
  const out = {};
  for (const lang of availableLanguages(record)) {
    if (lang === renderedLang) continue;
    const t = inLanguage(record, lang);
    out[lang] = { title: t.title, summary: t.summary, description: t.body };
  }
  return out;
}

export function toPublicRecord(record, { language = null } = {}) {
  const lang = language || record.language;
  const text = inLanguage(record, lang);
  const hero = bestHero(record);

  const media = [];
  if (hero) media.push(publicMedium(hero));
  for (const m of record.media || []) {
    if (hero && m === hero) continue;
    const pm = publicMedium(m);
    if (pm) media.push(pm);
  }

  const out = {
    id: record.id,
    slug: record.slug,
    identity: identityOf(record.branch),
    type: record.presentationType,
    title: text.title,
    summary: text.summary,
    description: text.body,
    media,
    pricingTier: "FREE",          // editorial is free. Always.
    featured: record.featured === true,
    categories: record.topics,
    collections: record.collection ? [record.collection] : [],
    bundleMembership: [],
    publishedAt: record.publishedAt,
    publicationStatus: "PUBLIC_SITE",
    publicReadiness: { approved: true, withheld: false, approved_at: record.publishedAt },
    metadata: {
      editorialType: record.contentType,
      editorialLabel: TYPE_LABEL[record.contentType] || "Item",
      author: record.authorDisplay,
      languages: availableLanguages(record),
      /* The public engine's localization contract (platform/engine/renderers.js,
         localizedRecord): metadata.translations.<lang> = {title, summary,
         description}. Without it the EN/FR reader switch has nothing to show. */
      translations: publicTranslations(record, lang),
      corridor: true,
    },
  };

  if (record.cta && CTA_MAP[record.cta.type]) {
    out.cta = {
      kind: CTA_MAP[record.cta.type],
      label: record.cta.label || CTA_LABEL[record.cta.type],
      destination: record.cta.destination,
    };
  }
  return out;
}

/**
 * Build the whole public feed from the store.
 *
 * Only PUBLISHED records are included — and `isPublic()` is the single place
 * that decides, so DRAFT and PREVIEW cannot reach the feed through any route.
 * `expiresAt` is honoured here too: an expired record simply stops appearing.
 */
export function buildFeed(store, { now = () => Date.now(), evidence = "TEST_PREVIEW" } = {}) {
  const t = now();
  const records = store.all()
    .filter((r) => isPublic(r.status))
    .filter((r) => !r.publishAt || Date.parse(r.publishAt) <= t)
    .filter((r) => !r.expiresAt || Date.parse(r.expiresAt) > t)
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .map((r) => toPublicRecord(r));

  return {
    schema: FEED_SCHEMA,
    evidence,
    source: { system: "HOUSE_OF_ASSETS", channel: "SFL_EDITORIAL_CORRIDOR", generated_at: new Date(t).toISOString() },
    records,
  };
}

/** Everything a public record must NOT contain. Asserted by the tests. */
export const FORBIDDEN_PUBLIC_KEYS = Object.freeze([
  "audit", "revisionHistory", "rights", "sourceClient", "ownerInstructionId",
  "ownerApproval", "status", "price", "compareAtPrice", "checkoutUrl", "body",
]);
