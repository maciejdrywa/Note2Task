import type { ApiRequest, ApiResponse, NoteResult, Task } from "./types";

// Ten sam podział co Data/txt_to_json.py: kropka między cyframi
// lub po "godz." należy do zapisu godziny, a nie kończy zdania.
const SENTENCE_END = /(?<!\bgodz)(?:(?<!\d)\.|\.(?!\d))+/i;

export function splitSentences(note: string): string[] {
  return note
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function toApiRequest(note: string): ApiRequest {
  const req: ApiRequest = {};
  splitSentences(note).forEach((s, i) => {
    req[`zdanie${i + 1}`] = s;
  });
  return req;
}

/** "8:5", "08.05", "8:05" -> "08:05"; nieprawidłowe -> null. */
export function normalizeTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2})[:.](\d{1,2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Zadania bez godziny lądują na końcu. */
export function sortByTime(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.time === b.time) return 0;
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time.localeCompare(b.time);
  });
}

const sentenceIndex = (key: string) => Number(key.replace(/\D/g, "")) || 0;

export function fromApiResponse(req: ApiRequest, res: ApiResponse): NoteResult {
  const keys = new Set([...Object.keys(req), ...Object.keys(res)]);
  const sentences = [...keys]
    .sort((a, b) => sentenceIndex(a) - sentenceIndex(b))
    .map((id) => ({
      id,
      text: req[id] ?? "",
      tasks: sortByTime(
        (res[id] ?? []).map((t, i) => ({
          id: `${id}-${i}`,
          action: t["czynność"],
          time: normalizeTime(t.godzina),
          done: false,
        })),
      ),
    }));
  return { sentences };
}
