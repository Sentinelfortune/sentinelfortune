/* Sentinel Fortune — EDITORIAL -> DIGITAL SHOP: THE ONE GOVERNED POINTER.
 *
 *   free editorial record  --product_ref-->  Shop product page  -->  Shop checkout
 *
 * A free teaching may point a reader at a real product. It may not become one.
 * Price, licence, checkout and entitlement belong to House of Assets and the
 * Digital Shop (DIGITAL_PRODUCT_COMMERCIAL_BOUNDARY.md); the corridor's only
 * commercial capability is to say "this product exists — go and look at it".
 *
 * THE HOLE THIS CLOSES. `create_draft` stored the caller's `cta` verbatim. The
 * engine already refuses a BUY on a FREE record, but an OPEN action was taken
 * as given, so an assistant could publish
 *     { kind: "OPEN", label: "Buy now · $49", destination: "<shop>/product.html?slug=x" }
 * — an invented price, under the Owner's approval, pointing at a product
 * nobody checked exists. That is a second commercial authority by accident.
 *
 * THREE RULES:
 *   1. A link into the Shop is expressible ONLY as `product_ref: { shop_slug }`.
 *      The corridor builds the URL and the label itself; the caller supplies
 *      neither, so neither can carry a price or a checkout.
 *   2. A free-form editorial CTA may not carry commercial wording, may not be
 *      a BUY, and may not link into the Shop or a checkout.
 *   3. A record with a product_ref publishes only after the Shop's own PUBLIC
 *      catalogue confirms that product is published. No catalogue configured,
 *      unreachable, or product absent: the publish is refused. The Shop is
 *      asked, never assumed.
 *
 * No secret is involved: the Shop catalogue is the same public endpoint the
 * storefront reads (`GET /shop/products/:slug`).
 */

/* The storefront's product page (shop/product.js reads ?slug=). The same Shop
   origin the engine's hub links to (engine/hub.js SHOP). */
const SHOP_ORIGIN_HOST = "sentinelfortune.github.io";
const SHOP_PATH_PREFIX = "/sentinelfortune/shop";
const SHOP_PRODUCT_PAGE = `https://${SHOP_ORIGIN_HOST}${SHOP_PATH_PREFIX}/product.html`;
const PRODUCT_LABEL = "See the product";

/* The Shop Worker's own slug discipline: lowercase words, single hyphens. */
const SHOP_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* Editorial actions. BUY is absent on purpose — the corridor has no price to
   put next to it. DOWNLOAD is built from `attachments`, never stated. */
const EDITORIAL_CTA_KINDS = ["READ", "LISTEN", "WATCH", "OPEN", "LEARN", "SUPPORT"];

/* Wording that makes a commercial claim, EN and FR. A label is the visitor's
   reading of the action, so a price or a "buy" in it is a commercial term
   whichever `kind` it rides on. */
const COMMERCIAL_WORDING =
  /[$€£¥]|\b(usd|eur|gbp|cad)\b|\b(buy|purchase|checkout|cart|order now|price|pricing|discount|sale|acheter|achat|commander|prix|panier|promo)\b/i;
const CHECKOUT_DESTINATION = /\/checkout|\/cart|stripe\.com/i;

function isShopDestination(href) {
  let url;
  try { url = new URL(href, "https://onecompany.sentinelfortune.com"); } catch { return false; }
  return url.hostname === SHOP_ORIGIN_HOST && url.pathname.startsWith(SHOP_PATH_PREFIX);
}

/** The one Shop CTA the corridor can emit. Built here, never supplied. */
function shopProductCta(slug) {
  return {
    kind: "OPEN",
    label: PRODUCT_LABEL,
    destination: `${SHOP_PRODUCT_PAGE}?slug=${encodeURIComponent(slug)}`,
  };
}

const refuse = (error, detail, extra = {}) => ({ error, detail, ...extra });

/**
 * Decide the record's action from what the caller sent.
 *
 *   { cta, product_ref } and the caller's attachments decision
 *   -> { cta, product_ref }  or  { error, detail }
 *
 * `governedSrc` is the corridor's own host check, passed in so there is one
 * allow-list, not two that drift.
 */
