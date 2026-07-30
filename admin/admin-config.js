/**
 * Owner Admin — single point of configuration.
 *
 * Mirrors the storefront's shop/shop-config.js convention deliberately: every
 * environment-dependent value the browser needs lives in exactly one config
 * file per front end, never inline in application logic. The Owner edits this
 * file; admin.js is never edited to change an environment.
 *
 * SHOP_API_BASE must point at the deployed Shop Worker (see
 * CLOUDFLARE_SHOP_SETUP.md). Until it is set, every admin request fails
 * visibly with a clear "Shop Worker URL is not configured" message rather
 * than silently pointing somewhere wrong.
 *
 * NOTE: this file is served from the Owner Admin's Cloudflare Pages
 * deployment (behind Cloudflare Access), NOT from GitHub Pages — `admin/` is
 * excluded from the Pages publication surface in the repository's _config.yml.
 * The Worker URL here is not a secret: it is a public endpoint that
 * independently authenticates every admin request against Cloudflare Access.
 */
window.SHOP_API_BASE = "https://REPLACE_WITH_SHOP_WORKER_URL.workers.dev";
