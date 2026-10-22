/* SFL EDITORIAL CORRIDOR — the versioned record store.
 *
 * In-memory by design, with an explicit snapshot/restore seam. The corridor's
 * logic must be testable without a database and its transport must be
 * replaceable, so persistence is a boundary rather than a dependency.
 *
 * TWO GUARANTEES
 * --------------
 * 1. IDEMPOTENCY. Every command carries an instruction id. Replaying the same
 *    instruction returns the original outcome and writes nothing. Retrying a
 *    delivery is always safe, which is what lets a client retry at all.
 *
 * 2. NOTHING IS DESTROYED. An update pushes the previous version onto the
 *    record's history and increments the version. Unpublish and archive change
 *    state; they never delete. Rollback restores a prior version as a NEW
 *    version, so the act of rolling back is itself in the history.
 */

export function createStore() {
  /** id -> record (current version) */
  const records = new Map();
  /** ownerInstructionId -> { recordId, version, outcome } */
  const instructions = new Map();
  /* Corridor governance state. It lives HERE, in the store, so that it is
     persisted with the records it governs: a transport that builds a fresh
     corridor per request (the Worker does) must not lose an Owner approval,
     the Owner's audit trail or a client's rate-limit window between requests. */
  /** `${recordId}|${action}` -> Owner approval */
  const approvals = new Map();
  /** Owner audit entries, append-only */
  const ownerAudit = [];
  /** client -> [timestamps] in the rolling rate-limit window */
  const rateHits = new Map();

  return {
    approvals,
    ownerAudit,
    rateHits,

    /** The outcome of an instruction already seen, or null. */
    replay(instructionId) {
      if (!instructionId) return null;
      return instructions.get(instructionId) || null;
    },

    remember(instructionId, outcome) {
      if (instructionId) instructions.set(instructionId, outcome);
      return outcome;
    },

    get(id) {
      return records.get(id) || null;
    },

    bySlug(branch, slug) {
      for (const r of records.values()) if (r.branch === branch && r.slug === slug) return r;
      return null;
    },

    put(record) {
      records.set(record.id, record);
      return record;
    },

    /**
     * Save a new version. The CURRENT record is pushed onto history first, so
     * the previous text is always recoverable.
     */
    putVersion(previous, next) {
      const history = [...(previous.revisionHistory || [])];
      history.push({
        version: previous.version,
        at: previous.updatedAt,
        status: previous.status,
        title: previous.title,
        body: previous.body,
        summary: previous.summary,
        translations: previous.translations,
        media: previous.media,
        heroMedia: previous.heroMedia,
        cta: previous.cta,
      });
      const saved = { ...next, version: previous.version + 1, revisionHistory: history, createdAt: previous.createdAt };
      records.set(saved.id, saved);
      return saved;
    },

    /**
     * Restore a prior version as a NEW version.
     *
     * Deliberately not a rewind: the rollback itself becomes the latest
     * version and the history keeps everything, so "what did this say last
     * Tuesday" always has an answer.
     */
    rollback(id, toVersion) {
      const current = records.get(id);
      if (!current) return { ok: false, reason: "no such record" };
      const snapshot = (current.revisionHistory || []).find((h) => h.version === toVersion);
      if (!snapshot) {
        return { ok: false, reason: `version ${toVersion} is not in the history of ${id}` };
      }
      const restored = this.putVersion(current, {
        ...current,
        title: snapshot.title,
        body: snapshot.body,
        summary: snapshot.summary,
        translations: snapshot.translations,
        media: snapshot.media,
        heroMedia: snapshot.heroMedia,
        cta: snapshot.cta,
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, record: restored, restoredFrom: toVersion };
    },

    all() {
      return [...records.values()];
    },

    inState(state) {
      return [...records.values()].filter((r) => r.status === state);
    },

    /** Most recently touched first — what `list_recent` returns. */
    recent(limit = 20, branch = null) {
      return [...records.values()]
        .filter((r) => !branch || r.branch === branch)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, limit);
    },

    /* The persistence seam. A Git-backed or API-backed transport implements
       these two and nothing else changes. */
    snapshot() {
      return {
        records: [...records.values()],
        instructions: [...instructions.entries()],
        approvals: [...approvals.entries()],
        ownerAudit: [...ownerAudit],
        rateHits: [...rateHits.entries()],
      };
    },
    restore(snap) {
      records.clear(); instructions.clear(); approvals.clear(); ownerAudit.length = 0; rateHits.clear();
      for (const r of snap.records || []) records.set(r.id, r);
      for (const [k, v] of snap.instructions || []) instructions.set(k, v);
      for (const [k, v] of snap.approvals || []) approvals.set(k, v);
      for (const e of snap.ownerAudit || []) ownerAudit.push(e);
      for (const [k, v] of snap.rateHits || []) rateHits.set(k, v);
    },
  };
}
