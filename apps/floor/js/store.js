// Persistence. One key, one object: settings plus the job list.
//
// localStorage rather than a database, and that is a deliberate scope decision
// rather than a missing feature. The data is a small operator's own pricing —
// commercially sensitive, of no use to anyone else, and worth nothing to a
// server. Keeping it local means no account, no credential, no breach surface
// and no privacy policy beyond "nothing is collected".
//
// Storage is injected, so this whole module is testable in Node.

import { DEFAULT_SETTINGS, validateSettings, validateJob } from "./model.js";

export const STORAGE_KEY = "sentinel.floor.v1";
export const MAX_JOBS = 200;

export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

/** Private browsing and some embedded webviews throw on access rather than returning null. */
export function resolveStorage(win) {
  try {
    const s = win?.localStorage;
    if (!s) return { storage: memoryStorage(), persistent: false };
    s.setItem("__floor_probe__", "1");
    s.removeItem("__floor_probe__");
    return { storage: s, persistent: true };
  } catch {
    return { storage: memoryStorage(), persistent: false };
  }
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `j_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

const JOB_KEYS = ["id", "name", "price", "labourHours", "materials", "travel", "subcontractor"];

/** Keeps only known keys, so a hand-edited store cannot introduce fields. */
function cleanJob(raw) {
  if (!raw || typeof raw !== "object") return null;
  const v = validateJob(raw);
  if (!v.ok) return null;
  return { id: typeof raw.id === "string" && raw.id ? raw.id : newId(), ...v.value };
}

export function createRepo(storage) {
  function read() {
    let parsed;
    try {
      parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
    } catch {
      return { settings: { ...DEFAULT_SETTINGS }, jobs: [] };
    }
    if (!parsed || typeof parsed !== "object") return { settings: { ...DEFAULT_SETTINGS }, jobs: [] };

    const sv = validateSettings(parsed.settings ?? {});
    const settings = sv.ok ? sv.value : { ...DEFAULT_SETTINGS };
    const jobs = Array.isArray(parsed.jobs) ? parsed.jobs.map(cleanJob).filter(Boolean).slice(0, MAX_JOBS) : [];
    return { settings, jobs };
  }

  function write(state) {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      settings: state.settings,
      jobs: state.jobs.map((j) => Object.fromEntries(JOB_KEYS.map((k) => [k, j[k]]))),
    }));
  }

  return {
    getSettings() { return read().settings; },
    saveSettings(settings) {
      const s = read();
      const v = validateSettings(settings);
      s.settings = v.ok ? v.value : s.settings;
      write(s);
      return s.settings;
    },
    /** True once the operator has entered the figures the maths needs. */
    isConfigured() {
      const s = read().settings;
      return s.billableHours > 0 && s.labourCostPerHour > 0;
    },
    listJobs() { return read().jobs; },
    addJob(job) {
      const s = read();
      const clean = cleanJob(job);
      if (!clean) return null;
      if (s.jobs.length >= MAX_JOBS) return null;
      s.jobs.push(clean);
      write(s);
      return clean;
    },
    removeJob(id) {
      const s = read();
      s.jobs = s.jobs.filter((j) => j.id !== id);
      write(s);
    },
    replaceAll(settings, jobs) {
      const v = validateSettings(settings);
      write({ settings: v.ok ? v.value : { ...DEFAULT_SETTINGS }, jobs: jobs.map(cleanJob).filter(Boolean) });
    },
    clear() { storage.removeItem(STORAGE_KEY); },
  };
}
