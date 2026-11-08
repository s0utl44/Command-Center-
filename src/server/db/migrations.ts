/** Migracje wykonywane po kolei; numer = indeks + 1 (PRAGMA user_version). Nigdy nie edytuj istniejących. */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE process_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    process_key TEXT NOT NULL,
    version INTEGER NOT NULL,
    definition_json TEXT NOT NULL,
    change_note TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (process_key, version)
  );

  CREATE TABLE processes (
    process_key TEXT PRIMARY KEY,
    active_version_id INTEGER NOT NULL REFERENCES process_versions(id),
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    process_version_id INTEGER NOT NULL REFERENCES process_versions(id),
    status TEXT NOT NULL,
    utterance TEXT NOT NULL,
    params_json TEXT NOT NULL,
    missing_json TEXT NOT NULL,
    approval_reasons_json TEXT NOT NULL,
    result_json TEXT,
    hermes_session_id TEXT,
    prompt_submitted_at TEXT,
    lease_owner TEXT,
    lease_until TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX tasks_status ON tasks(status);
  CREATE INDEX tasks_created ON tasks(created_at);

  CREATE TABLE task_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    at TEXT NOT NULL,
    type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    data_json TEXT
  );
  CREATE INDEX task_events_task ON task_events(task_id, id);
  `,
];
