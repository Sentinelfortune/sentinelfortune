// Tests for the calculation engine.
//
// The customer is trusting these numbers to price work, so the arithmetic is
// checked against figures worked by hand rather than against whatever the code
// happens to produce.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  analyseJob, analysePortfolio, diagnose, overheadRecoveryRate,
  validateJob, validateSettings, num, formatMoney, SAMPLE, DEFAULT_SETTINGS,
} from "../js/model.js";
import { createRepo, memoryStorage } from "../js/store.js";
import { toCSV, toHTML } from "../js/export.js";

const S = { currency: "USD", annualOverhead: 48000, billableHours: 1600, labourCostPerHour: 32, targetMarginPct: 25 };

describe("overhead recovery", () => {
  test("spreads annual overhead across billable hours", () => {
    // 48000 / 1600 = 30.00 per billable hour
    assert.equal(overheadRecoveryRate(S), 30);
  });

  test("zero capacity cannot divide — returns 0 rather than Infinity", () => {
    assert.equal(overheadRecoveryRate({ ...S, billableHours: 0 }), 0);
  });
});

describe("job analysis — worked by hand", () => {
  // 10 hours, labour 32/hr, materials 500, travel 50, overhead 30/hr.
  // labour  = 320
  // overhead= 300
  // direct  = 320 + 500 + 50 = 870
  // true    = 1170
  const job = { name: "Hand-worked", price: 1500, labourHours: 10, materials: 500, travel: 50, subcontractor: 0 };
  const a = analyseJob(job, S);

  test("labour and overhead are allocated per hour", () => {
    assert.equal(a.labourCost, 320);
    assert.equal(a.overheadCost, 300);
  });

  test("true cost includes allocated overhead, direct cost does not", () => {
    assert.equal(a.directCost, 870);
    assert.equal(a.trueCost, 1170);
  });

  test("margin is price minus true cost", () => {
    assert.equal(a.margin, 330);
    assert.equal(a.marginPct, 22);
  });

  test("price floor is break-even, not cost-plus", () => {
    assert.equal(a.priceFloor, 1170);
  });

  test("target price solves cost / (1 - margin), not cost * (1 + margin)", () => {
    // 1170 / 0.75 = 1560 — a job priced at 1560 yields exactly 25%.
    assert.equal(a.targetPrice, 1560);
    const check = analyseJob({ ...job, price: 1560 }, S);
    assert.equal(check.marginPct, 25);
  });

  test("shortfall is what the price missed the target by", () => {
    assert.equal(a.shortfall, 60);
  });

  test("hourly yield is margin per labour hour", () => {
    assert.equal(a.hourlyYield, 33);
  });

  test("a job that only covers direct cost is still a loss", () => {
    const breakEvenOnDirect = analyseJob({ ...job, price: 870 }, S);
    assert.equal(breakEvenOnDirect.verdict, "LOSS");
    assert.equal(breakEvenOnDirect.margin, -300); // exactly the unrecovered overhead
  });

  test("verdicts key off the target margin", () => {
    assert.equal(analyseJob({ ...job, price: 1000 }, S).verdict, "LOSS");
    assert.equal(analyseJob({ ...job, price: 1500 }, S).verdict, "UNDER_TARGET");
    assert.equal(analyseJob({ ...job, price: 1600 }, S).verdict, "ON_TARGET");
  });

  test("cost shares sum to 100% of true cost", () => {
    const sum = Object.values(a.shares).reduce((x, y) => x + y, 0);
    assert.ok(Math.abs(sum - 100) < 0.5, `shares summed to ${sum}`);
  });
});

