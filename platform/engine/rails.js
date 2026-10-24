/* Sentinel Fortune — DISCOVERY RAILS.
 *
 * The horizontal discovery mechanic streaming platforms made familiar, built
 * once and reused by all seven houses. A rail is a labelled, scrollable row of
 * cards with honest arrows, real keyboard support and native touch scrolling.
 *
 * THREE RULES THAT ARE NOT NEGOTIABLE HERE
 * ----------------------------------------
 * 1. AN EMPTY RAIL NEVER RENDERS. `rail()` returns null rather than an empty
 *    row, so a house with little content shows fewer rails rather than a page
 *    of empty shelves.
 *
 * 2. A RAIL LABEL IS A CLAIM. "New" asserts recency, so it may only be built
 *    from governed publication dates. There is no "Trending" and no "Popular"
 *    anywhere in this file, because no usage data exists to support either —
 *    and inventing one is the easiest lie a discovery surface can tell.
 *
 * 3. NOTHING ESSENTIAL HIDES BEHIND HOVER. The arrows are a convenience over
 *    scrolling that already works by touch, wheel and keyboard; the card's
 *    action is always visible on the card.
 */

import { h, recordCard } from "./ui.js";

/* ─────────────────────────────────────────────────────────────────────────
   THE RAIL COMPONENT
   ───────────────────────────────────────────────────────────────────────── */

let railSeq = 0;

/**
 * One discovery rail, or null when there is nothing to show.
 *
 * @param {object}   opts
 * @param {string}   opts.title     the shelf label — a claim, so keep it true
 * @param {string}   [opts.kicker]  small line above the title
 * @param {string}   [opts.note]    one line explaining WHY these items (used
 *                                  by "Recommended", which must say that it is
 *                                  rule-based rather than personalised)
 * @param {Array}    opts.records   governed records, already filtered/sorted
 * @param {Function} opts.hrefFor   record -> href
 * @param {Function} [opts.cardOpts]
 */
export function rail({ title, kicker = null, note = null, records, hrefFor, cardOpts = null, id = null }) {
  if (!records || records.length === 0) return null;        // rule 1

  const railId = id || `rail-${++railSeq}`;
  const headingId = `${railId}-h`;

  const track = h("ul.sf-rail-track", {
    id: `${railId}-track`,
    tabindex: "0",
    role: "list",
    "aria-labelledby": headingId,
  }, records.map((r) => {
    const opts = typeof cardOpts === "function" ? cardOpts(r) : (cardOpts || {});
    return h("li.sf-rail-item", null, [recordCard(r, hrefFor(r), opts)]);
  }));

  const prev = h("button.sf-rail-nav.sf-rail-prev", {
    type: "button", "aria-label": `Scroll ${title} backwards`,
    "aria-controls": `${railId}-track`, hidden: true,
  }, ["‹"]);
  const next = h("button.sf-rail-nav.sf-rail-next", {
    type: "button", "aria-label": `Scroll ${title} forwards`,
    "aria-controls": `${railId}-track`, hidden: true,
  }, ["›"]);

  const section = h("section.sf-rail", { "aria-labelledby": headingId, dataset: { rail: railId } }, [
    h("header.sf-rail-head", null, [
      h("div.sf-rail-titles", null, [
        kicker ? h("p.sf-kicker", { text: kicker }) : null,
        h("h2.sf-rail-h", { id: headingId, text: title }),
        note ? h("p.sf-rail-note", { text: note }) : null,
      ]),
      h("div.sf-rail-navs", null, [prev, next]),
    ]),
    track,
  ]);

  wireRail(track, prev, next);
  return section;
}

/**
 * Scrolling behaviour.
 *
 * Touch and wheel already work — the track is an ordinary overflow container,
 * which is why this stays small. What is added: arrows that appear ONLY when
 * there is somewhere to scroll, and arrow-key support once the track has
 * focus.
 *
 * `scroll-behavior` is left to CSS so the reduced-motion media query can turn
 * smooth scrolling off without this file knowing anything about it.
 */
