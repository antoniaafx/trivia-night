import { useState } from "react";

const STORAGE_KEY = "trivia-night:client-id";

/**
 * A stable identity for this browser tab, persisted in sessionStorage.
 * A refresh keeps the same id (so a host or player reconnects as
 * themselves); a new tab/window gets a new id (so two windows on the
 * same machine act as two separate participants, which is exactly what
 * manual multi-window testing needs).
 */
export function useClientId(): string {
  const [clientId] = useState<string>(() => {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const created = crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEY, created);
    return created;
  });

  return clientId;
}
