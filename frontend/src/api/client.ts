import { ApiError, type ApiRequest, type ApiResponse } from "./types";

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

// Ustalone z backendem: POST /extract, body { "tekst": "..." }.
const EXTRACT_PATH = "/extract";

export async function postExtract(req: ApiRequest, signal?: AbortSignal): Promise<ApiResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${EXTRACT_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(`Brak połączenia z backendem (${API_URL})`);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* odpowiedź nie-JSON */
    }
    throw new ApiError(`Błąd backendu ${res.status}: ${detail}`, res.status);
  }

  try {
    return (await res.json()) as ApiResponse;
  } catch {
    throw new ApiError("Backend zwrócił niepoprawny JSON");
  }
}
