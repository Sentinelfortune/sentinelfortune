/* Sentinel Fortune — IDENTITY ROUTER.
 *
 *   request hostname -> resolve identity -> load core -> load branch config
 *   -> load governed content -> render specialized branch experience
 *
 * One runtime serves all seven. The hostname decides which house a visitor is
 * standing in; the path decides which room.
 *
 * Pure functions over strings. No DOM, no fetch — so every routing rule is
 * testable without a browser, including the seven production hostnames that
 * cannot be visited from a test.
 */

import { HOST_MAP, BRANCHES, branch } from "./identities.js";
import { isIdentity } from "./core.js";

/* ─────────────────────────────────────────────────────────────────────────
   IDENTITY RESOLUTION
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Which house is this request in?
 *
 * Three sources, in strict order of authority:
 *
 *   1. the canonical hostname          — production. The only one that counts
 *                                        once the subdomains are serving.
 *   2. an `/i/<slug>/…` path prefix    — development and preview, where every
 *                                        branch shares one vercel.app host.
 *   3. an `?i=<slug>` query parameter  — same, for a quick link.
 *
 * Hostname wins outright. On a canonical host the dev overrides are IGNORED,
 * not merged: being able to make the record label render the academy by adding
 * a query string would be a cross-identity leak reachable from the address bar.
 *
 * Returns `{ identity, source, devPrefix }` or `{ identity: null, reason }`.
 */
export function resolveIdentity({ hostname = "", pathname = "/", search = "" } = {}) {
  const host = String(hostname).toLowerCase().replace(/:\d+$/, "");

  if (HOST_MAP[host]) {
    return { identity: HOST_MAP[host], source: "HOSTNAME", devPrefix: "" };
  }

  // Not a canonical host: this is local, a preview, or an unknown host.
  const prefix = pathname.match(/^\/i\/([a-z0-9-]+)(?=\/|$)/);
  if (prefix && isIdentity(prefix[1])) {
    return { identity: prefix[1], source: "PATH", devPrefix: `/i/${prefix[1]}` };
  }

  const params = new URLSearchParams(search || "");
  const q = params.get("i");
  if (q && isIdentity(q)) {
    return { identity: q, source: "QUERY", devPrefix: "" };
  }

  return { identity: null, reason: "NO_IDENTITY", host };
}

/** True when this hostname is one of the seven canonical public hosts. Used to
 *  decide whether to offer the development identity picker: it must never
 *  appear in front of the public. */
export function isCanonicalHost(hostname = "") {
  return Boolean(HOST_MAP[String(hostname).toLowerCase().replace(/:\d+$/, "")]);
}

/* ─────────────────────────────────────────────────────────────────────────
   VIEW RESOLUTION
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Which room?
 *
 *   /                      home
 *   /browse                browse everything this house owns
 *   /browse?type=COURSE    browse one type
 *   /browse?q=…            search
 *   /collections           every collection in this house
 *   /c/<name>              one collection
 *   /<segment>/<slug>      a detail page, where <segment> is the branch's own
 *                          public word for its primary object — release,
 *                          story, play, learn, reflect, systems, offer
 *
 * The detail segment is per-branch deliberately. /release/… and /learn/… are
 * different URLs for different things, and a visitor reading the address bar
 * should be able to tell which house they are in without the hostname.
 *
 * An unknown path resolves to `notfound` rather than silently falling back to
 * home: a wrong URL that renders the homepage hides broken links.
 */
export function resolveView({ identity, pathname = "/", search = "", devPrefix = "" } = {}) {
  const cfg = branch(identity);
  if (!cfg) return { view: "notfound", reason: "UNKNOWN_IDENTITY" };

  let path = String(pathname);
  if (devPrefix && path.startsWith(devPrefix)) path = path.slice(devPrefix.length) || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/+$/, "") || "/";

  const params = new URLSearchParams(search || "");

  if (path === "/" || path === "/index.html") {
    return { view: "home" };
  }
  if (path === "/browse") {
    return {
      view: "browse",
      type: params.get("type") || null,
      q: params.get("q") || "",
      filter: params.get("filter") || null,
    };
  }
  if (path === "/collections") {
    return { view: "collections" };
  }

  const collection = path.match(/^\/c\/([^/]+)$/);
  if (collection) {
    return { view: "collection", name: decodeURIComponent(collection[1]) };
  }

  const detail = path.match(/^\/([a-z0-9-]+)\/([a-z0-9-]+)$/);
  if (detail && detail[1] === cfg.segment) {
    return { view: "detail", slug: detail[2] };
  }

  return { view: "notfound", reason: "NO_ROUTE", path };
}

/* ─────────────────────────────────────────────────────────────────────────
   LINK BUILDING
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Build in-branch links that are correct on BOTH the canonical hostname and a
 * shared preview host. Everything the renderers emit goes through here, which
 * is why a preview deployment does not need a different build of the app.
 */
export function links(identity, devPrefix = "") {
  const cfg = branch(identity);
  const base = devPrefix || "";
  return {
    home: () => `${base}/` || "/",
    browse: (opts = {}) => {
      const p = new URLSearchParams();
      if (opts.type) p.set("type", opts.type);
      if (opts.q) p.set("q", opts.q);
      if (opts.filter) p.set("filter", opts.filter);
      const qs = p.toString();
      return `${base}/browse${qs ? `?${qs}` : ""}`;
    },
    collections: () => `${base}/collections`,
    collection: (name) => `${base}/c/${encodeURIComponent(name)}`,
    detail: (record) => `${base}/${cfg.segment}/${record.slug}`,
  };
}

/**
 * The canonical absolute URL for a view — always the PRODUCTION hostname, even
 * when rendered on a preview host.
 *
 * This is what a canonical tag and a share link must carry. A preview is a
 * copy; pointing its canonical at itself would put the copy into a search
 * index competing with the original.
 */
export function canonicalUrl(identity, route) {
  const cfg = branch(identity);
  if (!cfg) return null;
  const origin = `https://${cfg.host}`;
  switch (route.view) {
    case "home":        return `${origin}/`;
    case "browse":      return `${origin}/browse`;
    case "collections": return `${origin}/collections`;
    case "collection":  return `${origin}/c/${encodeURIComponent(route.name)}`;
    case "detail":      return `${origin}/${cfg.segment}/${route.slug}`;
    default:            return `${origin}/`;
  }
}

/** Every canonical host, for the hub and the institutional site to link to. */
export function canonicalHosts() {
  return Object.values(BRANCHES).map((b) => ({
    identity: b.slug, name: b.name, host: b.host, url: `https://${b.host}/`,
  }));
}
