import { useMemo } from "react";
import { MessageSquarePlus, Search } from "lucide-react";
import { API_URL, USE_MOCK } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dayLabel, noteDay } from "@/lib/dates";
import { matchesNote, parseQuery } from "@/lib/search";
import { cn } from "@/lib/utils";
import { displayTitle, taskStats, type Note } from "@/storage";
import { MiniCalendar } from "./MiniCalendar";

interface Props {
  notes: Note[];
  activeNoteId: string | null;
  calendarDay: string | null;
  busyDays: Set<string>;
  query: string;
  onQuery: (q: string) => void;
  onSelectNote: (id: string) => void;
  onSelectDay: (day: string) => void;
  onNew: () => void;
}

export function Sidebar(props: Props) {
  const { notes, activeNoteId, calendarDay, busyDays, query, onQuery, onSelectNote, onSelectDay, onNew } = props;
  const parsed = useMemo(() => parseQuery(query), [query]);

  // czaty pogrupowane po dniu utworzenia (najnowsze na górze); pusty szkic nie jest pokazywany
  const groups = useMemo(() => {
    const visible = notes.filter((n) => (n.text.trim() || n.id === activeNoteId) && matchesNote(n, parsed));
    const map = new Map<string, Note[]>();
    for (const n of visible) {
      const day = noteDay(n);
      map.set(day, [...(map.get(day) ?? []), n]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [notes, parsed, activeNoteId]);

  return (
    <aside className="flex min-h-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-2 px-1 pt-1 font-semibold">
          <img src="/icon.svg" alt="" className="size-6" />
          <span>Note2Task</span>
          <Badge
            variant="secondary"
            className="ml-auto text-[10px] uppercase"
            title={USE_MOCK ? "Dane z ../Data (VITE_USE_MOCK=true)" : API_URL}
          >
            {USE_MOCK ? "mock" : "API"}
          </Badge>
        </div>

        <MiniCalendar busyDays={busyDays} selectedDay={calendarDay} onSelectDay={onSelectDay} />

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="bg-background pl-8"
            placeholder="Szukaj… (&09/10/2026)"
            value={query}
            onChange={(e) => onQuery(e.currentTarget.value)}
            aria-label="Szukaj czatów"
          />
        </div>
        {parsed.invalidDates.length > 0 && (
          <p className="text-xs text-warning-foreground">
            Nieznany format daty: {parsed.invalidDates.join(", ")}. Użyj np. &09/10/2026, &09/10 lub &10/2026.
          </p>
        )}

        <Button variant="outline" className="justify-start bg-background" onClick={onNew}>
          <MessageSquarePlus /> Nowy czat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {groups.map(([day, list]) => (
          <section key={day} className="mb-2">
            <h3 className="px-3 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">{dayLabel(day)}</h3>
            <ul>
              {list.map((n) => {
                const { done, total } = taskStats(n);
                const active = n.id === activeNoteId;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onSelectNote(n.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent",
                        active && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{displayTitle(n)}</span>
                      {total > 0 && (
                        <Badge
                          variant="secondary"
                          className={cn("px-1.5 py-0 tabular-nums", done === total && "bg-success text-white")}
                        >
                          {done}/{total}
                        </Badge>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {groups.length === 0 && (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            {notes.some((n) => n.text.trim()) ? "Nic nie pasuje do wyszukiwania." : "Brak czatów."}
          </p>
        )}
      </div>
    </aside>
  );
}
