// View wiring.
//
// All state lives in one `state` object and one repo; views are pure renders of
// it. There is no framework and no build step: the app ships as the files you
// see, which keeps the whole thing auditable and makes "no secrets in
// client-side source" trivially true — there is no server to hold a secret.
//
// Every string that reaches the DOM goes through textContent or a document
// fragment. Nothing user-typed is ever interpolated into innerHTML.

import { DIMENSIONS, getDimension } from "./dimensions.js";
import { recommend } from "./router.js";
import {
  createProject, createRepo, dimensionStatus, projectProgress,
  resolveStorage, validateGoal, validateProjectName, coerceField,
} from "./store.js";
import { buildSummary, toHTML, toJSON, suggestFilename } from "./export.js";

const { storage, persistent } = resolveStorage(window);
const repo = createRepo(storage);

const state = { view: "landing", project: null, pending: null };

const $ = (id) => document.getElementById(id);
const VIEWS = ["landing", "new", "route", "workspace", "dimension", "result", "projects"];

function show(view) {
  state.view = view;
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  // Landing owns the document's only <h1>; other views head with .view-h.
  const h = $(`view-${view}`).querySelector("h1, .view-h");
  if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function setError(el, errEl, message) {
  if (message) {
    errEl.textContent = message; errEl.hidden = false;
    el?.setAttribute("aria-invalid", "true");
  } else {
    errEl.textContent = ""; errEl.hidden = true;
    el?.removeAttribute("aria-invalid");
  }
}

// ---------------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------------

function renderLanding() {
  const ul = $("landingDims");
  ul.textContent = "";
  for (const d of DIMENSIONS) {
    const li = document.createElement("li");
    li.style.setProperty("--accent", d.accent);
    const job = document.createElement("p"); job.className = "job"; job.textContent = d.job;
    const h = document.createElement("h3"); h.textContent = d.name;
    const p = document.createElement("p"); p.className = "b"; p.textContent = d.blurb;
    li.append(job, h, p);
    ul.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// New project → router
// ---------------------------------------------------------------------------

$("newForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const nameEl = $("pName"), goalEl = $("pGoal");
  const name = validateProjectName(nameEl.value);
  const goal = validateGoal(goalEl.value);
  setError(nameEl, $("pNameErr"), name.ok ? "" : name.error);
  setError(goalEl, $("pGoalErr"), goal.ok ? "" : goal.error);
  if (!name.ok) { nameEl.focus(); return; }
  if (!goal.ok) { goalEl.focus(); return; }

  state.pending = { name: name.value, goal: goal.value, result: recommend(goal.value) };
  renderRoute();
  show("route");
});

function pickRow(id, why, checked) {
  const d = getDimension(id);
  const label = document.createElement("label");
  label.className = "pick";
  label.style.setProperty("--accent", d.accent);
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.value = id; cb.checked = checked;
  cb.setAttribute("data-pick", id);
  const box = document.createElement("div"); box.className = "pick-b";
  const strong = document.createElement("strong"); strong.textContent = `${d.name} — ${d.job}`;
  const p = document.createElement("div"); p.className = "why"; p.textContent = why;
  box.append(strong, p);
  label.append(cb, box);
  return label;
}

function renderRoute() {
  const { result } = state.pending;
  const ids = result.recommended.map((r) => r.id);
  $("routeIntro").textContent = result.matched
    ? "Based on what you wrote, these are the dimensions that apply. Uncheck anything you do not want."
    : "Your goal is broad, so Prism has started you with a general-purpose pair. Add whatever else fits.";

  const list = $("routeList"); list.textContent = "";
  for (const r of result.recommended) list.appendChild(pickRow(r.id, r.reason, true));

  const rest = $("routeRest"); rest.textContent = "";
  for (const d of DIMENSIONS) {
    if (ids.includes(d.id)) continue;
    rest.appendChild(pickRow(d.id, d.blurb, false));
  }
  setError(null, $("routeErr"), "");
}

$("routeGo").addEventListener("click", () => {
  const chosen = [...document.querySelectorAll("[data-pick]")].filter((c) => c.checked).map((c) => c.value);
  if (!chosen.length) {
    setError(null, $("routeErr"), "Pick at least one dimension — the workspace needs something to open.");
    return;
  }
  setError(null, $("routeErr"), "");
  const ordered = DIMENSIONS.map((d) => d.id).filter((id) => chosen.includes(id));

  if (state.project) {
    state.project.selected = ordered;
    state.project = repo.save(state.project);
  } else {
    state.project = repo.save(createProject({ ...state.pending, selected: ordered }));
  }
  state.pending = null;
  openWorkspace();
});

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

function openWorkspace() {
  const p = state.project;
  $("ws-h").textContent = p.name;
  $("wsGoal").textContent = p.goal;

  const prog = projectProgress(p);
  $("wsBar").style.width = `${prog.percent}%`;
  $("wsProgTxt").textContent = `${prog.complete} of ${prog.total} dimensions complete`;

  const grid = $("wsGrid"); grid.textContent = "";
  for (const id of p.selected) {
    const d = getDimension(id);
    if (!d) continue;
    const st = dimensionStatus(id, p.data?.[id]);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `card st-${st.state}`;
    card.style.setProperty("--accent", d.accent);
    card.setAttribute("data-open", id);
    const job = document.createElement("span"); job.className = "job"; job.textContent = d.job;
    const h = document.createElement("h3"); h.textContent = d.name;
    const stat = document.createElement("span"); stat.className = "st";
    const dot = document.createElement("span"); dot.className = "dot";
    const txt = document.createElement("span");
    txt.textContent = st.state === "complete" ? "Complete"
      : st.state === "started" ? `In progress — ${st.filled} of ${st.required} required`
      : "Not started";
    stat.append(dot, txt);
    card.append(job, h, stat);
    grid.appendChild(card);
  }
  show("workspace");
}

$("wsGrid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-open]");
  if (b) openDimension(b.getAttribute("data-open"));
});

