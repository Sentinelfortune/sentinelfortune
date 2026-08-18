// Project schema, validation and persistence.
//
// Persistence is the browser's own localStorage, and that is a deliberate
// product decision rather than a shortcut. VibraFlow collects genuinely
// personal reflection; a server would mean that content leaving the person's
// device, an account system, a breach surface and a privacy policy to write.
// Keeping everything local means the app collects nothing, transmits nothing,
// and needs no credentials at all — and the user can still export whatever they
// want to keep.
//
// The trade-off is honest and stated in the UI: clearing site data loses the
// work, and projects do not follow you to another device. Export is the answer
// to both, which is why export is a core action rather than a nice-to-have.
//
// Storage layer is injected, so every function here is testable in Node against
// a plain Map without a browser.

import { DIMENSION_IDS, getDimension } from "./dimensions.js";

export const STORAGE_KEY = "sentinel.prism.projects.v1";
export const SCHEMA_VERSION = 1;

export const LIMITS = {
  projectName: 120,
  goal: 2000,
  listItem: 200,
  listItems: 40,
  projects: 100,
};

/** In-memory storage with the localStorage shape — used by tests and as a fallback. */
export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

/**
 * localStorage is not always available — private browsing modes and embedded
 * webviews can throw on access rather than merely returning null. Falling back
 * keeps the app usable for that session instead of failing to boot.
 */
export function resolveStorage(win) {
  try {
    const s = win?.localStorage;
    if (!s) return { storage: memoryStorage(), persistent: false };
    const probe = "__prism_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return { storage: s, persistent: true };
  } catch {
    return { storage: memoryStorage(), persistent: false };
  }
}

export function newId() {
  const rnd = globalThis.crypto?.randomUUID?.();
  if (rnd) return rnd;
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateProjectName(name) {
  const v = String(name ?? "").trim();
  if (!v) return { ok: false, error: "Give the project a name." };
  if (v.length > LIMITS.projectName) return { ok: false, error: `Keep the name under ${LIMITS.projectName} characters.` };
  return { ok: true, value: v };
}

export function validateGoal(goal) {
  const v = String(goal ?? "").trim();
  if (v.length < 12) {
    return { ok: false, error: "Describe the goal in a sentence or so — the router needs something to work with." };
  }
  if (v.length > LIMITS.goal) return { ok: false, error: `Keep this under ${LIMITS.goal} characters.` };
  return { ok: true, value: v };
}

/** Coerces one field value to its declared type and clamps it to the field's limits. */
export function coerceField(field, raw) {
  if (field.type === "list") {
    const arr = Array.isArray(raw) ? raw : String(raw ?? "").split("\n");
    return arr
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .slice(0, LIMITS.listItems)
      .map((s) => s.slice(0, field.max ?? LIMITS.listItem));
  }
  const s = String(raw ?? "").trim();
  return s.slice(0, field.max ?? 500);
}

function fieldFilled(field, value) {
  return field.type === "list" ? Array.isArray(value) && value.length > 0 : Boolean(value);
}

/** A dimension is complete when every required field has something in it. */
export function dimensionStatus(dimensionId, data) {
  const dim = getDimension(dimensionId);
  if (!dim) return { state: "unknown", filled: 0, required: 0 };
  const required = dim.fields.filter((f) => f.required);
  const filledRequired = required.filter((f) => fieldFilled(f, data?.[f.key])).length;
  const anyFilled = dim.fields.some((f) => fieldFilled(f, data?.[f.key]));
  const state = filledRequired === required.length && required.length > 0
    ? "complete"
    : anyFilled ? "started" : "empty";
  return { state, filled: filledRequired, required: required.length };
}

// ---------------------------------------------------------------------------
// Project shape
// ---------------------------------------------------------------------------

export function createProject({ name, goal, selected = [] }) {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name,
    goal,
    selected: selected.filter((id) => DIMENSION_IDS.includes(id)),
    data: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** Repairs anything unexpected rather than throwing — a corrupt entry must not brick the app. */
export function normaliseProject(p) {
  if (!p || typeof p !== "object") return null;
  const id = typeof p.id === "string" && p.id ? p.id : newId();
  const selected = Array.isArray(p.selected) ? p.selected.filter((s) => DIMENSION_IDS.includes(s)) : [];
  const data = p.data && typeof p.data === "object" && !Array.isArray(p.data) ? p.data : {};
  const clean = {};
  for (const dimId of DIMENSION_IDS) {
    const dim = getDimension(dimId);
    const src = data[dimId];
    if (!src || typeof src !== "object") continue;
    const out = {};
    for (const f of dim.fields) {
      if (src[f.key] === undefined) continue;
      out[f.key] = coerceField(f, src[f.key]);
    }
    if (Object.keys(out).length) clean[dimId] = out;
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name: String(p.name ?? "Untitled project").slice(0, LIMITS.projectName),
    goal: String(p.goal ?? "").slice(0, LIMITS.goal),
    selected,
    data: clean,
    createdAt: typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : new Date().toISOString(),
  };
}

export function projectProgress(project) {
  const selected = project?.selected ?? [];
  if (!selected.length) return { complete: 0, total: 0, percent: 0 };
  let complete = 0;
  for (const id of selected) {
    if (dimensionStatus(id, project.data?.[id]).state === "complete") complete++;
  }
  return { complete, total: selected.length, percent: Math.round((complete / selected.length) * 100) };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function createRepo(storage) {
  function readAll() {
    let parsed;
    try {
      parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      // Unreadable store: start clean rather than refusing to load.
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normaliseProject).filter(Boolean);
  }

  function writeAll(projects) {
    const trimmed = projects.slice(0, LIMITS.projects);
    storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return trimmed;
  }

  return {
    list() {
      return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    get(id) {
      return readAll().find((p) => p.id === id) ?? null;
    },
    save(project) {
      const clean = normaliseProject({ ...project, updatedAt: new Date().toISOString() });
      const all = readAll();
      const i = all.findIndex((p) => p.id === clean.id);
      if (i >= 0) all[i] = clean; else all.unshift(clean);
      writeAll(all);
      return clean;
    },
    remove(id) {
      writeAll(readAll().filter((p) => p.id !== id));
    },
    clear() {
      storage.removeItem(STORAGE_KEY);
    },
  };
}
