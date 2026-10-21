/* Sentinel Fortune — SPECIALIZED RENDERERS.
 *
 * The same canonical record, presented seven different ways. This is the file
 * that makes the seven branches different products rather than one product
 * with seven logos.
 *
 * ONE RENDERER PER CONTENT TYPE, chosen by `record.type`. There is NO generic
 * detail page: a type with no renderer is a routing error, surfaced as such,
 * because a generic page for everything is exactly what this architecture
 * exists to avoid.
 *
 *   MUSIC_RELEASE -> transport + waveform. You operate it.
 *   STORY         -> position in a series. You continue it.
 *   GAME          -> one oversized launch target. You press it.
 *   COURSE        -> ordered path on a spine. You work through it.
 *   TEACHING      -> one narrow column, no onward pressure. You sit with it.
 *   SOFTWARE      -> takes/returns/runs contract. You run it.
 *   BOOK          -> reading surface. You read it.
 *   PODCAST       -> episode transport. You listen to it.
 *   BUNDLE        -> what is inside, and one price. You buy it.
 */

import { h, priceTag, ctaButton, actionRow, section, cardGrid, emptyState, demoBadge } from "./ui.js";
import { relatedTo, bundlesContaining, priceState } from "./commerce.js";
import { cover, hasGovernedImage } from "./visual.js";

/* The aspect a medium is actually shaped like. A record sleeve is square, key
   art is widescreen, a course cover is landscape. Using one ratio everywhere
   is what makes a catalogue look generic. */
const RATIO = Object.freeze({
  MUSIC_RELEASE: "1 / 1",
  PODCAST: "1 / 1",
  STORY: "16 / 9",
  GAME: "16 / 9",
  COURSE: "3 / 2",
  BOOK: "2 / 3",
  TEACHING: "3 / 2",
  SOFTWARE: "3 / 2",
  BUNDLE: "1 / 1",
});

export function ratioFor(type) {
  return RATIO[type] || "3 / 2";
}

/* ─────────────────────────────────────────────────────────────────────────
   SHARED DETAIL FRAME
   ───────────────────────────────────────────────────────────────────────── */

/** Every detail page shares this frame. Only `body` differs by type, which is
 *  what keeps the seven coherent while letting each one feel like itself. */
function localizedRecord(record) {
  if (typeof window === "undefined") return { record, lang: "en", hasFrench: false };
  const requested = new URLSearchParams(window.location.search).get("lang");
  const fr = record.metadata && record.metadata.translations && record.metadata.translations.fr;
  const hasFrench = Boolean(fr && (fr.title || fr.summary || fr.description));
  if (requested !== "fr" || !hasFrench) return { record, lang: "en", hasFrench };
  return {
    lang: "fr",
    hasFrench,
    record: {
      ...record,
      title: fr.title || record.title,
      summary: fr.summary || record.summary,
      description: fr.description || record.description,
    },
  };
}

function languageSwitch(record, lang, hasFrench) {
  if (!hasFrench || typeof window === "undefined") return null;
  const path = window.location.pathname;
  return h("nav.sf-lang", { "aria-label": "Language" }, [
    h("a", { href: path, text: "EN", "aria-current": lang === "en" ? "page" : null }),
    h("span", { "aria-hidden": "true", text: "|" }),
    h("a", { href: path + "?lang=fr", text: "FR", "aria-current": lang === "fr" ? "page" : null }),
  ]);
}

