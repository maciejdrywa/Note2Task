import { postExtract } from "./client";
import { fromApiResponse, toApiRequest } from "./mapping";
import { mockPostExtract } from "./mock";
import type { NoteResult } from "./types";

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

/** Główne wejście dla UI: notatka -> zadania pogrupowane po zdaniach, posortowane po godzinie. */
export async function extractTasks(note: string, signal?: AbortSignal): Promise<NoteResult> {
  const req = toApiRequest(note);
  if (Object.keys(req).length === 0) return { sentences: [] };
  const res = USE_MOCK ? await mockPostExtract(req, signal) : await postExtract(req, signal);
  return fromApiResponse(req, res);
}

export { sampleNotes, type SampleNote } from "./mock";
export { API_URL } from "./client";
export { sortByTime, splitSentences } from "./mapping";
export * from "./types";
