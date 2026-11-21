import { postSchedule } from "./client";
import { fromApiResponse, fromScheduleResponse, toApiRequest } from "./mapping";
import { mockPostExtract } from "./mock";
import type { NoteResult } from "./types";

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

/** Notatka -> zadania i zapis w Google Calendar; mock nie wykonuje zapisów. */
export async function extractTasks(note: string, signal?: AbortSignal): Promise<NoteResult> {
  const req = toApiRequest(note);
  if (!req.text) return { tasks: [] };
  if (USE_MOCK) return fromApiResponse(await mockPostExtract(req, signal));
  return fromScheduleResponse(await postSchedule(req, signal));
}

export { sampleNotes, type SampleNote } from "./mock";
export { API_URL } from "./client";
export { checkBackend, EXTRACT_TIMEOUT_MS, type BackendHealth } from "./health";
export { sortTasks } from "./mapping";
export * from "./types";