function detailFrame(record, { kicker, body, aside = null }, ctx) {
  const { links, pool } = ctx;
  const related = relatedTo(record, pool, 3);
  const bundles = bundlesContaining(record, pool);

  const ratio = ratioFor(record.type);
  /* Image-dominant layout. The strongest sourced mechanism in the benchmark
     work was SSENSE giving roughly 70% of a mobile product page to imagery;
     this is the restrained version of that — a real visual column beside the
     headline rather than a thumbnail above a wall of text. */
  return h("article.sf-detail.sf-detail--visual", { dataset: { type: record.type, slug: record.slug } }, [
    h("nav.sf-crumbs", { "aria-label": "Breadcrumb" }, [
      h("a", { href: links.home(), text: "Home" }),
      h("span", { "aria-hidden": "true", text: "/" }),
      h("a", { href: links.browse(), text: "Browse" }),
      h("span", { "aria-hidden": "true", text: "/" }),
      h("span", { "aria-current": "page", text: record.title }),
    ]),

    h("div.sf-detail-top", null, [
      h("div.sf-detail-art", { dataset: { governed: String(hasGovernedImage(record)) } },
        [cover(record, record.identity, { ratio, eager: true, width: 900, height: 900 })]),
      h("header.sf-detail-head", null, [
        h("p.sf-kicker", { text: kicker }),
        languageSwitch(record, record.__lang || "en", record.__hasFrench === true),
        demoBadge(record),
        h("h1.sf-detail-title", { text: record.title }),
        record.summary ? h("p.sf-detail-sum", { text: record.summary }) : null,
        actionRow(record),
      ]),
    ]),

    body,

    record.description ? h("div.sf-prose", null, [h("p", { text: record.description })]) : null,
    aside,

    bundles.length
      ? section("Also in a bundle", {
          kicker: "Better together",
          body: cardGrid(bundles, links.detail, { title: "No bundles" }, (r) => ({ identity: record.identity, ratio: ratioFor(r.type) })),
        })
      : null,

    related.length
      ? section("Related", {
          kicker: "Next",
          sub: "From this house only — nothing is recommended across identities.",
          body: cardGrid(related, links.detail, { title: "Nothing related yet" }, (r) => ({ identity: record.identity, ratio: ratioFor(r.type) })),
        })
      : null,
  ]);
}

/* ─────────────────────────────────────────────────────────────────────────
   MUSIC_RELEASE — the listening room
   ───────────────────────────────────────────────────────────────────────── */

function renderMusicRelease(record, ctx) {
  const audio = record.media.find((m) => m.kind === "AUDIO");
  const generated = record.metadata && record.metadata.generated === true;

  const deck = h("div.rn-deck", null, [
    h("canvas.rn-wave", {
      id: "rnWave", width: 900, height: 110,
      role: "img", "aria-label": "Waveform display for this release",
    }),
    h("div.rn-transport", null, [
      h("button.rn-key", { id: "rnPlay", type: "button", "aria-label": `Play ${record.title}`, text: "▶" }),
      h("button.rn-key", { id: "rnStop", type: "button", "aria-label": `Stop ${record.title}`, disabled: true, text: "■" }),
      h("div.rn-now", null, [
        h("p.rn-now-title", { text: record.title }),
        h("p.rn-now-kind", {
          text: generated ? "Generated live in your browser · not a recording" : "Governed audio",
        }),
      ]),
    ]),
    h("p.rn-note", { id: "rnNote", role: "status", text: "Sound is off until you press play." }),
  ]);

  /* The transport is wired only when there is something to drive. A player
     with no source would be a fake product. */
  if (generated) deck.dataset.generated = "true";
  else if (!audio) deck.dataset.silent = "true";

  return detailFrame(record, {
    kicker: "Release",
    body: h("div.rn", null, [
      deck,
      !generated && !audio
        ? h("p.sf-cta-note", { text: "No audio is published for this release yet." })
        : null,
    ]),
  }, ctx);
}

/* ─────────────────────────────────────────────────────────────────────────
   STORY — position in a world
   ───────────────────────────────────────────────────────────────────────── */

function renderStory(record, ctx) {
  const { pool, links } = ctx;
  const seriesName = (record.metadata && record.metadata.series) || record.collections[0] || null;

  /* Siblings in the same series, in episode order. A narrative branch's job is
     to tell you where you are in the world, which a card grid cannot. */
  const siblings = seriesName
    ? pool
        .filter((r) => r.type === "STORY" && ((r.metadata && r.metadata.series) === seriesName || r.collections.includes(seriesName)))
        .sort((a, b) => ((a.metadata && a.metadata.episode) || 0) - ((b.metadata && b.metadata.episode) || 0))
    : [];

  const position = siblings.findIndex((r) => r.id === record.id);

  return detailFrame(record, {
    kicker: seriesName ? `Story · ${seriesName}` : "Story",
    body: h("div.cx", null, [
      seriesName && siblings.length > 1
        ? h("ol.cx-spine", { "aria-label": `Episodes in ${seriesName}` }, siblings.map((s, i) =>
            h(`li.cx-ep${s.id === record.id ? ".is-here" : ""}`, null, [
              h("span.cx-ep-n", { "aria-hidden": "true", text: String((s.metadata && s.metadata.episode) || i + 1) }),
              s.id === record.id
                ? h("span.cx-ep-t", { text: s.title, "aria-current": "true" })
                : h("a.cx-ep-t", { href: links.detail(s), text: s.title }),
            ])))
        : null,
      position > -1 && siblings.length > 1
        ? h("p.cx-pos", { text: `Episode ${position + 1} of ${siblings.length}` })
        : null,
    ]),
  }, ctx);
}

