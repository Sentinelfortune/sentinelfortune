/* Sentinel Fortune — SEO / CANONICAL METADATA.
 *
 * One implementation for all seven branches. Title, description, canonical,
 * Open Graph and JSON-LD are set from the governed record and the branch
 * config — never hand-written per page, because there are no hand-written
 * pages.
 *
 * TWO RULES THAT MATTER MORE THAN THE REST:
 *
 * 1. The canonical always names the PRODUCTION hostname, even on a preview.
 *    A preview is a copy; pointing its canonical at itself puts the copy in
 *    the index competing with the original.
 *
 * 2. A preview feed is noindex. Test fixtures must never be indexable, and
 *    that decision is made from the feed's own evidence marker rather than
 *    from where the app happens to be deployed.
 */

import { canonicalUrl } from "./router.js";
import { priceState } from "./commerce.js";

function meta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    const [, key, val] = selector.match(/\[(\w+)="([^"]+)"\]/) || [];
    if (key && val) el.setAttribute(key, val);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function link(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Apply metadata for the current view.
 *
 * `evidence` decides indexability: anything other than LIVE is noindex.
 */
export function applySeo({ branch, route, record = null, evidence = "TEST_PREVIEW" } = {}) {
  const title = pageTitle(branch, route, record);
  const description = pageDescription(branch, route, record);
  /* `canonicalUrl` resolves the seven worlds. The company homepage is not one
     of them, so it falls back to its own declared host — otherwise the one
     page most likely to be shared is the one page with no canonical. */
  const canonical = canonicalUrl(branch.slug, route)
    || (branch.host ? `https://${branch.host}/` : null);

  document.title = title;
  document.documentElement.lang = "en";

  meta('meta[name="description"]', "content", description);
  meta('meta[name="robots"]', "content", evidence === "LIVE" ? "index,follow,max-image-preview:large" : "noindex,nofollow");
  if (canonical) link("canonical", canonical);

  meta('meta[property="og:type"]', "content", record ? "article" : "website");
  meta('meta[property="og:site_name"]', "content", branch.name);
  meta('meta[property="og:title"]', "content", title);
  meta('meta[property="og:description"]', "content", description);
  if (canonical) meta('meta[property="og:url"]', "content", canonical);

  /* A record's own governed image wins. Failing that, a branch may declare a
     share image — the homepage does. An absolute URL either way, because a
     relative og:image is ignored by most crawlers. */
  const recordImage = record && record.media.find((m) => m.kind === "IMAGE");
  const shareSrc = recordImage ? recordImage.src
    : (branch.shareImage && branch.host ? `https://${branch.host}${branch.shareImage}` : null);
  if (shareSrc) {
    const absolute = /^https?:\/\//.test(shareSrc) || !branch.host ? shareSrc : `https://${branch.host}${shareSrc}`;
    meta('meta[property="og:image"]', "content", absolute);
    meta('meta[name="twitter:image"]', "content", absolute);
  }
  meta('meta[name="twitter:card"]', "content", "summary_large_image");
  meta('meta[name="twitter:title"]', "content", title);
  meta('meta[name="twitter:description"]', "content", description);

  applyJsonLd({ branch, route, record, canonical, evidence });
}

function pageTitle(branch, route, record) {
  if (record) return `${record.title} · ${branch.name}`;
  switch (route.view) {
    case "browse":      return `Browse · ${branch.name}`;
    case "collections": return `Collections · ${branch.name}`;
    case "collection":  return `${route.name} · ${branch.name}`;
    case "notfound":    return `Not found · ${branch.name}`;
    default:            return `${branch.name} — ${branch.promise}`;
  }
}

function pageDescription(branch, route, record) {
  if (record) return (record.summary || record.description || branch.promise).slice(0, 300);
  return `${branch.job} ${branch.promise}`.slice(0, 300);
}

/**
 * Structured data, emitted only where the visible page supports it.
 *
 * A `Product` with an `offers` block is emitted ONLY for a record with a
 * governed price. No `aggregateRating`, no `reviewCount` — there are no
 * reviews, so claiming any would be fabricated markup, and a preview feed
 * gets no Product markup at all.
 */
function applyJsonLd({ branch, route, record, canonical, evidence }) {
  let el = document.head.querySelector('script[type="application/ld+json"]#sf-ld');
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = "sf-ld";
    document.head.appendChild(el);
  }

  const graph = [
    {
      "@type": "Organization",
      "@id": "https://sentinelfortune.com/#organization",
      name: "Sentinel Fortune LLC",
      url: "https://sentinelfortune.com/",
    },
    {
      "@type": "WebSite",
      "@id": `https://${branch.host}/#website`,
      url: `https://${branch.host}/`,
      name: branch.name,
      description: branch.job,
      publisher: { "@id": "https://sentinelfortune.com/#organization" },
      inLanguage: "en",
    },
  ];

  if (record && evidence === "LIVE") {
    const money = priceState(record);
    const node = {
      "@type": money.state === "PAID" ? "Product" : "CreativeWork",
      "@id": `${canonical}#item`,
      name: record.title,
      description: record.summary || record.description || "",
      url: canonical,
      publisher: { "@id": "https://sentinelfortune.com/#organization" },
    };
    if (money.state === "PAID") {
      node.offers = {
        "@type": "Offer",
        price: money.price.amount,
        priceCurrency: money.price.currency,
        availability: "https://schema.org/InStock",
        url: record.cta ? record.cta.destination : canonical,
      };
    } else if (money.state === "FREE") {
      node.isAccessibleForFree = true;
    }
    graph.push(node);
  }

  el.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

/** Paint the branch's atmosphere tokens. One family, seven worlds: the shared
 *  stylesheet reads these variables, so a branch changes its world without a
 *  second stylesheet. */
export function applyTheme(branch) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(branch.theme)) {
    root.style.setProperty(`--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value);
  }
  root.dataset.identity = branch.slug;
  root.dataset.mood = branch.theme.mood;
  meta('meta[name="theme-color"]', "content", branch.theme.bg);
}
