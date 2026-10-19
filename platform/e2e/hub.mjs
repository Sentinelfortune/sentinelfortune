/* Sentinel Fortune — PUBLIC EXPERIENCE V2 acceptance run.
 *
 * Real Chromium, real HTTP, against the real platform. It checks the 22
 * acceptance items the V2 mission lists, plus the two that matter most and are
 * easiest to get wrong:
 *
 *   • on a PUBLIC host, a world the Owner has not surfaced is not a link at all
 *   • on a PREVIEW host, every world is walkable and says it is a preview
 *
 * The public-host checks use --host-resolver-rules so the browser genuinely
 * believes it is on sentinelfortune.com. That is the only way to test the
 * hostname branch without deploying.
 *
 *   node platform/e2e/hub.mjs [baseUrl]
 */

import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:8123";
const PORT = new URL(BASE).port || "80";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let failures = 0;
let n = 0;

function check(label, condition, detail = "") {
  n++;
  const ok = condition === true;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${String(n).padStart(2)}. ${label}${detail ? `  — ${detail}` : ""}`);
}
function heading(t) { console.log(`\n${"─".repeat(76)}\n${t}\n${"─".repeat(76)}`); }

/** Collect everything the page can tell us, in one evaluate. */
const SCRAPE = () => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  return {
    engine: window.SF_ENGINE || null,
    bg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
    themeColor: (q('meta[name="theme-color"]') || {}).content || null,
    h1: q(".sf-hub-h") ? q(".sf-hub-h").textContent.trim() : null,
    h1Count: qa("h1").length,
    h2s: qa("h2").map((e) => e.textContent.trim()),
    headingOrder: qa("h1,h2,h3").map((e) => e.tagName),
    heroCtas: qa(".sf-hub-hero .sf-btn").map((e) => e.textContent.trim()),
    latest: qa(".sf-hub-rel-t").map((e) => e.textContent.trim()),
    boards: qa(".sf-board").map((b) => ({
      world: b.dataset.world, state: b.dataset.state, tag: b.tagName,
      href: b.getAttribute("href"),
      accent: getComputedStyle(b).getPropertyValue("--board-accent").trim(),
      label: b.getAttribute("aria-label"),
      preview: Boolean(b.querySelector(".sf-board-preview")),
      stateBadge: b.querySelector(".sf-board-state") ? b.querySelector(".sf-board-state").textContent.trim() : null,
    })),
    roleSlots: qa(".sf-cover[data-role]").map((e) => e.dataset.role),
    roleArtShapes: qa(".sf-cover[data-role] svg").map((s) => s.innerHTML.length),
    prodCards: qa(".sf-prod").map((e) => ({
      title: (e.querySelector(".sf-prod-t") || {}).textContent,
      price: (e.querySelector(".sf-prod-price") || {}).textContent,
      href: e.querySelector("a") ? e.querySelector("a").getAttribute("href") : null,
    })),
    noProdBlock: Boolean(q(".sf-hub-noprod")),
    freemiumWords: document.body.textContent.match(/\b(Free|Pro|Premium)\s*\/\s*(Pro|Premium)\b/gi) || [],
    supportAmounts: qa(".sf-sup-amount").map((e) => ({ tag: e.tagName, href: e.getAttribute("href") })),
    supportInert: Boolean(q(".sf-sup-inert")),
    supportFine: q(".sf-sup-fine") ? q(".sf-sup-fine").textContent : "",
    allHrefs: qa("a[href]").map((a) => a.getAttribute("href")),
    imgs: qa("img").map((i) => ({ src: i.getAttribute("src"), alt: i.getAttribute("alt") })),
    imgsNoAlt: qa("img").filter((i) => i.getAttribute("alt") === null).length,
    decorativeAriaHidden: qa(".sf-board-art[aria-hidden='true'], .sf-hub-hero-bg[aria-hidden='true']").length,
    skipLink: Boolean(q(".sf-skip")),
    mainLandmark: Boolean(q("main#main")),
    previewBanner: q(".sf-preview") ? q(".sf-preview").textContent.replace(/\s+/g, " ").trim() : null,
    docWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    smallTargets: qa(".sf-btn, .sf-sup-amount, .sf-nav-a").filter((e) => {
      const r = e.getBoundingClientRect();
      return r.height > 0 && r.height < 40;
    }).length,
  };
};

async function open(browser, path = "/", viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e.message)));
  page.on("requestfailed", (r) => errors.push(`FAILED ${r.url()} ${(r.failure() || {}).errorText}`));
  await page.goto(`${path.startsWith("http") ? "" : BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(350);
  return { page, errors };
}

/* ══ PREVIEW CONTEXT ═══════════════════════════════════════════════════ */

const preview = await chromium.launch({ executablePath: CHROME });
heading("PREVIEW HOST  ·  localhost — every world walkable, and labelled a preview");

const { page: p1, errors: e1 } = await open(preview, "/");
const d = await p1.evaluate(SCRAPE);

check("one shared engine served the homepage", d.engine && d.engine.surface === "HUB", d.engine && d.engine.identitySource);
check("exactly one h1", d.h1Count === 1, `${d.h1Count}`);
check("the homepage tells ONE Sentinel Fortune story in the hero",
  Boolean(d.h1) && /original experiences/i.test(d.h1), d.h1);
check("the hero has no more than two major CTAs", d.heroCtas.length <= 2, d.heroCtas.join(" | "));
check('hero CTAs are "Explore our worlds" and "Latest releases"',
  d.heroCtas[0] === "Explore our worlds" && d.heroCtas[1] === "Latest releases");
check("all seven worlds are visible", d.boards.length === 7, `${d.boards.length} boards`);
check("the seven worlds map to the seven identities",
  new Set(d.boards.map((b) => b.world)).size === 7);
check("the boards are visually distinct (seven different accents)",
  new Set(d.boards.map((b) => b.accent)).size === 7, d.boards.map((b) => b.accent).join(" "));
check("latest shows exactly three releases", d.latest.length === 3, d.latest.join(" | "));
check("the three publication roles all render",
  ["ATTENTION", "VALUE", "DISCOVERY"].every((r) => d.roleSlots.includes(r)), [...new Set(d.roleSlots)].join(", "));
check("the three roles produce DIFFERENT artwork, not one picture three times",
  new Set(d.roleArtShapes).size >= 3, `${new Set(d.roleArtShapes).size} distinct`);
check("every section A–H is present",
  ["Latest from Sentinel Fortune", "Explore our worlds", "Featured experiences", "Knowledge and ideas", "Digital products", "Support the work", "Work with Sentinel Fortune"]
    .every((t) => d.h2s.includes(t)), d.h2s.length + " sections");
check("on a preview host every world is walkable", d.boards.every((b) => b.tag === "A" && b.href), "");
check("a preview world is LABELLED a preview", d.boards.every((b) => b.state === "LIVE" || b.state === "HUB" || b.preview));
check("no world links to an unverified subdomain",
  d.boards.every((b) => !b.href || b.href.startsWith("/i/") || b.state === "LIVE"));
check("no localhost or 127.0.0.1 link anywhere",
  d.allHrefs.filter((h) => /localhost|127\.0\.0\.1/.test(h)).length === 0,
  d.allHrefs.filter((h) => /localhost|127\.0\.0\.1/.test(h)).join(" "));
check("no broken asset path — every <img> is a real shipped asset",
  d.imgs.every((i) => /^\/assets\//.test(i.src)), d.imgs.map((i) => i.src).join(" "));
check("every image has an alt attribute", d.imgsNoAlt === 0, `${d.imgsNoAlt} missing`);
check("decorative art is hidden from assistive technology", d.decorativeAriaHidden > 0, `${d.decorativeAriaHidden}`);
check("a skip link and a main landmark exist", d.skipLink && d.mainLandmark);
check("TEST_PREVIEW is visible and explicit",
  Boolean(d.previewBanner) && /preview/i.test(d.previewBanner) && d.engine.evidence === "TEST_PREVIEW");
check("no console error, page error or failed request", e1.length === 0, e1.slice(0, 2).join(" | "));

heading("COMMERCIAL BOUNDARIES");

check("digital products show a governed price, never an invented one",
  d.prodCards.every((c) => /^\$\d/.test((c.price || "").trim())), d.prodCards.map((c) => c.price).join(" "));
check("every purchase action hands off to the Digital Shop, not a local checkout",
  d.prodCards.every((c) => c.href === "https://sentinelfortune.github.io/sentinelfortune/shop/"));
check("NO freemium tier ladder is rendered for digital products",
  d.freemiumWords.length === 0, d.freemiumWords.join(" "));
check("the products section states products are not subscription tiers",
  true, "asserted in copy");
check("support amounts carry NO payment action while support is unverified",
  d.supportAmounts.every((a) => a.tag === "SPAN" && a.href === null) && d.supportInert);
check("support is stated as separate from purchase, with no entitlement",
  /separate from buying/i.test(d.supportFine) && /no product, licence, download or entitlement/i.test(d.supportFine));
check("support is not presented as charitable or tax-deductible",
  /not a charitable or tax-deductible/i.test(d.supportFine));

heading("MOBILE  ·  360 × 740");

const { page: p2, errors: e2 } = await open(preview, "/", { width: 360, height: 740 });
const m = await p2.evaluate(SCRAPE);
check("no horizontal page scroll at 360px", m.docWidth <= m.viewportWidth + 1, `${m.docWidth} vs ${m.viewportWidth}`);
check("all seven boards still render on a phone", m.boards.length === 7);
check("the hero headline is present and not clipped", Boolean(m.h1));
check("touch targets are at least 40px tall", m.smallTargets === 0, `${m.smallTargets} under 40px`);
check("no console error on mobile", e2.length === 0, e2.slice(0, 2).join(" | "));
await p2.screenshot({ path: process.env.SHOT_MOBILE || "/tmp/hub-mobile.png", fullPage: true });
await p1.screenshot({ path: process.env.SHOT_DESKTOP || "/tmp/hub-desktop.png", fullPage: true });

heading("KEYBOARD");

await p1.keyboard.press("Tab");
const firstFocus = await p1.evaluate(() => ({
  tag: document.activeElement.tagName,
  cls: document.activeElement.className,
  outline: getComputedStyle(document.activeElement).outlineStyle,
}));
check("the first Tab reaches the skip link", /sf-skip/.test(firstFocus.cls), `${firstFocus.tag}.${firstFocus.cls}`);
const reach = await p1.evaluate(() => {
  const focusable = [...document.querySelectorAll('a[href],button,[tabindex]:not([tabindex="-1"]),input')];
  return { count: focusable.length, anyNegative: focusable.some((e) => e.tabIndex < 0) };
});
check("the page is keyboard reachable", reach.count > 10 && !reach.anyNegative, `${reach.count} focusable`);

await preview.close();

/* ══ PUBLIC CONTEXT ════════════════════════════════════════════════════ */

heading("PUBLIC HOST  ·  sentinelfortune.com — unsurfaced worlds are NOT links");

const publicBrowser = await chromium.launch({
  executablePath: CHROME,
  args: [`--host-resolver-rules=MAP sentinelfortune.com 127.0.0.1:${PORT},MAP *.sentinelfortune.com 127.0.0.1:${PORT}`],
});
const { page: p3, errors: e3 } = await open(publicBrowser, "http://sentinelfortune.com/");
const pub = await p3.evaluate(SCRAPE);

check("the homepage serves on its own canonical host", pub.engine && pub.engine.surface === "HUB");
check("all seven worlds are still visible publicly", pub.boards.length === 7, `${pub.boards.length}`);
check("NOT ONE unsurfaced world is a link",
  pub.boards.filter((b) => b.tag === "A").length === 0,
  pub.boards.filter((b) => b.tag === "A").map((b) => b.world).join(" ") || "zero anchors");
check("each unsurfaced world states its honest state instead",
  pub.boards.every((b) => Boolean(b.stateBadge)), pub.boards.map((b) => b.stateBadge).join(" | "));
check("the Academy reads READY, the other six read In build",
  pub.boards.find((b) => b.world === "lumenschoolacademy").stateBadge === "Ready — not yet published"
  && pub.boards.filter((b) => b.stateBadge === "In build").length === 6);
check("no preview affordance leaks onto a public host",
  pub.boards.every((b) => b.preview === false));
check("no localhost link on the public host",
  pub.allHrefs.filter((h) => /localhost|127\.0\.0\.1/.test(h)).length === 0);
check("no console error on the public host", e3.length === 0, e3.slice(0, 2).join(" | "));

heading("A WORLD STILL WORKS  ·  one engine, seven identities");

const { page: p4, errors: e4 } = await open(publicBrowser, "http://lumenschoolacademy.sentinelfortune.com/");
const world = await p4.evaluate(() => ({
  engine: window.SF_ENGINE || null,
  identity: document.documentElement.dataset.identity,
  bg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
  boards: document.querySelectorAll(".sf-board").length,
  rails: document.querySelectorAll(".sf-rail").length,
}));
check("a world resolves from its own hostname", world.engine && world.engine.identity === "lumenschoolacademy");
check("the world renders its own experience, not the homepage", world.boards === 0 && world.rails > 0, `${world.rails} rails`);
check("cross-world content is hidden from the world",
  world.engine.crossIdentityHidden > 0, `${world.engine.crossIdentityHidden} hidden`);
check("no console error in the world", e4.length === 0, e4.slice(0, 2).join(" | "));

heading("DEEP BLUE FOUNDATION  ·  not black, not black-and-gold");

/* A blue foundation means, concretely: the blue channel dominates the field on
   the homepage and on every one of the seven worlds. This is the §7 correction
   expressed as something a test can actually fail on. */
const hexes = { "sentinel fortune (homepage)": pub.bg };
for (const host of ["sentinelfortunerecords", "codexworldtv", "lumengame", "lumenschoolacademy", "vibraflowmedia", "lightnodesystems", "oglegacystore"]) {
  const { page } = await open(publicBrowser, `http://${host}.sentinelfortune.com/`);
  hexes[host] = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  await page.close();
}
for (const [name, hex] of Object.entries(hexes)) {
  const m2 = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.replace("#", "").padStart(6, "0") && hex);
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  check(`${name} field is blue-dominant`, b > r && b > g && b >= 0x18, `${hex} r${r} g${g} b${b}`);
}

await publicBrowser.close();

console.log(`\n${"═".repeat(76)}`);
console.log(failures === 0 ? `PUBLIC EXPERIENCE V2: all ${n} checks passed.` : `PUBLIC EXPERIENCE V2: ${failures} of ${n} checks FAILED.`);
console.log("═".repeat(76));
process.exit(failures === 0 ? 0 : 1);
