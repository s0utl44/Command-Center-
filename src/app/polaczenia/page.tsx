import { CONNECTION_STATE_LABEL, SERVICE_LABEL } from "@/core/connection-status";
import { CONNECTION_ACCOUNTS } from "@/core/connections";
import { requirePageSession } from "@/server/auth/page";
import { getRuntime } from "@/server/context";

export const dynamic = "force-dynamic";

/** Połączenia: konta, usługi, PRAWDZIWY status z backendu (dziś: „nie sprawdzono”), procesy korzystające. */
export default async function ConnectionsPage() {
  const session = await requirePageSession();
  const rt = getRuntime();
  const processes = rt.processes.listActive().map((v) => v.definition);
  const rows = await Promise.all(
    CONNECTION_ACCOUNTS.flatMap((account) => account.services.map(async (service) => ({ account, service, status: await rt.connections.status(account, service) }))),
  );

  return (
    <section className="screen connections">
      <h1>Połączenia</h1>
      {rt.connections.mode === "mock" && (
        <p className="sim-banner">Status połączeń nie jest jeszcze sprawdzany — żadne konto nie jest oznaczone jako połączone.</p>
      )}
      {rows.map(({ account, service, status }) => {
        const users = processes.filter((p) => p.connection.alias === account.alias && p.connection.services.includes(service));
        return (
          <article key={`${account.alias}-${service}`} className="panel" data-testid={`connection-${account.alias}-${service}`}>
            <header>
              <h2>{SERVICE_LABEL[service]}</h2>
              <span className={`conn-state state-${status.state}`} data-testid="connection-state">
                {CONNECTION_STATE_LABEL[status.state]}
              </span>
            </header>
            <dl className="params">
              <div>
                <dt>Konto</dt>
                <dd>
                  {account.alias} — {account.email}
                </dd>
              </div>
              <div>
                <dt>Przestrzeń</dt>
                <dd>{account.workspace === "wre" ? "WRE (firmowa)" : "Prywatna"}</dd>
              </div>
              <div>
                <dt>Sprawdzono</dt>
                <dd>{status.checkedAt ? new Date(status.checkedAt).toLocaleString("pl-PL") : "nigdy"}</dd>
              </div>
              <div>
                <dt>Procesy</dt>
                <dd>{users.length ? users.map((p) => p.name).join(", ") : "brak"}</dd>
              </div>
            </dl>
            <p className="muted small">{status.detail}</p>
            <button type="button" disabled title="Dostępne po integracji z Composio (etap 8)">
              Autoryzuj ponownie
            </button>
          </article>
        );
      })}
      <form action="/api/auth/logout" method="post" className="account">
        <span className="muted small">Zalogowano jako {session.email}</span>
        <button type="submit">Wyloguj</button>
      </form>
    </section>
  );
}
