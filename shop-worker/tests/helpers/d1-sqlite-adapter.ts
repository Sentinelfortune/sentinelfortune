// Wraps Node's built-in node:sqlite (stable enough for test use as of
// Node 22.5+) behind the same D1Like interface (src/types.ts) that the
// real Cloudflare D1 binding satisfies. This lets every src/lib/db.ts
// function run against a real, faithful SQL engine in tests — including
// the actual migrations/*.sql schema, foreign keys, and UNIQUE constraints
// — without needing Miniflare, wrangler, or a live Cloudflare account.
//
// This is a test-only file (tests/ is not part of the deployed Worker).

// node:sqlite is a recent, still-experimental Node builtin that Vite's
// module graph does not recognize as a built-in (even a `/* @vite-ignore */`
// dynamic import still gets routed through vite-node's SSR module loader
// under vitest). Loading it through Node's own `createRequire` bypasses
// Vite/vite-node entirely and hands the bare specifier straight to Node's
// real, native `require`, where it resolves normally.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import type { D1Like, D1PreparedStatement, D1Result } from "../../src/types";

type DatabaseSyncCtor = new (location: string) => {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  };
};

const nodeRequire = createRequire(import.meta.url);

let cachedDatabaseSync: DatabaseSyncCtor | null = null;
async function loadDatabaseSync(): Promise<DatabaseSyncCtor> {
  if (!cachedDatabaseSync) {
    const mod = nodeRequire("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };
    cachedDatabaseSync = mod.DatabaseSync;
  }
  return cachedDatabaseSync;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

function normalizeParam(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

type DatabaseSyncInstance = InstanceType<DatabaseSyncCtor>;

class SqliteD1Adapter implements D1Like {
  constructor(private db: DatabaseSyncInstance) {}

  prepare(query: string): D1PreparedStatement {
    const db = this.db;
    let boundArgs: unknown[] = [];

    const statement: D1PreparedStatement = {
      bind(...values: unknown[]) {
        boundArgs = values.map(normalizeParam);
        return statement;
      },
      async first<T = unknown>(colName?: string): Promise<T | null> {
        const stmt = db.prepare(query);
        const row = stmt.get(...(boundArgs as never[])) as Record<string, unknown> | undefined;
        if (row === undefined) return null;
        if (colName) return (row[colName] ?? null) as T;
        return row as T;
      },
      async run(): Promise<D1Result> {
        const stmt = db.prepare(query);
        const info = stmt.run(...(boundArgs as never[]));
        return { results: [], success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
      },
      async all<T = unknown>(): Promise<D1Result<T>> {
        const stmt = db.prepare(query);
        const rows = stmt.all(...(boundArgs as never[])) as T[];
        return { results: rows, success: true };
      },
    };

    return statement;
  }
}

/**
 * Creates a fresh in-memory SQLite database with the real Shop migrations
 * applied (schema only — 0001; pass includeSeed=true to also apply the
 * 0002 first-product seed).
 */
export async function createTestD1(includeSeed = false): Promise<D1Like> {
  const DatabaseSync = await loadDatabaseSync();
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");

  const schemaSql = readFileSync(path.join(MIGRATIONS_DIR, "0001_init.sql"), "utf-8");
  db.exec(schemaSql);

  if (includeSeed) {
    const seedSql = readFileSync(path.join(MIGRATIONS_DIR, "0002_seed_first_product.sql"), "utf-8");
    db.exec(seedSql);
  }

  return new SqliteD1Adapter(db);
}
