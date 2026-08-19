// Functional acceptance, driven through a real browser.
//
// The sequence the gate demands: start → real input → primary action → real
// result → save → export → reload → verify. Nothing stubbed.
//
// Usage:
//   npm run e2e                          against the local server on :8098
//   npm run e2e:remote -- <base-url>     against a deployed Preview
//
// Requires `npm install` and, once per machine, `npm run e2e:install` to fetch
// the Chromium build Playwright drives.

import { chromium } from "playwright";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (process.argv[2] || "http://127.0.0.1:8098").replace(/\/$/, "");
const results = [];
let failed = 0;
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// A real job: 6 hours, priced at 900. With 30/hr overhead recovery and 32/hr
// labour, true cost is 6*32 + 6*30 + 240 + 60 = 672. Margin 228 → 25.33%.
const JOB = { name: "Immersion heater — Vale Rd", price: "900", hours: "6", materials: "240", travel: "60" };

// Let Playwright resolve its own bundled browser — that is what makes this
// runnable from a clean checkout on any OS. PLAYWRIGHT_CHROMIUM_PATH is an
// escape hatch for environments that pre-install Chromium somewhere else;
// unset (the normal case) it is simply absent from the launch options.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const dir = mkdtempSync(join(tmpdir(), "floor-"));
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

