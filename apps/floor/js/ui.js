// View wiring. One page, one workflow: figures → jobs → result.
//
// The report recomputes on every change rather than behind a "calculate"
// button. Seeing a new job move the numbers is the product demonstrating
// itself, and it removes a step from time-to-value.
//
// Every string reaching the DOM goes through textContent. No innerHTML.

import {
  analysePortfolio, formatMoney, overheadRecoveryRate,
  validateJob, validateSettings, VERDICT_LABEL, SAMPLE,
} from "./model.js";
import { createRepo, resolveStorage } from "./store.js";
import { toCSV, toHTML, filename } from "./export.js";

const { storage, persistent } = resolveStorage(window);
const repo = createRepo(storage);
const $ = (id) => document.getElementById(id);

const SETTING_INPUTS = ["annualOverhead", "billableHours", "labourCostPerHour", "targetMarginPct"];
const JOB_INPUTS = [
  ["jName", "name", "jNameErr"], ["jPrice", "price", "jPriceErr"], ["jHours", "labourHours", "jHoursErr"],
  ["jMaterials", "materials", "jMaterialsErr"], ["jTravel", "travel", "jTravelErr"], ["jSub", "subcontractor", "jSubErr"],
];

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function setErr(inputId, errId, message) {
  const el = $(inputId), errEl = $(errId);
  if (message) { errEl.textContent = message; errEl.hidden = false; el?.setAttribute("aria-invalid", "true"); }
  else { errEl.textContent = ""; errEl.hidden = true; el?.removeAttribute("aria-invalid"); }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function loadSettingsIntoForm(s) {
  for (const k of SETTING_INPUTS) $(k).value = s[k] === 0 ? "" : String(s[k]);
  $("currency").value = s.currency;
  showRecovery(s);
}

function readSettingsForm() {
  const raw = { currency: $("currency").value };
  for (const k of SETTING_INPUTS) raw[k] = $(k).value;
  return raw;
}

function showRecovery(settings) {
  const box = $("recoveryBox");
  if (!settings.billableHours || !settings.annualOverhead) { box.hidden = true; return; }
  $("recoveryVal").textContent = `${formatMoney(overheadRecoveryRate(settings), settings.currency)} / hour`;
  box.hidden = false;
}

$("setupForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = validateSettings(readSettingsForm());
  for (const k of SETTING_INPUTS) setErr(k, `${k}Err`, v.errors[k] ?? "");
  if (!v.ok) { $(Object.keys(v.errors)[0]).focus(); return; }

  repo.saveSettings(v.value);
  showRecovery(v.value);
  $("jobsPanel").hidden = false;
  toast("Figures saved");
  render();
  $("jName").focus();
});

// Live recovery figure as the two inputs it depends on are typed.
for (const k of ["annualOverhead", "billableHours"]) {
  $(k).addEventListener("input", () => {
    const v = validateSettings(readSettingsForm());
    showRecovery(v.ok ? v.value : { ...v.value, currency: $("currency").value });
  });
}

