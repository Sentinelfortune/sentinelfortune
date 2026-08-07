/**
 * Single point of configuration for every Shop page.
 *
 * SHOP_API_BASE must point at the deployed Shop Worker (see
 * CLOUDFLARE_SHOP_SETUP.md at the repo root). Until the Worker is deployed
 * and this value is updated, the Shop pages will show "unable to load
 * products" — that is expected and safe; it does not affect the existing
 * institutional site.
 */
window.SHOP_API_BASE = "https://sentinel-fortune-digital-shop-test.sentinelfortunellc.workers.dev";
