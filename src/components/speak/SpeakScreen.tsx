"use client";

import { useMemo, useState } from "react";
import { ACTIVE_STATUSES, QUICK_ACTIONS } from "@/core/quick-actions";
import type { TaskView } from "@/core/task-view";
import { api, ApiError } from "@/lib/api";
import { useRecorder } from "@/lib/useRecorder";
import { useSnapshot } from "@/lib/useSnapshot";
import { TaskCard } from "./TaskCard";

const RECENT_MS = 2 * 60 * 60 * 1000;
const DISMISSED_KEY = "asystent.dismissedTask";

function readDismissed(): string | null {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * Łączy migawkę z serwera z odpowiedziami na własne akcje (te przychodzą wcześniej niż SSE).
 * Wygrywa nowsza wersja zadania (updatedAt), więc nie pokazujemy chwilowo nieaktualnego stanu.
 */
function mergeTasks(serverTasks: TaskView[], local: Record<string, TaskView>): TaskView[] {
  const merged = serverTasks.map((t) => {
    const l = local[t.id];
    return l && l.updatedAt > t.updatedAt ? l : t;
  });
  const missing = Object.values(local).filter((l) => !serverTasks.some((t) => t.id === l.id));
  return [...missing, ...merged].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** Zadanie pokazywane na ekranie Mów: wskazane po wysłaniu, inaczej aktywne, inaczej świeżo zakończone. */
function pickTask(tasks: TaskView[], focusedId: string | null, dismissedId: string | null): TaskView | null {
  const focused = focusedId ? tasks.find((t) => t.id === focusedId) : undefined;
  if (focused && focused.id !== dismissedId) return focused;
  const active = tasks.find((t) => (ACTIVE_STATUSES as readonly string[]).includes(t.status));
  if (active) return active;
  const recent = tasks[0];
  if (recent && recent.id !== dismissedId && Date.now() - new Date(recent.updatedAt).getTime() < RECENT_MS) return recent;
  return null;
}

export function SpeakScreen() {
  const { snapshot, live } = useSnapshot();
  const [text, setText] = useState("");
  const [simulatedTranscript, setSimulatedTranscript] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "transcribing" | "sending">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, TaskView>>({});
  const remember = (task: TaskView) => setLocal((l) => ({ ...l, [task.id]: task }));
  const [dismissedId, setDismissedId] = useState<string | null>(() => (typeof window === "undefined" ? null : readDismissed()));

  const recorder = useRecorder(async (audio) => {
    setPhase("transcribing");
    setMessage(null);
    try {
      const result = await api.transcribe(audio);
      setText(result.text);
      setSimulatedTranscript(result.simulated);
      setIdempotencyKey(crypto.randomUUID());
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Nie udało się rozpoznać nagrania.");
    } finally {
      setPhase("idle");
    }
  });

  const tasks = useMemo(() => mergeTasks(snapshot?.tasks ?? [], local), [snapshot, local]);
  const current = useMemo(() => pickTask(tasks, focusedId, dismissedId), [tasks, focusedId, dismissedId]);
  const blocking = current !== null && (ACTIVE_STATUSES as readonly string[]).includes(current.status) && current.status !== "queued" && current.status !== "running" && current.status !== "verifying";

  async function submit() {
    const utterance = text.trim();
    if (!utterance) return;
    const key = idempotencyKey ?? crypto.randomUUID();
    setIdempotencyKey(key);
    setPhase("sending");
    setMessage(null);
    try {
      const result = await api.command(utterance, key);
      if (result.kind === "task") {
        remember(result.task);
        setFocusedId(result.task.id);
        setDismissedId(null);
        setText("");
        setSimulatedTranscript(false);
        setIdempotencyKey(null);
      } else if (result.kind === "ambiguous") {
        setMessage(`Pasuje kilka procesów: ${result.candidates.map((c) => c.name).join(", ")}. Doprecyzuj polecenie.`);
      } else {
        setMessage("Nie rozpoznałem żadnego zapisanego procesu. Spróbuj inaczej sformułować polecenie.");
      }
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Brak połączenia — polecenie nie zostało wysłane.");
    } finally {
      setPhase("idle");
    }
  }

  function dismiss(id: string) {
    setDismissedId(id);
    setFocusedId(null);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, id);
    } catch {
      // brak sessionStorage — tylko w pamięci
    }
  }

  const recording = recorder.state === "recording";
  const simulation = snapshot && (snapshot.modes.hermes === "mock" || snapshot.modes.stt === "mock");

  return (
    <section className="screen speak">
      <h1 className="sr-only">Mów</h1>
      {simulation && (
        <p className="sim-banner" data-testid="sim-banner">
          Tryb SYMULACJI — nic nie jest naprawdę wykonywane{snapshot.modes.stt === "mock" ? ", a rozpoznawanie mowy zwraca stały tekst" : ""}.
        </p>
      )}
      {live === "offline" && <p className="offline">Brak połączenia z serwerem — ponawiam…</p>}

      {current && <TaskCard key={current.id} task={current} onUpdate={remember} onDismiss={() => dismiss(current.id)} />}

      {!blocking && (
        <>
          <button
            type="button"
            className={`mic${recording ? " recording" : ""}`}
            aria-label={recording ? "Zakończ nagrywanie" : "Mikrofon — naciśnij i mów"}
            aria-pressed={recording}
            disabled={recorder.state === "unsupported" || phase !== "idle"}
            onClick={() => (recording ? recorder.stop() : void recorder.start())}
          >
            {recording ? "■" : "🎙️"}
          </button>
          <p className="muted center small" data-testid="mic-hint">
            {recording
              ? `Nagrywam… ${recorder.seconds} s — naciśnij, aby zakończyć`
              : phase === "transcribing"
                ? "Rozpoznaję…"
                : recorder.state === "unsupported"
                  ? "Ta przeglądarka nie obsługuje nagrywania — wpisz polecenie."
                  : "Naciśnij i powiedz, co mam zrobić."}
          </p>
          {recorder.error && <p className="error" role="alert">{recorder.error}</p>}

          <form
            className="command"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="command-text" className="sr-only">
              Polecenie
            </label>
            <textarea
              id="command-text"
              rows={2}
              placeholder="…albo wpisz polecenie"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSimulatedTranscript(false);
                setIdempotencyKey(null);
              }}
            />
            {simulatedTranscript && <p className="badge-sim">SYMULACJA — ten tekst nie pochodzi z Twojego nagrania</p>}
            <div className="actions">
              <button type="submit" className="primary" disabled={!text.trim() || phase !== "idle"}>
                {phase === "sending" ? "Wysyłam…" : "Wykonaj"}
              </button>
            </div>
          </form>

          <div className="quick">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  setText(q.text);
                  setIdempotencyKey(null);
                  document.getElementById("command-text")?.focus();
                }}
              >
                {q.label}
              </button>
            ))}
          </div>
        </>
      )}

      {message && (
        <p className="error" role="alert" data-testid="speak-message">
          {message}
        </p>
      )}
    </section>
  );
}
