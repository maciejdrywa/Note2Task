// Mock backendu: zwraca ten sam format co prawdziwy /extract (lista wydarzeń).
// Znana notatka z Data/TXT -> zadania z Data/GroundTruth, ustawione na jutro;
// nieznana -> prosta heurystyka (zdanie = zadanie, godzina z zapisu 14.10 / 9:15).
// Tekst zawierający "#error" symuluje błąd backendu.
import { ApiError, type ApiEvent, type ApiRequest, type ApiResponse } from "./types";

interface GtTask {
  "czynność": string;
  godzina: string | null;
}

const txtFiles = import.meta.glob<string>("../../../Data/TXT/*.txt", {
  query: "?raw",
  import: "default",
  eager: true,
});
const gtFiles = import.meta.glob<Record<string, GtTask[]>>("../../../Data/GroundTruth/*.json", {
  import: "default",
  eager: true,
});

const fileId = (path: string) => path.split("/").pop()!.replace(/\.\w+$/, "");
const normalize = (s: string) => s.toLocaleLowerCase("pl").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();

export interface SampleNote {
  id: string;
  text: string;
}

/** Przykładowe notatki z Data/TXT (szybki wybór w UI w trybie mock). */
export const sampleNotes: SampleNote[] = Object.entries(txtFiles)
  .map(([path, text]) => ({ id: fileId(path), text: text.replace(/^﻿/, "").trim() }))
  .filter((n) => n.text)
  .sort((a, b) => Number(a.id) - Number(b.id));

const groundTruthByText = new Map<string, GtTask[]>();
for (const [path, gt] of Object.entries(gtFiles)) {
  const note = sampleNotes.find((n) => n.id === fileId(path));
  if (note) groundTruthByText.set(normalize(note.text), Object.values(gt).flat());
}

const pad = (n: number) => String(n).padStart(2, "0");

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toEvent(summary: string, time: string | null, date: string): ApiEvent {
  if (!time) {
    return { summary, description: null, start: { date }, end: { date } };
  }
  const [h, m] = time.split(/[:.]/).map(Number);
  const endH = Math.min(h + 1, 23);
  const tz = "+01:00";
  return {
    summary,
    description: null,
    start: { dateTime: `${date}T${pad(h)}:${pad(m)}:00${tz}`, timeZone: "Europe/Warsaw" },
    end: { dateTime: `${date}T${pad(endH)}:${pad(m)}:00${tz}`, timeZone: "Europe/Warsaw" },
  };
}

const TIME_RE = /\b(\d{1,2})[:.](\d{2})\b/;

function heuristic(text: string, date: string): ApiResponse {
  return text
    .split(/(?<!\d)\.(?!\d)|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = TIME_RE.exec(s);
      return toEvent(s, m ? `${m[1]}:${m[2]}` : null, date);
    });
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
  await delay(1500 + Math.random() * 1000, signal); // ~czas odpowiedzi modelu, żeby było widać „myślenie”
  if (req.tekst.includes("#error")) {
    throw new ApiError("Symulowany błąd backendu (mock)", 500);
  }
  const date = tomorrow();
  const gt = groundTruthByText.get(normalize(req.tekst));
  return gt ? gt.map((t) => toEvent(t["czynność"], t.godzina, date)) : heuristic(req.tekst, date);
}
