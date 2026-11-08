import type { ConnectionAccount } from "./connections";
import type { AdapterMode } from "./execution";
import type { Service } from "./process";

export type ConnectionState = "connected" | "expired" | "not_configured" | "error" | "unknown";

export interface ConnectionStatus {
  alias: string;
  service: Service;
  state: ConnectionState;
  /** Kiedy status został faktycznie sprawdzony; `null` = nigdy. */
  checkedAt: string | null;
  detail: string;
}

/** Prawdziwy status połączeń (docelowo z Composio). Brak sprawdzenia ≠ „połączone”. */
export interface ConnectionStatusProvider {
  readonly mode: AdapterMode;
  status(account: ConnectionAccount, service: Service): Promise<ConnectionStatus>;
}

export const CONNECTION_STATE_LABEL: Record<ConnectionState, string> = {
  connected: "Połączone",
  expired: "Wygasła autoryzacja",
  not_configured: "Nieskonfigurowane",
  error: "Błąd",
  unknown: "Nie sprawdzono",
};

export const SERVICE_LABEL: Record<Service, string> = {
  "google-drive": "Google Drive",
  gmail: "Gmail",
  hubspot: "HubSpot",
  "google-calendar": "Google Calendar",
  "google-docs": "Google Docs/Sheets",
  notion: "Notion",
};
