/* Sentinel Fortune — THE PUBLIC HOMEPAGE.
 *
 *   WHO Sentinel Fortune is          → the institutional site
 *   WHAT Sentinel Fortune creates    → THIS PAGE
 *   WHERE each experience lives      → the seven worlds
 *   WHAT can be purchased            → the Digital Shop
 *   HOW people can support the work  → Support the Work
 *
 * THIS IS A VIEW, NOT AN ENGINE.
 * ------------------------------
 * It owns no core, no commercial logic, no pricing, no routing and no
 * selection gate. Every one of those is imported from the same modules the
 * seven worlds use:
 *
 *   core.js      selectAllPublic — the SAME readiness gate as selectPublic
 *   commerce.js  priceState / ctaState — the one commercial heart
 *   rails.js     newestRecords / featuredRecords / rail
 *   visual.js    cover / generatedArt — the one media system
 *   ui.js        h / section / emptyState — the one component set
 *   identities.js the seven worlds and their readiness contract
 *
 * If a rule appears in this file that is not in one of those, it is in the
 * wrong place.
 *
 * SECTIONS, in the order a first-time visitor needs them:
 *   A  Hero                  one unified story, two actions
 *   B  Latest                the three most recent published releases
 *   C  Explore our worlds    seven gateways
 *   D  Featured experiences  what you can actually DO
 *   E  Knowledge and ideas   guides, articles, teachings
 *   F  Digital products      verified commercial assets only
 *   G  Support the work      voluntary, never a purchase
 *   H  Work with us          B2B, outcomes first
 */

import { h, section, emptyState } from "./ui.js";
import { priceState, ctaState, byType, splitByCost } from "./commerce.js";
import { newestRecords, featuredRecords } from "./rails.js";
import { cover, roleCover, heroBackdrop } from "./visual.js";
import { ratioFor } from "./renderers.js";
import { HUB, orderedBranches, worldState, STATE_LABEL } from "./identities.js";

/* ─────────────────────────────────────────────────────────────────────────
   DESTINATIONS

   A world is reachable publicly only when its own readiness says so. On a
   preview host the in-platform route is always offered, but it is LABELLED a
   preview — so a walkthrough is possible without a single public link ever
   pointing at an experience the Owner has not surfaced.
   ───────────────────────────────────────────────────────────────────────── */

export function worldHref(cfg, state, { preview = false } = {}) {
  if (state === "LIVE") return `https://${cfg.host}/`;
  if (state === "HUB") return `/i/${cfg.slug}/`;
  return preview ? `/i/${cfg.slug}/` : null;
}

/** The institutional site and the Shop. Absolute, governed, never invented. */
const INSTITUTIONAL = "https://sentinelfortune.com/";
const SHOP = "https://sentinelfortune.github.io/sentinelfortune/shop/";

/* ─────────────────────────────────────────────────────────────────────────
   THE PAGE
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Build the homepage.
 *
 * `byIdentity` comes from `selectAllPublic()`, so everything rendered here has
 * already passed the one public-readiness gate. Nothing in this file decides
 * whether a record may be shown.
 */
export function renderHub({ accepted = [], byIdentity = {}, preview = false, support = null } = {}) {
  return h("div.sf-hub", null, [
    sectionA(accepted),
    sectionB(accepted, preview),
    sectionC(byIdentity, preview),
    sectionD(accepted, preview),
    sectionE(accepted, preview),
    sectionF(accepted),
    sectionG(support),
    sectionH(),
  ]);
}

/* ── A · HERO ──────────────────────────────────────────────────────────────
   ONE story. Not seven competing messages — §5 is explicit, and a hero that
   tries to say seven things says none. Two actions, no more.
   ──────────────────────────────────────────────────────────────────────── */

