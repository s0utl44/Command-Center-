import { randomUUID } from "node:crypto";
import { CONTINUATION_TEXT, parsePromptMeta, RESULT_LINE_PREFIX, type FileCounter, type HermesGateway, type RunState } from "@/core/execution";
import { WRE_PHOTOS_ROOT } from "@/core/processes/wre-photo-edit";
import type { Db } from "../db";

/**
 * SYMULACJA Hermesa i Google Drive. Nie łączy się z niczym. Stan trzymany w tej samej bazie
 * (tabele `mock_*`), żeby przetrwał restart workera — tak jak przetrwałby go prawdziwy Hermes.
 *
 * Scenariusze wybierane słowem w nazwie folderu (do ręcznych testów):
 *   BLAD → błąd wykonania, CZESC → brakuje jednego pliku, PYTANIE → Hermes dopytuje,
 *   ZGUB → Hermes gubi sesję. W pozostałych przypadkach — sukces.
 * Kontynuacja („Dokończ”) w tej samej sesji zawsze kończy brakujące pliki.
 */

export type MockOutcome = "success" | "partial" | "fail" | "clarify" | "lost";

export interface MockWorldOptions {
  now?: () => Date;
  durationMs?: number;
  outcomeFor?: (params: Record<string, string>) => MockOutcome;
}

interface SessionRow {
  session_id: string;
  prompt: string | null;
  submitted_at: string | null;
  complete_at: string | null;
  outcome: MockOutcome | null;
  applied: number;
}

export function defaultOutcome(params: Record<string, string>): MockOutcome {
  const folder = (params.folder ?? "").toUpperCase();
  if (folder.includes("BLAD")) return "fail";
  if (folder.includes("CZESC")) return "partial";
  if (folder.includes("PYTANIE")) return "clarify";
  if (folder.includes("ZGUB")) return "lost";
  return "success";
}

/** Deterministyczna liczba zdjęć źródłowych (4–12) wyliczona z nazwy folderu. */
export function mockSourceCount(folder: string): number {
  let h = 0;
  for (const ch of folder) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 4 + (h % 9);
}

export class MockWorld {
  private readonly now: () => Date;
  private readonly durationMs: number;
  private readonly outcomeFor: (params: Record<string, string>) => MockOutcome;

  constructor(
    private readonly db: Db,
    options: MockWorldOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.durationMs = options.durationMs ?? 8000;
    this.outcomeFor = options.outcomeFor ?? defaultOutcome;
    db.exec(`
      CREATE TABLE IF NOT EXISTS mock_hermes_sessions (
        session_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, prompt TEXT, submitted_at TEXT,
        complete_at TEXT, outcome TEXT, applied INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS mock_hermes_submits (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mock_drive_folders (alias TEXT NOT NULL, path TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (alias, path));
    `);
  }

  /** Liczba wywołań prompt.submit — testy sprawdzają, że zlecenie nigdy nie poszło dwa razy. */
  submitCount(sessionId?: string): number {
    const row = (
      sessionId
        ? this.db.prepare("SELECT COUNT(*) AS c FROM mock_hermes_submits WHERE session_id = ?").get(sessionId)
        : this.db.prepare("SELECT COUNT(*) AS c FROM mock_hermes_submits").get()
    ) as { c: number };
    return row.c;
  }

  /** Symuluje utratę zlecenia w drodze: sesja istnieje, ale prompt do niej nie dotarł. */
  dropPrompt(sessionId: string): void {
    this.db.prepare("UPDATE mock_hermes_sessions SET prompt = NULL, submitted_at = NULL, complete_at = NULL WHERE session_id = ?").run(sessionId);
  }

