import { parseProcessDefinition, type ProcessDefinition } from "@/core/process";
import type { Db } from "./index";

export interface ProcessVersion {
  id: number;
  processKey: string;
  version: number;
  definition: ProcessDefinition;
  changeNote: string;
  createdAt: string;
}

interface VersionRow {
  id: number;
  process_key: string;
  version: number;
  definition_json: string;
  change_note: string;
  created_at: string;
}

function toVersion(row: VersionRow): ProcessVersion {
  return {
    id: row.id,
    processKey: row.process_key,
    version: row.version,
    definition: parseProcessDefinition(JSON.parse(row.definition_json)),
    changeNote: row.change_note,
    createdAt: row.created_at,
  };
}

export class ProcessRepository {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Wgrywa procesy, których jeszcze nie ma. Istniejących nie zmienia (zmiany = nowe wersje). */
  seed(definitions: readonly ProcessDefinition[]): void {
    for (const def of definitions) {
      if (!this.getActive(def.key)) this.addVersion(def, "Wersja początkowa");
    }
  }

  /** Dodaje nową, niezmienną wersję i ustawia ją jako aktywną. */
  addVersion(input: ProcessDefinition, changeNote: string): ProcessVersion {
    const definition = parseProcessDefinition(input);
    return this.db.transaction(() => {
      const last = this.db
        .prepare("SELECT MAX(version) AS v FROM process_versions WHERE process_key = ?")
        .get(definition.key) as { v: number | null };
      const version = (last.v ?? 0) + 1;
      const info = this.db
        .prepare("INSERT INTO process_versions (process_key, version, definition_json, change_note, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(definition.key, version, JSON.stringify(definition), changeNote, this.now().toISOString());
      const id = Number(info.lastInsertRowid);
      this.db
        .prepare(
          "INSERT INTO processes (process_key, active_version_id) VALUES (?, ?) ON CONFLICT(process_key) DO UPDATE SET active_version_id = excluded.active_version_id",
        )
        .run(definition.key, id);
      return this.getVersion(id) as ProcessVersion;
    })();
  }

  getVersion(id: number): ProcessVersion | undefined {
    const row = this.db.prepare("SELECT * FROM process_versions WHERE id = ?").get(id) as VersionRow | undefined;
    return row ? toVersion(row) : undefined;
  }

  getActive(processKey: string): ProcessVersion | undefined {
    const row = this.db
      .prepare("SELECT v.* FROM processes p JOIN process_versions v ON v.id = p.active_version_id WHERE p.process_key = ?")
      .get(processKey) as VersionRow | undefined;
    return row ? toVersion(row) : undefined;
  }

  listActive(): ProcessVersion[] {
    const rows = this.db
      .prepare(
        "SELECT v.* FROM processes p JOIN process_versions v ON v.id = p.active_version_id WHERE p.enabled = 1 ORDER BY p.process_key",
      )
      .all() as VersionRow[];
    return rows.map(toVersion);
  }

  history(processKey: string): ProcessVersion[] {
    const rows = this.db
      .prepare("SELECT * FROM process_versions WHERE process_key = ? ORDER BY version DESC")
      .all(processKey) as VersionRow[];
    return rows.map(toVersion);
  }
}