describe("portfolio analysis", () => {
  const r = analysePortfolio(SAMPLE.jobs, SAMPLE.settings);

  test("ranks worst margin first, so the problem is at the top", () => {
    const pcts = r.ranked.map((j) => j.marginPct);
    assert.deepEqual(pcts, [...pcts].sort((a, b) => a - b));
  });

  test("identifies the below-break-even jobs in the sample", () => {
    // The two short call-outs cannot carry travel + overhead at those prices.
    assert.ok(r.counts.loss >= 1, `expected losses, got ${r.counts.loss}`);
    const names = r.jobs.filter((j) => j.verdict === "LOSS").map((j) => j.name);
    assert.ok(names.some((n) => n.includes("Radiator valve")), names.join(", "));
  });

  test("totals reconcile with the per-job figures", () => {
    const sumPrice = r.jobs.reduce((s, j) => s + j.price, 0);
    const sumCost = r.jobs.reduce((s, j) => s + j.trueCost, 0);
    assert.ok(Math.abs(r.totals.price - sumPrice) < 0.01);
    assert.ok(Math.abs(r.totals.cost - sumCost) < 0.01);
    assert.ok(Math.abs(r.totals.margin - (sumPrice - sumCost)) < 0.02);
  });

  test("headline names the worst job and its break-even price", () => {
    assert.match(r.headline, /below break-even/i);
    assert.ok(r.findings.length >= 1);
  });

  test("detects that short jobs underperform longer ones", () => {
    const insight = r.findings.find((f) => f.severity === "insight");
    assert.ok(insight, "expected a short-job insight from the sample");
    assert.match(insight.text, /minimum charge/i);
  });

  test("a healthy portfolio reports no problems rather than inventing one", () => {
    const good = SAMPLE.jobs.map((j) => ({ ...j, price: j.price * 4 }));
    const rr = analysePortfolio(good, SAMPLE.settings);
    assert.equal(rr.counts.loss, 0);
    assert.equal(rr.findings[0].severity, "ok");
  });

  test("an empty portfolio does not throw", () => {
    const empty = analysePortfolio([], SAMPLE.settings);
    assert.equal(empty.counts.total, 0);
    assert.equal(empty.totals.price, 0);
  });
});

describe("diagnosis", () => {
  test("declines to compare with fewer than three jobs", () => {
    const two = [SAMPLE.jobs[0], SAMPLE.jobs[1]].map((j) => analyseJob(j, SAMPLE.settings));
    assert.match(diagnose(two[0], two), /three jobs|two more/i);
  });

  test("names the component that is out of line", () => {
    const jobs = [
      { name: "A", price: 1000, labourHours: 10, materials: 100, travel: 20, subcontractor: 0 },
      { name: "B", price: 1000, labourHours: 10, materials: 110, travel: 25, subcontractor: 0 },
      { name: "C", price: 1000, labourHours: 10, materials: 900, travel: 20, subcontractor: 0 },
    ].map((j) => analyseJob(j, S));
    assert.match(diagnose(jobs[2], jobs), /Materials/i);
  });

  test("says so plainly when nothing stands out", () => {
    const jobs = [
      { name: "A", price: 1000, labourHours: 10, materials: 100, travel: 20, subcontractor: 0 },
      { name: "B", price: 1000, labourHours: 10, materials: 100, travel: 20, subcontractor: 0 },
      { name: "C", price: 1000, labourHours: 10, materials: 100, travel: 20, subcontractor: 0 },
    ].map((j) => analyseJob(j, S));
    assert.match(diagnose(jobs[0], jobs), /in line|priced too low/i);
  });
});

describe("input validation", () => {
  test("num accepts real entries and rejects junk", () => {
    assert.equal(num("1,250.50"), 1250.5);
    assert.equal(num(" 42 "), 42);
    assert.equal(num("abc"), null);
    assert.equal(num(""), null);
    assert.equal(num("12px"), null);
    assert.equal(num(Infinity), null);
    assert.equal(num(NaN), null);
  });

  test("billable hours must be above zero — it is the divisor", () => {
    const r = validateSettings({ ...S, billableHours: 0 });
    assert.equal(r.ok, false);
    assert.match(r.errors.billableHours, /greater than zero/i);
  });

  test("a target margin of 100% is refused because no price satisfies it", () => {
    assert.equal(validateSettings({ ...S, targetMarginPct: 100 }).ok, false);
    assert.equal(validateSettings({ ...S, targetMarginPct: 99 }).ok, true);
  });

  test("labour hours cannot be zero — overhead is allocated per hour", () => {
    const r = validateJob({ name: "X", price: 100, labourHours: 0 });
    assert.equal(r.ok, false);
    assert.match(r.errors.labourHours, /cannot be zero/i);
  });

  test("optional cost fields default to zero rather than failing", () => {
    const r = validateJob({ name: "X", price: 100, labourHours: 2 });
    assert.equal(r.ok, true);
    assert.equal(r.value.materials, 0);
    assert.equal(r.value.travel, 0);
  });

  test("negative costs are refused", () => {
    assert.equal(validateJob({ name: "X", price: 100, labourHours: 2, materials: -5 }).ok, false);
    assert.equal(validateJob({ name: "X", price: -1, labourHours: 2 }).ok, false);
  });
});

