import { useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { matchesNote, parseQuery } from "@/lib/search";
import { displayTitle, formatDate, taskStats, type Note } from "@/storage";

interface Props {
  notes: Note[];
  selectedId: string | null;
  query: string;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function Sidebar({ notes, selectedId, query, onQuery, onSelect, onNew }: Props) {
  const parsed = useMemo(() => parseQuery(query), [query]);
  const visible = useMemo(() => notes.filter((n) => matchesNote(n, parsed)), [notes, parsed]);

  return (
    <aside className="flex min-h-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex flex-col gap-3 p-4 pb-3">
        <div className="flex items-center gap-2 font-semibold">
          <img src="/icon.svg" alt="" className="size-6" />
          <span>Note2Task</span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="bg-background pl-8"
            placeholder="Szukaj… (&09/10/2026)"
            value={query}
            onChange={(e) => onQuery(e.currentTarget.value)}
            aria-label="Szukaj notatek"
          />
        </div>
        {parsed.invalidDates.length > 0 && (
          <p className="text-xs text-warning-foreground">
            Nieznany format daty: {parsed.invalidDates.join(", ")}. Użyj np. &09/10/2026, &09/10 lub &10/2026.
          </p>
        )}

        <Button variant="outline" className="justify-start bg-background" onClick={onNew}>
          <Plus /> Nowa notatka
        </Button>
      </div>

      <ul className="flex-1 overflow-y-auto px-2 pb-4">
        {visible.map((n) => {
          const { done, total } = taskStats(n);
          const active = n.id === selectedId;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onSelect(n.id)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                <span className={cn("truncate", active ? "font-semibold" : "font-medium")}>{displayTitle(n)}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {formatDate(n.createdAt)}
                  {total > 0 && (
                    <Badge
                      variant={done === total ? "default" : "secondary"}
                      className={cn("px-1.5 py-0 tabular-nums", done === total && "bg-success text-white")}
                    >
                      {done}/{total}
                    </Badge>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-3 py-3 text-sm text-muted-foreground">
            {notes.length === 0 ? "Brak notatek." : "Nic nie pasuje do wyszukiwania."}
          </li>
        )}
      </ul>
    </aside>
  );
}
