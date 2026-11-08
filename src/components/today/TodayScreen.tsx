"use client";

import Link from "next/link";
import { groupForToday, taskHeadline, TODAY_GROUPS } from "@/core/today";
import { useSnapshot } from "@/lib/useSnapshot";

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

export function TodayScreen() {
  const { snapshot, live } = useSnapshot();
  const groups = snapshot ? groupForToday(snapshot.tasks) : null;

  return (
    <section className="screen today">
      <h1>Dzisiaj</h1>
      {snapshot && snapshot.modes.hermes === "mock" && <p className="sim-banner">Tryb SYMULACJI — wyniki nie pochodzą z prawdziwego Hermesa.</p>}
      {live === "offline" && <p className="offline">Brak połączenia z serwerem — ponawiam…</p>}
      {!groups && <p className="muted">Wczytuję…</p>}
      {groups &&
        TODAY_GROUPS.map(({ group, label, empty }) => (
          <section key={group} className={`today-group group-${group}`} aria-labelledby={`g-${group}`} data-testid={`group-${group}`}>
            <h2 id={`g-${group}`}>
              {label} <span className="count">{groups[group].length}</span>
            </h2>
            {groups[group].length === 0 ? (
              <p className="muted small">{empty}</p>
            ) : (
              <ul>
                {groups[group].map((t) => (
                  <li key={t.id}>
                    <Link href={`/zadania/${t.id}`} className="today-item">
                      <span className="headline">{taskHeadline(t)}</span>
                      <span className="meta">
                        {t.processName} · {t.statusLabel} · {time(t.updatedAt)}
                        {t.result?.simulated ? " · SYMULACJA" : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
    </section>
  );
}