try {
  // 1 — app loads
  const res = await page.goto(BASE + "/", { waitUntil: "load" });
  check("1. app loads", res.ok() && await page.locator("h1").isVisible(), `HTTP ${res.status()}`);

  // 2 — time to value: sample data produces a real result with no typing
  const t0 = Date.now();
  await page.getByRole("button", { name: "See it with example figures" }).click();
  await page.waitForSelector("#reportPanel:not([hidden])");
  const sampleHeadline = (await page.locator("#headline").textContent()).trim();
  const sampleRows = await page.locator("#jobTable tbody tr").count();
  check("2. time to value (sample)", sampleRows === 5 && sampleHeadline.length > 20,
    `${Date.now() - t0}ms, ${sampleRows} jobs, headline: "${sampleHeadline.slice(0, 60)}…"`);

  // 3 — invalid input is refused with a usable message, before the happy path
  // The handler must be armed before the click: window.confirm blocks
  // synchronously, so a listener registered afterwards never sees the dialog.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Clear everything" }).click();
  await page.waitForFunction(() => window.__floor.repo.listJobs().length === 0);
  await page.getByRole("button", { name: "Check a job" }).click();
  await page.getByRole("button", { name: "Save figures" }).click();
  const errShown = await page.locator("#billableHoursErr").isVisible();
  await page.fill("#annualOverhead", "48000");
  await page.fill("#billableHours", "0");
  await page.fill("#labourCostPerHour", "32");
  await page.fill("#targetMarginPct", "25");
  await page.getByRole("button", { name: "Save figures" }).click();
  const divZeroBlocked = await page.locator("#billableHoursErr").isVisible();
  check("3. invalid input handled", errShown && divZeroBlocked,
    `empty blocked ${errShown}, zero-divisor blocked ${divZeroBlocked}`);

  // 4 — real settings input, and the recovery figure is computed live
  await page.fill("#billableHours", "1600");
  const recovery = (await page.locator("#recoveryVal").textContent()).trim();
  await page.getByRole("button", { name: "Save figures" }).click();
  check("4. real input → business rule engine", recovery.includes("30"), `recovery shown as "${recovery}"`);

  // 5 + 6 — primary action produces a real, correct result
  await page.fill("#jName", JOB.name);
  await page.fill("#jPrice", JOB.price);
  await page.fill("#jHours", JOB.hours);
  await page.fill("#jMaterials", JOB.materials);
  await page.fill("#jTravel", JOB.travel);
  await page.getByRole("button", { name: "Add job and recalculate" }).click();
  await page.waitForSelector("#reportPanel:not([hidden])");

  const computed = await page.evaluate(() => {
    const j = window.__floor.report.ranked[0];
    return { trueCost: j.trueCost, margin: j.margin, marginPct: j.marginPct, floor: j.priceFloor, target: j.targetPrice };
  });
  const arithmeticRight =
    computed.trueCost === 672 && computed.margin === 228 &&
    Math.abs(computed.marginPct - 25.33) < 0.02 && computed.floor === 672 && computed.target === 896;
  check("5. primary action executes", await page.locator("#jobTable tbody tr").count() === 1);
  check("6. result is real and arithmetically correct", arithmeticRight,
    `true cost ${computed.trueCost}, margin ${computed.margin} (${computed.marginPct}%), floor ${computed.floor}, target ${computed.target}`);

  // 7 — a second job that is genuinely a loss, to prove the verdict is earned
  await page.fill("#jName", "Tap washer call-out");
  await page.fill("#jPrice", "80");
  await page.fill("#jHours", "1");
  await page.fill("#jMaterials", "6");
  await page.fill("#jTravel", "35");
  await page.getByRole("button", { name: "Add job and recalculate" }).click();
  const verdicts = await page.$$eval("#jobTable tbody tr", (rs) => rs.map((r) => r.className));
  const headline = (await page.locator("#headline").textContent()).trim();
  check("7. loss detected and ranked first", verdicts[0].includes("v-LOSS") && /below break-even/i.test(headline),
    headline.slice(0, 80));

  // 8 + 9 — persistence across a real reload
  await page.reload({ waitUntil: "load" });
  const afterReload = await page.evaluate(() => ({
    jobs: window.__floor.repo.listJobs().length,
    overhead: window.__floor.repo.getSettings().annualOverhead,
    rows: document.querySelectorAll("#jobTable tbody tr").length,
  }));
  check("8. saves and survives reload", afterReload.jobs === 2 && afterReload.overhead === 48000);
  check("9. result re-renders after reload without re-entry", afterReload.rows === 2, `${afterReload.rows} rows`);

  // 10 — CSV export, parsed from disk
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export CSV" }).click(),
  ]);
  const csvPath = join(dir, csv.suggestedFilename());
  await csv.saveAs(csvPath);
  const csvText = readFileSync(csvPath, "utf8");
  const csvLines = csvText.trim().split("\n");
  check("10. CSV export works", csvLines.length === 3 && /Price floor/i.test(csvLines[0]) && csvText.includes("672"),
    `${csv.suggestedFilename()}, ${csvLines.length} lines`);

  // 11 — printable report
  const [html] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Printable report" }).click(),
  ]);
  const htmlPath = join(dir, html.suggestedFilename());
  await html.saveAs(htmlPath);
  const htmlText = readFileSync(htmlPath, "utf8");
  check("11. printable report works",
    htmlText.startsWith("<!doctype html>") && htmlText.includes(JOB.name) && htmlText.includes("Price floor"),
    `${html.suggestedFilename()} (${htmlText.length}B)`);

  // 12 — removing a job recalculates rather than leaving a stale report
  const before = await page.evaluate(() => window.__floor.report.totals.price);
  await page.locator("[data-remove]").first().click();
  const after = await page.evaluate(() => window.__floor.report.totals.price);
  check("12. removal recalculates", after < before, `${before} → ${after}`);

  // 13 — mobile
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 360, height: 740 });
  await mob.goto(BASE + "/", { waitUntil: "load" });
  await mob.getByRole("button", { name: "See it with example figures" }).click();
  await mob.waitForSelector("#reportPanel:not([hidden])");
  const overflow = await mob.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const cta = await mob.getByRole("button", { name: "Check a job" }).boundingBox();
  const mobRows = await mob.locator("#jobTable tbody tr").count();
  check("13. mobile usable, no horizontal overflow", overflow <= 0 && cta.height >= 44 && mobRows === 5,
    `overflow ${overflow}px, CTA ${Math.round(cta.height)}px, ${mobRows} rows`);
  await mob.close();

  // 14 — accessibility basics in the rendered DOM
  const a11y = await page.evaluate(() => {
    const unlabelled = [...document.querySelectorAll("input,select")].filter((i) =>
      !i.labels?.length && !i.getAttribute("aria-label")).length;
    const unnamed = [...document.querySelectorAll("button")].filter((b) =>
      !b.textContent.trim() && !b.getAttribute("aria-label")).length;
    const small = [...document.querySelectorAll("button,input,select,a[href]")]
      .filter((e) => e.offsetParent !== null && e.getBoundingClientRect().height > 0
        && e.getBoundingClientRect().height < 38).length;
    return { unlabelled, unnamed, small, h1: document.querySelectorAll("h1").length,
      landmarks: ["header", "main", "footer"].every((t) => document.querySelector(t)) };
  });
  check("14. accessibility basics", a11y.unlabelled === 0 && a11y.unnamed === 0 && a11y.small === 0
    && a11y.h1 === 1 && a11y.landmarks, JSON.stringify(a11y));

  // 15 — console clean
  check("15. no uncaught errors", errors.length === 0, errors.slice(0, 2).join(" | ") || "clean");

} catch (err) {
  check("run completed without throwing", false, String(err).slice(0, 300));
} finally {
  await browser.close();
}

console.log("\n" + "=".repeat(58));
console.log(`FLOOR E2E — ${BASE}`);
console.log(`${results.filter((r) => r.pass).length} passed, ${failed} failed, ${results.length} checks`);
console.log("=".repeat(58));
process.exit(failed ? 1 : 0);
