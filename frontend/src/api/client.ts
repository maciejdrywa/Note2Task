import { ApiError, type ApiRequest, type ApiScheduleResponse } from "./types";

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

const SCHEDULE_PATH = "/schedule";

export async function postSchedule(req: ApiRequest, signal?: AbortSignal): Promise<ApiScheduleResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${SCHEDULE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(`Brak połączenia z backendem (${API_URL}). Jeśli żądanie dotarło do serwera, wydarzenia mogły zostać zapisane. Sprawdź Google Calendar przed ponowieniem.`);
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
    const report = await res.json();
    if (!report || typeof report.calendar_id !== "string" ||
        !["completed", "partial", "failed"].includes(report.status) ||
        !Array.isArray(report.results) || report.results.some((item: unknown) => {
          if (!item || typeof item !== "object") return true;
          const entry = item as Record<string, unknown>;
          const event = entry.event as Record<string, unknown> | undefined;
          return !["created", "failed", "unknown", "not_attempted"].includes(String(entry.status)) ||
            !event || typeof event.summary !== "string";
        })) {
      throw new Error("Invalid scheduling report");
    }
    return report as ApiScheduleResponse;
  } catch {
    throw new ApiError("Backend zwrócił niepoprawny raport zapisu. Sprawdź Google Calendar przed ponowieniem.");
  }
}