/* ─────────────────────────────────────────────────────────────────────────
   GAME — the arcade cabinet
   ───────────────────────────────────────────────────────────────────────── */

function renderGame(record, ctx) {
  const controls = record.metadata && record.metadata.controls;
  return detailFrame(record, {
    kicker: "Playable",
    body: h("div.gm", null, [
      h("div.gm-cab", null, [
        h("p.gm-title", { text: record.title }),
        controls ? h("p.gm-controls", { text: controls }) : null,
        h("div.gm-act", null, [ctaButton(record)]),
      ]),
      h("p.gm-fine", {
        text: "Your progress stays in this browser. No account, no leaderboard, no purchases.",
      }),
    ]),
  }, ctx);
}

/* ─────────────────────────────────────────────────────────────────────────
   COURSE — the learning path
   ───────────────────────────────────────────────────────────────────────── */

function renderCourse(record, ctx) {
  const { pool, links } = ctx;
  const pathName = record.collections[0] || null;

  /* Siblings in the same path. Order is the product here, so they render on a
     numbered spine rather than in a grid that implies order does not matter. */
  const steps = pathName
    ? pool.filter((r) => r.collections.includes(pathName) && (r.type === "COURSE" || r.type === "SOFTWARE" || r.type === "BOOK"))
        .sort((a, b) => a.slug.localeCompare(b.slug))
    : [];

  const minutes = record.metadata && record.metadata.reading_time;

  return detailFrame(record, {
    kicker: minutes ? `Course · ${minutes} min` : "Course",
    body: h("div.lp", null, [
      pathName && steps.length > 1
        ? h("div.lp-path", null, [
            h("p.lp-path-h", { text: `Part of: ${pathName}` }),
            h("ol.lp-spine", null, steps.map((s, i) =>
              h(`li.lp-step${s.id === record.id ? ".is-here" : ""}`, null, [
                h("span.lp-n", { "aria-hidden": "true", text: String(i + 1) }),
                h("div.lp-body", null, [
                  s.id === record.id
                    ? h("span.lp-t", { text: s.title, "aria-current": "true" })
                    : h("a.lp-t", { href: links.detail(s), text: s.title }),
                  h("span.lp-kind", { text: s.type === "SOFTWARE" ? "Tool" : s.type === "BOOK" ? "Reading" : "Course" }),
                ]),
              ]))),
          ])
        : null,
      h("p.lp-fine", {
        text: "No enrolment, no cohorts, no instructors and no certificates. Nothing is recorded anywhere but on your own device.",
      }),
    ]),
  }, ctx);
}

/* ─────────────────────────────────────────────────────────────────────────
   TEACHING — the reading room
   ───────────────────────────────────────────────────────────────────────── */

function renderTeaching(record, ctx) {
  /* The only renderer with no related grid and no onward call to action: the
     absence of onward pressure is this branch's whole point. The shared frame
     would add both, so this one does not use it. */
  const { links } = ctx;
  return h("article.sf-detail.vf", { dataset: { type: record.type, slug: record.slug } }, [
    h("nav.sf-crumbs", { "aria-label": "Breadcrumb" }, [
      h("a", { href: links.home(), text: "Home" }),
      h("span", { "aria-hidden": "true", text: "/" }),
      h("span", { "aria-current": "page", text: record.title }),
    ]),
    h("div.vf-art", { "aria-hidden": "true" }, [cover(record, record.identity, { ratio: "21 / 9", eager: true })]),
    h("div.vf-piece", null, [
      h("p.vf-kicker", { text: "Teaching" }),
      languageSwitch(record, record.__lang || "en", record.__hasFrench === true),
      h("h1.vf-title", { text: record.title }),
      /* The price renders; the CTA deliberately does not. A reader is still
         entitled to know whether this costs anything — that is a commercial
         requirement, and it is separate from the onward pressure this room
         exists to leave out. */
      h("div.vf-cost", null, [priceTag(record)]),
      record.description ? h("div.vf-text", null, [h("p", { text: record.description })]) : null,
    ]),
    h("p.vf-fine", {
      text: "Reflective writing. Not therapy, not medical or psychological advice, and not a substitute for either.",
    }),
  ]);
}

/* ─────────────────────────────────────────────────────────────────────────
   SOFTWARE — the workshop contract
   ───────────────────────────────────────────────────────────────────────── */

