import { useEffect, useState } from "react";
import { checkBackend, USE_MOCK, type BackendHealth } from "@/api";

const INTERVAL_MS = 10_000;

/** Sprawdza backend co 10 s i po powrocie do okna. W trybie mock zwraca null (nic nie sprawdza). */
export function useBackendHealth(): BackendHealth | "checking" | null {
  const [health, setHealth] = useState<BackendHealth | "checking">("checking");

  useEffect(() => {
    if (USE_MOCK) return;
    let alive = true;
    const run = () => checkBackend().then((h) => alive && setHealth(h));
    run();
    const timer = setInterval(run, INTERVAL_MS);
    window.addEventListener("focus", run);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", run);
    };
  }, []);

  return USE_MOCK ? null : health;
}
