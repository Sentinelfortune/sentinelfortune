// Exports. Two formats, each with a job.
//
// CSV goes into the spreadsheet the operator already uses. Printable HTML is
// the sheet they take to a pricing conversation — self-contained, so it prints
// or saves as PDF from the browser without a PDF library.

import { formatMoney, VERDICT_LABEL } from "./model.js";

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * A leading =, +, - or @ makes a spreadsheet treat the cell as a formula, which
 * turns a job name into code the recipient's Excel will run. Prefixing an
 * apostrophe is the standard neutralisation and is invisible in the cell.
 */
function csvCell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS = [
  ["Job", (j) => j.name],
  ["Price", (j) => j.price],
  ["Labour hours", (j) => j.labourHours],
  ["Labour cost", (j) => j.labourCost],
  ["Materials", (j) => j.materials],
  ["Travel", (j) => j.travel],
  ["Subcontractor", (j) => j.subcontractor],
  ["Overhead allocated", (j) => j.overheadCost],
  ["True cost", (j) => j.trueCost],
  ["Margin", (j) => j.margin],
  ["Margin %", (j) => j.marginPct],
  ["Yield per hour", (j) => j.hourlyYield],
  ["Price floor", (j) => j.priceFloor],
  ["Target price", (j) => (Number.isFinite(j.targetPrice) ? j.targetPrice : "")],
  ["Verdict", (j) => VERDICT_LABEL[j.verdict]],
  ["Diagnosis", (j) => j.diagnosis],
];

export function toCSV(report) {
  const head = CSV_COLUMNS.map(([h]) => csvCell(h)).join(",");
  const rows = report.ranked.map((j) => CSV_COLUMNS.map(([, get]) => csvCell(get(j))).join(","));
  return [head, ...rows].join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Printable HTML
// ---------------------------------------------------------------------------

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export function toHTML(report) {
  const cur = report.settings.currency;
  const m = (v) => esc(formatMoney(v, cur));
  const date = new Date().toISOString().slice(0, 10);

  const rows = report.ranked.map((j) => `
    <tr class="v-${j.verdict}">
      <td><strong>${esc(j.name)}</strong><br><span class="dx">${esc(j.diagnosis)}</span></td>
      <td class="n">${m(j.price)}</td>
      <td class="n">${m(j.trueCost)}</td>
      <td class="n ${j.margin < 0 ? "neg" : ""}">${m(j.margin)}<br><span class="dx">${esc(j.marginPct)}%</span></td>
      <td class="n"><strong>${m(j.priceFloor)}</strong></td>
      <td class="n">${Number.isFinite(j.targetPrice) ? m(j.targetPrice) : "—"}</td>
    </tr>`).join("");

  const findings = report.findings.map((f) =>
    `<li class="f-${esc(f.severity)}">${esc(f.text)}</li>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Job margin report — ${esc(date)}</title>
<style>
 :root{--ink:#14161d;--muted:#5c6072;--line:#e2e4ec;--neg:#c0392b;--warn:#b7791f;--ok:#2f855a}
 *{box-sizing:border-box}
 body{margin:0;padding:36px 22px;max-width:900px;margin-inline:auto;color:var(--ink);background:#fff;
   font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
 h1{font-size:1.6rem;margin:0 0 6px}
 .sub{color:var(--muted);margin:0 0 22px;font-size:.9rem}
 .head-line{background:#fdf6e3;border-left:4px solid var(--warn);padding:13px 16px;margin:0 0 22px;font-weight:500}
 .kpis{display:flex;flex-wrap:wrap;gap:14px;margin:0 0 26px}
 .kpi{border:1px solid var(--line);border-radius:9px;padding:12px 15px;min-width:150px}
 .kpi .l{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}
 .kpi .v{font-size:1.2rem;font-weight:600}
 table{width:100%;border-collapse:collapse;font-size:.86rem}
 th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
 th{font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
 td.n{text-align:right;white-space:nowrap}
 .dx{color:var(--muted);font-size:.78rem}
 .neg{color:var(--neg);font-weight:600}
 tr.v-LOSS td:first-child{border-left:3px solid var(--neg);padding-left:9px}
 tr.v-UNDER_TARGET td:first-child{border-left:3px solid var(--warn);padding-left:9px}
 tr.v-ON_TARGET td:first-child{border-left:3px solid var(--ok);padding-left:9px}
 ul.findings{padding-left:18px;margin:26px 0 0}
 ul.findings li{margin-bottom:8px}
 .f-critical{color:var(--neg)}
 footer{margin-top:34px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:.78rem}
 @media print{body{padding:0}tr{break-inside:avoid}}
</style></head><body>
<h1>Job margin report</h1>
<p class="sub">${esc(report.counts.total)} job${report.counts.total === 1 ? "" : "s"} ·
  overhead recovery ${m(report.recovery)} per billable hour ·
  target margin ${esc(report.settings.targetMarginPct)}% · ${esc(date)}</p>

<p class="head-line">${esc(report.headline)}</p>

<div class="kpis">
  <div class="kpi"><div class="l">Total invoiced</div><div class="v">${m(report.totals.price)}</div></div>
  <div class="kpi"><div class="l">True cost</div><div class="v">${m(report.totals.cost)}</div></div>
  <div class="kpi"><div class="l">Margin</div><div class="v ${report.totals.margin < 0 ? "neg" : ""}">${m(report.totals.margin)} (${esc(report.totals.marginPct)}%)</div></div>
  <div class="kpi"><div class="l">Yield per hour</div><div class="v">${m(report.totals.effectiveHourly)}</div></div>
  <div class="kpi"><div class="l">Below break-even</div><div class="v ${report.counts.loss ? "neg" : ""}">${esc(report.counts.loss)} of ${esc(report.counts.total)}</div></div>
</div>

<table>
  <caption style="text-align:left;color:var(--muted);font-size:.8rem;padding-bottom:8px">
    Worst margin first. Price floor is break-even including allocated overhead.
  </caption>
  <thead><tr>
    <th>Job</th><th class="n">Charged</th><th class="n">True cost</th>
    <th class="n">Margin</th><th class="n">Price floor</th><th class="n">Target price</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>

<ul class="findings">${findings}</ul>

<footer>
  Produced by Floor, a Sentinel Fortune LLC hosted application, from figures you entered.
  It is a costing calculation, not accounting, tax or financial advice. Check the overhead
  and capacity figures against your own records before pricing work from it.
</footer>
</body></html>`;
}

export function filename(ext) {
  return `job-margin-report-${new Date().toISOString().slice(0, 10)}.${ext}`;
}