function renderSoftware(record, ctx) {
  const m = record.metadata || {};
  const contract = [
    ["Takes", m.takes],
    ["Returns", m.returns],
    ["Runs", m.runs],
  ].filter(([, v]) => v);

  const facts = [
    ["Version", m.version],
    ["Audience", m.audience],
    ["Evidence", m.evidence],
  ].filter(([, v]) => v);

  return detailFrame(record, {
    kicker: "System",
    body: h("div.ws", null, [
      contract.length
        ? h("dl.ws-contract", null, contract.map(([k, v]) =>
            h("div", null, [h("dt", { text: k }), h("dd", { text: String(v) })])))
        : h("p.sf-cta-note", {
            text: "This system has not declared its inputs and outputs yet.",
          }),
      facts.length
        ? h("dl.ws-facts", null, facts.map(([k, v]) =>
            h("div", null, [h("dt", { text: k }), h("dd", { text: String(v) })])))
        : null,
    ]),
  }, ctx);
}

/* ─────────────────────────────────────────────────────────────────────────
   BOOK / PODCAST
   ───────────────────────────────────────────────────────────────────────── */

function renderBook(record, ctx) {
  return detailFrame(record, {
    kicker: "Book",
    body: h("div.bk", null, [
      h("p.bk-lead", { text: record.summary || "" }),
    ]),
  }, ctx);
}

function renderPodcast(record, ctx) {
  return detailFrame(record, {
    kicker: "Episode",
    body: h("div.pd", null, [
      h("div.pd-bar", null, [
        h("button.rn-key", { type: "button", id: "rnPlay", "aria-label": `Play ${record.title}`, text: "▶" }),
        h("p.pd-title", { text: record.title }),
      ]),
      !record.media.some((x) => x.kind === "AUDIO")
        ? h("p.sf-cta-note", { text: "No audio is published for this episode yet." })
        : null,
    ]),
  }, ctx);
}

/* ─────────────────────────────────────────────────────────────────────────
   BUNDLE — the commerce renderer
   ───────────────────────────────────────────────────────────────────────── */

function renderBundle(record, ctx) {
  const { pool, links } = ctx;
  /* What is inside: every record declaring membership of this bundle. Resolved
     from the pool rather than listed on the bundle, so a bundle can never
     claim to contain something that is not published. */
  const contents = pool.filter((r) => r.bundleMembership.includes(record.slug));
  const money = priceState(record);

  return detailFrame(record, {
    kicker: "Collection",
    body: h("div.bn", null, [
      contents.length
        ? h("div.bn-in", null, [
            h("p.bn-in-h", { text: `${contents.length} ${contents.length === 1 ? "item" : "items"} inside` }),
            cardGrid(contents, links.detail, { title: "Nothing inside yet" }, (r) => ({ identity: record.identity, ratio: ratioFor(r.type) })),
          ])
        : emptyState({
            title: "Nothing published in this collection yet",
            body: "A collection lists only items that are actually published. None are, so none are listed.",
          }),
      money.state === "UNPRICED"
        ? h("p.bn-note", {
            text: "Checkout is handled by the Digital Shop. This collection has no published price yet, so there is nothing to buy.",
          })
        : h("p.bn-note", { text: "Checkout, licensing and delivery are handled by the Digital Shop." }),
    ]),
  }, ctx);
}

/* ─────────────────────────────────────────────────────────────────────────
   THE MAP
   ───────────────────────────────────────────────────────────────────────── */

const RENDERERS = Object.freeze({
  MUSIC_RELEASE: renderMusicRelease,
  STORY: renderStory,
  GAME: renderGame,
  COURSE: renderCourse,
  TEACHING: renderTeaching,
  SOFTWARE: renderSoftware,
  BOOK: renderBook,
  PODCAST: renderPodcast,
  BUNDLE: renderBundle,
});

/** The renderer for a type, or null. Null is a routing error the caller must
 *  surface — never a silent fallback to something generic. */
export function rendererFor(type) {
  return RENDERERS[type] || null;
}

export function renderDetail(record, ctx) {
  const fn = rendererFor(record.type);
  if (!fn) {
    return emptyState({
      title: "This cannot be displayed",
      body: `No presentation exists for content of type ${record.type}.`,
    });
  }
  const localized = localizedRecord(record);
  const viewRecord = Object.freeze({
    ...localized.record,
    __lang: localized.lang,
    __hasFrench: localized.hasFrench,
  });
  return fn(viewRecord, ctx);
}

/** Which specialized renderer a type uses — reported by the acceptance gate. */
export function rendererName(type) {
  const fn = RENDERERS[type];
  return fn ? fn.name.replace(/^render/, "") : null;
}
