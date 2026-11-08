import type { Service, Workspace } from "./process";

/** Konta przypisane do przestrzeni. Status połączenia NIE jest tu zapisany — pochodzi z backendu na żywo. */
export interface ConnectionAccount {
  alias: string;
  email: string;
  workspace: Workspace;
  services: Service[];
}

export const CONNECTION_ACCOUNTS: readonly ConnectionAccount[] = [
  { alias: "wre", email: "d.lys@wrenieruchomosci.pl", workspace: "wre", services: ["google-drive", "gmail"] },
  { alias: "sotuldrop", email: "sotuldrop@gmail.com", workspace: "private", services: ["gmail"] },
];

export class WorkspaceMismatchError extends Error {
  constructor(processKey: string, alias: string) {
    super(`Proces ${processKey} nie może używać konta ${alias} z innej przestrzeni`);
    this.name = "WorkspaceMismatchError";
  }
}

/** Egzekwuje rozdział kont: proces może używać tylko konta ze swojej przestrzeni i z wymaganymi usługami. */
export function resolveAccount(
  process: { key: string; workspace: Workspace; connection: { alias: string; services: Service[] } },
  accounts: readonly ConnectionAccount[] = CONNECTION_ACCOUNTS,
): ConnectionAccount {
  const account = accounts.find((a) => a.alias === process.connection.alias);
  if (!account) throw new Error(`Nieznany alias połączenia: ${process.connection.alias}`);
  if (account.workspace !== process.workspace) throw new WorkspaceMismatchError(process.key, account.alias);
  const missing = process.connection.services.filter((s) => !account.services.includes(s));
  if (missing.length > 0) throw new Error(`Konto ${account.alias} nie ma usług: ${missing.join(", ")}`);
  return account;
}
