import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");

export type Db = Database;

/** DB を開き、未適用のマイグレーションを流す。path に ":memory:" を渡すとテスト用のメモリ DB。 */
export function openDb(path: string): Db {
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

export function migrate(db: Db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)");
  const applied = new Set(db.query<{ version: string }, []>("SELECT version FROM schema_migrations").all().map((r) => r.version));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    db.transaction(() => {
      db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf-8"));
      db.query("INSERT INTO schema_migrations (version) VALUES ($version)").run({ version: file });
    })();
  }
}

export const now = () => new Date().toISOString();
