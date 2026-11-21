import type { NoteResult } from "../api";
import { getItem, setItem } from "./kv";

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
  return Array.isArray(notes) ? notes : [];
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
  const tasks = note.result?.sentences.flatMap((s) => s.tasks) ?? [];
  return { done: tasks.filter((t) => t.done).length, total: tasks.length };
}

/** Po ponownym wyciągnięciu zachowuje odhaczenie zadań, które się nie zmieniły. */
export function carryOverDone(prev: NoteResult | null, next: NoteResult): NoteResult {
  if (!prev) return next;
  const doneKeys = new Set(
    prev.sentences
      .flatMap((s) => s.tasks)
      .filter((t) => t.done)
      .map((t) => `${t.action.toLocaleLowerCase("pl")}|${t.time}`),
  );
  return {
    sentences: next.sentences.map((s) => ({
      ...s,
      tasks: s.tasks.map((t) => ({
        ...t,
        done: doneKeys.has(`${t.action.toLocaleLowerCase("pl")}|${t.time}`),
      })),
    })),
  };
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}
