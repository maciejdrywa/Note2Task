import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  dayLabel,
  monthLabel,
  monthOf,
  monthWeeks,
  timeRange,
  todayIso,
  WEEKDAYS_SHORT,
  type CalendarEntry,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import { displayTitle } from "@/storage";

export interface TaskRef {
  noteId: string;
  taskId: string;
}

interface Props {
  index: Map<string, CalendarEntry[]>;
  day: string;
  highlight: TaskRef | null;
  onSelectDay: (day: string) => void;
  onToggleTask: (ref: TaskRef) => void;
  onOpenNote: (noteId: string) => void;
}

const MAX_CHIPS = 3;
const isHighlighted = (e: CalendarEntry, h: TaskRef | null) => !!h && e.note.id === h.noteId && e.task.id === h.taskId;

export function CalendarView({ index, day, highlight, onSelectDay, onToggleTask, onOpenNote }: Props) {
  const { year, month } = monthOf(day);
  const today = todayIso();
  const entries = index.get(day) ?? [];
  const highlightRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlight, day]);

  const goMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    onSelectDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  };

  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
        {/* nagłówek miesiąca */}
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{monthLabel(year, month)}</h1>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => onSelectDay(today)}>
              Dziś
            </Button>
            <Button variant="ghost" size="icon" onClick={() => goMonth(-1)} aria-label="Poprzedni miesiąc">
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => goMonth(1)} aria-label="Następny miesiąc">
              <ChevronRight />
            </Button>
          </div>
        </div>

        {/* siatka miesiąca + lista dnia (obok siebie na szerokim oknie) */}
        <div className="grid items-start gap-5 @5xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
              {WEEKDAYS_SHORT.map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            {monthWeeks(year, month).map((week) => (
              <div key={week[0]} className="grid grid-cols-7 border-b last:border-b-0">
                {week.map((d) => {
                  const list = index.get(d) ?? [];
                  const inMonth = monthOf(d).month === month;
                  const selected = d === day;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onSelectDay(d)}
                      className={cn(
                        "flex min-h-20 min-w-0 flex-col gap-1 border-r p-1.5 text-left transition-colors last:border-r-0 hover:bg-accent/60",
                        !inMonth && "bg-muted/30 text-muted-foreground",
                        selected && "bg-accent ring-2 ring-ring ring-inset",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-6 place-items-center rounded-full text-xs tabular-nums",
                          d === today && "bg-primary font-semibold text-primary-foreground",
                        )}
                      >
                        {Number(d.slice(8))}
                      </span>
                      {list.slice(0, MAX_CHIPS).map((e) => (
                        <span
                          key={`${e.note.id}-${e.task.id}`}
                          className={cn(
                            "truncate rounded px-1 py-0.5 text-[11px] leading-tight",
                            e.task.done
                              ? "bg-muted text-muted-foreground line-through"
                              : "bg-primary/10 text-foreground",
                            isHighlighted(e, highlight) && "ring-1 ring-ring",
                          )}
                          title={`${timeRange(e.task)} ${e.task.action}`}
                        >
                          {e.task.start && <span className="mr-1 font-semibold tabular-nums">{e.task.start}</span>}
                          {e.task.action}
                        </span>
                      ))}
                      {list.length > MAX_CHIPS && (
                        <span className="px-1 text-[11px] text-muted-foreground">
                          +{list.length - MAX_CHIPS} więcej
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* lista wybranego dnia */}
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-3 flex items-baseline gap-2 font-semibold">
              {dayLabel(day)}
              <span className="text-sm font-normal text-muted-foreground">
                {entries.length > 0 ? `${entries.filter((e) => e.task.done).length}/${entries.length} zrobione` : ""}
              </span>
            </h2>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak zadań tego dnia.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {entries.map((e) => {
                  const hl = isHighlighted(e, highlight);
                  return (
                    <li
                      key={`${e.note.id}-${e.task.id}`}
                      ref={hl ? highlightRef : undefined}
                      className={cn(
                        "flex items-start gap-3 rounded-md bg-muted/60 px-3 py-2 text-sm",
                        hl && "bg-accent ring-2 ring-ring",
                      )}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={e.task.done}
                        onCheckedChange={() => onToggleTask({ noteId: e.note.id, taskId: e.task.id })}
                        aria-label={`Zrobione: ${e.task.action}`}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            e.task.start ? "font-semibold" : "text-muted-foreground",
                            e.task.done && "text-muted-foreground line-through",
                          )}
                        >
                          {timeRange(e.task)}
                        </span>
                        <span className={cn("break-words", e.task.done && "text-muted-foreground line-through")}>
                          {e.task.action}
                        </span>
                        {e.task.description && (
                          <span className="text-xs break-words text-muted-foreground">{e.task.description}</span>
                        )}
                        <button
                          type="button"
                          className="mt-0.5 flex max-w-full items-center gap-1 self-start rounded text-xs text-muted-foreground hover:text-foreground hover:underline"
                          onClick={() => onOpenNote(e.note.id)}
                          title="Otwórz czat"
                        >
                          <MessageSquare className="size-3 shrink-0" />
                          <span className="truncate">{displayTitle(e.note)}</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
