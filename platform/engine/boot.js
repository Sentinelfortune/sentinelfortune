/* Sentinel Fortune — THE SHARED RUNTIME.
 *
 *   hostname -> identity -> core -> branch config -> governed content
 *            -> specialized branch experience
 *
 * This is the whole application. One file boots all seven houses; nothing in
 * here knows anything specific about any of them beyond what identities.js
 * declares and what the governed feed carries.
 */

import { selectPublic, selectAllPublic } from "./core.js";
import { loadFeed } from "./feed.js";
import { branch, allBranches, HUB, worldState } from "./identities.js";
import { renderHub, worldHref } from "./hub.js";
import { resolveIdentity, resolveView, links as makeLinks, isCanonicalHost, isPublicHost } from "./router.js";
import { applySeo, applyTheme } from "./seo.js";
import { renderDetail } from "./renderers.js";
import {
  h, clear, section, cardGrid, chips, emptyState, errorState, loadingState,
  previewNotice, priceTag, ctaButton,
} from "./ui.js";
import { featured, byType, categoryIndex, collectionIndex, splitByCost, search } from "./commerce.js";
import { heroBackdrop, cover } from "./visual.js";
import { rail, featuredRecords, newestRecords, freeRecords, paidRecords, typeRecords, recommendedRecords } from "./rails.js";
import { noteOpened, recentRecords, recentSlugs, hasHistory, forget, continueLabel } from "./continuity.js";
import { relatedTo } from "./commerce.js";
import { ratioFor } from "./renderers.js";
import { actionRow } from "./ui.js";

const app = () => document.getElementById("app");

/* State for this page load. Deliberately module-scoped and tiny — there is no
   store, no framework and nothing to keep in sync. */
let STATE = { identity: null, devPrefix: "", pool: [], rejected: [], evidence: "TEST_PREVIEW", generatedAt: null };

/* ─────────────────────────────────────────────────────────────────────────
   BOOT
   ───────────────────────────────────────────────────────────────────────── */

