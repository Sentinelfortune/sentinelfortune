/* Sentinel Fortune — SHARED UI PRIMITIVES.
 *
 * The components every branch uses, and the three states every branch must be
 * able to show honestly: loading, empty, error.
 *
 * SECURITY: nothing here ever assigns innerHTML from governed data. Every
 * string from the feed reaches the DOM through textContent. The feed is
 * trusted in the sense that House of Assets governs it, and untrusted in the
 * sense that a public runtime must not be one bad field away from script
 * execution. Both can be true, so the safe path is the only path.
 */

import { priceState, ctaState, showsPrice } from "./commerce.js";
import { cover } from "./visual.js";

/* ─────────────────────────────────────────────────────────────────────────
   ELEMENT HELPER
   ───────────────────────────────────────────────────────────────────────── */

/**
 * `h("div.card", { href }, [child, "text"])`
 *
 * Tag may carry classes: `"a.card.is-featured"`. Attributes whose value is
 * null/undefined/false are skipped, so a caller can pass a conditional
 * attribute without branching. Text children become text nodes, never markup.
 */
export function h(spec, attrs = null, children = null) {
  const [tag, ...classes] = String(spec).split(".");
  const el = document.createElement(tag || "div");
  if (classes.length) el.className = classes.join(" ");

  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = `${el.className} ${v}`.trim();
      else if (k === "text") el.textContent = String(v);
      else if (k === "dataset") for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = String(dv);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }

  for (const child of flatten(children)) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function flatten(c) {
  if (c === null || c === undefined) return [];
  return Array.isArray(c) ? c.flat(Infinity) : [c];
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/**
 * Append children to a real DOM node, DROPPING the absent ones.
 *
 * This exists because of a production defect. `clear(app()).append(a, b, c)`
 * calls the NATIVE `Element.append`, which stringifies anything that is not a
 * Node — so a conditional child written as `cond ? node : null` appends the
 * literal text "null". It sat first in the shell, so it rendered as the word
 * null in the top-left corner of every page.
 *
 * `h()` has always filtered absent children, which is why the same idiom is
 * safe everywhere else in this engine and why the bug stayed hidden: the one
 * ternary that fed a native append had a condition that was never false in
 * production until the preview banner became environment-scoped.
 *
 * Use this for every append onto a raw node. Never call native append with a
 * conditional child.
 */
export function appendAll(node, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === "") continue;
    node.append(child);
  }
  return node;
}

/* ─────────────────────────────────────────────────────────────────────────
   THE THREE HONEST STATES
   ───────────────────────────────────────────────────────────────────────── */

export function loadingState(what = "Loading") {
  return h("div.sf-state.sf-state--loading", { role: "status", "aria-live": "polite" }, [
    h("span.sf-spinner", { "aria-hidden": "true" }),
    h("p.sf-state-text", { text: `${what}…` }),
  ]);
}

/**
 * Empty, and specific about WHY.
 *
 * "Nothing here yet" is a design failure when the real reason is knowable. A
 * branch with no published records and a branch whose filter matched nothing
 * are different situations and the visitor can act on the difference.
 */
export function emptyState({ title, body, action = null } = {}) {
  return h("div.sf-state.sf-state--empty", null, [
    h("p.sf-state-h", { text: title || "Nothing published here yet" }),
    h("p.sf-state-text", { text: body || "" }),
    action ? h("a.sf-btn", { href: action.href, text: action.label }) : null,
  ]);
}

/**
 * Error, with the reason and a way out.
 *
 * Shows the machine-readable cause, because a visitor reporting "it says
 * HTTP 404" is far more useful than one reporting "it didn't work" — and
 * because hiding the cause does not make it go away.
 */
export function errorState({ detail, onRetry = null } = {}) {
  return h("div.sf-state.sf-state--error", { role: "alert" }, [
    h("p.sf-state-h", { text: "This did not load" }),
    h("p.sf-state-text", {
      text: "The catalogue could not be read, so nothing is shown rather than something stale.",
    }),
    detail ? h("p.sf-state-detail", { text: detail }) : null,
    onRetry ? h("button.sf-btn", { type: "button", onclick: onRetry, text: "Try again" }) : null,
  ]);
}

/**
 * The environment banner — for NON-PRODUCTION hosts only.
 *
 * It used to render wherever the feed was not LIVE, which meant the public
 * production ecosystem described itself as a draft. A global draft banner is
 * the wrong instrument for that: it says nothing about any particular item
 * while making everything look provisional.
 *
 * The truth did not get dropped, it got moved. `demoBadge` carries it per
 * record, so a fixture is still marked a fixture on a production host and a
 * real artefact is no longer tarred with it. This banner now says only what
 * it can honestly say globally: which ENVIRONMENT you are looking at.
 */
export function previewNotice(generatedAt) {
  return h("div.sf-preview", { role: "note" }, [
    h("strong", { text: "Preview environment" }),
    " — not the public production site. Items marked Demo are fixtures, not real inventory.",
    generatedAt ? h("span.sf-preview-at", { text: ` Feed generated ${generatedAt}.` }) : null,
  ]);
}

/**
 * ITEM-LEVEL TRUTH. A record that has not declared itself a real artefact is
 * labelled, on every host including production, wherever it appears.
 *
 * This is what makes removing the global banner honest rather than merely
 * tidier: the claim becomes narrower and more accurate at the same time.
 */
