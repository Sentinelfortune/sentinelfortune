/* Sentinel Fortune — SHARED COMMERCIAL HEART.
 *
 * One commercial layer for all seven branches:
 *
 *   DISCOVER -> UNDERSTAND -> EVALUATE -> ACCESS/BUY -> DELIVERY/USE -> RELATED
 *
 * No branch implements any of this. A branch decides how a release or a course
 * LOOKS; it never decides what something costs, whether it is free, what the
 * button says, or where the button goes. Those answers come from here, and
 * here reads them from the governed record.
 *
 * Pure functions. No DOM, no fetch.
 */

import { governedPrice, governedCompareAt, CTA_KINDS } from "./core.js";

/** Default CTA wording per governed action. A record may override the label;
 *  it may not override the KIND, because the kind decides the behaviour. */
const DEFAULT_LABEL = Object.freeze({
  OPEN: "Open",
  LISTEN: "Listen",
  WATCH: "Watch",
  READ: "Read",
  BUY: "Buy",
  DOWNLOAD: "Download",
  LEARN: "Start learning",
  SUPPORT: "Support the work",
});

/** Actions that do not involve payment. Used to decide whether a price has to
 *  be shown beside the button at all. */
const FREE_ACTIONS = Object.freeze(["OPEN", "LISTEN", "WATCH", "READ", "DOWNLOAD", "LEARN", "SUPPORT"]);

/* ─────────────────────────────────────────────────────────────────────────
   PRICE STATE
   ───────────────────────────────────────────────────────────────────────── */

/**
 * What commercial state is this record in?
 *
 *   FREE       governed as free to use — no payment anywhere in the flow
 *   PAID       carries a governed price
 *   UNPRICED   neither. The honest third state, and the reason this returns
 *              three values rather than a boolean: a record whose price has
 *              not been decided must not be rendered as free.
 *
 * `pricingTier: "FREE"` is what makes something free. The ABSENCE of a price
 * never does — that is the bug this function exists to prevent.
 */
export function priceState(record) {
  const price = governedPrice(record);

  if (record.pricingTier === "FREE") {
    return { state: "FREE", label: "Free", price: null, compareAt: null };
  }
  if (price) {
    return {
      state: "PAID",
      label: formatMoney(price.amount, price.currency),
      price,
      compareAt: governedCompareAt(record),
    };
  }
  return { state: "UNPRICED", label: null, price: null, compareAt: null };
}

/** USD, no cents when the amount is whole. `224` reads as $224, not $224.00 —
 *  trailing zeroes on a round price look like a form field, not a price. */