$("setupToggle").addEventListener("click", () => {
  const body = $("setupForm");
  const open = body.hidden;
  body.hidden = !open;
  $("setupToggle").textContent = open ? "Hide" : "Edit";
  $("setupToggle").setAttribute("aria-expanded", String(open));
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

$("jobForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = {};
  for (const [inputId, key] of JOB_INPUTS) raw[key] = $(inputId).value;

  const v = validateJob(raw);
  for (const [inputId, key, errId] of JOB_INPUTS) setErr(inputId, errId, v.errors[key] ?? "");
  if (!v.ok) {
    const firstBad = JOB_INPUTS.find(([, key]) => v.errors[key]);
    $(firstBad[0]).focus();
    return;
  }

  if (!repo.addJob(v.value)) { toast("Job limit reached"); return; }
  for (const [inputId] of JOB_INPUTS) $(inputId).value = "";
  render();
  toast(`"${v.value.name}" added`);
  $("jName").focus();
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

let currentReport = null;

function kpi(label, value, negative) {
  const d = document.createElement("div"); d.className = "kpi";
  const l = document.createElement("div"); l.className = "l"; l.textContent = label;
  const v = document.createElement("div"); v.className = "v" + (negative ? " neg" : ""); v.textContent = value;
  d.append(l, v);
  return d;
}

function cell(text, cls) {
  const td = document.createElement("td");
  if (cls) td.className = cls;
  td.textContent = text;
  return td;
}

function render() {
  const settings = repo.getSettings();
  const jobs = repo.listJobs();
  const configured = repo.isConfigured();

  $("jobsPanel").hidden = !configured;
  $("emptyPanel").hidden = !(configured && jobs.length === 0);

  if (!configured || jobs.length === 0) {
    $("reportPanel").hidden = true;
    currentReport = null;
    return;
  }

  const r = analysePortfolio(jobs, settings);
  currentReport = r;
  const m = (v) => formatMoney(v, settings.currency);

  const head = $("headline");
  head.textContent = r.headline;
  head.className = "headline " + (r.findings[0].severity === "ok" ? "ok"
    : r.findings[0].severity === "critical" ? "critical" : "");

  const kpis = $("kpis"); kpis.textContent = "";
  kpis.append(
    kpi("Total invoiced", m(r.totals.price)),
    kpi("True cost", m(r.totals.cost)),
    kpi("Margin", `${m(r.totals.margin)} (${r.totals.marginPct}%)`, r.totals.margin < 0),
    kpi("Yield per hour", m(r.totals.effectiveHourly), r.totals.effectiveHourly < 0),
    kpi("Below break-even", `${r.counts.loss} of ${r.counts.total}`, r.counts.loss > 0),
  );

  const table = $("jobTable"); table.textContent = "";
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const [label, cls] of [["Job", ""], ["Charged", "n"], ["True cost", "n"], ["Margin", "n"],
                              ["Price floor", "n"], ["Target price", "n"], ["", ""]]) {
    const th = document.createElement("th");
    if (cls) th.className = cls;
    th.textContent = label;
    if (!label) th.setAttribute("aria-label", "Remove job");
    hr.appendChild(th);
  }
  thead.appendChild(hr); table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const j of r.ranked) {
    const tr = document.createElement("tr");
    tr.className = `v-${j.verdict}`;

    const nameTd = document.createElement("td");
    const strong = document.createElement("strong"); strong.textContent = j.name;
    const dx = document.createElement("span"); dx.className = "dx";
    dx.textContent = `${VERDICT_LABEL[j.verdict]} · ${j.diagnosis}`;
    nameTd.append(strong, dx);

    const marginTd = cell(`${m(j.margin)} (${j.marginPct}%)`, "n" + (j.margin < 0 ? " neg" : ""));

    const rmTd = document.createElement("td");
    const rm = document.createElement("button");
    rm.type = "button"; rm.className = "rm"; rm.textContent = "×";
    rm.setAttribute("aria-label", `Remove ${j.name}`);
    rm.setAttribute("data-remove", j.id);
    rmTd.appendChild(rm);

    tr.append(nameTd, cell(m(j.price), "n"), cell(m(j.trueCost), "n"), marginTd,
              cell(m(j.priceFloor), "n"), cell(Number.isFinite(j.targetPrice) ? m(j.targetPrice) : "—", "n"), rmTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  const f = $("findings"); f.textContent = "";
  for (const item of r.findings) {
    const li = document.createElement("li");
    li.className = `f-${item.severity}`;
    li.textContent = item.text;
    f.appendChild(li);
  }

  $("reportPanel").hidden = false;
}

$("jobTable").addEventListener("click", (e) => {
  const b = e.target.closest("[data-remove]");
  if (!b) return;
  repo.removeJob(b.getAttribute("data-remove"));
  render();
  toast("Job removed");
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function download(text, name, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast(`Downloaded ${name}`);
}

$("csvBtn").addEventListener("click", () => {
  if (currentReport) download(toCSV(currentReport), filename("csv"), "text/csv;charset=utf-8");
});
$("pdfBtn").addEventListener("click", () => {
  if (currentReport) download(toHTML(currentReport), filename("html"), "text/html;charset=utf-8");
});

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

$("startBtn").addEventListener("click", () => {
  $("setupForm").hidden = false;
  $("annualOverhead").focus();
  $("setupPanel").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("sampleBtn").addEventListener("click", () => {
  repo.replaceAll(SAMPLE.settings, SAMPLE.jobs);
  loadSettingsIntoForm(repo.getSettings());
  render();
  $("reportPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  toast("Example figures loaded — replace them with your own");
});

$("resetAll").addEventListener("click", () => {
  if (!window.confirm("Clear your figures and all jobs? This cannot be undone.")) return;
  repo.clear();
  loadSettingsIntoForm(repo.getSettings());
  $("jobsPanel").hidden = true;
  render();
  toast("Cleared");
});

loadSettingsIntoForm(repo.getSettings());
if (repo.isConfigured()) $("setupForm").hidden = false;
render();

if (!persistent) toast("This browser is blocking local storage — your figures will not survive a reload.");

// Exposed so the end-to-end suite can assert on real state rather than scraping.
window.__floor = { repo, analysePortfolio, get report() { return currentReport; } };