function sectionA(accepted) {
  const { free, paid } = splitByCost(accepted);

  return h("section.sf-hub-hero", { "aria-labelledby": "sfHubH" }, [
    h("div.sf-hub-hero-bg", { "aria-hidden": "true" }, [heroBackdrop(HUB.slug)]),
    h("div.sf-hub-hero-in", null, [
      h("p.sf-hub-eyebrow", null, [
        h("span.sf-hub-eyebrow-mark", { "aria-hidden": "true", text: HUB.mark }),
        "Sentinel Fortune LLC",
      ]),
      h("h1.sf-hub-h", { id: "sfHubH", text: HUB.promise }),
      h("p.sf-hub-sub", { text: HUB.job }),
      h("div.sf-hub-act", null, [
        h("a.sf-btn.sf-btn--primary", { href: "#worlds", text: "Explore our worlds" }),
        h("a.sf-btn", { href: "#latest", text: "Latest releases" }),
      ]),
      /* Counts, only when there is something to count. A "0 free · 0 paid"
         line is worse than no line. */
      accepted.length
        ? h("p.sf-hub-count", { text: `${accepted.length} published · ${free.length} free · ${paid.length} with a governed price` })
        : null,
    ]),
  ]);
}

/* ── B · LATEST FROM SENTINEL FORTUNE ──────────────────────────────────────
   Exactly three, newest first, from governed `publishedAt` only. §B.
   ──────────────────────────────────────────────────────────────────────── */

function sectionB(accepted, preview) {
  const latest = newestRecords(accepted, 3);

  const body = latest.length
    ? h("div.sf-hub-latest", null, latest.map((record) => latestCard(record, preview)))
    : emptyState({
        title: "Nothing published yet",
        body: "When House of Assets approves a release, the three most recent appear here automatically. No page is written by hand.",
      });

  return section("Latest from Sentinel Fortune", {
    kicker: "New",
    sub: "The three most recent published releases, from any world.",
    body,
    id: "latest",
  });
}

function latestCard(record, preview) {
  const cfg = worldOf(record.identity);
  const state = cfg ? worldState(cfg) : "BUILD";
  const href = cfg ? worldHref(cfg, state, { preview }) : null;
  const action = ctaState(record);

  return h("article.sf-hub-rel", null, [
    h("div.sf-hub-rel-art", { "aria-hidden": "true" },
      [roleCover(record, record.identity, "ATTENTION", { ratio: ratioFor(record.type), width: 640, height: 426 })]),
    h("div.sf-hub-rel-body", null, [
      h("p.sf-hub-rel-meta", null, [
        h("span.sf-hub-rel-world", { text: cfg ? cfg.name : record.identity }),
        h("span.sf-hub-rel-dot", { "aria-hidden": "true", text: "·" }),
        h("span.sf-hub-rel-type", { text: typeWord(record.type) }),
      ]),
      h("h3.sf-hub-rel-t", { text: record.title }),
      record.summary ? h("p.sf-hub-rel-sum", { text: record.summary }) : null,
      /* ONE call to action. It is the world's canonical action when the world
         is reachable, and an honest state label when it is not — never a
         button that goes nowhere. */
      h("div.sf-hub-rel-act", null, [
        href
          ? h("a.sf-btn.sf-btn--primary", { href, text: cfg.cta })
          : h("p.sf-hub-inert", { text: `${cfg ? cfg.name : "This world"} — ${STATE_LABEL[state]}` }),
        action.enabled === false && action.note
          ? h("p.sf-hub-rel-note", { text: action.note })
          : null,
      ]),
    ]),
  ]);
}

/* ── C · EXPLORE OUR WORLDS ────────────────────────────────────────────────
   Seven gateways, not seven cards. Each one visually distinct and obviously
   part of one company: the shared frame is the brand, the accent and the
   generated field are the world.
   ──────────────────────────────────────────────────────────────────────── */

function sectionC(byIdentity, preview) {
  const boards = orderedBranches().map((cfg) => worldBoard(cfg, byIdentity[cfg.slug] || [], preview));

  return section("Explore our worlds", {
    kicker: HUB.direction,
    sub: "One company, seven specialized worlds. Each has its own craft; all share one core.",
    body: h("div.sf-hub-boards", null, boards),
    id: "worlds",
  });
}