export function demoBadge(record) {
  if (!record || record.demo !== true) return null;
  return h("span.sf-demo", { title: "Example content — not real inventory", text: "Demo" });
}

/* ─────────────────────────────────────────────────────────────────────────
   COMMERCIAL COMPONENTS — one implementation, seven branches
   ───────────────────────────────────────────────────────────────────────── */

/**
 * The price. Rendered by the shared heart, never by a branch.
 *
 * UNPRICED with a free action renders NOTHING rather than a placeholder: there
 * is genuinely nothing to say, and "—" invites the reader to wonder.
 */
export function priceTag(record, { suppressIfCtaSaysIt = false } = {}) {
  const money = priceState(record);
  if (!showsPrice(record)) return null;

  /* A disabled BUY already explains the price situation in its own note.
     Rendering the tag as well printed "Price not published yet" twice, side by
     side — each correct alone, a stutter together. */
  if (suppressIfCtaSaysIt && money.state === "UNPRICED") {
    const cta = ctaState(record);
    if (!cta.enabled && cta.kind === "BUY") return null;
  }

  if (money.state === "FREE") return h("p.sf-price.sf-price--free", { text: "Free" });

  if (money.state === "PAID") {
    return h("p.sf-price", null, [
      h("span.sf-price-now", { text: money.label }),
      money.compareAt
        ? h("span.sf-price-was", {
            text: new Intl.NumberFormat("en-US", { style: "currency", currency: money.compareAt.currency, maximumFractionDigits: 2 }).format(money.compareAt.amount),
          })
        : null,
    ]);
  }
  return h("p.sf-price.sf-price--tbc", { text: "Price not published yet" });
}

/**
 * The one button.
 *
 * A disabled CTA renders as TEXT, not as a greyed-out button. A button that
 * looks pressable and is not is worse than a sentence saying why.
 */
/** Price and action together, without either repeating the other. Every detail
 *  page uses this rather than placing the two components by hand. */
export function actionRow(record) {
  return h("div.sf-detail-act", null, [
    priceTag(record, { suppressIfCtaSaysIt: true }),
    ctaButton(record),
  ]);
}

export function ctaButton(record, { primary = true } = {}) {
  const cta = ctaState(record);
  if (!cta.enabled) return h("p.sf-cta-note", { text: cta.note });

  return h(`a.sf-btn${primary ? ".sf-btn--primary" : ""}`, {
    href: cta.href,
    target: cta.external ? "_blank" : null,
    rel: cta.external ? "noopener noreferrer" : null,
    dataset: { ctaKind: cta.kind },
  }, [cta.label, cta.external ? h("span.sf-ext", { "aria-hidden": "true", text: "↗" }) : null]);
}

/**
 * A record card. ONE implementation for all seven branches — what differs per
 * branch is the CSS the branch's theme applies to it, and the optional
 * `badge`/`meta` a specialized renderer passes in.
 *
 * The whole card is not a link: the title is. A card-sized anchor swallows
 * text selection and makes the real action ambiguous when the card also
 * carries a buy button.
 */
export function recordCard(record, href, { badge = null, meta = null, identity = null, ratio = "3 / 2", eager = false } = {}) {
  /* EVERY card carries artwork. Governed imagery when it exists, deliberate
     generated art when it does not — never an absent image and never a grey
     box. A catalogue of text-only cards is the failure mode this replaces. */
  return h("article.sf-card", { dataset: { type: record.type, slug: record.slug } }, [
    h("a.sf-card-cover", { href, tabindex: "-1", "aria-hidden": "true" },
      [cover(record, identity || record.identity, { ratio, eager })]),
    h("div.sf-card-body", null, [
      badge ? h("p.sf-card-badge", { text: badge }) : null,
      demoBadge(record),
      h("h3.sf-card-title", null, [h("a", { href, text: record.title })]),
      record.summary ? h("p.sf-card-sum", { text: record.summary }) : null,
      meta ? h("p.sf-card-meta", { text: meta }) : null,
      h("div.sf-card-foot", null, [priceTag(record), ctaButton(record, { primary: false })]),
    ]),
  ]);
}

/** A grid of cards, or a specific empty state. Never an empty grid. */
export function cardGrid(records, hrefFor, emptyOpts, cardOpts = {}) {
  if (!records.length) return emptyState(emptyOpts);
  return h("div.sf-grid", null, records.map((r, i) => {
    const opts = typeof cardOpts === "function" ? cardOpts(r) : { ...cardOpts };
    /* The first row is above the fold on most viewports, so it loads eagerly;
       everything after it is lazy. Explicit aspect ratios mean neither choice
       can shift the layout. */
    return recordCard(r, hrefFor(r), { eager: i < 3, ...opts });
  }));
}

/** A labelled section. Shared so section rhythm is identical across branches. */
export function section(title, { kicker = null, sub = null, body = null, id = null } = {}) {
  const headingId = id ? `${id}-h` : null;
  return h("section.sf-section", { id, "aria-labelledby": headingId }, [
    kicker ? h("p.sf-kicker", { text: kicker }) : null,
    h("h2.sf-section-h", { id: headingId, text: title }),
    sub ? h("p.sf-section-sub", { text: sub }) : null,
    body,
  ]);
}

/** Chip row for categories and collections. */
export function chips(items, hrefFor) {
  if (!items.length) return null;
  return h("ul.sf-chips", null, items.map((it) =>
    h("li", null, [h("a.sf-chip", { href: hrefFor(it), text: `${it.name} (${it.count})` })])));
}