export function formatMoney(amount, currency = "USD") {
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${whole ? amount : amount.toFixed(2)}`;
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   CTA STATE
   ───────────────────────────────────────────────────────────────────────── */

/**
 * The one button.
 *
 * Returns `{ enabled, kind, label, href, external, note }`. When there is no
 * governed action it returns `enabled: false` with a `note` a visitor can
 * actually read — never a dead button and never an invented one.
 *
 * A BUY whose price is unknown is refused on purpose: a buy button with no
 * price is the single worst commercial state a storefront can be in, and
 * refusing it here means no branch can produce it by accident.
 */
export function ctaState(record) {
  const money = priceState(record);
  const cta = record.cta;

  if (!cta) {
    return {
      enabled: false,
      kind: null,
      label: null,
      href: null,
      external: false,
      note: "Not yet available.",
    };
  }
  if (!CTA_KINDS.includes(cta.kind)) {
    return { enabled: false, kind: null, label: null, href: null, external: false, note: "Not yet available." };
  }
  if (cta.kind === "BUY" && money.state !== "PAID") {
    return {
      enabled: false,
      kind: "BUY",
      label: null,
      href: null,
      external: false,
      note: "Price not published yet.",
    };
  }

  const label = cta.label || DEFAULT_LABEL[cta.kind];
  return {
    enabled: true,
    kind: cta.kind,
    label: cta.kind === "BUY" && money.state === "PAID" ? `${label} · ${money.label}` : label,
    href: cta.destination,
    external: cta.external === true,
    note: null,
  };
}

/** Does the visitor need to see a price next to this action? A free action
 *  with no price is complete as it stands; a paid one is not. */
export function showsPrice(record) {
  const money = priceState(record);
  if (money.state === "PAID") return true;
  if (money.state === "FREE") return true;         // "Free" is information
  const cta = record.cta;
  return !(cta && FREE_ACTIONS.includes(cta.kind)); // UNPRICED + free action: nothing to say
}

/* ─────────────────────────────────────────────────────────────────────────
   RELATED OFFER — the last step of the commercial flow
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Related items, scored within the SAME identity only.
 *
 * Cross-identity recommendation is deliberately impossible here: `pool` is
 * already filtered to one house by core.selectPublic, and this function never
 * widens it. A visitor in the record label is not shown a course.
 *
 * Scoring is shared collections first, then categories, then same type, then
 * featured. Deterministic ties broken by slug so the order never flickers
 * between loads.
 */
export function relatedTo(record, pool, limit = 3) {
  const scored = [];
  for (const other of pool) {
    if (other.id === record.id) continue;
    let score = 0;
    score += overlap(record.collections, other.collections) * 5;
    score += overlap(record.categories, other.categories) * 3;
    if (other.type === record.type) score += 2;
    if (other.featured) score += 1;
    if (score > 0) scored.push({ other, score });
  }
  scored.sort((a, b) => (b.score - a.score) || a.other.slug.localeCompare(b.other.slug));
  return scored.slice(0, limit).map((s) => s.other);
}

function overlap(a, b) {
  if (!a.length || !b.length) return 0;
  const set = new Set(a);
  let n = 0;
  for (const x of b) if (set.has(x)) n++;
  return n;
}

/** Bundles this record belongs to, resolved out of the same identity's pool. */
export function bundlesContaining(record, pool) {
  if (!record.bundleMembership.length) return [];
  const want = new Set(record.bundleMembership);
  return pool.filter((p) => p.type === "BUNDLE" && want.has(p.slug));
}

/* ─────────────────────────────────────────────────────────────────────────
   BROWSE SURFACES — shared discovery, specialized presentation
   ───────────────────────────────────────────────────────────────────────── */

/** Featured first, then everything, deterministic. What a branch renders as a
 *  hero carousel and another renders as a single spotlight both start here. */
export function featured(pool, limit = 4) {
  return pool.filter((r) => r.featured).sort(bySlug).slice(0, limit);
}

export function byType(pool, type) {
  return pool.filter((r) => r.type === type).sort(bySlug);
}

/** Every category present in this identity's public pool, with counts. Derived
 *  from the records rather than configured, so a category cannot exist as an
 *  empty navigation item that leads nowhere. */
export function categoryIndex(pool) {
  return indexBy(pool, (r) => r.categories);
}

export function collectionIndex(pool) {
  return indexBy(pool, (r) => r.collections);
}

function indexBy(pool, pick) {
  const counts = new Map();
  for (const r of pool) for (const key of pick(r)) counts.set(key, (counts.get(key) || 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
}

/** Free and paid, split. Every branch has to tell a visitor which is which. */
export function splitByCost(pool) {
  const free = [];
  const paid = [];
  for (const r of pool) {
    const s = priceState(r).state;
    if (s === "FREE") free.push(r);
    else if (s === "PAID") paid.push(r);
  }
  return { free: free.sort(bySlug), paid: paid.sort(bySlug) };
}

/** Plain substring search over the fields a visitor can actually see. No
 *  index, no ranking cleverness: at MVP scale a linear scan is instant and
 *  has no failure mode. */
export function search(pool, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return pool.slice().sort(bySlug);
  return pool
    .filter((r) =>
      r.title.toLowerCase().includes(q) ||
      r.summary.toLowerCase().includes(q) ||
      r.categories.some((c) => c.toLowerCase().includes(q)) ||
      r.collections.some((c) => c.toLowerCase().includes(q)))
    .sort(bySlug);
}

function bySlug(a, b) {
  return a.slug.localeCompare(b.slug);
}
