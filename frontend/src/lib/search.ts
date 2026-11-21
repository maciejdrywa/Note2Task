// Wyszukiwanie notatek.
//   zwykły tekst      -> tytuł, treść, nazwy i opisy zadań (wszystkie słowa muszą pasować)
//   &DD/MM/RRRR       -> data utworzenia
//   &DD/MM            -> dzień i miesiąc (dowolny rok)
//   &MM/RRRR          -> cały miesiąc
//   &RRRR             -> cały rok
//   &DD               -> dzień miesiąca
// Separator: / . lub -. Można łączyć, np. "&09/10 chleb".
import { displayTitle, type Note } from "../storage";

interface DateFilter {
  day?: number;
  month?: number;
  year?: number;
}

export interface ParsedQuery {
  words: string[];
  dates: DateFilter[];
  invalidDates: string[];
}

const norm = (s: string) =>
  s
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");

function parseDate(raw: string): DateFilter | null {
  const parts = raw.split(/[/.-]/).filter(Boolean);
  if (parts.length === 0 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  const isYear = (p: string) => p.length === 4;

  let f: DateFilter;
  if (parts.length === 3) f = { day: n[0], month: n[1], year: n[2] };
  else if (parts.length === 2) f = isYear(parts[1]) ? { month: n[0], year: n[1] } : { day: n[0], month: n[1] };
  else if (parts.length === 1) f = isYear(parts[0]) ? { year: n[0] } : { day: n[0] };
  else return null;

  if (f.day !== undefined && (f.day < 1 || f.day > 31)) return null;
  if (f.month !== undefined && (f.month < 1 || f.month > 12)) return null;
  return f;
}

export function parseQuery(query: string): ParsedQuery {
  const parsed: ParsedQuery = { words: [], dates: [], invalidDates: [] };
  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    if (token.startsWith("&")) {
      const raw = token.slice(1);
      if (!raw) continue;
      const d = parseDate(raw);
      if (d) parsed.dates.push(d);
      else parsed.invalidDates.push(token);
    } else {
      parsed.words.push(norm(token));
    }
  }
  return parsed;
}

function matchesDate(iso: string, f: DateFilter): boolean {
  const d = new Date(iso);
  return (
    (f.day === undefined || d.getDate() === f.day) &&
    (f.month === undefined || d.getMonth() + 1 === f.month) &&
    (f.year === undefined || d.getFullYear() === f.year)
  );
}

export function matchesNote(note: Note, q: ParsedQuery): boolean {
  if (!q.dates.every((f) => matchesDate(note.createdAt, f))) return false;
  if (q.words.length === 0) return true;
  const haystack = norm(
    [
      displayTitle(note),
      note.text,
      ...(note.result?.tasks.flatMap((t) => [t.action, t.description ?? ""]) ?? []),
    ].join("\n"),
  );
  return q.words.every((w) => haystack.includes(w));
}