$("wsAdd").addEventListener("click", () => {
  state.pending = {
    name: state.project.name,
    goal: state.project.goal,
    result: { matched: true, recommended: state.project.selected.map((id) => ({ id, reason: getDimension(id).blurb })) },
  };
  renderRoute();
  show("route");
});

// ---------------------------------------------------------------------------
// Dimension editor
// ---------------------------------------------------------------------------

let currentDim = null;

function listRow(value, max) {
  const row = document.createElement("div"); row.className = "list-row";
  const input = document.createElement("input");
  input.type = "text"; input.value = value ?? ""; input.maxLength = max ?? 200;
  input.setAttribute("data-list-item", "1");
  const rm = document.createElement("button");
  rm.type = "button"; rm.className = "rm"; rm.textContent = "×";
  rm.setAttribute("aria-label", "Remove this line");
  rm.addEventListener("click", () => {
    const rows = row.parentElement;
    row.remove();
    if (!rows.querySelector(".list-row")) rows.appendChild(listRow("", max));
    rows.querySelector("input")?.focus();
  });
  row.append(input, rm);
  return row;
}

function openDimension(id) {
  const d = getDimension(id);
  if (!d) return;
  currentDim = id;
  const data = state.project.data?.[id] ?? {};

  $("dimJob").textContent = d.job;
  $("dim-h").textContent = d.name;
  $("dimBlurb").textContent = d.blurb;

  const priv = $("dimPrivacy");
  if (d.sensitive) {
    priv.textContent = "What you write here is personal. It stays in this browser — it is never uploaded, and it is only included in an export if you choose to generate one.";
    priv.hidden = false;
  } else {
    priv.hidden = true;
  }

  const form = $("dimForm"); form.textContent = "";
  for (const f of d.fields) {
    const wrap = document.createElement("div"); wrap.className = "field";
    const label = document.createElement("label");
    label.htmlFor = `f_${f.key}`;
    label.textContent = f.required ? `${f.label} *` : f.label;
    wrap.appendChild(label);

    if (f.type === "list") {
      const rows = document.createElement("div");
      rows.className = "list-rows"; rows.id = `f_${f.key}`;
      rows.setAttribute("data-list", f.key);
      const values = Array.isArray(data[f.key]) && data[f.key].length ? data[f.key] : [""];
      for (const v of values) rows.appendChild(listRow(v, f.max));
      wrap.appendChild(rows);
      const add = document.createElement("button");
      add.type = "button"; add.className = "add-row"; add.textContent = "+ Add a line";
      add.addEventListener("click", () => {
        const r = listRow("", f.max);
        rows.appendChild(r);
        r.querySelector("input").focus();
      });
      wrap.appendChild(add);
    } else {
      const el = document.createElement(f.type === "long" ? "textarea" : "input");
      el.id = `f_${f.key}`;
      el.setAttribute("data-field", f.key);
      if (f.type === "long") el.rows = 4; else el.type = f.type === "date" ? "date" : "text";
      if (f.max) el.maxLength = f.max;
      el.value = data[f.key] ?? "";
      wrap.appendChild(el);
    }

    if (f.hint) {
      const hint = document.createElement("p"); hint.className = "hint"; hint.textContent = f.hint;
      wrap.appendChild(hint);
    }
    form.appendChild(wrap);
  }
  $("dimSaved").textContent = "";
  show("dimension");
}

function collectDimension() {
  const d = getDimension(currentDim);
  const out = {};
  for (const f of d.fields) {
    if (f.type === "list") {
      const rows = document.querySelector(`[data-list="${f.key}"]`);
      const vals = [...rows.querySelectorAll("[data-list-item]")].map((i) => i.value);
      out[f.key] = coerceField(f, vals);
    } else {
      out[f.key] = coerceField(f, document.querySelector(`[data-field="${f.key}"]`).value);
    }
  }
  return out;
}

