import type { NoteResult, Task } from "../api";
import { getItem, setItem } from "./kv";

/** Stary format (przed kontraktem z backendem): zadania pogrupowane po zdaniach, sama godzina. */
interface LegacyResult {
  sentences: { tasks: { id: string; action: string; time: string | null; done: boolean }[] }[];
}

/** Przerabia zapisane wyniki w starym formacie na NoteResult (zachowuje odhaczenia i kolejność). */
function migrateResult(result: unknown): NoteResult | null {
  if (!result || typeof result !== "object") return null;
  if (Array.isArray((result as NoteResult).tasks)) return result as NoteResult;
  const legacy = result as LegacyResult;
  if (!Array.isArray(legacy.sentences)) return null;
  return {
    tasks: legacy.sentences.flatMap((s) =>
      s.tasks.map(
        (t): Task => ({
          id: t.id,
          action: t.action,
          description: null,
          date: null,
          start: t.time,
          end: null,
          done: t.done,
        }),
      ),
    ),
  };
}

export interface Note {
  id: string;
  title: string; // pusty = tytuł z pierwszych słów treści
  text: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  result: NoteResult | null;
  extractedText: string | null; // treść, z której wyciągnięto `result`
  /** Własna kolejność zadań na osi czasu (id zadań); null = sortowanie po godzinie. */
  taskOrder?: string[] | null;
}

const KEY = "notes";

export async function loadNotes(): Promise<Note[]> {
  const notes = await getItem<Note[]>(KEY);
  if (!Array.isArray(notes)) return [];
  return notes.map((n) => ({ ...n, result: migrateResult(n.result) }));
}

export function saveNotes(notes: Note[]): Promise<void> {
  // puste szkice nie są zapisywane
  return setItem(KEY, notes.filter((n) => n.text.trim() || n.title.trim()));
}

export function createNote(text = ""): Note {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "",
    text,
    createdAt: now,
    updatedAt: now,
    result: null,
    extractedText: null,
    taskOrder: null,
  };
}

export function displayTitle(note: Note): string {
  if (note.title.trim()) return note.title.trim();
  const words = note.text
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
    .replace(/[,;:.\-–]+$/, "");
  if (!words) return "Nowa notatka";
  return words.length > 40 ? words.slice(0, 40) + "…" : words;
}

export function isStale(note: Note): boolean {
  return note.result !== null && note.extractedText !== note.text;
}

export function taskStats(note: Note): { done: number; total: number } {
  const tasks = note.result?.tasks ?? [];
  return { done: tasks.filter((t) => t.done).length, total: tasks.length };
}

const taskKey = (t: Task) => `${t.action.toLocaleLowerCase("pl")}|${t.date}|${t.start}`;

/** Po ponownym wyciągnięciu zachowuje odhaczenie zadań, które się nie zmieniły. */
export function carryOverDone(prev: NoteResult | null, next: NoteResult): NoteResult {
  if (!prev) return next;
  const doneKeys = new Set(prev.tasks.filter((t) => t.done).map(taskKey));
  return { ...next, tasks: next.tasks.map((t) => ({ ...t, done: doneKeys.has(taskKey(t)) })) };
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
