/* HOSTNAME ROUTING — proven against the seven REAL canonical hostnames.
 *
 * The acceptance gate exercises the /i/<slug>/ development prefix. This file
 * exercises the thing that actually matters in production: one runtime,
 * resolving its identity from the request hostname.
 *
 * Chromium's --host-resolver-rules maps the seven public hostnames onto the
 * local test server, so the browser genuinely sends
 * `Host: lumengame.sentinelfortune.com` and the app genuinely resolves it. No
 * DNS is touched and nothing leaves the machine.
 */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOT = process.argv[2];
const PORT = 8905;
const MIME = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".mjs":"text/javascript",
               ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png" };

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  let f = join(ROOT, p);
  try { const s = await stat(f); if (s.isDirectory()) f = join(f, "index.html"); }
  catch { f = join(ROOT, "index.html"); }
  try {
    const b = await readFile(f);
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(b);
  } catch { res.writeHead(404); res.end("404"); }
});
await new Promise((r) => server.listen(PORT, r));

const HOSTS = [
  ["sentinelfortunerecords.sentinelfortune.com", "sentinelfortunerecords", "release", "origin-echo"],
  ["codexworldtv.sentinelfortune.com",           "codexworldtv",           "story",   "the-quiet-wire"],
  ["lumengame.sentinelfortune.com",              "lumengame",              "play",    "s5-ascent-lite"],
  ["lumenschoolacademy.sentinelfortune.com",     "lumenschoolacademy",     "learn",   "floor"],
  ["vibraflowmedia.sentinelfortune.com",         "vibraflowmedia",         "reflect", "stillness-first"],
  ["lightnodesystems.sentinelfortune.com",       "lightnodesystems",       "systems", "ledger-watch"],
  ["oglegacystore.sentinelfortune.com",          "oglegacystore",          "offer",   "legacy-first-collection"],
];

/* Map every canonical hostname onto the local server. */
const rules = HOSTS.map(([h]) => `MAP ${h} 127.0.0.1:${PORT}`).join(",");
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: [`--host-resolver-rules=${rules}`, "--ignore-certificate-errors"],
});

let pass = 0, fail = 0; const failures = [];
const check = (n, c, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; failures.push(`${n}${d ? ` — ${d}` : ""}`); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
};

const page = await browser.newPage();
await page.route("**/*", (r) => /fonts\.(googleapis|gstatic)/.test(r.request().url()) ? r.abort() : r.continue());
page.setDefaultTimeout(15000);

for (const [host, slug, seg, fixture] of HOSTS) {
  console.log(`\n── ${host} ──`);

  // Identity resolved from the HOSTNAME, with no path hint at all.
  await page.goto(`http://${host}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-hero, .sf-state", { timeout: 10000 });
  const report = await page.evaluate(() => window.SF_ENGINE);
  check("identity resolved from the hostname", report.identity === slug, JSON.stringify(report));
  check("resolution source is HOSTNAME", report.identitySource === "HOSTNAME", report.identitySource);

  // Clean production URLs — no /i/ prefix anywhere in the emitted links.
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  check("emits clean production paths (no /i/ prefix)", !hrefs.some((hv) => hv && hv.startsWith("/i/")),
    hrefs.filter((hv) => hv && hv.startsWith("/i/")).join(", "));

  // The branch's own detail segment resolves on its own host.
  await page.goto(`http://${host}/${seg}/${fixture}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-detail", { timeout: 10000 });
  check(`/${seg}/${fixture} resolves on this host`, await page.locator(".sf-detail").count() === 1);

  // The canonical tag names THIS host.
  const canon = await page.evaluate(() => document.querySelector('link[rel="canonical"]').href);
  check("canonical names this hostname", canon === `https://${host}/${seg}/${fixture}`, canon);

  // The development identity picker must NOT appear on a canonical host.
  check("no development identity picker on a public host", await page.locator(".sf-dev").count() === 0);

  // Another house's segment must not resolve here.
  const otherSeg = HOSTS.find(([, s]) => s !== slug)[2];
  await page.goto(`http://${host}/${otherSeg}/${fixture}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-state--empty, .sf-detail", { timeout: 10000 });
  check(`another branch's segment /${otherSeg}/ does not resolve here`,
    await page.locator(".sf-detail").count() === 0);

  // An identity override in the query must be IGNORED on a canonical host.
  await page.goto(`http://${host}/?i=oglegacystore`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".sf-hero, .sf-state", { timeout: 10000 });
  const overridden = await page.evaluate(() => window.SF_ENGINE.identity);
  check("a ?i= override cannot switch house from the address bar", overridden === slug, overridden);
}

console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed`);
if (fail) { console.log("\nFAILURES:"); failures.forEach((f) => console.log(`  - ${f}`)); }
console.log("=".repeat(56));
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
