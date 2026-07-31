/**
 * Owner Admin — single point of configuration.
 *
 * Mirrors the storefront's shop/shop-config.js convention deliberately: every
 * environment-dependent value the browser needs lives in exactly one config
 * file per front end, never inline in application logic. The Owner edits this
 * file; admin.js is never edited to change an environment.
 *
 * SHOP_API_BASE is a SAME-ORIGIN path, not a hostname, and must stay that way.
 *
 * The admin browser must only ever call its own Cloudflare Pages origin. That
 * origin is the one Cloudflare Access protects, so it is the only one the
 * Access session applies to: the CF_Authorization cookie is scoped to this
 * hostname, and the Cf-Access-Jwt-Assertion header is injected by Cloudflare
 * only on requests to this hostname.
 *
 * Pointing this at the Worker's *.workers.dev hostname instead — as it was
 * originally — makes every admin call cross-site. The Access cookie is not
 * sent, the header cannot be set by page JavaScript, the Worker sees no token,
 * and it correctly answers 401. The admin then shows "Access Denied" even
 * though the Access login succeeded.
 *
 * /api/* is served by functions/api/[[path]].ts in this Pages project, which
 * runs server-side, reads the Access token from the authenticated request, and
 * forwards it to the Shop Worker. The token is never exposed to this page.
 *
 * NOTE: this file is served from the Owner Admin's Cloudflare Pages
 * deployment (behind Cloudflare Access), NOT from GitHub Pages — `admin/` is
 * excluded from the Pages publication surface in the repository's _config.yml.
 */
window.SHOP_API_BASE = "/api";