function governEditorialCta(body, { governedSrc, hasAttachments, fallback }) {
  const ref = body.product_ref;
  const cta = body.cta;

  if (ref !== undefined && ref !== null) {
    if (cta) return refuse("CTA_CONFLICT", "send either cta or product_ref; a record has one action");
    if (hasAttachments) return refuse("CTA_CONFLICT", "a record with attachments already has a DOWNLOAD action; product_ref would replace it");
    const slug = ref && typeof ref === "object" ? ref.shop_slug : undefined;
    if (typeof slug !== "string" || slug.length > 80 || !SHOP_SLUG_RE.test(slug)) {
      return refuse("PRODUCT_REF_INVALID", "product_ref must be { shop_slug } with the Shop product's slug (lowercase words joined by single hyphens)");
    }
    const extraKeys = Object.keys(ref).filter((k) => k !== "shop_slug");
    if (extraKeys.length) {
      /* price, title, url... — the Shop states those, the corridor does not. */
      return refuse("PRODUCT_REF_INVALID", "product_ref carries only shop_slug; price, title and links come from the Shop", { refused_fields: extraKeys });
    }
    return { cta: shopProductCta(slug), product_ref: { shop_slug: slug } };
  }

  if (cta === undefined || cta === null) return { cta: fallback, product_ref: null };
  if (typeof cta !== "object") return refuse("EDITORIAL_CTA_REFUSED", "cta must be an object");

  if (cta.kind === "BUY") {
    return refuse("EDITORIAL_CTA_REFUSED", "the corridor cannot emit BUY; point at a Shop product with product_ref and the Shop sells it");
  }
  if (!EDITORIAL_CTA_KINDS.includes(cta.kind)) {
    return refuse("EDITORIAL_CTA_REFUSED", `cta.kind must be one of ${EDITORIAL_CTA_KINDS.join(", ")}`);
  }
  for (const key of ["price", "amount", "currency", "checkout_url", "checkoutUrl"]) {
    if (cta[key] !== undefined) return refuse("EDITORIAL_CTA_REFUSED", `cta.${key} is not editorial authority`);
  }
  const label = cta.label === undefined || cta.label === null ? null : String(cta.label);
  if (label !== null && COMMERCIAL_WORDING.test(label)) {
    return refuse("EDITORIAL_CTA_REFUSED", "cta.label makes a commercial claim (a price, a currency or a purchase word); prices are stated by the Shop");
  }
  const destination = governedSrc(cta.destination);
  if (!destination) return refuse("EDITORIAL_CTA_REFUSED", "cta.destination must be site-relative or https on an allowed Sentinel Fortune host");
  if (CHECKOUT_DESTINATION.test(destination)) return refuse("EDITORIAL_CTA_REFUSED", "an editorial cta may not link into a checkout");
  if (isShopDestination(destination)) {
    return refuse("SHOP_LINK_REQUIRES_PRODUCT_REF", "a link into the Shop is made with product_ref: { shop_slug }, so the Shop can confirm the product before publication");
  }
  return { cta: { kind: cta.kind, label, destination }, product_ref: null };
}

/**
 * Ask the Shop whether a product is published. Never throws.
 *
 *   -> { verified: true, product: { slug, title, buyable } }
 *   -> { verified: false, error, detail }
 *
 * `apiBase` is the Shop Worker's public origin (SHOP_API_BASE). Unset means
 * the Shop cannot be asked, which refuses rather than waves through.
 */
async function verifyShopProduct(slug, { apiBase, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  if (!apiBase) {
    return { verified: false, error: "SHOP_PRODUCT_UNVERIFIED", detail: "the Shop catalogue is not configured (SHOP_API_BASE), so the product cannot be confirmed; publication is refused" };
  }
  let base;
  try { base = new URL(apiBase); } catch { base = null; }
  if (!base || base.protocol !== "https:") {
    return { verified: false, error: "SHOP_PRODUCT_UNVERIFIED", detail: "SHOP_API_BASE must be an https origin" };
  }
  const url = `${base.origin}/shop/products/${encodeURIComponent(slug)}`;
  let res;
  try {
    const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
    res = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json" }, signal });
  } catch {
    return { verified: false, error: "SHOP_UNREACHABLE", detail: "the Shop catalogue did not answer; nothing was published" };
  }
  if (res.status === 404) {
    return { verified: false, error: "SHOP_PRODUCT_NOT_PUBLISHED", detail: `the Shop has no published product "${slug}"` };
  }
  if (!res.ok) return { verified: false, error: "SHOP_UNREACHABLE", detail: `the Shop catalogue answered ${res.status}; nothing was published` };
  let body;
  try { body = await res.json(); } catch { body = null; }
  const p = body && body.ok === true && body.product;
  /* The Shop must name the product it was asked about. A catalogue that
     answers 200 with someone else's product has not confirmed this one. */
  if (!p || p.slug !== slug) {
    return { verified: false, error: "SHOP_PRODUCT_NOT_PUBLISHED", detail: "the Shop's answer did not confirm this product" };
  }
  return { verified: true, product: { slug: p.slug, title: String(p.title || ""), buyable: p.buyable === true } };
}

module.exports = {
  SHOP_PRODUCT_PAGE, EDITORIAL_CTA_KINDS,
  shopProductCta, governEditorialCta, verifyShopProduct, isShopDestination,
};