function wireRail(track, prev, next) {
  const page = () => Math.max(track.clientWidth * 0.8, 200);

  function sync() {
    const scrollable = track.scrollWidth - track.clientWidth > 4;
    const atStart = track.scrollLeft <= 2;
    const atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    /* Hidden rather than disabled: a control that can never do anything on
       this viewport should not be in the tab order at all. */
    prev.hidden = !scrollable || atStart;
    next.hidden = !scrollable || atEnd;
    track.dataset.scrollable = String(scrollable);
  }

  prev.addEventListener("click", () => track.scrollBy({ left: -page(), behavior: "smooth" }));
  next.addEventListener("click", () => track.scrollBy({ left: page(), behavior: "smooth" }));
  track.addEventListener("scroll", sync, { passive: true });

  track.addEventListener("keydown", (ev) => {
    /* Only when the track itself has focus. A card inside it owns its own keys. */
    if (ev.target !== track) return;
    if (ev.key === "ArrowRight") { ev.preventDefault(); track.scrollBy({ left: page(), behavior: "smooth" }); }
    else if (ev.key === "ArrowLeft") { ev.preventDefault(); track.scrollBy({ left: -page(), behavior: "smooth" }); }
    else if (ev.key === "Home") { ev.preventDefault(); track.scrollTo({ left: 0, behavior: "smooth" }); }
    else if (ev.key === "End") { ev.preventDefault(); track.scrollTo({ left: track.scrollWidth, behavior: "smooth" }); }
  });

  /* Re-evaluate when the viewport changes: a rail that fits on a desktop may
     need arrows on a narrow window and vice versa. */
  if (typeof ResizeObserver === "function") new ResizeObserver(sync).observe(track);
  requestAnimationFrame(sync);
}

/* ─────────────────────────────────────────────────────────────────────────
   HONEST RAIL BUILDERS
   ───────────────────────────────────────────────────────────────────────── */
/* Each returns records or an empty array. The label each one earns is in its
   name, and none of them can produce a claim the data does not support.      */

/** Governed featured flag. */
export function featuredRecords(pool, limit = 10) {
  return pool.filter((r) => r.featured).slice(0, limit);
}

/**
 * Newest first — but ONLY among records carrying a governed publication date.
 *
 * A record with no date is excluded rather than sorted to one end. With no
 * dated records at all this returns [], the rail does not render, and no
 * recency is implied. That is the whole safeguard.
 */
export function newestRecords(pool, limit = 10) {
  return pool
    .filter((r) => r.publishedAt)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit);
}

/** Everything free to explore. */
export function freeRecords(pool, limit = 12) {
  return pool.filter((r) => r.pricingTier === "FREE").slice(0, limit);
}

/** Everything with a governed price. */
export function paidRecords(pool, limit = 12) {
  return pool.filter((r) => r.pricingTier === "PAID" && r.price).slice(0, limit);
}

/** One content type — the "Courses", "Tools", "Series" style shelf. */
export function typeRecords(pool, type, limit = 12) {
  return pool.filter((r) => r.type === type).slice(0, limit);
}

/** One collection. */
export function collectionRecords(pool, name, limit = 12) {
  return pool.filter((r) => r.collections.includes(name)).slice(0, limit);
}

/**
 * Rule-based suggestions, seeded by what the visitor has actually opened.
 *
 * NOT personalisation and never labelled as such: it is "because you opened X"
 * computed on this device from local history, using the same governed
 * relationships the detail pages use. With no history it returns [], so the
 * rail disappears rather than pretending to know the visitor.
 */
export function recommendedRecords(pool, seedSlugs, relatedTo, limit = 10) {
  if (!seedSlugs || !seedSlugs.length) return [];
  const seen = new Set(seedSlugs);
  const out = [];
  const taken = new Set();
  for (const slug of seedSlugs) {
    const seed = pool.find((r) => r.slug === slug);
    if (!seed) continue;
    for (const rec of relatedTo(seed, pool, 4)) {
      if (seen.has(rec.slug) || taken.has(rec.slug)) continue;
      taken.add(rec.slug);
      out.push(rec);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