function worldBoard(cfg, records, preview) {
  const state = worldState(cfg);
  const href = worldHref(cfg, state, { preview });
  const open = Boolean(href);

  /* The board's visual. A world with published content shows its newest
     artwork; a world without shows its own generated field, which is a
     deliberate premium fallback rather than a missing image. */
  const newest = newestRecords(records, 1)[0] || null;
  const art = newest
    ? cover(newest, cfg.slug, { ratio: "4 / 3", width: 560, height: 420 })
    : heroBackdrop(cfg.slug);

  const inner = [
    h("div.sf-board-art", { "aria-hidden": "true" }, [art]),
    h("div.sf-board-in", null, [
      h("p.sf-board-tag", null, [
        h("span.sf-board-mark", { "aria-hidden": "true", text: cfg.mark }),
        cfg.tag,
      ]),
      h("h3.sf-board-name", { text: cfg.name }),
      h("p.sf-board-role", { text: cfg.role }),
      h("p.sf-board-count", {
        text: records.length
          ? `${records.length} published`
          : "Nothing published yet",
      }),
      open
        ? h("span.sf-board-cta", null, [
            cfg.cta,
            h("span.sf-board-arrow", { "aria-hidden": "true", text: "→" }),
          ])
        : h("span.sf-board-state", { text: STATE_LABEL[state] }),
      /* A preview route is reachable, and says so. This is how the seven can
         be walked for validation without one public link pointing at an
         experience the Owner has not surfaced. */
      open && state !== "LIVE" && state !== "HUB"
        ? h("span.sf-board-preview", { text: "Preview" })
        : null,
    ]),
  ];

  const attrs = {
    "data-world": cfg.slug,
    "data-state": state,
    style: `--board-accent:${cfg.theme.accent};--board-surface:${cfg.theme.surface};--board-line:${cfg.theme.line}`,
  };

  /* Reachable worlds are one large anchor — the whole board is the target, so
     a thumb does not have to find a small link. Unreachable worlds are NOT an
     anchor at all, rather than an anchor that is visually disabled: there is
     nothing to click, so there is no link to mislead anyone. */
  return open
    ? h("a.sf-board.sf-board--open", { ...attrs, href, "aria-label": `${cfg.name} — ${cfg.cta}` }, inner)
    : h("div.sf-board.sf-board--inert", attrs, inner);
}

/* ── D · FEATURED EXPERIENCES ──────────────────────────────────────────────
   What a visitor can DO, phrased as the doing. §D.
   ──────────────────────────────────────────────────────────────────────── */

function sectionD(accepted, preview) {
  const picks = featuredRecords(accepted, 6);
  if (!picks.length) return null;

  return section("Featured experiences", {
    kicker: "Do something",
    sub: "Not a catalogue — things you can listen to, read, play, learn and run.",
    body: h("div.sf-hub-exp", null, picks.map((record) => {
      const cfg = worldOf(record.identity);
      const state = cfg ? worldState(cfg) : "BUILD";
      const href = cfg ? worldHref(cfg, state, { preview }) : null;
      const inner = [
        h("div.sf-exp-art", { "aria-hidden": "true" },
          [roleCover(record, record.identity, "VALUE", { ratio: "16 / 9", width: 480, height: 270 })]),
        h("div.sf-exp-in", null, [
          h("p.sf-exp-do", { text: doingVerb(record.type) }),
          h("h3.sf-exp-t", { text: record.title }),
          h("p.sf-exp-world", { text: cfg ? cfg.name : record.identity }),
        ]),
      ];
      return href
        ? h("a.sf-exp", { href, "aria-label": `${doingVerb(record.type)}: ${record.title}` }, inner)
        : h("div.sf-exp.sf-exp--inert", null, inner);
    })),
    id: "experiences",
  });
}

/* ── E · KNOWLEDGE AND IDEAS ───────────────────────────────────────────────
   Guides, articles, teachings and courses — made visual rather than rendered
   as text cards on an abstract field. §E.
   ──────────────────────────────────────────────────────────────────────── */

