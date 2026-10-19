/* ACCEPTANCE GATE — real Chromium, all seven branches.
 *
 * Verifies the fifteen branch checks and the shared-engine checks from the
 * mission brief against the actual runtime, served as a preview host would
 * serve it. Nothing here is inferred from source.
 *
 * Usage: node platform/e2e/acceptance.mjs <platform-dir>
 */

import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOT = process.argv[2] || new URL("..", import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8899);
const CHROME = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
};

/* Serves the platform the way the hosting target must: every unknown path
   falls back to index.html, which is what makes dynamic detail routes work
   without a generated page per record. */
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  let file = join(ROOT, p);
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(ROOT, "index.html");            // SPA fallback
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("404");
  }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ executablePath: CHROME });

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`    PASS  ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`    FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function newPage(ctx) {
  const page = await (ctx || browser).newPage();
  /* Google Fonts is unreachable from this sandbox and would hang every load.
     It is decoration; no assertion depends on a webfont. */
  await page.route("**/*", (r) =>
    /fonts\.(googleapis|gstatic)/.test(r.request().url()) ? r.abort() : r.continue());
  page.setDefaultTimeout(15000);
  return page;
}

const U = (p) => `http://localhost:${PORT}${p}`;

/* The seven, with the one fixture slug each must be able to show. */
const BRANCHES = [
  { slug: "sentinelfortunerecords", name: "Sentinel Fortune Records", seg: "release", fixture: "origin-echo",            renderer: ".rn-deck",     nav: "Releases" },
  { slug: "codexworldtv",           name: "Codex World TV",           seg: "story",   fixture: "the-quiet-wire",         renderer: ".cx-spine, .cx-pos, .sf-detail", nav: "Stories" },
  { slug: "lumengame",              name: "Lumen Game",               seg: "play",    fixture: "s5-ascent-lite",         renderer: ".gm-cab",      nav: "Play" },
  { slug: "lumenschoolacademy",     name: "Lumen School Academy",     seg: "learn",   fixture: "floor",                  renderer: ".ws-contract, .ws-facts", nav: "Courses" },
  { slug: "vibraflowmedia",         name: "VibraFlow Media",          seg: "reflect", fixture: "stillness-first",        renderer: ".vf-piece",    nav: "Teachings" },
  { slug: "lightnodesystems",       name: "LightNode Systems",        seg: "systems", fixture: "ledger-watch",           renderer: ".ws-contract", nav: "Tools" },
  { slug: "oglegacystore",          name: "OG Legacy Store",          seg: "offer",   fixture: "legacy-first-collection", renderer: ".bn, .sf-detail", nav: "Collections" },
];

/* ══════════════════════════════════════════════════════════════════════
   PER-BRANCH ACCEPTANCE
   ══════════════════════════════════════════════════════════════════════ */

const signatures = {};
const engineReports = {};

