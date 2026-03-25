import { Router, type IRouter } from "express";
import {
  listDeals, getDeal, type DealRecord,
  listRoutedDeals, listRoutedByDesk, type RoutedRecord,
} from "../lib/r2Reader";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// JSON API
// ---------------------------------------------------------------------------

router.get("/viewer/deals.json", async (req, res) => {
  const { desk, status } = req.query as Record<string, string | undefined>;
  let deals = await listDeals(50);
  if (desk)   deals = deals.filter((d) => d.desk   === desk);
  if (status) deals = deals.filter((d) => d.status === status);
  res.json({ count: deals.length, deals });
});

router.get("/viewer/deals/:ref_id.json", async (req, res) => {
  const deal = await getDeal(req.params["ref_id"] ?? "");
  if (!deal) { res.status(404).json({ error: "Not found" }); return; }
  res.json(deal);
});

// ---------------------------------------------------------------------------
// HTML viewer
// ---------------------------------------------------------------------------

router.get("/viewer/deals", async (req, res) => {
  const { desk, status } = req.query as Record<string, string | undefined>;
  let deals = await listDeals(50);
  if (desk)   deals = deals.filter((d) => d.desk   === desk);
  if (status) deals = deals.filter((d) => d.status === status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(renderList(deals, desk, status));
});

router.get("/viewer/deals/:ref_id", async (req, res) => {
  const deal = await getDeal(req.params["ref_id"] ?? "");
  if (!deal) {
    res.status(404).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(page("Not Found", `<p class="error">Deal not found.</p>`));
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(renderDetail(deal));
});

// ---------------------------------------------------------------------------
// Routed records — JSON API
// ---------------------------------------------------------------------------

router.get("/viewer/routed.json", async (_req, res) => {
  const records = await listRoutedDeals(50);
  res.json({ count: records.length, records });
});

router.get("/viewer/routed/:desk.json", async (req, res) => {
  const records = await listRoutedByDesk(req.params["desk"] ?? "");
  res.json({ count: records.length, desk: req.params["desk"], records });
});

// ---------------------------------------------------------------------------
// Routed records — HTML viewer
// ---------------------------------------------------------------------------

router.get("/viewer/routed", async (_req, res) => {
  const records = await listRoutedDeals(50);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(renderRoutedList(records));
});

router.get("/viewer/routed/:desk", async (req, res) => {
  const desk = req.params["desk"] ?? "";
  const records = await listRoutedByDesk(desk);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(renderRoutedList(records, desk));
});

export default router;

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',monospace;background:#0a0a0a;color:#d4d4d4;
       font-size:13px;line-height:1.6}
  .wrap{max-width:1100px;margin:0 auto;padding:32px 24px}
  h1{font-size:16px;font-weight:600;color:#e8e8e8;letter-spacing:.08em;
     text-transform:uppercase;margin-bottom:6px}
  .sub{color:#666;font-size:11px;margin-bottom:32px;letter-spacing:.04em}
  /* filter bar */
  .filters{display:flex;gap:12px;margin-bottom:28px;flex-wrap:wrap;
            align-items:center}
  .filters select,.filters input{background:#141414;border:1px solid #2a2a2a;
    color:#ccc;padding:6px 10px;font-size:12px;font-family:inherit;
    border-radius:2px}
  .filters select:focus,.filters input:focus{outline:none;border-color:#444}
  .btn{background:#1a1a1a;border:1px solid #2e2e2e;color:#bbb;
       padding:6px 14px;font-size:12px;font-family:inherit;cursor:pointer;
       border-radius:2px;text-decoration:none}
  .btn:hover{background:#222;border-color:#3c3c3c}
  .btn-back{display:inline-block;margin-bottom:24px}
  /* table */
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{text-align:left;color:#555;text-transform:uppercase;letter-spacing:.06em;
     font-size:10px;padding:8px 12px;border-bottom:1px solid #1e1e1e}
  td{padding:10px 12px;border-bottom:1px solid #181818;vertical-align:top}
  tr:hover td{background:#111}
  .ref-link{color:#7eb8f7;text-decoration:none;font-weight:500}
  .ref-link:hover{text-decoration:underline}
  .badge{display:inline-block;padding:2px 8px;border-radius:2px;font-size:10px;
         letter-spacing:.04em;text-transform:uppercase;font-weight:600}
  .badge-new{background:#1a2a1a;color:#4caf50;border:1px solid #2a3c2a}
  .badge-oem{background:#1a2030;color:#5b8adb}
  .badge-licensing{background:#2a1a30;color:#9b6dd6}
  .badge-investor{background:#2a2010;color:#d4a840}
  .badge-legal{background:#2a1a1a;color:#d46a6a}
  .badge-contact{background:#1e1e1e;color:#888}
  .badge-red{background:#2a1a1a;color:#e05c5c;border:1px solid #3a2020}
  .badge-orange{background:#2a1e10;color:#d4884a;border:1px solid #3a2a18}
  .badge-yellow{background:#2a2410;color:#c8a840;border:1px solid #3a3418}
  .badge-grey{background:#1a1a1a;color:#666;border:1px solid #2a2a2a}
  .ts{color:#555}
  /* detail */
  .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;
               margin-bottom:28px}
  @media(max-width:640px){.detail-grid{grid-template-columns:1fr}}
  .card{background:#111;border:1px solid #1e1e1e;border-radius:2px;padding:20px}
  .card-title{font-size:10px;text-transform:uppercase;letter-spacing:.08em;
               color:#555;margin-bottom:14px}
  .field{display:flex;flex-direction:column;gap:2px;margin-bottom:12px}
  .field-label{font-size:10px;color:#555;text-transform:uppercase;
                letter-spacing:.05em}
  .field-value{color:#ccc;word-break:break-all}
  .summary-box{background:#0d0d0d;border:1px solid #1e1e1e;border-radius:2px;
               padding:16px;white-space:pre-wrap;line-height:1.7;color:#aaa;
               font-size:12px}
  .empty{color:#444;padding:40px 0;text-align:center;font-size:13px}
  .error{color:#d46a6a;padding:40px 0}
  .count-line{color:#555;font-size:11px;margin-bottom:16px}
  form{display:contents}
`;

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>SFL Deal Viewer — ${esc(title)}</title>
<style>${CSS}</style></head>
<body><div class="wrap">
${body}
</div></body></html>`;
}

function deskBadge(desk: string): string {
  const cls = `badge badge-${esc(desk)}`;
  return `<span class="${cls}">${esc(desk)}</span>`;
}

function statusBadge(status: string): string {
  return `<span class="badge badge-new">${esc(status)}</span>`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch { return iso; }
}

function esc(s: string = ""): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DESKS   = ["oem", "licensing", "investor", "legal", "contact"];
const STATUSES = ["NEW", "UNDER_REVIEW", "CLOSED"];

function filterBar(desk?: string, status?: string): string {
  const deskOpts = ["", ...DESKS]
    .map((d) => `<option value="${esc(d)}" ${d === desk ? "selected" : ""}>${d || "All desks"}</option>`)
    .join("");
  const statusOpts = ["", ...STATUSES]
    .map((s) => `<option value="${esc(s)}" ${s === status ? "selected" : ""}>${s || "All statuses"}</option>`)
    .join("");

  return `<form method="GET" action="/api/viewer/deals">
    <div class="filters">
      <select name="desk">${deskOpts}</select>
      <select name="status">${statusOpts}</select>
      <button type="submit" class="btn">Filter</button>
      <a href="/api/viewer/deals" class="btn">Reset</a>
      <a href="/api/viewer/deals.json" class="btn">JSON</a>
    </div>
  </form>`;
}

function renderList(
  deals: DealRecord[],
  desk?: string,
  status?: string,
): string {
  const header = `
    <h1>Sentinel Fortune — Deal Viewer</h1>
    <p class="sub">originus/bot/deals/intake/ &nbsp;·&nbsp; read-only &nbsp;·&nbsp; sorted by completed_at desc</p>
    ${filterBar(desk, status)}
    <p class="count-line">${deals.length} record${deals.length !== 1 ? "s" : ""}</p>`;

  if (deals.length === 0) {
    return page(
      "Deal Viewer",
      `${header}<p class="empty">No records found.</p>`,
    );
  }

  const rows = deals
    .map((d) => {
      const url = `/api/viewer/deals/${esc(d.ref_id)}`;
      return `<tr>
        <td><a href="${url}" class="ref-link">${esc(d.ref_id)}</a></td>
        <td>${deskBadge(d.desk)}</td>
        <td>${esc(d.classification)}</td>
        <td class="ts">${fmtDate(d.completed_at)}</td>
        <td>${statusBadge(d.status)}</td>
      </tr>`;
    })
    .join("");

  const table = `
    <table>
      <thead>
        <tr>
          <th>Ref ID</th>
          <th>Desk</th>
          <th>Classification</th>
          <th>Completed at</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  return page("Deal Viewer", `${header}${table}`);
}

function renderDetail(d: DealRecord): string {
  const answersHtml = Object.entries(d.answers)
    .map(
      ([k, v]) =>
        `<div class="field">
          <span class="field-label">${esc(k.replace(/_/g, " "))}</span>
          <span class="field-value">${esc(v)}</span>
        </div>`,
    )
    .join("");

  const body = `
    <a href="/api/viewer/deals" class="btn btn-back">← Back to list</a>
    <h1>${esc(d.ref_id)}</h1>
    <p class="sub">${esc(d.desk)} &nbsp;·&nbsp; ${esc(d.classification)} &nbsp;·&nbsp; ${esc(d.status)}</p>

    <div class="detail-grid">
      <div class="card">
        <div class="card-title">Record fields</div>
        <div class="field"><span class="field-label">Ref ID</span>
          <span class="field-value">${esc(d.ref_id)}</span></div>
        <div class="field"><span class="field-label">Desk</span>
          <span class="field-value">${deskBadge(d.desk)}</span></div>
        <div class="field"><span class="field-label">Classification</span>
          <span class="field-value">${esc(d.classification)}</span></div>
        <div class="field"><span class="field-label">Status</span>
          <span class="field-value">${statusBadge(d.status)}</span></div>
        <div class="field"><span class="field-label">Next action</span>
          <span class="field-value">${esc(d.next_action)}</span></div>
        <div class="field"><span class="field-label">Completed at</span>
          <span class="field-value">${fmtDate(d.completed_at)}</span></div>
        <div class="field"><span class="field-label">Source</span>
          <span class="field-value">${esc(d.source)}</span></div>
        <div class="field"><span class="field-label">Bot</span>
          <span class="field-value">${esc(d.bot_username)}</span></div>
      </div>

      <div class="card">
        <div class="card-title">Qualification answers</div>
        ${answersHtml}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Final summary (as sent to user)</div>
      <div class="summary-box">${esc(d.final_summary)}</div>
    </div>`;

  return page(d.ref_id, body);
}

// Score/priority/urgency badge helpers
function scoreBadge(score?: number): string {
  if (score === undefined || score === null) return `<span class="badge badge-grey">—</span>`;
  const cls =
    score >= 80 ? "badge-red" :
    score >= 60 ? "badge-orange" :
    score >= 40 ? "badge-yellow" : "badge-grey";
  return `<span class="badge ${cls}">${score}</span>`;
}

function priorityBadge(p?: string): string {
  if (!p) return `<span class="badge badge-grey">—</span>`;
  const cls: Record<string, string> = {
    critical: "badge-red", high: "badge-orange",
    medium: "badge-yellow", low: "badge-grey",
  };
  return `<span class="badge ${cls[p] ?? "badge-grey"}">${esc(p)}</span>`;
}

function urgencyBadge(u?: string): string {
  if (!u) return `<span class="badge badge-grey">—</span>`;
  const cls: Record<string, string> = {
    immediate: "badge-red", fast: "badge-orange",
    normal: "badge-yellow", slow: "badge-grey",
  };
  return `<span class="badge ${cls[u] ?? "badge-grey"}">${esc(u)}</span>`;
}

function renderRoutedList(records: RoutedRecord[], desk?: string): string {
  const title    = desk ? `Routed — ${desk.toUpperCase()}` : "Routed Deals";
  const deskNav  = ["oem", "licensing", "investor", "legal", "contact"]
    .map((d) =>
      `<a href="/api/viewer/routed/${d}" class="btn${d === desk ? " btn-active" : ""}">${d}</a>`,
    )
    .join(" ");

  // Sort by score desc (safe: fallback to 0 for legacy records without score)
  const sorted = [...records].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0),
  );

  const header = `
    <h1>Sentinel Fortune — ${esc(title)}</h1>
    <p class="sub">originus/bot/deals/routed/ &nbsp;·&nbsp; read-only &nbsp;·&nbsp; sorted by score desc</p>
    <div class="filters">
      <a href="/api/viewer/routed" class="btn">All desks</a>
      ${deskNav}
      <a href="/api/viewer/routed.json" class="btn">JSON</a>
      <a href="/api/viewer/deals" class="btn">← Intake</a>
    </div>
    <p class="count-line">${sorted.length} record${sorted.length !== 1 ? "s" : ""}</p>`;

  if (sorted.length === 0) {
    return page(title, `${header}<p class="empty">No routed records found.</p>`);
  }

  const rows = sorted
    .map((r) => {
      const intakeUrl = `/api/viewer/deals/${esc(r.ref_id)}`;
      return `<tr>
        <td><a href="${intakeUrl}" class="ref-link">${esc(r.ref_id)}</a></td>
        <td>${deskBadge(r.desk)}</td>
        <td>${scoreBadge(r.score)}</td>
        <td>${priorityBadge(r.priority)}</td>
        <td>${urgencyBadge(r.urgency)}</td>
        <td>${esc(r.review_bucket ?? "—")}</td>
        <td>${esc(r.sla_target ?? "—")}</td>
        <td>${esc(r.next_action ?? "—")}</td>
        <td>${esc(r.owner_queue ?? "—")}</td>
        <td>${esc(r.classification)}</td>
        <td class="ts">${fmtDate(r.routed_at)}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>`;
    })
    .join("");

  const table = `
    <table>
      <thead>
        <tr>
          <th>Ref ID</th>
          <th>Desk</th>
          <th>Score</th>
          <th>Priority</th>
          <th>Urgency</th>
          <th>Review bucket</th>
          <th>SLA target</th>
          <th>Next action</th>
          <th>Owner queue</th>
          <th>Classification</th>
          <th>Routed at</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  return page(title, `${header}${table}`);
}
