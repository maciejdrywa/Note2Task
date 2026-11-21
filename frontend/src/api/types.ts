// Kontrakt z backendem (ustalony z backendem 21.11.2026).
// Zmiana formatu API = zmiana tylko w tym folderze.
//
//   POST {VITE_API_URL}/extract
//   body:     { "tekst": "cała notatka" }
//   response: ApiEvent[]  (format jak wydarzenia Google Calendar)

export interface ApiRequest {
  tekst: string;
}

export interface ApiEventTime {
  dateTime?: string | null; // "2026-11-22T10:00:00+01:00"
  date?: string | null; // "2026-11-22" — wydarzenie całodniowe / bez godziny
  timeZone?: string | null; // "Europe/Warsaw"
}

export interface ApiEvent {
  summary: string;
  description: string | null;
  start: ApiEventTime | null;
  end: ApiEventTime | null;
}

export type ApiResponse = ApiEvent[];

// --- Model używany w UI (niezależny od nazw pól z API) ---

export interface Task {
  id: string; // stabilny w obrębie notatki
  action: string;
  description: string | null;
  date: string | null; // "YYYY-MM-DD"
  start: string | null; // "HH:MM"
  end: string | null; // "HH:MM"
  done: boolean; // stan lokalny (checkbox), backend go nie zna
}

export interface NoteResult {
  tasks: Task[];
}

export class ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
