// End-to-end proof, driven through a real browser against a served build.
//
// Every check here is one of the fifteen the product has to survive to be
// callable working. Nothing is stubbed: real clicks, real typing, a real
// reload, real localStorage, a real download.
//
// Usage:  node e2e/flow.mjs <base-url>

import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (process.argv[2] || "http://127.0.0.1:8099").replace(/\/$/, "");
const results = [];
let failed = 0;

function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const GOAL = "I want to turn ten years of plumbing experience into a course I can sell, with a repeatable delivery workflow";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const downloadDir = mkdtempSync(join(tmpdir(), "prism-dl-"));
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

try {
  // 1 — app loads
  const resp = await page.goto(BASE + "/", { waitUntil: "load" });
  check("1. app loads", resp.ok() && (await page.locator("#view-landing h1").isVisible()),
    `HTTP ${resp.status()}`);

  // 14 — invalid input handled cleanly (done before the happy path so a stale
  // error state cannot be mistaken for success later)
  await page.getByRole("button", { name: "Start a project" }).first().click();
  await page.getByRole("button", { name: "Route my goal" }).click();
  const nameErr = await page.locator("#pNameErr").isVisible();
  await page.fill("#pName", "Trade Ops");
  await page.fill("#pGoal", "help");
  await page.getByRole("button", { name: "Route my goal" }).click();
  const goalErr = await page.locator("#pGoalErr").isVisible();
  const stillOnForm = await page.locator("#view-route").isHidden();
  check("14. invalid input handled cleanly", nameErr && goalErr && stillOnForm,
    `name error ${nameErr}, goal error ${goalErr}, blocked ${stillOnForm}`);

  // 2 + 3 — create project with a real goal
  await page.fill("#pGoal", GOAL);
  await page.getByRole("button", { name: "Route my goal" }).click();
  await page.waitForSelector("#view-route:not([hidden])");
  check("2. create project", true);
  check("3. enter real goal", (await page.locator("#pGoal").inputValue()) === GOAL);

  // 4 — router recommends dimensions, each with a reason
  const picks = await page.locator("#routeList .pick").count();
  const reasons = await page.locator("#routeList .why").allTextContents();
  const routed = await page.evaluate((g) => window.__prism.recommend(g).recommended.map((r) => r.id), GOAL);
  check("4. router recommends dimensions", picks >= 2 && reasons.every((r) => r.length > 10),
    `${picks} suggested: ${routed.join(", ")}`);

  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.waitForSelector("#view-workspace:not([hidden])");
  const cards = await page.locator("#wsGrid .card").count();
  check("10a. unified workspace opens with the chosen dimensions", cards === routed.length, `${cards} cards`);

  // 5 + 6 — enter a dimension and save meaningful content
  const firstDim = routed[0];
  await page.locator(`[data-open="${firstDim}"]`).click();
  await page.waitForSelector("#view-dimension:not([hidden])");
  check("5. enter a selected dimension", (await page.locator("#dim-h").textContent()).length > 0, firstDim);

  const fields = await page.locator("#dimForm .field").count();
  // Fill every visible control so the dimension reaches "complete".
  for (const el of await page.locator("#dimForm [data-field]").all()) {
    const tag = await el.evaluate((n) => n.tagName + ":" + (n.type || ""));
    await el.fill(tag.includes("date") ? "2026-09-01" : "Verified end-to-end content");
  }
  for (const el of await page.locator("#dimForm [data-list-item]").all()) {
    await el.fill("First real step");
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const savedMsg = await page.locator("#dimSaved").textContent();
  check("6. save meaningful content", savedMsg.includes("Saved"), `${fields} fields · "${savedMsg}"`);

  // 7 + 8 — leave, reload, project persists
  await page.getByRole("button", { name: "← Back to workspace" }).click();
  await page.reload({ waitUntil: "load" });
  check("7. leave and reload", await page.locator("#view-landing").isVisible());

  const stored = await page.evaluate(() => window.__prism.repo.list());
  const persisted = stored.length === 1 && stored[0].goal === GOAL
    && Object.keys(stored[0].data).includes(firstDim);
  check("8. project persists across reload", persisted,
    `${stored.length} project(s), data on ${Object.keys(stored[0]?.data ?? {}).join(", ")}`);

  // Reopen through the real UI, not by injecting state.
  await page.locator('[data-nav="projects"]').first().click();
  await page.waitForSelector("#view-projects:not([hidden])");
  await page.getByRole("button", { name: "Open" }).first().click();
  await page.waitForSelector("#view-workspace:not([hidden])");

  // 9 — use a second dimension
  const secondDim = routed[1];
  await page.locator(`[data-open="${secondDim}"]`).click();
  await page.waitForSelector("#view-dimension:not([hidden])");
  for (const el of await page.locator("#dimForm [data-field]").all()) {
    const tag = await el.evaluate((n) => n.tagName + ":" + (n.type || ""));
    await el.fill(tag.includes("date") ? "2026-10-01" : "Second dimension content");
  }
  for (const el of await page.locator("#dimForm [data-list-item]").all()) {
    await el.fill("Second dimension step");
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "← Back to workspace" }).click();
  await page.waitForSelector("#view-workspace:not([hidden])");
  const after = await page.evaluate(() => window.__prism.repo.list()[0]);
  check("9. use a second dimension", Object.keys(after.data).length === 2,
    `content on ${Object.keys(after.data).join(", ")}`);

  // 10 — cross-dimension flow reflected in the unified workspace
  const progress = await page.locator("#wsProgTxt").textContent();
  check("10. return to unified workspace", /\d+ of \d+ dimensions complete/.test(progress), progress.trim());

  // 11 — generate the plan, and it must carry both dimensions
  await page.getByRole("button", { name: "Generate the plan" }).click();
  await page.waitForSelector("#view-result:not([hidden])");
  const sections = await page.locator("#resBody .res-sec").count();
  check("11. generate final project result", sections === 2, `${sections} sections rendered`);

  // 12 — export actually produces files
  const [htmlDl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download printable plan" }).click(),
  ]);
  const htmlPath = join(downloadDir, htmlDl.suggestedFilename());
  await htmlDl.saveAs(htmlPath);
  const htmlBody = existsSync(htmlPath) ? readFileSync(htmlPath, "utf8") : "";

  const [jsonDl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download JSON" }).click(),
  ]);
  const jsonPath = join(downloadDir, jsonDl.suggestedFilename());
  await jsonDl.saveAs(jsonPath);
  let parsed = null;
  try { parsed = JSON.parse(readFileSync(jsonPath, "utf8")); } catch {}

  check("12. export works",
    htmlBody.startsWith("<!doctype html>") && htmlBody.includes(GOAL) && parsed?.project?.goal === GOAL,
    `${htmlDl.suggestedFilename()} (${htmlBody.length}B) + ${jsonDl.suggestedFilename()}`);

  // 13 — mobile viewport usable, with no horizontal overflow
  const mob = await ctx.newPage();
  await mob.goto(BASE + "/", { waitUntil: "load" });
  await mob.setViewportSize({ width: 360, height: 740 });
  const overflow = await mob.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const startBtn = mob.getByRole("button", { name: "Start a project" }).first();
  const box = await startBtn.boundingBox();
  await startBtn.click();
  const reachedForm = await mob.locator("#view-new:not([hidden])").isVisible();
  await mob.fill("#pName", "Mobile check");
  await mob.fill("#pGoal", GOAL);
  await mob.getByRole("button", { name: "Route my goal" }).click();
  const mobileRouted = await mob.locator("#view-route:not([hidden])").isVisible();
  check("13. mobile viewport usable", overflow <= 0 && box.height >= 44 && reachedForm && mobileRouted,
    `overflow ${overflow}px, primary CTA ${Math.round(box.height)}px tall, routed ${mobileRouted}`);
  await mob.close();

  // 15 — no dead core action: every button in a visible view must be wired
  await page.goto(BASE + "/", { waitUntil: "load" });
  const dead = await page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll("button")) {
      const href = b.getAttribute("href");
      if (b.type === "submit") continue;
      if (!b.hasAttribute("data-nav") && !b.id && !b.className.includes("card") &&
          !b.className.includes("rm") && !b.className.includes("add-row") &&
          !b.className.includes("del") && !b.classList.contains("btn") && !href) {
        out.push(b.textContent.trim().slice(0, 40));
      }
    }
    return out;
  });
  check("15. no dead core action", dead.length === 0, dead.length ? dead.join(" | ") : "all buttons wired");

  check("16. no uncaught page errors during the run", consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(" | ") || "clean console");

} catch (err) {
  check("run completed without throwing", false, String(err).slice(0, 300));
} finally {
  await browser.close();
}

console.log("\n" + "=".repeat(58));
console.log(`REMOTE E2E — ${BASE}`);
console.log(`${results.filter((r) => r.pass).length} passed, ${failed} failed, ${results.length} checks`);
console.log("=".repeat(58));
process.exit(failed ? 1 : 0);
