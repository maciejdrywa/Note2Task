import type { ApiEventTime, ApiRequest, ApiResponse, ApiScheduleResponse, NoteResult, Task } from "./types";

export function toApiRequest(note: string): ApiRequest {
  return { text: note.trim() };
}

/**
 * Data i godzina dokładnie tak, jak zapisał je backend (bez przeliczania na strefę komputera):
 * "2026-11-22T10:00:00+01:00" -> { date: "2026-11-22", time: "10:00" }.
 */
export function parseEventTime(t: ApiEventTime | null | undefined): { date: string | null; time: string | null } {
  if (!t) return { date: null, time: null };
  if (t.dateTime) {
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(t.dateTime);
    if (m) return { date: m[1], time: `${m[2]}:${m[3]}` };
  }
  if (t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) return { date: t.date, time: null };
  return { date: null, time: null };
}

/** Po dacie, potem po godzinie; brak daty / godziny na końcu. */
export function sortTasks(tasks: Task[]): Task[] {
  const key = (t: Task) => `${t.date ?? "9999-99-99"} ${t.start ?? "99:99"}`;
  return [...tasks].sort((a, b) => key(a).localeCompare(key(b)));
}

export function fromApiResponse(res: ApiResponse): NoteResult {
  if (!Array.isArray(res)) return { tasks: [] };
  const tasks = res
    .filter((e) => e && typeof e.summary === "string" && e.summary.trim())
    .map((e, i): Task => {
      const start = parseEventTime(e.start);
      const end = parseEventTime(e.end);
      return {
        id: `t${i}`,
        action: e.summary.trim(),
        description: e.description?.trim() || null,
        date: start.date ?? end.date,
        start: start.time,
        // koniec pokazujemy tylko, gdy jest tego samego dnia co start
        end: end.time && (!end.date || end.date === start.date) ? end.time : null,
        done: false,
      };
    });
  return { tasks: sortTasks(tasks) };
}

export function fromScheduleResponse(report: ApiScheduleResponse): NoteResult {
  return { ...fromApiResponse(report.results.map((result) => result.event)), schedule: report };
}
