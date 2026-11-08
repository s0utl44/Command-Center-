"use client";

import { useState } from "react";
import type { TaskView } from "@/core/task-view";
import { api, ApiError } from "@/lib/api";

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pl-PL";
  window.speechSynthesis.speak(u);
}

export function TaskCard({ task, onDismiss, onUpdate }: { task: TaskView; onDismiss?: () => void; onUpdate: (task: TaskView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ task: TaskView }>) {
    setBusy(true);
    setError(null);
    try {
      onUpdate((await action()).task);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Nie udało się — sprawdź połączenie.");
    } finally {
      setBusy(false);
    }
  }

  const terminal = task.status === "succeeded" || task.status === "failed" || task.status === "cancelled";
  const working = task.status === "queued" || task.status === "running" || task.status === "verifying";

  return (
    <article className={`task-card status-${task.status}`} aria-live="polite" data-testid="task-card" data-task-id={task.id} data-utterance={task.utterance}>
      <header>
        <span className="process">{task.processName}</span>
        <span className="status" data-testid="task-status">
          {working && <span className="spinner" aria-hidden="true" />}
          {task.statusLabel}
        </span>
      </header>

      {task.params.length > 0 && (
        <dl className="params">
          {task.params
            .filter((p) => !(p.name === "extra_instruction" && p.value === "brak") && !(p.name === "listing_type" && p.value === "nie podano"))
            .map((p) => (
              <div key={p.name}>
                <dt>{p.label}</dt>
                <dd>{p.value}</dd>
              </div>
            ))}
        </dl>
      )}

      {task.status === "needs_input" && <MissingForm task={task} busy={busy} onSubmit={(values) => run(() => api.provideParams(task.id, values))} />}

      {task.status === "awaiting_approval" && (
        <div className="approval">
          <p>Potrzebuję Twojej zgody:</p>
          <ul>
            {task.approvalReasons.map((r) => (
              <li key={r.reason}>{r.label}</li>
            ))}
          </ul>
          <div className="actions">
            <button type="button" className="primary" disabled={busy} onClick={() => run(() => api.approve(task.id))}>
              Zatwierdź
            </button>
            <button type="button" disabled={busy} onClick={() => run(() => api.cancel(task.id))}>
              Anuluj
            </button>
          </div>
        </div>
      )}

      {task.result && (
        <div className="result">
          {task.result.simulated && <span className="badge-sim">SYMULACJA</span>}
          <p data-testid="task-summary">{task.result.summary}</p>
          {task.result.question && <p className="question">Pytanie: {task.result.question}</p>}
          {task.result.resolvedFolder && <p className="muted small">Folder: {task.result.resolvedFolder}</p>}
          {task.result.link && (
            <a href={task.result.link} target="_blank" rel="noreferrer">
              Otwórz wynik
            </a>
          )}
        </div>
      )}

      {task.status === "needs_attention" && (
        <div className="actions">
          {task.canContinue && (
            <button type="button" className="primary" disabled={busy} onClick={() => run(() => api.retry(task.id, "continue"))}>
              Dokończ
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Poprzednie zlecenie mogło zostać częściowo wykonane. Zacząć od nowa w nowej sesji?")) {
                void run(() => api.retry(task.id, "fresh"));
              }
            }}
          >
            Od nowa
          </button>
          <button type="button" disabled={busy} onClick={() => run(() => api.cancel(task.id))}>
            Anuluj
          </button>
        </div>
      )}

      {working && (
        <p className="muted small">Działa w tle — możesz zamknąć aplikację.</p>
      )}

      {terminal && (
        <div className="actions">
          {task.result && (
            <button type="button" onClick={() => speak(task.result?.summary ?? "")}>
              🔊 Odczytaj
            </button>
          )}
          {onDismiss && (
            <button type="button" onClick={onDismiss}>
              Nowe polecenie
            </button>
          )}
        </div>
      )}

      {(task.status === "needs_input" || task.status === "awaiting_approval") && (
        <button type="button" className="link" disabled={busy} onClick={() => run(() => api.cancel(task.id))}>
          Anuluj zadanie
        </button>
      )}

      {error && <p className="error" role="alert">{error}</p>}
    </article>
  );
}

function MissingForm({ task, busy, onSubmit }: { task: TaskView; busy: boolean; onSubmit: (values: Record<string, string>) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <form
      className="missing"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      {task.missing.map((m) => (
        <label key={m.name}>
          <span>{m.question}</span>
          {m.options ? (
            <span className="options">
              {m.options.map((o) => (
                <button key={o} type="button" disabled={busy} className={values[m.name] === o ? "primary" : undefined} onClick={() => setValues((v) => ({ ...v, [m.name]: o }))}>
                  {o}
                </button>
              ))}
            </span>
          ) : (
            <input
              name={m.name}
              autoComplete="off"
              value={values[m.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [m.name]: e.target.value }))}
            />
          )}
        </label>
      ))}
      <button type="submit" className="primary" disabled={busy || task.missing.some((m) => !values[m.name]?.trim())}>
        Dalej
      </button>
    </form>
  );
}