$("dimSave").addEventListener("click", () => {
  state.project.data = { ...state.project.data, [currentDim]: collectDimension() };
  state.project = repo.save(state.project);
  const st = dimensionStatus(currentDim, state.project.data[currentDim]);
  $("dimSaved").textContent = st.state === "complete"
    ? "Saved — this dimension is complete."
    : `Saved — ${st.filled} of ${st.required} required fields filled.`;
  toast("Saved to this browser");
});

$("dimBack").addEventListener("click", openWorkspace);

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

$("wsResult").addEventListener("click", () => {
  const s = buildSummary(state.project);
  $("res-h").textContent = state.project.name;
  $("resNote").textContent = `${s.sections.length} of ${s.selected.length} selected dimensions have content.`;

  const body = $("resBody"); body.textContent = "";
  if (!s.sections.length) {
    const empty = document.createElement("div"); empty.className = "empty";
    const strong = document.createElement("strong"); strong.textContent = "Nothing to show yet.";
    const p = document.createElement("span");
    p.textContent = "Open a dimension and fill in at least one field, then come back.";
    empty.append(strong, p);
    body.appendChild(empty);
  }
  for (const sec of s.sections) {
    const el = document.createElement("section");
    el.className = "res-sec"; el.style.setProperty("--accent", sec.accent);
    const h = document.createElement("h2"); h.textContent = sec.name;
    const job = document.createElement("p"); job.className = "job"; job.textContent = sec.job;
    el.append(h, job);
    for (const e of sec.entries) {
      const f = document.createElement("div"); f.className = "res-f";
      const lab = document.createElement("h3"); lab.textContent = e.label;
      f.appendChild(lab);
      if (e.type === "list") {
        const ul = document.createElement("ul");
        for (const v of e.value) { const li = document.createElement("li"); li.textContent = v; ul.appendChild(li); }
        f.appendChild(ul);
      } else {
        const p = document.createElement("p"); p.textContent = e.value; f.appendChild(p);
      }
      el.appendChild(f);
    }
    body.appendChild(el);
  }
  show("result");
});

$("resBack").addEventListener("click", openWorkspace);

function download(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast(`Downloaded ${filename}`);
}

$("resHTML").addEventListener("click", () =>
  download(toHTML(state.project), suggestFilename(state.project, "html"), "text/html;charset=utf-8"));
$("resJSON").addEventListener("click", () =>
  download(toJSON(state.project), suggestFilename(state.project, "json"), "application/json"));

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

function renderProjects() {
  const box = $("projList"); box.textContent = "";
  const all = repo.list();
  if (!all.length) {
    const empty = document.createElement("div"); empty.className = "empty";
    const strong = document.createElement("strong"); strong.textContent = "No projects yet.";
    const span = document.createElement("span"); span.textContent = "Start one and it will be saved here in this browser.";
    empty.append(strong, span);
    box.appendChild(empty);
    return;
  }
  for (const p of all) {
    const prog = projectProgress(p);
    const row = document.createElement("div"); row.className = "proj";
    const left = document.createElement("div");
    const h = document.createElement("h3"); h.textContent = p.name;
    const m = document.createElement("p"); m.className = "m";
    m.textContent = `${prog.complete}/${prog.total} complete · updated ${p.updatedAt.slice(0, 10)}`;
    left.append(h, m);
    const btns = document.createElement("div"); btns.className = "proj-btns";
    const open = document.createElement("button");
    open.type = "button"; open.className = "btn btn-ghost"; open.textContent = "Open";
    open.addEventListener("click", () => { state.project = repo.get(p.id); openWorkspace(); });
    const del = document.createElement("button");
    del.type = "button"; del.className = "del"; del.textContent = "Delete";
    del.setAttribute("aria-label", `Delete ${p.name}`);
    del.addEventListener("click", () => {
      if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
      repo.remove(p.id);
      if (state.project?.id === p.id) state.project = null;
      renderProjects();
      toast("Project deleted");
    });
    btns.append(open, del);
    row.append(left, btns);
    box.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]");
  if (!nav) return;
  const to = nav.getAttribute("data-nav");
  if (to === "projects") { renderProjects(); show("projects"); }
  else if (to === "new") {
    state.project = null; state.pending = null;
    $("newForm").reset();
    setError($("pName"), $("pNameErr"), "");
    setError($("pGoal"), $("pGoalErr"), "");
    show("new");
  }
});

renderLanding();
show("landing");

if (!persistent) {
  toast("This browser is blocking local storage — projects will not survive a reload.");
}

// Exposed for the end-to-end suite so it can drive real flows without
// scraping the DOM for internals. Read-only from the test's point of view.
window.__prism = { repo, state, recommend };
