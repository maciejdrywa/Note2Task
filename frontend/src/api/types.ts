// Kontrakt z backendem (na razie wg Data/JSON i Data/GroundTruth).
// Zmiana formatu API = zmiana tylko w tym folderze.

/** Żądanie: notatka pocięta na zdania, jak w Data/JSON/*.json. */
export type ApiRequest = Record<string, string>; // { "zdanie1": "tekst", ... }

/** Pojedyncze zadanie w odpowiedzi, jak w Data/GroundTruth/*.json. */
export interface ApiTask {
  "czynność": string;
  godzina: string | null; // "HH:MM" albo null
}

/** Odpowiedź: zadania pogrupowane po kluczu zdania. */
export type ApiResponse = Record<string, ApiTask[]>;

// --- Model używany w UI (niezależny od nazw pól z API) ---

export interface Task {
  id: string; // stabilny w obrębie notatki, np. "zdanie1-0"
  action: string;
  time: string | null; // "HH:MM"
  done: boolean; // stan lokalny (checkbox), backend go nie zna
}

export interface SentenceResult {
  id: string; // "zdanie1"
  text: string; // treść zdania z notatki
  tasks: Task[];
}

export interface NoteResult {
  sentences: SentenceResult[];
}

export class ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