function sectionE(accepted, preview) {
  const knowledge = [
    ...byType(accepted, "COURSE"),
    ...byType(accepted, "TEACHING"),
    ...byType(accepted, "BOOK"),
  ].slice(0, 6);
  if (!knowledge.length) return null;

  return section("Knowledge and ideas", {
    kicker: "Learn and reflect",
    sub: "Guides, lessons, teachings and writing — free to read unless a governed price says otherwise.",
    body: h("div.sf-hub-know", null, knowledge.map((record) => {
      const cfg = worldOf(record.identity);
      const state = cfg ? worldState(cfg) : "BUILD";
      const href = cfg ? worldHref(cfg, state, { preview }) : null;
      const money = priceState(record);
      const inner = [
        h("div.sf-know-art", { "aria-hidden": "true" },
          [roleCover(record, record.identity, "DISCOVERY", { ratio: "3 / 2", width: 420, height: 280 })]),
        h("div.sf-know-in", null, [
          h("p.sf-know-kind", { text: `${typeWord(record.type)} · ${cfg ? cfg.name : record.identity}` }),
          h("h3.sf-know-t", { text: record.title }),
          record.summary ? h("p.sf-know-sum", { text: record.summary }) : null,
          /* FREE is stated only when the governed price state says FREE. An
             absent price is UNPRICED and says nothing — it never becomes
             "free" by default. */
          h("p.sf-know-cost", { text: money.state === "FREE" ? "Free to read" : money.label }),
        ]),
      ];
      return href ? h("a.sf-know", { href }, inner) : h("div.sf-know.sf-know--inert", null, inner);
    })),
    id: "knowledge",
  });
}

/* ── F · DIGITAL PRODUCTS ──────────────────────────────────────────────────
   VERIFIED COMMERCIAL ASSETS ONLY.
   §F and §10: a digital product has its OWN commercial truth. This section
   never invents a price, a discount, availability, a licence or a checkout,
   and it never renders a Buy button without a governed price behind it —
   `ctaState()` already refuses that, and this section shows nothing it
   refuses. There are NO freemium tiers here, because a digital product's price
   is not a plan.
   ──────────────────────────────────────────────────────────────────────── */

function sectionF(accepted) {
  /* A product qualifies only if the one commercial heart says it has a real
     governed price AND a usable purchase action. Both, or it is not shown. */
  const products = accepted.filter((record) => {
    const money = priceState(record);
    const action = ctaState(record);
    return money.state === "PAID" && action.enabled === true && action.kind === "BUY";
  });

  if (!products.length) {
    /* Honest absence. No placeholder grid, no "coming soon" price, no tiers. */
    return section("Digital products", {
      kicker: "Commerce",
      sub: "Books, toolkits, courses, licences and collections — each with its own price.",
      body: h("div.sf-hub-noprod", null, [
        h("p", { text: "No verified digital product is published to this surface yet." }),
        h("p.sf-hub-noprod-note", { text: "Product price, licence and fulfilment are governed by House of Assets and the Digital Shop. This page displays them; it never sets them, and it shows no purchase action until a verified product exists." }),
        h("a.sf-btn", { href: SHOP, rel: "noopener", text: "Visit the Digital Shop" }),
      ]),
      id: "products",
    });
  }

  return section("Digital products", {
    kicker: "Commerce",
    sub: "Each product carries its own governed price. These are not subscription tiers.",
    body: h("div.sf-hub-prod", null, products.slice(0, 6).map((record) => {
      const money = priceState(record);
      const action = ctaState(record);
      return h("article.sf-prod", null, [
        h("div.sf-prod-art", { "aria-hidden": "true" },
          [cover(record, record.identity, { ratio: "1 / 1", width: 400, height: 400 })]),
        h("div.sf-prod-in", null, [
          h("p.sf-prod-kind", { text: typeWord(record.type) }),
          h("h3.sf-prod-t", { text: record.title }),
          h("p.sf-prod-price", { text: money.label }),
          h("a.sf-btn.sf-btn--primary", {
            href: action.href,
            rel: action.external ? "noopener" : null,
            target: action.external ? "_blank" : null,
            text: action.label,
          }),
        ]),
      ]);
    })),
    id: "products",
  });
}

/* ── G · SUPPORT THE WORK ──────────────────────────────────────────────────
   Voluntary. Not a purchase. No entitlement. §11.

   NO ACTIVE PAYMENT ACTION EXISTS UNLESS VERIFIED SUPPORT INFRASTRUCTURE IS
   CONFIGURED. Without it this renders the invitation and says plainly that
   support is not open yet — which is the honest state, and is why there is no
   `href` to fabricate.
   ──────────────────────────────────────────────────────────────────────── */

export const SUPPORT_AMOUNTS = Object.freeze([5, 10, 25]);

