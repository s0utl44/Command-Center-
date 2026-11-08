import { CONNECTION_ACCOUNTS } from "@/core/connections";
import { SERVICE_LABEL } from "@/core/connection-status";
import { APPROVAL_REASON_LABEL } from "@/core/policy";
import { requirePageSession } from "@/server/auth/page";
import { getRuntime } from "@/server/context";

export const dynamic = "force-dynamic";

const PROFILE_LABEL = { "read-only": "tylko odczyt", "draft-only": "tylko szkice", "write-with-approval": "zapis po zgodzie", write: "zapis" } as const;
const ACTION_LABEL = { read: "odczyt", draft: "szkic", write: "zapis", send: "wysyłka", delete: "usuwanie", publish: "publikacja", payment: "płatność", irreversible: "nieodwracalna zmiana" } as const;

/** Procesy tylko do odczytu: aktywna wersja, konto, parametry, zgody, weryfikacja, historia wersji. */
export default async function ProcessesPage() {
  await requirePageSession();
  const rt = getRuntime();
  const processes = rt.processes.listActive();
  return (
    <section className="screen processes">
      <h1>Procesy</h1>
      <p className="muted small">Zmiany procesów zapisują się wyłącznie jako nowe wersje, po Twojej zgodzie.</p>
      {processes.map((v) => {
        const d = v.definition;
        const account = CONNECTION_ACCOUNTS.find((a) => a.alias === d.connection.alias);
        const history = rt.processes.history(d.key);
        return (
          <article key={d.key} className="panel" data-testid={`process-${d.key}`}>
            <header>
              <h2>{d.name}</h2>
              <span className="muted small">wersja {v.version}</span>
            </header>
            <p>{d.description}</p>
            <dl className="params">
              <div>
                <dt>Konto</dt>
                <dd>
                  {d.connection.alias} — {account?.email ?? "nieznane"} ({d.workspace === "wre" ? "WRE" : "prywatne"})
                </dd>
              </div>
              <div>
                <dt>Usługi</dt>
                <dd>{d.connection.services.map((s) => SERVICE_LABEL[s]).join(", ")}</dd>
              </div>
              {d.execution.skill && (
                <div>
                  <dt>Skill Hermesa</dt>
                  <dd>{d.execution.skill}</dd>
                </div>
              )}
              <div>
                <dt>Działania</dt>
                <dd>
                  {d.actions.map((a) => ACTION_LABEL[a]).join(", ")} (profil: {PROFILE_LABEL[d.execution.profile]})
                </dd>
              </div>
              <div>
                <dt>Weryfikacja</dt>
                <dd>{d.verification.description}</dd>
              </div>
            </dl>
            <h3>Parametry</h3>
            <ul>
              {d.params.map((p) => (
                <li key={p.name}>
                  <strong>{p.label}</strong> — {p.required ? `wymagany; pytanie: „${p.question}”` : `opcjonalny (domyślnie: ${p.default ?? "brak"})`}
                  {p.derive ? ` · wyprowadzany z: ${p.derive.from}` : ""}
                </li>
              ))}
            </ul>
            <h3>Zgody</h3>
            <ul>
              {d.approval.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
              <li>
                Zawsze wymagają zgody: {[APPROVAL_REASON_LABEL.delete, APPROVAL_REASON_LABEL.publish, APPROVAL_REASON_LABEL.payment, APPROVAL_REASON_LABEL["ambiguous-target"]].join(", ").toLowerCase()}.
              </li>
            </ul>
            <h3>Przykładowe polecenia</h3>
            <ul>
              {d.intents.examples.map((e) => (
                <li key={e}>„{e}”</li>
              ))}
            </ul>
            <details>
              <summary>Instrukcja dla Hermesa</summary>
              <pre className="instruction">{d.execution.instruction}</pre>
            </details>
            <details>
              <summary>Historia wersji ({history.length})</summary>
              <ol className="timeline">
                {history.map((h) => (
                  <li key={h.id}>
                    <time dateTime={h.createdAt}>v{h.version}</time>
                    <span>
                      {h.changeNote} · {new Date(h.createdAt).toLocaleDateString("pl-PL")}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          </article>
        );
      })}
    </section>
  );
}
