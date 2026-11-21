// Daty jako "YYYY-MM-DD" (czas lokalny) + pomocnicze funkcje kalendarza.
import type { Task } from "@/api";
import type { Note } from "@/storage";

export const pad = (n: number) => String(n).padStart(2, "0");

export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayIso = () => isoDay(new Date());

export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/** Dzień utworzenia czatu (lokalnie). */
export const noteDay = (note: Note) => isoDay(new Date(note.createdAt));

/** Dzień zadania; bez daty = dzień utworzenia czatu (tak samo robi backend). */
export const taskDay = (task: Task, note: Note) => task.date ?? noteDay(note);

export function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}.${m}`;
}

export function relativeDayName(day: string): string | null {
  const t = todayIso();
  if (day === t) return "Dziś";
  if (day === addDays(t, 1)) return "Jutro";
  if (day === addDays(t, -1)) return "Wczoraj";
  return null;
}

/** "Jutro · niedziela, 22.11.2026" / "Poniedziałek, 24.11.2026" */
export function dayLabel(day: string): string {
  const d = parseDay(day);
  const weekday = d.toLocaleDateString("pl-PL", { weekday: "long" });
  const full = `${weekday}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const rel = relativeDayName(day);
  return rel ? `${rel} · ${full}` : full.charAt(0).toUpperCase() + full.slice(1);
}

export function monthLabel(year: number, month: number): string {
  const s = new Date(year, month, 1).toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const WEEKDAYS_SHORT = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

/** Tygodnie (od poniedziałku) obejmujące dany miesiąc; dni jako "YYYY-MM-DD". */
export function monthWeeks(year: number, month: number): string[][] {
  const weekdayMon0 = (d: Date) => (d.getDay() + 6) % 7; // pon = 0 … nd = 6
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cur = new Date(year, month, 1 - weekdayMon0(first));
  const end = new Date(year, month + 1, 0 + (6 - weekdayMon0(last)));
  const weeks: string[][] = [];
  while (cur <= end) {
    if (weekdayMon0(cur) === 0) weeks.push([]);
    weeks[weeks.length - 1].push(isoDay(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return weeks;
}

export const monthOf = (day: string) => {
  const [y, m] = day.split("-").map(Number);
  return { year: y, month: m - 1 };
};

/** "10:00–11:00", "10:00", "cały dzień" */
export function timeRange(task: Task): string {
  if (!task.start) return "cały dzień";
  return task.end && task.end !== task.start ? `${task.start}–${task.end}` : task.start;
}

// --- indeks: dzień -> zadania ze wszystkich czatów ---

export interface CalendarEntry {
  task: Task;
  note: Note;
  day: string;
}

/** Zadania po dniach; w obrębie dnia po godzinie (cały dzień na górze). */
export function buildCalendarIndex(notes: Note[]): Map<string, CalendarEntry[]> {
  const map = new Map<string, CalendarEntry[]>();
  for (const note of notes) {
    for (const task of note.result?.tasks ?? []) {
      const day = taskDay(task, note);
      const list = map.get(day) ?? [];
      list.push({ task, note, day });
      map.set(day, list);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.task.start ?? "00:00").localeCompare(b.task.start ?? "00:00"));
  }
  return map;
}
