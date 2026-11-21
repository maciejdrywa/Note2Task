// Mock backendu oparty na danych z repo (Data/TXT + Data/GroundTruth).
// Znana notatka -> odpowiedź z GroundTruth; nieznana -> prosta heurystyka.
// Tekst zawierający "#error" symuluje błąd backendu.
import { ApiError, type ApiRequest, type ApiResponse } from "./types";
import { toApiRequest } from "./mapping";

const txtFiles = import.meta.glob<string>("../../../Data/TXT/*.txt", {
  query: "?raw",
  import: "default",
  eager: true,
});
const gtFiles = import.meta.glob<ApiResponse>("../../../Data/GroundTruth/*.json", {
  import: "default",
  eager: true,
});

const fileId = (path: string) => path.split("/").pop()!.replace(/\.\w+$/, "");
const normalize = (s: string) => s.toLocaleLowerCase("pl").replace(/\s+/g, " ").trim();
const keyOf = (req: ApiRequest) => normalize(Object.values(req).join(" | "));

export interface SampleNote {
  id: string;
  text: string;
}

/** Przykładowe notatki z Data/TXT (np. do szybkiego wyboru w UI). */
export const sampleNotes: SampleNote[] = Object.entries(txtFiles)
  .map(([path, text]) => ({ id: fileId(path), text: text.replace(/^﻿/, "").trim() }))
  .filter((n) => n.text)
  .sort((a, b) => Number(a.id) - Number(b.id));

const groundTruthByKey = new Map<string, ApiResponse>();
for (const [path, gt] of Object.entries(gtFiles)) {
  const note = sampleNotes.find((n) => n.id === fileId(path));
  if (note) groundTruthByKey.set(keyOf(toApiRequest(note.text)), gt);
}

const TIME_RE = /\b(\d{1,2})[:.](\d{2})\b/;

function heuristic(req: ApiRequest): ApiResponse {
  const res: ApiResponse = {};
  for (const [key, sentence] of Object.entries(req)) {
    const m = TIME_RE.exec(sentence);
    res[key] = [{ "czynność": sentence, godzina: m ? `${m[1]}:${m[2]}` : null }];
  }
  return res;
}

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

export async function mockPostExtract(req: ApiRequest, signal?: AbortSignal): Promise<ApiResponse> {
  await delay(600 + Math.random() * 600, signal);
  if (Object.values(req).some((s) => s.includes("#error"))) {
    throw new ApiError("Symulowany błąd backendu (mock)", 500);
  }
  return groundTruthByKey.get(keyOf(req)) ?? heuristic(req);
}
