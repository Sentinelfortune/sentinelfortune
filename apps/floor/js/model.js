// The calculation engine. This is the product — everything else is a way to
// get numbers in and results out.
//
// The job it does is one small operators reliably get wrong: allocating
// overhead. A quote that covers labour and materials still loses money, because
// rent, insurance, admin, software and the van are paid whether or not the job
// happens. Those costs have to be recovered across billable hours, and the
// per-hour figure that does it is not something anyone estimates correctly by
// feel.
//
// Every function here is pure. No DOM, no storage, no formatting — that keeps
// the arithmetic testable in isolation, which matters because the arithmetic is
// the thing the customer is trusting.

/** Currency is stored in minor units internally to avoid float drift. */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const SETTINGS_FIELDS = ["annualOverhead", "billableHours", "labourCostPerHour", "targetMarginPct"];

export const DEFAULT_SETTINGS = {
  currency: "USD",
  annualOverhead: 0,
  billableHours: 0,
  labourCostPerHour: 0,
  targetMarginPct: 20,
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function num(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value ?? "").trim().replace(/,/g, "");
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function validateSettings(raw) {
  const errors = {};
  const out = { ...DEFAULT_SETTINGS };

  const overhead = num(raw.annualOverhead);
  if (overhead === null || overhead < 0) errors.annualOverhead = "Enter your annual overhead as a number (0 or more).";
  else out.annualOverhead = overhead;

  const hours = num(raw.billableHours);
  if (hours === null || hours <= 0) errors.billableHours = "Billable hours per year must be greater than zero — it is what overhead is spread across.";
  else if (hours > 20000) errors.billableHours = "That is more hours than a year contains. Check the figure.";
  else out.billableHours = hours;

  const labour = num(raw.labourCostPerHour);
  if (labour === null || labour < 0) errors.labourCostPerHour = "Enter what an hour of labour costs you (wage plus on-costs).";
  else out.labourCostPerHour = labour;

  const margin = num(raw.targetMarginPct);
  if (margin === null || margin < 0) errors.targetMarginPct = "Target margin must be 0 or more.";
  else if (margin >= 100) errors.targetMarginPct = "A target margin of 100% or more has no achievable price. Use something under 100.";
  else out.targetMarginPct = margin;

  if (typeof raw.currency === "string" && /^[A-Z]{3}$/.test(raw.currency.trim().toUpperCase())) {
    out.currency = raw.currency.trim().toUpperCase();
  }
  return { ok: Object.keys(errors).length === 0, errors, value: out };
}

export function validateJob(raw) {
  const errors = {};
  const out = { name: "", price: 0, labourHours: 0, materials: 0, travel: 0, subcontractor: 0 };

  const name = String(raw.name ?? "").trim();
  if (!name) errors.name = "Give the job a name so you can recognise it.";
  else if (name.length > 120) errors.name = "Keep the name under 120 characters.";
  else out.name = name;

  const price = num(raw.price);
  if (price === null || price <= 0) errors.price = "Enter what you charged (or plan to charge) for this job.";
  else out.price = price;

  const hours = num(raw.labourHours);
  if (hours === null || hours <= 0) errors.labourHours = "Enter the on-site labour hours. Overhead is allocated per hour, so this cannot be zero.";
  else if (hours > 10000) errors.labourHours = "Check that hours figure.";
  else out.labourHours = hours;

  for (const [key, label] of [["materials", "Materials"], ["travel", "Travel"], ["subcontractor", "Subcontractor"]]) {
    const v = num(raw[key] === "" || raw[key] === undefined ? 0 : raw[key]);
    if (v === null || v < 0) errors[key] = `${label} cost must be 0 or more.`;
    else out[key] = v;
  }

  return { ok: Object.keys(errors).length === 0, errors, value: out };
}

// ---------------------------------------------------------------------------
// The arithmetic
// ---------------------------------------------------------------------------

/**
 * What every billable hour must contribute toward fixed costs.
 * This single number is the reason a job that "looked fine" lost money.
 */
export function overheadRecoveryRate(settings) {
  if (!settings.billableHours) return 0;
  return round2(settings.annualOverhead / settings.billableHours);
}

/**
 * Full cost of delivering one job: direct costs plus the share of fixed costs
 * those labour hours are responsible for carrying.
 */
export function analyseJob(job, settings) {
  const recovery = overheadRecoveryRate(settings);

  const labourCost = round2(job.labourHours * settings.labourCostPerHour);
  const overheadCost = round2(job.labourHours * recovery);
  const directCost = round2(labourCost + job.materials + job.travel + job.subcontractor);
  const trueCost = round2(directCost + overheadCost);

  const margin = round2(job.price - trueCost);
  const marginPct = job.price > 0 ? round2((margin / job.price) * 100) : 0;

  // Break-even is true cost. Below it the job consumes the business.
  const priceFloor = trueCost;

  // Price that would have hit the target margin: cost / (1 - margin).
  const t = settings.targetMarginPct / 100;
  const targetPrice = t < 1 ? round2(trueCost / (1 - t)) : Infinity;
  const shortfall = round2(Math.max(0, targetPrice - job.price));

  // What one hour of this job actually returned after every cost.
  const hourlyYield = job.labourHours > 0 ? round2(margin / job.labourHours) : 0;

  const verdict =
    margin < 0 ? "LOSS" :
    marginPct < settings.targetMarginPct ? "UNDER_TARGET" : "ON_TARGET";

  return {
    ...job,
    labourCost, overheadCost, directCost, trueCost,
    margin, marginPct, priceFloor, targetPrice, shortfall, hourlyYield, verdict,
    recovery,
    // Share of true cost by component — the basis of the diagnosis below.
    shares: trueCost > 0 ? {
      labour: round2((labourCost / trueCost) * 100),
      overhead: round2((overheadCost / trueCost) * 100),
      materials: round2((job.materials / trueCost) * 100),
      travel: round2((job.travel / trueCost) * 100),
      subcontractor: round2((job.subcontractor / trueCost) * 100),
    } : { labour: 0, overhead: 0, materials: 0, travel: 0, subcontractor: 0 },
  };
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : round2((s[mid - 1] + s[mid]) / 2);
}

/**
 * Why this job's margin is worse than the rest.
 *
 * Compares each cost component's share against the portfolio median and names
 * the one that is most out of line. With fewer than three jobs there is no
 * meaningful median, so it says so instead of inventing a comparison.
 */
export function diagnose(analysed, all) {
  if (all.length < 3) {
    return analysed.verdict === "LOSS"
      ? "Below break-even. Add two more jobs to see which cost is out of line with the rest."
      : "Add at least three jobs to compare cost patterns.";
  }
  const labels = {
    materials: "Materials are a bigger share of this job than your typical job",
    travel: "Travel is a bigger share of this job than your typical job",
    subcontractor: "Subcontractor cost is a bigger share here than usual",
    overhead: "This job carried more overhead than usual for its price — the hours were long relative to what you charged",
    labour: "Labour is a bigger share of this job than your typical job",
  };
  const medians = {};
  for (const k of Object.keys(labels)) medians[k] = median(all.map((j) => j.shares[k]));

  let worst = null, gap = 0;
  for (const k of Object.keys(labels)) {
    const d = analysed.shares[k] - medians[k];
    if (d > gap) { gap = d; worst = k; }
  }
  if (!worst || gap < 5) {
    return analysed.verdict === "LOSS"
      ? "No single cost stands out — this job is simply priced too low for the work in it."
      : "Cost mix is in line with your other jobs.";
  }
  return `${labels[worst]} (${analysed.shares[worst]}% vs ${medians[worst]}% typical).`;
}

/**
 * Portfolio-level analysis. Returns the ranked jobs plus the findings that are
 * true of the set as a whole — including the single most important one.
 */
export function analysePortfolio(jobs, settings) {
  const analysed = jobs.map((j) => analyseJob(j, settings));
  const withDiagnosis = analysed.map((a) => ({ ...a, diagnosis: diagnose(a, analysed) }));

  const ranked = [...withDiagnosis].sort((a, b) => a.marginPct - b.marginPct);

  const totalPrice = round2(analysed.reduce((s, j) => s + j.price, 0));
  const totalCost = round2(analysed.reduce((s, j) => s + j.trueCost, 0));
  const totalMargin = round2(totalPrice - totalCost);
  const totalHours = round2(analysed.reduce((s, j) => s + j.labourHours, 0));

  const losses = analysed.filter((j) => j.verdict === "LOSS");
  const under = analysed.filter((j) => j.verdict === "UNDER_TARGET");

  const findings = [];
  if (losses.length) {
    const worst = [...losses].sort((a, b) => a.margin - b.margin)[0];
    findings.push({
      severity: "critical",
      text: `${losses.length} of ${analysed.length} job${analysed.length === 1 ? "" : "s"} is below break-even. The worst is "${worst.name}", losing ${Math.abs(worst.margin)} — it needed to be priced at ${worst.priceFloor} just to break even.`,
    });
  }
  if (under.length) {
    findings.push({
      severity: "warning",
      text: `${under.length} job${under.length === 1 ? " is" : "s are"} profitable but below your ${settings.targetMarginPct}% target.`,
    });
  }

  // Short jobs are where travel and overhead quietly eat the margin.
  const short = analysed.filter((j) => j.labourHours <= 4);
  if (short.length >= 2) {
    const shortAvg = round2(short.reduce((s, j) => s + j.marginPct, 0) / short.length);
    const longJobs = analysed.filter((j) => j.labourHours > 4);
    if (longJobs.length >= 2) {
      const longAvg = round2(longJobs.reduce((s, j) => s + j.marginPct, 0) / longJobs.length);
      if (longAvg - shortAvg >= 10) {
        findings.push({
          severity: "insight",
          text: `Your short jobs (4 hours or less) average ${shortAvg}% margin against ${longAvg}% on longer ones. Short jobs carry the same travel and call-out cost over fewer billable hours — consider a minimum charge.`,
        });
      }
    }
  }

  if (!findings.length) {
    findings.push({ severity: "ok", text: `Every job clears your ${settings.targetMarginPct}% target. Your overhead recovery is covered.` });
  }

  return {
    settings,
    recovery: overheadRecoveryRate(settings),
    jobs: withDiagnosis,
    ranked,
    totals: {
      price: totalPrice, cost: totalCost, margin: totalMargin,
      marginPct: totalPrice > 0 ? round2((totalMargin / totalPrice) * 100) : 0,
      hours: totalHours,
      effectiveHourly: totalHours > 0 ? round2(totalMargin / totalHours) : 0,
    },
    counts: { total: analysed.length, loss: losses.length, under: under.length,
              onTarget: analysed.length - losses.length - under.length },
    findings,
    headline: findings[0].text,
  };
}

export function formatMoney(value, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${round2(value).toFixed(2)}`;
  }
}

export const VERDICT_LABEL = {
  LOSS: "Below break-even",
  UNDER_TARGET: "Under target",
  ON_TARGET: "On target",
};

/** Realistic sample so a first-time visitor sees the output before typing. */
export const SAMPLE = {
  settings: { currency: "USD", annualOverhead: 48000, billableHours: 1600, labourCostPerHour: 32, targetMarginPct: 25 },
  jobs: [
    { name: "Boiler swap — Elm Road", price: 2400, labourHours: 14, materials: 980, travel: 40, subcontractor: 0 },
    { name: "Blocked drain call-out", price: 180, labourHours: 2, materials: 15, travel: 45, subcontractor: 0 },
    { name: "Bathroom refit — Priory St", price: 6800, labourHours: 52, materials: 2100, travel: 120, subcontractor: 600 },
    { name: "Radiator valve replacement", price: 145, labourHours: 1.5, materials: 28, travel: 38, subcontractor: 0 },
    { name: "Commercial kitchen pipework", price: 4300, labourHours: 30, materials: 1250, travel: 90, subcontractor: 0 },
  ],
};
