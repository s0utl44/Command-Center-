import type { ConnectionStatusProvider } from "@/core/connection-status";

/**
 * Dostawca statusu, który NIE sprawdza niczego i uczciwie to mówi.
 * Prawdziwe sprawdzanie przez Composio — etap 8.
 */
export const uncheckedConnectionStatus: ConnectionStatusProvider = {
  mode: "mock",
  status: async (account, service) => ({
    alias: account.alias,
    service,
    state: "unknown",
    checkedAt: null,
    detail: "Status nie jest jeszcze sprawdzany — integracja z Composio powstanie w etapie 8.",
  }),
};