for (const b of BRANCHES) {
  console.log(`\n── ${b.name} ──────────────────────────────────────────`);
  const errors = [];
  const page = await newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_FAILED|ERR_BLOCKED|ERR_CONNECTION|Failed to load resource/.test(m.text())) {
      errors.push(`console: ${m.text()}`);
    }
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !/fonts\./.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url().replace(`http://localhost:${PORT}`, "")}`);
  });

  // 1. identity resolution
  const res = await page.goto(U(`/i/${b.slug}/`), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-hero, .sf-state", { timeout: 10000 });
  const report = await page.evaluate(() => window.SF_ENGINE || null);
  engineReports[b.slug] = report;
  check("1. identity resolves from the route", report && report.identity === b.slug, JSON.stringify(report));
  check("   HTTP 200", res.status() === 200, String(res.status()));

  // 2. identity home
  const heroH = await page.locator(".sf-hero-h").first().innerText().catch(() => "");
  check("2. identity home renders its own promise", heroH.length > 3, heroH);
  check("   exactly one h1", await page.locator("h1").count() === 1, String(await page.locator("h1").count()));
  check("   brand names this house", (await page.locator(".sf-brand-name").innerText()).trim().toLowerCase() === b.name.toLowerCase());

  // 3. specialized navigation
  const navLabels = await page.$$eval(".sf-nav-a", (as) => as.map((a) => a.textContent.trim()));
  check(`3. specialized nav includes "${b.nav}"`, navLabels.includes(b.nav), navLabels.join(" · "));
  check("   nav is small and obvious (<= 5)", navLabels.length <= 5, String(navLabels.length));

  // 4. browse / catalogue
  await page.goto(U(`/i/${b.slug}/browse`), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-browse-h", { timeout: 10000 });
  const cards = await page.locator(".sf-card").count();
  check("4. browse lists this house's catalogue", cards >= 1, `${cards} cards`);

  // 5 + 6. dynamic detail route + specialized renderer
  await page.goto(U(`/i/${b.slug}/${b.seg}/${b.fixture}`), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-detail, .sf-state", { timeout: 10000 });
  const onDetail = await page.locator(".sf-detail").count();
  check("5. dynamic detail route renders with no generated page", onDetail === 1);
  const rendered = await page.locator(b.renderer).count();
  check("6. the specialized renderer is used", rendered >= 1, `selector ${b.renderer} matched ${rendered}`);
  const detailTitle = await page.locator(".sf-detail-title, .vf-title").first().innerText().catch(() => "");
  check("7. governed test content appears automatically", detailTitle.length > 2, detailTitle);

  // capture the structural signature for the distinctness check
  signatures[b.slug] = await page.evaluate(() =>
    [...document.querySelectorAll(".sf-main *")]
      .map((el) => (typeof el.className === "string" ? el.className.split(" ")[0] : ""))
      .filter((c) => c && !/^sf-/.test(c))
      .filter((v, i, a) => a.indexOf(v) === i).sort().join(","));

  // 8. empty state
  await page.goto(U(`/i/${b.slug}/browse?q=zzzznothingmatchesthis`), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-state--empty", { timeout: 10000 });
  const emptyText = await page.locator(".sf-state--empty").innerText();
  check("8. empty state is specific, not blank", /nothing matched/i.test(emptyText), emptyText.slice(0, 70));

  // 9. wrong identity data is rejected / hidden
  const otherFixture = BRANCHES.find((x) => x.slug !== b.slug).fixture;
  await page.goto(U(`/i/${b.slug}/${b.seg}/${otherFixture}`), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-state--empty, .sf-detail", { timeout: 10000 });
  const leaked = await page.locator(".sf-detail").count();
  check("9. another house's record is NOT shown here", leaked === 0, `${otherFixture} leaked into ${b.slug}`);
  check("   cross-identity records counted as hidden", report && report.crossIdentityHidden > 0, JSON.stringify(report && report.crossIdentityHidden));

  // 10 + 11. governed price + CTA
  await page.goto(U(`/i/${b.slug}/${b.seg}/${b.fixture}`), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-detail-act", { timeout: 10000 }).catch(() => {});
  const commerce = await page.evaluate(() => ({
    price: document.querySelector(".sf-price") ? document.querySelector(".sf-price").textContent.trim() : null,
    cta: document.querySelector(".sf-detail-act .sf-btn") ? document.querySelector(".sf-detail-act .sf-btn").textContent.trim() : null,
    note: document.querySelector(".sf-detail-act .sf-cta-note, .sf-cta-note") ? document.querySelector(".sf-detail-act .sf-cta-note, .sf-cta-note").textContent.trim() : null,
    deadButtons: [...document.querySelectorAll("a.sf-btn")].filter((a) => !a.getAttribute("href")).length,
  }));
  /* VibraFlow's reading room deliberately carries no onward CTA — the absence
     of onward pressure is that branch's job. It must still state the cost, so
     it is held to the price requirement and exempted from the CTA one. */
  const readingRoom = b.slug === "vibraflowmedia";
  const anyPrice = await page.evaluate(() => {
    const el = document.querySelector(".sf-price");
    return el ? el.textContent.trim() : null;
  });
  check("10. governed price state renders", Boolean(anyPrice || commerce.note), JSON.stringify({ anyPrice, note: commerce.note }));
  check(`11. governed CTA renders, or an honest note${readingRoom ? " (reading room: price only, by design)" : ""}`,
    readingRoom ? Boolean(anyPrice) : Boolean(commerce.cta || commerce.note),
    JSON.stringify({ ...commerce, anyPrice }));
  check("    no button without a destination", commerce.deadButtons === 0, `${commerce.deadButtons} dead buttons`);

  // 10b + 16 + 17 + 18. governed imagery, visual credibility, no broken media
  const visual = await page.evaluate(() => {
    const covers = [...document.querySelectorAll(".sf-cover")];
    const imgs = [...document.querySelectorAll(".sf-cover-img")];
    return {
      covers: covers.length,
      withArt: covers.filter((c) => c.querySelector("svg.sf-art, img.sf-cover-img")).length,
      emptyCovers: covers.filter((c) => !c.querySelector("svg.sf-art, img.sf-cover-img")).length,
      brokenImgs: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
      imgsMissingDims: imgs.filter((i) => !i.getAttribute("width") || !i.getAttribute("height")).length,
      /* A reserved box means art cannot shift the layout when it arrives. */
      coversWithoutRatio: covers.filter((c) => !getComputedStyle(c).aspectRatio || getComputedStyle(c).aspectRatio === "auto").length,
      artElements: document.querySelectorAll("svg.sf-art").length,
      /* "Raw placeholder" = a visible box with no artwork and no background. */
      rawPlaceholders: covers.filter((c) => {
        const cs = getComputedStyle(c);
        return !c.querySelector("svg, img") && (cs.backgroundImage === "none" && cs.backgroundColor === "rgba(0, 0, 0, 0)");
      }).length,
    };
  });
  check("10b. every cover carries artwork", visual.covers >= 1 && visual.emptyCovers === 0, JSON.stringify(visual));

  /* Captured here, on the detail page, and asserted further down. The
     first-screen checks below navigate to home, so reading it later would
     read the home canonical — which is what an earlier version of this
     harness did. */
  const detailCanonical = await page.evaluate(() => {
    const l = document.querySelector('link[rel="canonical"]');
    return l ? l.href : null;
  });
  const detailRobots = await page.evaluate(() => {
    const m = document.querySelector('meta[name="robots"]');
    return m ? m.content : null;
  });
  check("17. no broken media", visual.brokenImgs === 0, `${visual.brokenImgs} broken`);
  check("18. no raw placeholder graphics", visual.rawPlaceholders === 0, `${visual.rawPlaceholders}`);
  check("    every governed image declares dimensions", visual.imgsMissingDims === 0, `${visual.imgsMissingDims}`);
  check("    every cover reserves its box (no layout shift)", visual.coversWithoutRatio === 0, `${visual.coversWithoutRatio}`);

  // 16. hero looks commercially credible + 19. first screen communicates
  await page.goto(U(`/i/${b.slug}/`), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-hero", { timeout: 10000 });
  const firstScreen = await page.evaluate(() => {
    const vh = window.innerHeight;
    const inView = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top < vh && r.bottom > 0 && r.height > 0;
    };
    return {
      brand: (document.querySelector(".sf-brand-name") || {}).textContent || "",
      promise: ((document.querySelector(".sf-hero-promise") || {}).textContent || "") ||
               ((document.querySelector(".sf-hero-h") || {}).textContent || ""),
      itemTitle: (document.querySelector(".sf-hero-h") || {}).textContent || "",
      job: (document.querySelector(".sf-hero-sub") || {}).textContent || "",
      action: (document.querySelector(".sf-hero-act .sf-btn") || {}).textContent || "",
      cost: (document.querySelector(".sf-hero-cost") || {}).textContent || "",
      heroArt: document.querySelectorAll(".sf-hero-bg svg, .sf-hero-art svg, .sf-hero-art img").length,
      navVisible: inView(".sf-nav") || document.querySelectorAll(".sf-burger").length > 0,
      hubLink: document.querySelectorAll('.sf-foot-nav a').length,
      /* How much text is in the first screen. A wall of prose fails the
         5-10 second test however well written it is. */
      heroWords: ((document.querySelector(".sf-hero") || {}).innerText || "").trim().split(/\s+/).length,
    };
  });
  check("16. hero carries a visual treatment", firstScreen.heroArt >= 1, `${firstScreen.heroArt} art elements`);
  check("19. first screen answers: where am I", firstScreen.brand.trim().length > 3, firstScreen.brand);
  check("    first screen answers: what is this", firstScreen.promise.trim().length > 8, firstScreen.promise);
  check("    first screen answers: what does it do", firstScreen.job.trim().length > 12, firstScreen.job);
  check("    first screen answers: what do I do next", firstScreen.action.trim().length > 3, firstScreen.action);
  check("    first screen answers: what is free / paid", /free/i.test(firstScreen.cost), firstScreen.cost);
  check("    first screen is scannable, not a wall of text", firstScreen.heroWords <= 70, `${firstScreen.heroWords} words`);
  check("20. return to Sentinel Fortune is present", firstScreen.hubLink >= 1, `${firstScreen.hubLink}`);

  // ── LIVING EXPERIENCE (12 of the 15 checks; mobile swipe + reduced motion
  //    are measured in their own contexts below) ────────────────────────────
  const living = await page.evaluate(() => {
    const rails = [...document.querySelectorAll(".sf-rail")];
    const tracks = [...document.querySelectorAll(".sf-rail-track")];
    return {
      rails: rails.length,
      emptyRails: rails.filter((r) => r.querySelectorAll(".sf-rail-item").length === 0).length,
      railTitles: rails.map((r) => (r.querySelector(".sf-rail-h") || {}).textContent || ""),
      trackFocusable: tracks.filter((t) => t.getAttribute("tabindex") === "0").length,
      tracksLabelled: tracks.filter((t) => t.getAttribute("aria-labelledby")).length,
      heroDynamic: document.querySelectorAll(".sf-hero--dynamic").length,
      heroArt: document.querySelectorAll(".sf-hero-art svg, .sf-hero-art img").length,
      heroCta: document.querySelectorAll(".sf-hero-stage .sf-btn, .sf-hero-act .sf-btn").length,
      /* An action that only appears on hover is unreachable by touch. */
      hoverOnlyActions: [...document.querySelectorAll(".sf-card .sf-btn")]
        .filter((b) => getComputedStyle(b).display === "none" || getComputedStyle(b).visibility === "hidden").length,
      /* Nothing may play by itself. */
      autoplayMedia: [...document.querySelectorAll("audio,video")].filter((m) => m.autoplay || !m.paused).length,
      cardsInRails: document.querySelectorAll(".sf-rail-item .sf-card").length,
      /* A label is a claim: these two need usage data that does not exist. */
      dishonestLabels: rails.map((r) => (r.querySelector(".sf-rail-h") || {}).textContent || "")
        .filter((t) => /trending|popular|most[- ]watched|best[- ]sell/i.test(t)),
      personalisationClaim: /personali[sz]ed for you|tailored to you|our ai picked/i.test(document.body.innerText),
    };
  });
  check("L1. dynamic hero renders from governed content", living.heroDynamic === 1 && living.heroArt >= 1, JSON.stringify({ d: living.heroDynamic, a: living.heroArt }));
  check("L1b. hero carries a primary action", living.heroCta >= 1, `${living.heroCta}`);
  check("L2. at least one discovery rail renders", living.rails >= 1, `${living.rails} rails: ${living.railTitles.join(" | ")}`);
  check("L3. no empty rail renders", living.emptyRails === 0, `${living.emptyRails} empty`);
  check("L4. cards live inside rails and are interactive", living.cardsInRails >= 1, `${living.cardsInRails}`);
  check("L4b. no action hidden behind hover only", living.hoverOnlyActions === 0, `${living.hoverOnlyActions}`);
  check("L6. rail tracks are keyboard focusable and labelled",
    living.trackFocusable === living.rails && living.tracksLabelled === living.rails,
    JSON.stringify({ focusable: living.trackFocusable, labelled: living.tracksLabelled, rails: living.rails }));
  check("L10. no fabricated trending/popular label", living.dishonestLabels.length === 0, living.dishonestLabels.join(", "));
  check("L10b. no personalisation claimed", living.personalisationClaim === false);
  check("L13. no autoplay audio or video", living.autoplayMedia === 0, `${living.autoplayMedia}`);

  // L6b. arrow keys actually scroll a rail
  const scrolled = await page.evaluate(async () => {
    const t = document.querySelector('.sf-rail-track[data-scrollable="true"]') || document.querySelector(".sf-rail-track");
    if (!t) return null;
    if (t.scrollWidth - t.clientWidth < 5) return "not-scrollable";
    t.focus();
    const before = t.scrollLeft;
    t.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    return t.scrollLeft > before ? "scrolled" : `stuck@${before}`;
  });
  check("L6c. ArrowRight scrolls a scrollable rail",
    scrolled === "scrolled" || scrolled === "not-scrollable", String(scrolled));

  // L9 + L11. continuity appears only AFTER something is opened, and a newly
  // opened record shows up in the right rail automatically.
  /* A FRESH context with empty storage — a genuine first visit. The earlier
     steps in this run already opened detail pages, so re-using this page
     would have been measuring the harness's own history. */
  const freshCtx = await browser.newContext();
  const fresh = await newPage(freshCtx);
  await fresh.goto(U(`/i/${b.slug}/`), { waitUntil: "domcontentloaded" });
  await fresh.waitForSelector(".sf-hero", { timeout: 10000 });
  const continueBefore = await fresh.evaluate(() =>
    [...document.querySelectorAll(".sf-rail-h")].some((e) => /continue|recently viewed/i.test(e.textContent)));
  check("L9. no continue rail on a first visit", continueBefore === false);
  await freshCtx.close();

  await page.goto(U(`/i/${b.slug}/${b.seg}/${b.fixture}`), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-detail", { timeout: 10000 });
  await page.goto(U(`/i/${b.slug}/`), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-hero", { timeout: 10000 });
  const continueAfter = await page.evaluate(() => {
    const rail = [...document.querySelectorAll(".sf-rail")]
      .find((r) => /continue|recently viewed/i.test((r.querySelector(".sf-rail-h") || {}).textContent || ""));
    return rail ? {
      title: rail.querySelector(".sf-rail-h").textContent,
      items: rail.querySelectorAll(".sf-rail-item").length,
      firstSlug: (rail.querySelector(".sf-card") || {}).dataset?.slug || null,
      saysLocal: /this device|this browser/i.test(rail.textContent),
    } : null;
  });
  check("L9b. continue rail appears after opening, in this house's language",
    continueAfter && continueAfter.items >= 1 && continueAfter.firstSlug === b.fixture, JSON.stringify(continueAfter));
  check("L9c. continuity is stated as device-local, not an account",
    continueAfter && continueAfter.saysLocal === true, JSON.stringify(continueAfter));
  check("L11. the opened governed record appeared in the rail automatically",
    continueAfter && continueAfter.firstSlug === b.fixture, JSON.stringify(continueAfter));

  // L7. reduced motion honoured
  const rmCtx = await browser.newContext({ reducedMotion: "reduce" });
  const rm = await newPage(rmCtx);
  await rm.goto(U(`/i/${b.slug}/`), { waitUntil: "domcontentloaded" });
  await rm.waitForSelector(".sf-hero", { timeout: 10000 });
  const motion = await rm.evaluate(() => {
    const rail = document.querySelector(".sf-rail");
    const track = document.querySelector(".sf-rail-track");
    return {
      railAnim: rail ? getComputedStyle(rail).animationName : "none",
      trackBehavior: track ? getComputedStyle(track).scrollBehavior : "auto",
    };
  });
  check("L7. reduced-motion disables rail animation and smooth scroll",
    (motion.railAnim === "none" || motion.railAnim === "") && motion.trackBehavior === "auto", JSON.stringify(motion));
  await rmCtx.close();

  // 12. mobile
  const mctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const mp = await newPage(mctx);
  await mp.goto(U(`/i/${b.slug}/`), { waitUntil: "domcontentloaded" });
  await mp.waitForSelector(".sf-hero, .sf-state", { timeout: 10000 });
  const mob = await mp.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const covers = [...document.querySelectorAll(".sf-cover")];
    const overWide = covers.filter((c) => c.getBoundingClientRect().width > document.documentElement.clientWidth + 1).length;
    const distorted = [...document.querySelectorAll(".sf-cover-img")].filter((i) => {
      const cs = getComputedStyle(i);
      return cs.objectFit !== "cover" && cs.objectFit !== "contain";
    }).length;
    /* Visually-hidden controls are excluded: the skip link is 1px until it is
       focused, which is correct, and measuring it would be measuring the
       technique rather than the target. */
    const small = [...document.querySelectorAll("a,button")].filter((el) => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      const cs = getComputedStyle(el);
      if (cs.clip === "rect(0px, 0px, 0px, 0px)" || cs.position === "fixed") return false;
      if (r.height <= 2 || r.width <= 2) return false;
      return r.height < 40;
    }).map((el) => `${el.className || el.tagName}:${Math.round(el.getBoundingClientRect().height)}`);
    const cta = document.querySelector(".sf-hero-act .sf-btn");
    return { overflow, small, overWide, distorted, covers: covers.length, ctaH: cta ? Math.round(cta.getBoundingClientRect().height) : 0 };
  });
  check("12. mobile: no horizontal overflow", mob.overflow <= 0, `${mob.overflow}px`);
  check("    mobile: tap targets >= 40px", mob.small.length === 0, mob.small.join(", "));
  check("    mobile: lead CTA >= 44px", mob.ctaH >= 44, `${mob.ctaH}px`);
  check("    mobile: imagery is responsive, nothing overflows", mob.overWide === 0, `${mob.overWide} over-wide`);
  check("    mobile: no image distortion", mob.distorted === 0, `${mob.distorted} distorted`);
  check("    mobile: artwork present on the phone layout", mob.covers >= 1, `${mob.covers}`);
  // L5. rails scroll by touch on a phone
  const swipe = await mp.evaluate(async () => {
    const t = document.querySelector(".sf-rail-track");
    if (!t) return "no-rail";
    if (t.scrollWidth - t.clientWidth < 5) return "not-scrollable";
    const before = t.scrollLeft;
    t.scrollBy({ left: 150 });
    await new Promise((r) => setTimeout(r, 250));
    return t.scrollLeft > before ? "scrolls" : "stuck";
  });
  check("L5. mobile: rails are swipeable/scrollable", swipe === "scrolls" || swipe === "not-scrollable", String(swipe));
  await mctx.close();

  // 13. hub return — asserted on the detail page, the richest link surface
  await page.goto(U(`/i/${b.slug}/${b.seg}/${b.fixture}`), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-detail", { timeout: 10000 });
  const hubHrefs = await page.$$eval(".sf-foot-nav a", (as) => as.map((a) => a.href));
  check("13. return to Sentinel Fortune exists", hubHrefs.some((hv) => /sentinelfortune\.com|sentinelfortune\.github\.io/.test(hv)), hubHrefs.join(" "));

  // 14. canonical hostname mapping (captured on the detail page above)
  check("14. canonical names the production hostname",
    detailCanonical === `https://${b.slug}.sentinelfortune.com/${b.seg}/${b.fixture}`, String(detailCanonical));
  check("    preview feed is noindex", /noindex/.test(detailRobots || ""), String(detailRobots));

  // no localhost link anywhere, and no subdomain link while they are inactive
  const links = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") || ""));
  const absolute = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
  /* Every emitted href is either same-origin (the harness host) or an https
     address on an allowed public host. Nothing else may appear. */
  const offOrigin = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .map((a) => a.href)
      .filter((hv) => !hv.startsWith(window.location.origin))
      /* floor.sentinelfortune.com is a SEPARATE Vercel application, not a
         world: it is linked from Lumen School Academy and bound to its own
         project. It is an allowed public host; it is not part of the seven. */
      .filter((hv) => !/^https:\/\/(sentinelfortune\.com|floor\.sentinelfortune\.com|sentinelfortune\.github\.io)\//.test(hv)));
  check("15. every off-origin link is an allowed public https address", offOrigin.length === 0, offOrigin.join(", "));
  /* Check the HOSTNAME, not the whole string: one fixture's slug is literally
     "localhost-destination", and a slug that contains the word is not a local
     address. The earlier version of this check tested the substring and
     flagged a correct link. */
  const rawLocal = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .map((a) => { try { return new URL(a.href); } catch { return null; } })
      .filter((u) => u && /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(u.hostname))
      .map((u) => u.href)
      /* The test server itself is on localhost; that is the harness, not the app. */
      .filter((hv) => !hv.startsWith(window.location.origin)));
  check("    no hardcoded local URL emitted by the engine", rawLocal.length === 0, rawLocal.join(", "));
  /* The guard still catches a link to any WORLD subdomain, because a world is
     reachable only once the Owner raises its readiness and the engine — not a
     hand-written href — decides that. `floor.` is exempt by name rather than
     by loosening the pattern: it is a separate application bound to its own
     Vercel project, so any OTHER unexpected subdomain link is still caught. */
  const subdomainLinks = absolute.filter((hv) => /\/\/[a-z]+\.sentinelfortune\.com/.test(hv))
    .filter((hv) => !/\/\/floor\.sentinelfortune\.com/.test(hv));
  check("    no link to an inactive subdomain", subdomainLinks.length === 0, subdomainLinks.join(", "));

  check("    no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

/* ══════════════════════════════════════════════════════════════════════
   SHARED-ENGINE BEHAVIOUR
   ══════════════════════════════════════════════════════════════════════ */

console.log("\n── shared engine ─────────────────────────────────────────");

const uniqueSignatures = new Set(Object.values(signatures));
check(`seven structurally DISTINCT branch experiences (got ${uniqueSignatures.size})`,
  uniqueSignatures.size === 7,
  JSON.stringify(Object.fromEntries(Object.entries(signatures).map(([k, v]) => [k, v.slice(0, 44)])), null, 1));

check("one shared runtime — every branch served by the same index.html",
  Object.keys(engineReports).length === 7 && Object.values(engineReports).every(Boolean));

check("one shared feed — same evidence marker everywhere",
  new Set(Object.values(engineReports).map((r) => r.evidence)).size === 1,
  JSON.stringify(Object.values(engineReports).map((r) => r.evidence)));

check("every branch hid records belonging to other houses",
  Object.values(engineReports).every((r) => r.crossIdentityHidden > 0),
  JSON.stringify(Object.fromEntries(Object.entries(engineReports).map(([k, v]) => [k, v.crossIdentityHidden]))));

check("every branch accepted at least one governed record",
  Object.values(engineReports).every((r) => r.accepted >= 1),
  JSON.stringify(Object.fromEntries(Object.entries(engineReports).map(([k, v]) => [k, v.accepted]))));

/* One runtime file, not seven. Proven by asking the server. */
const page = await newPage();
const shells = [];
for (const b of BRANCHES) {
  const r = await page.request.get(U(`/i/${b.slug}/`));
  shells.push((await r.text()).length);
}
check("one shell for all seven (identical bytes)", new Set(shells).size === 1, JSON.stringify(shells));

/* PUBLIC EXPERIENCE V2 CHANGED THIS DELIBERATELY.
   The root used to render a bare identity chooser — a list of links for an
   unknown host. It now renders the Sentinel Fortune homepage, which is the
   company's own surface and the one place all seven worlds belong. The old
   assertion is replaced rather than deleted, so the change is recorded here
   as an intended contract change and not as a quietly dropped check. */
await page.goto(U("/"), { waitUntil: "domcontentloaded" });
await page.waitForSelector(".sf-hub-hero, .sf-chooser, .sf-hero", { timeout: 10000 });
const hub = await page.evaluate(() => ({
  surface: (window.SF_ENGINE || {}).surface || null,
  boards: document.querySelectorAll(".sf-board").length,
  h1: document.querySelectorAll("h1").length,
  chooser: document.querySelectorAll(".sf-chooser").length,
}));
check("the root serves the company homepage, not a chooser", hub.surface === "HUB" && hub.chooser === 0, JSON.stringify(hub));
check("the homepage exposes all seven worlds directly", hub.boards === 7, String(hub.boards));
check("the homepage has exactly one h1", hub.h1 === 1, String(hub.h1));

/* Deep link straight to a detail route — the SPA fallback must serve it. */
const deep = await page.goto(U("/i/lumenschoolacademy/learn/floor"), { waitUntil: "domcontentloaded" });
await page.waitForSelector(".sf-detail", { timeout: 10000 });
check("a deep detail link loads directly (host rewrite works)", deep.status() === 200 && await page.locator(".sf-detail").count() === 1);

/* Floor ownership: the business tool sits in the education house, by problem
   domain and not by technology format. */
const floorHouse = await page.evaluate(() => window.SF_ENGINE.identity);
check("Floor is owned by Lumen School Academy (problem domain, not format)", floorHouse === "lumenschoolacademy", floorHouse);

/* The paid record renders a real price and a real saving. */
await page.goto(U("/i/lightnodesystems/systems/ledger-watch"), { waitUntil: "domcontentloaded" });
await page.waitForSelector(".sf-price", { timeout: 10000 });
const paid = await page.evaluate(() => ({
  now: document.querySelector(".sf-price-now") && document.querySelector(".sf-price-now").textContent,
  was: document.querySelector(".sf-price-was") && document.querySelector(".sf-price-was").textContent,
  cta: document.querySelector(".sf-detail-act .sf-btn") && document.querySelector(".sf-detail-act .sf-btn").textContent.trim(),
}));
check("a governed paid record shows price, compare-at and a buy CTA",
  paid.now === "$49" && /79/.test(paid.was || "") && /Buy/i.test(paid.cta || ""), JSON.stringify(paid));

/* The buy-with-no-price record must NOT render a buy button. */
await page.goto(U("/i/oglegacystore/offer/legacy-first-collection"), { waitUntil: "domcontentloaded" });
await page.waitForSelector(".sf-detail", { timeout: 10000 });
const unpriced = await page.evaluate(() => ({
  buttons: [...document.querySelectorAll(".sf-detail-act .sf-btn")].length,
  note: document.querySelector(".sf-cta-note") && document.querySelector(".sf-cta-note").textContent,
}));
check("a BUY with no governed price renders NO button, only a reason",
  unpriced.buttons === 0 && /price not published/i.test(unpriced.note || ""), JSON.stringify(unpriced));

/* The preview notice must be visible while the feed is not LIVE. */
const notice = await page.locator(".sf-preview").count();
check("preview evidence is visible to a visitor", notice === 1);

/* Keyboard: the lead action must be reachable. */
await page.goto(U("/i/lumengame/"), { waitUntil: "domcontentloaded" });
await page.waitForSelector(".sf-hero-act .sf-btn", { timeout: 10000 });
let reachedCta = false;
for (let i = 0; i < 25 && !reachedCta; i++) {
  await page.keyboard.press("Tab");
  reachedCta = await page.evaluate(() => {
    const el = document.activeElement;
    return Boolean(el && el.closest && el.closest(".sf-hero-act"));
  });
}
check("the lead action is keyboard reachable", reachedCta);

await page.close();

console.log(`\n${"=".repeat(60)}\n  ${pass} passed, ${fail} failed`);
if (fail) { console.log("\nFAILURES:"); failures.forEach((f) => console.log(`  - ${f}`)); }
console.log("=".repeat(60));

await browser.close();
server.close();
process.exit(fail ? 1 : 0);
