"use client";

import { useEffect } from "react";

/** Rejestruje service worker (tylko build produkcyjny — w dev przeszkadzałby w odświeżaniu). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
