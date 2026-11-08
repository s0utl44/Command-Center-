import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MIGRATIONS } from "./migrations";

export type Db = Database.Database;

/** Otwiera bazę (plik lub ":memory:"), włącza WAL i klucze obce, wykonuje migracje. */
export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (const [index, sql] of MIGRATIONS.entries()) {
    const version = index + 1;
    if (version <= current) continue;
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
  }
}