  readonly hermes: HermesGateway = {
    mode: "mock",
    createSession: async () => {
      const sessionId = `mock-${randomUUID()}`;
      this.db.prepare("INSERT INTO mock_hermes_sessions (session_id, created_at) VALUES (?, ?)").run(sessionId, this.now().toISOString());
      return { sessionId };
    },
    submitPrompt: async (sessionId, prompt) => {
      const at = this.now();
      this.db.prepare("INSERT INTO mock_hermes_submits (session_id, at) VALUES (?, ?)").run(sessionId, at.toISOString());
      const params = parsePromptMeta(prompt)?.params ?? {};
      const outcome = prompt.includes(CONTINUATION_TEXT) ? "success" : this.outcomeFor(params);
      const info = this.db
        .prepare("UPDATE mock_hermes_sessions SET prompt = ?, submitted_at = ?, complete_at = ?, outcome = ?, applied = 0 WHERE session_id = ?")
        .run(prompt, at.toISOString(), new Date(at.getTime() + this.durationMs).toISOString(), outcome, sessionId);
      if (info.changes !== 1) throw new Error("SYMULACJA: nieznana sesja");
    },
    inspect: async (sessionId, marker) => this.inspect(sessionId, marker),
  };

  readonly drive: FileCounter = {
    mode: "mock",
    countFiles: async (alias, folder) => {
      const row = this.db.prepare("SELECT count FROM mock_drive_folders WHERE alias = ? AND path = ?").get(alias, folder.path) as
        | { count: number }
        | undefined;
      if (row) return row.count;
      const rest = folder.path.startsWith(`${WRE_PHOTOS_ROOT}/`) ? folder.path.slice(WRE_PHOTOS_ROOT.length + 1) : null;
      if (alias === "wre" && rest && !rest.includes("/")) return mockSourceCount(rest);
      return null;
    },
  };

  private inspect(sessionId: string, marker: string): RunState {
    const row = this.db.prepare("SELECT * FROM mock_hermes_sessions WHERE session_id = ?").get(sessionId) as SessionRow | undefined;
    if (!row) return { kind: "lost" };
    if (!row.prompt || !row.prompt.includes(marker) || !row.complete_at) return { kind: "not-received" };
    if (this.now() < new Date(row.complete_at)) return { kind: "running" };

    const meta = parsePromptMeta(row.prompt);
    const folder = meta?.params.folder ?? "";
    const source = mockSourceCount(folder);
    switch (row.outcome) {
      case "success":
      case "partial": {
        const written = row.outcome === "success" ? source : source - 1;
        if (!row.applied) {
          this.db
            .prepare("INSERT INTO mock_drive_folders (alias, path, count) VALUES (?, ?, ?) ON CONFLICT(alias, path) DO UPDATE SET count = excluded.count")
            .run(meta?.account ?? "wre", `${WRE_PHOTOS_ROOT}/${folder}/obrobione`, written);
          this.db.prepare("UPDATE mock_hermes_sessions SET applied = 1 WHERE session_id = ?").run(sessionId);
        }
        const result = {
          source_folder_name: folder,
          source_folder_id: `mock-src-${sessionId}`,
          destination_folder_id: `mock-dst-${sessionId}`,
          destination_url: `https://example.invalid/symulacja/${encodeURIComponent(folder)}/obrobione`,
          source_count: source,
          verified_count: written,
        };
        return {
          kind: "completed",
          report: `SYMULACJA: obrobiono ${written} z ${source} zdjęć.\n${RESULT_LINE_PREFIX} ${JSON.stringify(result)}`,
        };
      }
      case "fail":
        return { kind: "failed", error: "SYMULACJA: błąd podczas obróbki zdjęć." };
      case "clarify":
        return { kind: "clarify", requestId: `mock-req-${sessionId}`, question: "SYMULACJA: znaleziono dwa pasujące foldery — który wybrać?" };
      case "lost":
        this.db.prepare("DELETE FROM mock_hermes_sessions WHERE session_id = ?").run(sessionId);
        return { kind: "lost" };
      default:
        return { kind: "not-received" };
    }
  }
}