describe("persistence", () => {
  test("settings and jobs survive a reload", () => {
    const store = memoryStorage();
    const repo = createRepo(store);
    repo.saveSettings(S);
    repo.addJob({ name: "Job 1", price: 500, labourHours: 5, materials: 50, travel: 10, subcontractor: 0 });

    const reloaded = createRepo(store);
    assert.equal(reloaded.getSettings().annualOverhead, 48000);
    assert.equal(reloaded.listJobs().length, 1);
    assert.equal(reloaded.listJobs()[0].name, "Job 1");
  });

  test("a corrupt store falls back to defaults instead of throwing", () => {
    const store = memoryStorage();
    store.setItem("sentinel.floor.v1", "{{{not json");
    const repo = createRepo(store);
    assert.deepEqual(repo.getSettings(), DEFAULT_SETTINGS);
    assert.deepEqual(repo.listJobs(), []);
  });

  test("removing a job leaves the rest intact", () => {
    const repo = createRepo(memoryStorage());
    const a = repo.addJob({ name: "A", price: 100, labourHours: 1, materials: 0, travel: 0, subcontractor: 0 });
    repo.addJob({ name: "B", price: 100, labourHours: 1, materials: 0, travel: 0, subcontractor: 0 });
    repo.removeJob(a.id);
    assert.deepEqual(repo.listJobs().map((j) => j.name), ["B"]);
  });

  test("stored jobs are stripped of unknown fields", () => {
    const store = memoryStorage();
    store.setItem("sentinel.floor.v1", JSON.stringify({
      settings: S, jobs: [{ id: "x", name: "A", price: 100, labourHours: 1, evil: "<script>" }],
    }));
    const j = createRepo(store).listJobs()[0];
    assert.equal(j.evil, undefined);
    assert.equal(j.name, "A");
  });
});

describe("export", () => {
  const r = analysePortfolio(SAMPLE.jobs, SAMPLE.settings);

  test("CSV has a header and one row per job", () => {
    const lines = toCSV(r).trim().split("\n");
    assert.equal(lines.length, SAMPLE.jobs.length + 1);
    assert.match(lines[0], /Job,Price,.*Price floor/i);
  });

  test("CSV escapes a name containing a comma and a quote", () => {
    const rr = analysePortfolio([{ ...SAMPLE.jobs[0], name: 'Smith, "the boiler" job' }], SAMPLE.settings);
    const line = toCSV(rr).trim().split("\n")[1];
    assert.ok(line.startsWith('"Smith, ""the boiler"" job"'), line);
  });

  test("CSV cannot be used for formula injection in a spreadsheet", () => {
    const rr = analysePortfolio([{ ...SAMPLE.jobs[0], name: "=cmd|'/c calc'!A1" }], SAMPLE.settings);
    const line = toCSV(rr).trim().split("\n")[1];
    assert.ok(!/^"?=/.test(line), `formula left executable: ${line}`);
  });

  test("printable HTML contains the headline and every job", () => {
    const html = toHTML(r);
    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes("Radiator valve replacement"));
    for (const j of SAMPLE.jobs) assert.ok(html.includes(j.name), `missing ${j.name}`);
  });

  test("printable HTML escapes injected markup", () => {
    const rr = analysePortfolio([{ ...SAMPLE.jobs[0], name: '<img src=x onerror="alert(1)">' }], SAMPLE.settings);
    const html = toHTML(rr);
    assert.ok(!html.includes("<img src=x"));
    assert.ok(html.includes("&lt;img"));
  });
});

describe("formatting", () => {
  test("money formats to the chosen currency", () => {
    assert.match(formatMoney(1234.5, "USD"), /\$1,234\.50/);
  });
  test("an unknown currency code does not throw", () => {
    assert.ok(formatMoney(10, "ZZZ").length > 0);
  });
});