function sectionG(support) {
  /* `support` is injected, never assumed. A configured endpoint must be an
     explicit https destination the Owner set — this file has no default. */
  const configured = Boolean(support && support.enabled === true && typeof support.href === "string" && support.href.startsWith("https://"));

  const amounts = h("div.sf-sup-amounts", { role: configured ? "group" : null, "aria-label": configured ? "Support amount" : null },
    [...SUPPORT_AMOUNTS.map((amount) =>
      configured
        ? h("a.sf-sup-amount", { href: `${support.href}${support.href.includes("?") ? "&" : "?"}amount=${amount}`, rel: "noopener", text: `$${amount}` })
        : h("span.sf-sup-amount.sf-sup-amount--inert", { text: `$${amount}` })),
      configured
        ? h("a.sf-sup-amount", { href: support.href, rel: "noopener", text: "Custom" })
        : h("span.sf-sup-amount.sf-sup-amount--inert", { text: "Custom" }),
    ]);

  return section("Support the work", {
    kicker: "Voluntary",
    sub: null,
    body: h("div.sf-sup", null, [
      h("p.sf-sup-lead", { text: "Enjoy our free work? Your support helps us create more original experiences and keep public work accessible." }),
      amounts,
      /* The distinction, stated on the page and not only in a document. */
      h("p.sf-sup-fine", { text: "Support is voluntary and separate from buying a product. It grants no product, licence, download or entitlement, and it is not a charitable or tax-deductible donation." }),
      configured
        ? null
        : h("p.sf-sup-inert", { text: "Support is not open yet. These amounts are shown as an intention, not a payment — no payment action exists on this page until support infrastructure is verified." }),
    ]),
    id: "support",
  });
}

/* ── H · WORK WITH SENTINEL FORTUNE ────────────────────────────────────────
   Outcomes first, infrastructure second. §12. No fabricated customers,
   testimonials, case studies or partner relationships — §22.
   ──────────────────────────────────────────────────────────────────────── */

const B2B = Object.freeze([
  { h: "Licensing", p: "Licence original music, writing, narrative or software for your own product or production." },
  { h: "OEM and white label", p: "Ship our systems inside yours, under your brand." },
  { h: "Distribution", p: "Carry Sentinel Fortune catalogue on your platform or storefront." },
  { h: "Technology collaboration", p: "Build with our AI, automation and systems work." },
  { h: "Media collaboration", p: "Co-produce audio, story or episodic media." },
  { h: "Partnerships", p: "Education, culture and commercial programmes." },
]);

function sectionH() {
  return section("Work with Sentinel Fortune", {
    kicker: "Business",
    sub: "Licensing, OEM, distribution and collaboration — across technology, media, music and learning.",
    body: h("div.sf-b2b", null, [
      h("div.sf-b2b-grid", null, B2B.map((item) =>
        h("div.sf-b2b-item", null, [
          h("h3.sf-b2b-h", { text: item.h }),
          h("p.sf-b2b-p", { text: item.p }),
        ]))),
      h("div.sf-hub-act", null, [
        h("a.sf-btn.sf-btn--primary", { href: `${INSTITUTIONAL}contact/`, rel: "noopener", text: "Work with Sentinel Fortune" }),
        h("a.sf-btn", { href: INSTITUTIONAL, rel: "noopener", text: "Visit the institutional site" }),
      ]),
    ]),
    id: "business",
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   SMALL SHARED WORDS
   ───────────────────────────────────────────────────────────────────────── */

function worldOf(identity) {
  return orderedBranches().find((b) => b.slug === identity) || null;
}

/** The public word for a type. A visitor never sees MUSIC_RELEASE. */
function typeWord(type) {
  return {
    MUSIC_RELEASE: "Release", STORY: "Story", GAME: "Game", COURSE: "Course",
    TEACHING: "Teaching", SOFTWARE: "Tool", BOOK: "Book", PODCAST: "Episode",
    BUNDLE: "Collection",
  }[type] || "Item";
}

/** The doing, not the noun — §D asks for experiential, not corporate. */
function doingVerb(type) {
  return {
    MUSIC_RELEASE: "Listen", PODCAST: "Listen", STORY: "Read", BOOK: "Read",
    TEACHING: "Reflect", GAME: "Play", COURSE: "Learn", SOFTWARE: "Explore",
    BUNDLE: "Discover",
  }[type] || "Open";
}
