// Turning a project into something the user can take away.
//
// Two formats, each with a job. JSON is the record — complete, re-importable,
// nothing lost. HTML is the artefact a person actually reads, prints or sends,
// and it is a single self-contained file with inline styles so it survives
// being emailed or opened offline.
//
// Nothing is invented here. A section appears only if the user put something in
// it; an untouched dimension is absent rather than rendered as an empty
// skeleton, because a plan padded with blank headings reads as unfinished work
// pretending to be finished work.

import { DIMENSIONS, getDimension } from "./dimensions.js";
import { dimensionStatus, projectProgress } from "./store.js";

/** Ordered, non-empty sections of a project — the shared basis of every export. */
export function buildSummary(project) {
  const sections = [];
  for (const dim of DIMENSIONS) {
    if (!project.selected?.includes(dim.id)) continue;
    const data = project.data?.[dim.id] ?? {};
    const entries = [];
    for (const f of dim.fields) {
      const v = data[f.key];
      const empty = f.type === "list" ? !Array.isArray(v) || v.length === 0 : !v;
      if (empty) continue;
      entries.push({ key: f.key, label: f.label, type: f.type, value: v });
    }
    if (!entries.length) continue;
    sections.push({
      id: dim.id,
      name: dim.name,
      job: dim.job,
      accent: dim.accent,
      sensitive: Boolean(dim.sensitive),
      status: dimensionStatus(dim.id, data).state,
      entries,
    });
  }
  return {
    name: project.name,
    goal: project.goal,
    selected: project.selected ?? [],
    progress: projectProgress(project),
    sections,
    generatedAt: new Date().toISOString(),
  };
}

export function toJSON(project) {
  return JSON.stringify(
    { format: "sentinel.prism.project/1", exportedAt: new Date().toISOString(), project },
    null,
    2,
  );
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

function renderValue(entry) {
  if (entry.type === "list") {
    return `<ul>${entry.value.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>`;
  }
  if (entry.type === "long") {
    return entry.value
      .split(/\n{2,}/)
      .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }
  return `<p>${esc(entry.value)}</p>`;
}

/** Self-contained printable plan. No external assets, so it works offline. */
export function toHTML(project) {
  const s = buildSummary(project);
  const date = new Date(s.generatedAt).toISOString().slice(0, 10);
  const hasSensitive = s.sections.some((x) => x.sensitive);

  const body = s.sections.map((sec) => `
    <section class="dim" style="--accent:${esc(sec.accent)}">
      <h2>${esc(sec.name)}<span class="job">${esc(sec.job)}</span></h2>
      ${sec.sensitive ? '<p class="note">Personal reflection — this section is included because you wrote it. Remove it before sharing if you would rather not.</p>' : ""}
      ${sec.entries.map((e) => `<div class="field"><h3>${esc(e.label)}</h3>${renderValue(e)}</div>`).join("")}
    </section>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(s.name)} — project plan</title>
<style>
  :root{--ink:#12131a;--muted:#5b5f6b;--line:#e3e4ea;--accent:#c8a84b;--bg:#fff}
  *{box-sizing:border-box}
  body{margin:0;padding:40px 24px;background:var(--bg);color:var(--ink);
    font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    max-width:760px;margin-inline:auto}
  header{border-bottom:2px solid var(--accent);padding-bottom:20px;margin-bottom:8px}
  .kicker{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
  h1{font-size:1.9rem;line-height:1.2;margin:0 0 14px}
  .goal{background:#f7f7fa;border-left:3px solid var(--accent);padding:12px 16px;margin:0;color:#33353f}
  .meta{font-size:.82rem;color:var(--muted);margin:14px 0 0}
  .dim{margin-top:36px;padding-top:22px;border-top:1px solid var(--line)}
  .dim h2{font-size:1.22rem;margin:0 0 18px;display:flex;flex-wrap:wrap;align-items:baseline;gap:10px}
  .dim h2::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--accent);flex:none}
  .job{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:400}
  .field{margin-bottom:18px}
  .field h3{font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 6px;font-weight:600}
  .field p{margin:0 0 8px}
  .field ul{margin:0;padding-left:20px}
  .field li{margin-bottom:5px}
  .note{font-size:.82rem;color:var(--muted);font-style:italic;margin:0 0 16px}
  footer{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);font-size:.78rem;color:var(--muted)}
  @media print{body{padding:0;max-width:none}.dim{break-inside:avoid}}
</style></head>
<body>
<header>
  <p class="kicker">Sentinel Fortune · Prism project plan</p>
  <h1>${esc(s.name)}</h1>
  <p class="goal"><strong>Goal:</strong> ${esc(s.goal)}</p>
  <p class="meta">${s.sections.length} of ${s.selected.length} selected dimension${s.selected.length === 1 ? "" : "s"} completed · generated ${esc(date)}</p>
</header>
${body || '<p class="note">No dimension has content yet. Fill in at least one to produce a plan.</p>'}
<footer>
  Generated by Prism, a Sentinel Fortune LLC hosted application. This plan is operational
  and general. It is not legal, financial, tax, investment, medical or mental-health advice.
  ${hasSensitive ? "It contains personal reflection you wrote." : ""}
</footer>
</body></html>`;
}

export function suggestFilename(project, ext) {
  const slug = String(project.name ?? "project")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "project";
  return `${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}
