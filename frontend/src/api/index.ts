import { postExtract } from "./client";
import { fromApiResponse, toApiRequest } from "./mapping";
import { mockPostExtract } from "./mock";
import type { NoteResult } from "./types";

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

/** Główne wejście dla UI: notatka -> zadania (posortowane po dacie i godzinie). */
export async function extractTasks(note: string, signal?: AbortSignal): Promise<NoteResult> {
  const req = toApiRequest(note);
  if (!req.tekst) return { tasks: [] };
  const res = USE_MOCK ? await mockPostExtract(req, signal) : await postExtract(req, signal);
  return fromApiResponse(res);
}

export { sampleNotes, type SampleNote } from "./mock";
export { API_URL } from "./client";
export { checkBackend, EXTRACT_TIMEOUT_MS, type BackendHealth } from "./health";
export { sortTasks } from "./mapping";
export * from "./types";
