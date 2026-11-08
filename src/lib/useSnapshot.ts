"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/core/task-view";

export type LiveState = "connecting" | "live" | "offline";

/**
 * Stan zadań na żywo przez SSE (`/api/events`), z jednorazowym pobraniem na start.
 * EventSource sam wznawia połączenie po utracie sieci; stan zawsze pochodzi z serwera.
 */
export function useSnapshot(): { snapshot: Snapshot | null; live: LiveState; refresh: () => void } {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [live, setLive] = useState<LiveState>("connecting");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let closed = false;
    fetch("/api/tasks")
      .then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : null))
      .then((s) => {
        if (!closed && s) setSnapshot(s);
      })
      .catch(() => undefined);

    const source = new EventSource("/api/events");
    source.addEventListener("snapshot", (event) => {
      setSnapshot(JSON.parse((event as MessageEvent<string>).data) as Snapshot);
      setLive("live");
    });
    source.onerror = () => setLive("offline");
    return () => {
      closed = true;
      source.close();
    };
  }, [nonce]);

  return { snapshot, live, refresh: () => setNonce((n) => n + 1) };
}
