import { API_URL } from "./client";

/**
 * ok   — backend odpowiada i ma CORS (fetch z aplikacji zadziała)
 * cors — serwer odpowiada, ale bez nagłówków CORS (zapytania z aplikacji będą blokowane)
 * down — brak połączenia (serwer wyłączony / zły adres)
 */
export type BackendHealth = "ok" | "cors" | "down";

const HEALTH_PATH = "/health"; // jeśli backend go nie ma (404), serwer i tak uznajemy za działający
const CHECK_TIMEOUT_MS = 3000;

export async function checkBackend(): Promise<BackendHealth> {
  const url = `${API_URL}${HEALTH_PATH}`;
  try {
    // zwykłe zapytanie: każda odpowiedź HTTP (też 404/405) = serwer żyje i CORS przepuszcza
    await fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    return "ok";
  } catch {
    try {
      // „no-cors” omija CORS: jeśli to przejdzie, serwer działa, tylko nie wpuszcza aplikacji
      await fetch(url, { mode: "no-cors", signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
      return "cors";
    } catch {
      return "down";
    }
  }
}

/** Limit czasu na analizę i zapis (VITE_EXTRACT_TIMEOUT_S, domyślnie 240 s). */
export const EXTRACT_TIMEOUT_MS = (Number(import.meta.env.VITE_EXTRACT_TIMEOUT_S) || 240) * 1000;