export async function boot() {
  const loc = window.location;
  const resolved = resolveIdentity({ hostname: loc.hostname, pathname: loc.pathname, search: loc.search });

  /* NO WORLD IN THE ADDRESS = THE COMPANY.
     An unknown host is not an error and not a chooser list — it is the
     Sentinel Fortune homepage, which is the one surface that legitimately
     shows all seven worlds at once. */
  if (!resolved.identity) {
    await bootHub();
    return;
  }

  const cfg = branch(resolved.identity);
  STATE.identity = resolved.identity;
  STATE.devPrefix = resolved.devPrefix || "";
  applyTheme(cfg);

  clear(app()).appendChild(loadingState(`Loading ${cfg.name}`));

  const feedUrl = window.SF_FEED_URL || undefined;
  const result = await loadFeed({ url: feedUrl });

  if (!result.ok) {
    renderShell(cfg, errorState({ detail: `${result.error}: ${result.detail}`, onRetry: () => boot() }));
    applySeo({ branch: cfg, route: { view: "home" }, evidence: "TEST_PREVIEW" });
    return;
  }

  const { accepted, rejected } = selectPublic(result.records, resolved.identity);
  STATE.pool = accepted;
  STATE.rejected = rejected;
  STATE.evidence = result.evidence;
  STATE.generatedAt = result.generatedAt;

  route();
  window.addEventListener("popstate", route);
  interceptLinks();

  /* Evidence for the acceptance gate, readable from a browser test. Reports
     what governance did — not a debug dashboard, and not visible. */
  window.SF_ENGINE = Object.freeze({
    identity: resolved.identity,
    identitySource: resolved.source,
    evidence: result.evidence,
    accepted: accepted.length,
    rejected: rejected.length,
    rejectedReasons: rejected.map((r) => r.reason),
    crossIdentityHidden: rejected.filter((r) => r.reason === "OTHER_IDENTITY").length,
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   ROUTING
   ───────────────────────────────────────────────────────────────────────── */

function route() {
  const cfg = branch(STATE.identity);
  const loc = window.location;
  const view = resolveView({
    identity: STATE.identity,
    pathname: loc.pathname,
    search: loc.search,
    devPrefix: STATE.devPrefix,
  });

  const links = makeLinks(STATE.identity, STATE.devPrefix);
  const ctx = { links, pool: STATE.pool, branch: cfg };

  let body;
  let record = null;

  switch (view.view) {
    case "home":        body = viewHome(ctx); break;
    case "browse":      body = viewBrowse(ctx, view); break;
    case "collections": body = viewCollections(ctx); break;
    case "collection":  body = viewCollection(ctx, view.name); break;
    case "detail": {
      record = STATE.pool.find((r) => r.slug === view.slug) || null;
      /* The one place continuity is written. A visitor opening a detail page
         is the only signal this platform collects, it stays on this device,
         and the continue rail resolves it against the live feed. */
      if (record) noteOpened(STATE.identity, record);
      body = record
        ? renderDetail(record, ctx)
        : emptyState({
            title: "Not published here",
            body: `Nothing in ${cfg.name} is published at this address. It may belong to another house, or it may not be published yet.`,
            action: { href: links.browse(), label: `Browse ${cfg.name}` },
          });
      break;
    }
    default:
      body = emptyState({
        title: "No page at this address",
        body: "The address does not match anything in this house.",
        action: { href: links.home(), label: `Go to ${cfg.name}` },
      });
  }

  renderShell(cfg, body);
  applySeo({ branch: cfg, route: view, record, evidence: STATE.evidence });
  window.scrollTo(0, 0);
}

/** Client-side navigation for in-app links, so a detail route does not need a
 *  generated page per record. External links and modified clicks fall through
 *  to the browser untouched. */
function interceptLinks() {
  document.addEventListener("click", (ev) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target.closest("a[href]");
    if (!a || a.target === "_blank") return;
    const url = new URL(a.href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    ev.preventDefault();
    if (url.pathname + url.search === window.location.pathname + window.location.search) return;
    window.history.pushState({}, "", url.pathname + url.search);
    route();
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   SHELL — identical across the seven, themed per branch
   ───────────────────────────────────────────────────────────────────────── */

function renderShell(cfg, body, linksOverride = null) {
  const links = linksOverride || makeLinks(STATE.identity, STATE.devPrefix);

  const nav = h("nav.sf-nav", { "aria-label": "Primary" }, cfg.nav.map((item) => {
    /* A nav item may name a route (the seven worlds) or carry an href outright
       (the homepage, whose destinations are its own sections). One renderer
       serves both rather than the hub forking the shell. */
    const href =
      item.href ? item.href
      : item.view === "home" ? links.home()
      : item.view === "collections" ? links.collections()
      : links.browse({ type: item.type, filter: item.filter });
    return h("a.sf-nav-a", { href, text: item.label });
  }));

  clear(app()).append(
    h("a.sf-skip", { href: "#main", text: "Skip to content" }),
    STATE.evidence !== "LIVE" ? previewNotice(STATE.generatedAt) : null,
    h("header.sf-head", null, [
      h("div.sf-head-in", null, [
        h("a.sf-brand", { href: links.home() }, [
          h("img.sf-brand-logo", {
            src: "/assets/sf-logo-128.webp",
            alt: "Sentinel Fortune",
            width: 38, height: 38,
            loading: "eager", decoding: "async",
          }),
          h("span.sf-brand-txt", null, [
            h("span.sf-brand-name", { text: cfg.name }),
            h("span.sf-brand-tag", null, [
              h("span.sf-brand-glyph", { "aria-hidden": "true", text: cfg.mark }),
              cfg.tag,
            ]),
          ]),
        ]),
        h("button.sf-burger", {
          id: "sfBurger", type: "button", "aria-expanded": "false", "aria-controls": "sfNav",
          "aria-label": "Open navigation menu",
        }, [h("span"), h("span"), h("span")]),
        nav,
      ]),
    ]),
    h("main.sf-main", { id: "main" }, [body]),
    h("footer.sf-foot", null, [
      h("div.sf-foot-in", null, [
        h("div.sf-foot-brand", null, [
          h("img.sf-foot-logo", {
            src: "/assets/sf-logo-256.webp",
            alt: "Sentinel Fortune LLC",
            width: 52, height: 52, loading: "lazy", decoding: "async",
          }),
          h("p.sf-foot-job", { text: cfg.job }),
        ]),
        /* THE WAY BACK OUT — four DISTINCT places, not four names for one.
           Each surface keeps its own authority and none is a competing
           homepage:
             Sentinel Fortune   institutional company authority (Jekyll)
             One Company        the Experience Hub / discovery gateway
             Public site        the existing GitHub Pages catalogue surface
             Digital Shop       the existing commerce surface, preserved
           "Public site" is NOT labelled as the institutional site: they are
           different things, and calling the catalogue the company would
           misrepresent both. The Shop link stays on GitHub Pages on purpose —
           commerce authority is not being moved or duplicated.
           The One Company link is omitted on the Hub itself, because a
           surface should not offer a link to where you already are. */
        h("nav.sf-foot-nav", { "aria-label": "Sentinel Fortune" }, [
          h("a", { href: "https://sentinelfortune.com/", rel: "noopener", text: "Sentinel Fortune" }),
          cfg.slug === HUB.slug
            ? null
            : h("a", { href: `https://${HUB.host}/`, rel: "noopener", text: "One Company" }),
          h("a", { href: "https://sentinelfortune.github.io/sentinelfortune/", rel: "noopener", text: "Public site" }),
          h("a", { href: "https://sentinelfortune.github.io/sentinelfortune/shop/", rel: "noopener", text: "Digital Shop" }),
        ]),
        h("p.sf-foot-note", {
          text: `© ${new Date().getFullYear()} Sentinel Fortune LLC. One company, seven houses.`,
        }),
        /* The development identity picker exists only off a canonical host, so
           it can never appear in front of the public. */
        !isCanonicalHost(window.location.hostname) ? devPicker() : null,
      ]),
    ]),
  );

  nav.id = "sfNav";
  wireBurger();
}

function wireBurger() {
  const b = document.getElementById("sfBurger");
  const n = document.getElementById("sfNav");
  if (!b || !n) return;
  document.documentElement.classList.add("sf-js");
  const set = (open) => {
    n.classList.toggle("open", open);
    b.setAttribute("aria-expanded", String(open));
    b.setAttribute("aria-label", `${open ? "Close" : "Open"} navigation menu`);
  };
  b.addEventListener("click", () => set(!n.classList.contains("open")));
  n.addEventListener("click", (e) => { if (e.target.tagName === "A") set(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && n.classList.contains("open")) { set(false); b.focus(); }
  });
}

function devPicker() {
  return h("div.sf-dev", null, [
    h("p.sf-dev-h", { text: "Preview host — switch house" }),
    h("ul.sf-dev-list", null, allBranches().map((b) =>
      h("li", null, [h("a", {
        href: `/i/${b.slug}/`,
        text: b.name,
        "aria-current": b.slug === STATE.identity ? "true" : null,
      })]))),
  ]);
}

/* ─────────────────────────────────────────────────────────────────────────
   THE COMPANY HOMEPAGE

   Same shell, same feed, same readiness gate, same commercial heart. The only
   difference from a world is that selection is not filtered to one identity —
   because the company's own page is the one place all seven belong.
   ───────────────────────────────────────────────────────────────────────── */

async function bootHub() {
  applyTheme(HUB);
  STATE.identity = null;

  clear(app()).appendChild(loadingState("Loading Sentinel Fortune"));

  /* The homepage's nav points at its own sections, so it needs a links object
     with only a home — not a world's route builder. */
  const hubLinks = { home: () => "/" };

  const result = await loadFeed({ url: window.SF_FEED_URL || undefined });
  if (!result.ok) {
    renderShell(HUB, errorState({ detail: `${result.error}: ${result.detail}`, onRetry: () => boot() }), hubLinks);
    return;
  }

  const { accepted, rejected, byIdentity } = selectAllPublic(result.records);
  STATE.evidence = result.evidence;
  STATE.generatedAt = result.generatedAt;

  /* Off a canonical host this is a preview, and the boards say so rather than
     pretending the worlds are published. */
  const preview = !isPublicHost(window.location.hostname);

  renderShell(HUB, renderHub({
    accepted,
    byIdentity,
    preview,
    /* Support infrastructure is injected or absent. There is no default, so a
       payment action cannot appear by accident. */
    support: (typeof window !== "undefined" && window.SF_SUPPORT) || null,
  }), hubLinks);

  applySeo({ branch: HUB, route: { view: "home" }, evidence: STATE.evidence });
  interceptHashOnly();

  window.SF_ENGINE = Object.freeze({
    identity: null,
    surface: "HUB",
    identitySource: "NO_IDENTITY",
    evidence: result.evidence,
    accepted: accepted.length,
    rejected: rejected.length,
    rejectedReasons: rejected.map((r) => r.reason),
    worlds: Object.fromEntries(allBranches().map((b) => [b.slug, {
      published: (byIdentity[b.slug] || []).length,
      state: worldState(b),
      linked: Boolean(worldHref(b, worldState(b), { preview: false })),
    }])),
  });
}

/** On the homepage a same-page anchor must not be intercepted into a route. */
function interceptHashOnly() {
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (a) ev.stopPropagation();
  }, true);
}

/** No identity: an unknown host. Kept for the preview host's own fallback. */
function renderIdentityChooser(host) {
  clear(app()).appendChild(h("div.sf-chooser", null, [
    h("h1", { text: "Sentinel Fortune" }),
    h("p", { text: "One company, seven houses. Choose one to preview." }),
    host ? h("p.sf-chooser-host", { text: `This host (${host}) is not one of the seven canonical addresses.` }) : null,
    h("ul.sf-chooser-list", null, allBranches().map((b) =>
      h("li", null, [
        h("a", { href: `/i/${b.slug}/` }, [
          h("span.sf-chooser-mark", { "aria-hidden": "true", text: b.mark }),
          h("span", null, [h("strong", { text: b.name }), h("span", { text: b.job })]),
        ]),
      ]))),
  ]));
  document.title = "Sentinel Fortune — seven houses";
}

/* ─────────────────────────────────────────────────────────────────────────
   VIEWS — shared discovery, branch-ordered rails
   ───────────────────────────────────────────────────────────────────────── */

function viewHome(ctx) {
  const { pool, links, branch: cfg } = ctx;

  /* THE DYNAMIC HERO.
     Content-driven: it presents a governed FEATURED record — its artwork, its
     type, its real price state and its real CTA — not a fixed marketing slab.
     When House of Assets features something else, the hero changes with no
     code edit.

     It does NOT auto-rotate. Several featured records give the visitor manual
     dots; a hero that moves on its own steals the thing someone is reading. */
  const { free, paid } = splitByCost(pool);
  const spotlights = featuredRecords(pool, 5);
  const hero = spotlights.length
    ? dynamicHero(spotlights, ctx)
    : staticHero(cfg, links, pool, free, paid);

  if (!pool.length) {
    return h("div", null, [hero, emptyState({
      title: `${cfg.name} has nothing published yet`,
      body: "This house is built and working. When House of Assets approves content for it, it appears here automatically — no page is written by hand.",
    })]);
  }

  /* The living surface. Rails render in the branch's declared order, each one
     built from governed data, and ANY rail with nothing in it is dropped here
     rather than rendering as an empty shelf. */
  const rails = cfg.rails.map((spec) => buildRail(spec, ctx)).filter(Boolean);
  return h("div", null, [hero, h("div.sf-rails", null, rails)]);
}

/* ── the hero ──────────────────────────────────────────────────────────── */

function staticHero(cfg, links, pool, free, paid) {
  return h("section.sf-hero", null, [
    h("div.sf-hero-bg", { "aria-hidden": "true" }, [heroBackdrop(cfg.slug)]),
    h("div.sf-hero-in", null, [
      h("p.sf-hero-tag", { text: cfg.tag }),
      h("h1.sf-hero-h", { text: cfg.promise }),
      h("p.sf-hero-sub", { text: cfg.job }),
      h("div.sf-hero-act", null, [
        h("a.sf-btn.sf-btn--primary", { href: links.browse(), text: primaryActionLabel(cfg) }),
        h("a.sf-btn", { href: links.collections(), text: "Collections" }),
      ]),
      pool.length ? h("p.sf-hero-cost", { text: `${free.length} free · ${paid.length} paid · ${pool.length} in all` }) : null,
    ]),
  ]);
}

function dynamicHero(spotlights, ctx) {
  const { links, branch: cfg, pool } = ctx;
  const { free, paid } = splitByCost(pool);
  let index = 0;

  const stage = h("div.sf-hero-stage");
  const dots = h("div.sf-hero-dots", { role: "tablist", "aria-label": "Featured items" });

  function paint(i) {
    index = i;
    const record = spotlights[i];
    clear(stage).append(
      h("div.sf-hero-art", { "aria-hidden": "true" },
        [cover(record, cfg.slug, { ratio: ratioFor(record.type), eager: true, width: 800, height: 600 })]),
      h("div.sf-hero-in", null, [
        h("p.sf-hero-tag", { text: `${cfg.tag} · ${typeLabel(record.type)}` }),
        /* The house's promise stays above the featured item. Without it the
           hero answers "what is this thing" and leaves "what is this place"
           unanswered — which is the question a first-time visitor actually
           arrives with. */
        h("p.sf-hero-promise", { text: cfg.promise }),
        h("h1.sf-hero-h", { text: record.title }),
        h("p.sf-hero-sub", { text: record.summary || cfg.job }),
        actionRow(record),
        h("div.sf-hero-act", null, [
          h("a.sf-btn", { href: links.detail(record), text: "Details" }),
          h("a.sf-btn", { href: links.browse(), text: primaryActionLabel(cfg) }),
        ]),
        h("p.sf-hero-cost", { text: `${free.length} free · ${paid.length} paid · ${pool.length} in all` }),
      ]),
    );
    [...dots.children].forEach((d, di) => {
      d.setAttribute("aria-selected", String(di === i));
      d.tabIndex = di === i ? 0 : -1;
    });
  }

  if (spotlights.length > 1) {
    spotlights.forEach((rec, i) => {
      dots.appendChild(h("button.sf-hero-dot", {
        type: "button", role: "tab",
        "aria-label": `Featured: ${rec.title}`,
        onclick: () => paint(i),
        onkeydown: (ev) => {
          if (ev.key === "ArrowRight") { ev.preventDefault(); paint((index + 1) % spotlights.length); dots.children[index].focus(); }
          if (ev.key === "ArrowLeft")  { ev.preventDefault(); paint((index - 1 + spotlights.length) % spotlights.length); dots.children[index].focus(); }
        },
      }));
    });
  }

  paint(0);
  /* No branch backdrop here: the featured record's own artwork is the hero
     visual, and two artworks in the same visual grammar overlapping each
     other read as a glitch rather than as depth. The static hero, which has
     no record art, keeps the backdrop. */
  return h("section.sf-hero.sf-hero--dynamic", null, [
    stage,
    spotlights.length > 1 ? dots : null,
  ]);
}

/* ── rail construction ─────────────────────────────────────────────────── */

/** Turn one declared rail spec into a rendered rail, or null. Every label
 *  below is something the data can actually support. */
function buildRail(spec, ctx) {
  const { pool, links, branch: cfg } = ctx;
  const card = (r) => ({ badge: typeLabel(r.type), identity: cfg.slug, ratio: ratioFor(r.type) });
  const mk = (title, records, extra = {}) =>
    rail({ title, records, hrefFor: links.detail, cardOpts: card, ...extra });

  switch (spec.kind) {
    case "continue": {
      const records = recentRecords(cfg.slug, pool, 12);
      if (!records.length) return null;
      const r = mk(spec.title || continueLabel(cfg.lead), records, {
        kicker: "On this device",
        note: "Kept in this browser only — there is no account and nothing is synced.",
      });
      if (r) {
        r.querySelector(".sf-rail-navs").appendChild(
          h("button.sf-rail-clear", {
            type: "button", text: "Clear",
            "aria-label": "Clear your local history",
            onclick: () => { forget(); route(); },
          }));
      }
      return r;
    }
    case "featured": {
      const title = spec.title || "Featured";
      /* Drop the kicker when it would just repeat the title. */
      const kicker = /start here/i.test(title) ? null : "Start here";
      return mk(title, featuredRecords(pool, 10), { kicker });
    }
    case "new":         return mk(spec.title || "New", newestRecords(pool, 10), { kicker: "Recently added" });
    case "free":        return mk(spec.title || "Free to explore", freeRecords(pool, 12), { kicker: "No payment" });
    case "paid":        return mk(spec.title || "Premium", paidRecords(pool, 12), { kicker: "Governed pricing" });
    case "type":        return mk(spec.title || typeLabel(spec.type, true), typeRecords(pool, spec.type, 12));
    case "recommended": {
      const records = recommendedRecords(pool, recentSlugs(cfg.slug, 4), relatedTo, 10);
      return mk(spec.title || "Related to what you opened", records, {
        kicker: "Suggested",
        note: "Chosen by shared collection, category and type — not by personal profiling.",
      });
    }
    case "collections": {
      const cols = collectionIndex(pool);
      if (!cols.length) return null;
      return section(spec.title || "Collections", {
        kicker: "Grouped",
        body: chips(cols, (c) => links.collection(c.name)),
        id: "collections",
      });
    }
    default: return null;
  }
}

function primaryActionLabel(cfg) {
  switch (cfg.lead) {
    case "LISTEN": return "Start listening";
    case "READ":   return "Start reading";
    case "OPEN":   return "See what runs";
    case "LEARN":  return "Start learning";
    case "BUY":    return "Browse the shop";
    default:       return "Explore";
  }
}

function viewBrowse(ctx, view) {
  const { pool, links, branch: cfg } = ctx;
  let items = pool;
  let title = `Everything in ${cfg.name}`;

  if (view.type) {
    items = byType(pool, view.type);
    title = typeLabel(view.type, true);
  }
  if (view.filter === "free") {
    items = splitByCost(items).free;
    title = `Free in ${cfg.name}`;
  }
  if (view.q) {
    items = search(items, view.q);
    title = `“${view.q}”`;
  }

  const form = h("form.sf-search", { role: "search", onsubmit: (e) => {
    e.preventDefault();
    const q = e.target.querySelector("input").value;
    window.history.pushState({}, "", links.browse({ type: view.type, q }));
    route();
  } }, [
    h("label.sf-sr", { for: "sfQ", text: "Search this house" }),
    h("input", { id: "sfQ", type: "search", name: "q", value: view.q || "", placeholder: `Search ${cfg.name}…`, autocomplete: "off" }),
    h("button.sf-btn", { type: "submit", text: "Search" }),
  ]);

  return h("div.sf-browse", null, [
    h("header.sf-browse-head", null, [
      h("p.sf-kicker", { text: "Browse" }),
      h("h1.sf-browse-h", { text: title }),
      h("p.sf-browse-count", { text: `${items.length} ${items.length === 1 ? "item" : "items"}` }),
    ]),
    form,
    cardGrid(items, links.detail, {
      title: view.q ? "Nothing matched" : "Nothing published here yet",
      body: view.q
        ? `No published item in ${cfg.name} matches “${view.q}”.`
        : "When House of Assets approves content for this house, it appears here automatically.",
      action: view.q ? { href: links.browse(), label: "Clear the search" } : null,
    }, (r) => ({ badge: typeLabel(r.type), identity: cfg.slug })),
  ]);
}

function viewCollections(ctx) {
  const { pool, links, branch: cfg } = ctx;
  const cols = collectionIndex(pool);
  const cats = categoryIndex(pool);

  return h("div.sf-cols", null, [
    h("header.sf-browse-head", null, [
      h("p.sf-kicker", { text: "Grouped" }),
      h("h1.sf-browse-h", { text: cfg.slug === "codexworldtv" ? "Series" : "Collections" }),
    ]),
    cols.length
      ? section("Collections", { body: chips(cols, (c) => links.collection(c.name)) })
      : emptyState({ title: "No collections yet", body: "Collections appear as soon as published content is grouped into them." }),
    cats.length ? section("Categories", { body: chips(cats, (c) => links.browse({ q: c.name })) }) : null,
  ]);
}

function viewCollection(ctx, name) {
  const { pool, links } = ctx;
  const items = pool.filter((r) => r.collections.includes(name));
  return h("div.sf-browse", null, [
    h("header.sf-browse-head", null, [
      h("p.sf-kicker", { text: "Collection" }),
      h("h1.sf-browse-h", { text: name }),
      h("p.sf-browse-count", { text: `${items.length} ${items.length === 1 ? "item" : "items"}` }),
    ]),
    cardGrid(items, links.detail, {
      title: "Nothing in this collection",
      body: "A collection lists only published items. None are published in this one.",
      action: { href: links.collections(), label: "All collections" },
    }, (r) => ({ badge: typeLabel(r.type), identity: cfg.slug })),
  ]);
}

/** The public word for a content type. Visitors never see MUSIC_RELEASE. */
function typeLabel(type, plural = false) {
  const one = {
    MUSIC_RELEASE: "Release", STORY: "Story", GAME: "Game", COURSE: "Course",
    TEACHING: "Teaching", SOFTWARE: "Tool", BOOK: "Book", PODCAST: "Episode", BUNDLE: "Collection",
  }[type] || "Item";
  if (!plural) return one;
  return one === "Story" ? "Stories" : `${one}s`;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
