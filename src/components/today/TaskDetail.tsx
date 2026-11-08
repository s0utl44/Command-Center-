"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { eventLabel } from "@/core/event-labels";
import type { TaskView } from "@/core/task-view";
import { api, ApiError, type TaskEventView } from "@/lib/api";
import { useSnapshot } from "@/lib/useSnapshot";
import { TaskCard } from "../speak/TaskCard";

/** Szczegóły zadania: karta z akcjami + oś zdarzeń. Odświeża się, gdy zadanie zmienia się w migawce. */
export function TaskDetail({ id }: { id: string }) {
  const { snapshot } = useSnapshot();
  const [task, setTask] = useState<TaskView | null>(null);
  const [events, setEvents] = useState<TaskEventView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const live = snapshot?.tasks.find((t) => t.id === id);
  const version = live?.updatedAt ?? "";

  useEffect(() => {
    let cancelled = false;
    api
      .task(id)
      .then((r) => {
        if (cancelled) return;
        setTask(r.task);
        setEvents(r.events);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Nie udało się wczytać zadania.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  const shown = live && task && live.updatedAt > task.updatedAt ? live : task;

  return (
    <section className="screen detail">
      <Link href="/dzisiaj" className="back">
        ← Dzisiaj
      </Link>
      {error && <p className="error">{error}</p>}
      {shown && (
        <>
          <p className="muted small">„{shown.utterance}”</p>
          <TaskCard task={shown} onUpdate={setTask} />
          <h2>Historia</h2>
          <ol className="timeline" data-testid="timeline">
            {events.map((e, i) => (
              <li key={i}>
                <time dateTime={e.at}>{new Date(e.at).toLocaleTimeString("pl-PL")}</time>
                <span>{eventLabel(e.type)}</span>
              </li>
            ))}
          </ol>
          <p className="muted small">
            Proces: {shown.processName} (wersja {shown.processVersion}) · próby: {shown.attempts}
          </p>
        </>
      )}
    </section>
  );
}
