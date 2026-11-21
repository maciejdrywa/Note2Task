import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowDownUp, CalendarDays, GripVertical } from "lucide-react";
import { type Task } from "@/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { dayLabel, shortDay, timeRange } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface Props {
  tasks: Task[];
  /** Dzień dla zadań bez daty (dzień utworzenia czatu). */
  fallbackDay: string;
  order: string[] | null;
  onToggle: (taskId: string) => void;
  onReorder: (order: string[] | null) => void;
  /** Kliknięcie zadania — otwiera je w kalendarzu. */
  onOpen: (task: Task) => void;
}

const dayOf = (t: Task, fallback: string) => t.date ?? fallback;

function sortTasks(tasks: Task[], fallback: string): Task[] {
  const key = (t: Task) => `${dayOf(t, fallback)} ${t.start ?? "00:00"}`;
  return [...tasks].sort((a, b) => key(a).localeCompare(key(b)));
}

function TimeLabel({ task, day }: { task: Task; day?: string }) {
  return (
    <span
      className={cn(
        "w-[6.5rem] shrink-0 text-sm tabular-nums",
        task.start ? "font-semibold text-foreground" : "text-muted-foreground",
        task.done && "text-muted-foreground line-through",
      )}
    >
      {day && <span className="mr-1.5 font-normal text-muted-foreground">{shortDay(day)}</span>}
      {timeRange(task)}
    </span>
  );
}

function TaskText({ task }: { task: Task }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className={cn("break-words", task.done && "text-muted-foreground line-through")}>{task.action}</span>
      {task.description && <span className="text-xs break-words text-muted-foreground">{task.description}</span>}
    </span>
  );
}

const rowClass = "group flex items-center gap-3 rounded-md bg-muted/60 text-sm transition-colors hover:bg-muted";

function OpenHint() {
  return (
    <CalendarDays className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
  );
}

// --- „Po dniach”: checkboxy, klik w zadanie = kalendarz ---

function ByDay({ tasks, fallbackDay, onToggle, onOpen }: Omit<Props, "order" | "onReorder">) {
  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of sortTasks(tasks, fallbackDay)) {
      const day = dayOf(t, fallbackDay);
      map.set(day, [...(map.get(day) ?? []), t]);
    }
    return [...map.entries()];
  }, [tasks, fallbackDay]);

  return (
    <div className="divide-y">
      {groups.map(([day, list]) => (
        <section key={day} className="py-3 first:pt-1 last:pb-0">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">{dayLabel(day)}</h3>
          <ul className="flex flex-col gap-1.5">
            {list.map((t) => (
              <li key={t.id} className={cn(rowClass, "pl-3")}>
                <Checkbox
                  checked={t.done}
                  onCheckedChange={() => onToggle(t.id)}
                  aria-label={`Zrobione: ${t.action}`}
                />
                <button
                  type="button"
                  onClick={() => onOpen(t)}
                  className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-3 text-left"
                  title="Pokaż w kalendarzu"
                >
                  <TimeLabel task={t} />
                  <TaskText task={t} />
                  <OpenHint />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// --- „Oś czasu”: bez checkboxów, przeciąganie ---

const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

function move(ids: string[], id: string, toIndex: number): string[] {
  const rest = ids.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, id);
  return rest;
}

function Timeline({ tasks, fallbackDay, order, onReorder, onOpen }: Omit<Props, "onToggle">) {
  const baseIds = useMemo(() => {
    const sorted = sortTasks(tasks, fallbackDay);
    if (!order) return sorted.map((t) => t.id);
    const known = order.filter((id) => tasks.some((t) => t.id === id));
    return [...known, ...sorted.filter((t) => !known.includes(t.id)).map((t) => t.id)];
  }, [tasks, fallbackDay, order]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const ids = draft ?? baseIds;
  const multiDay = new Set(tasks.map((t) => dayOf(t, fallbackDay))).size > 1;

  const commit = (next: string[]) => {
    if (!sameOrder(next, baseIds)) onReorder(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(id);
    setDraft(ids);
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!dragId || !draft) return;
    const others = draft.filter((id) => id !== dragId);
    const index = others.filter((id) => {
      const r = itemRefs.current.get(id)?.getBoundingClientRect();
      return r ? r.top + r.height / 2 < e.clientY : false;
    }).length;
    const next = move(draft, dragId, index);
    if (!sameOrder(next, draft)) setDraft(next);
  };

  const endDrag = () => {
    if (draft) commit(draft);
    setDraft(null);
    setDragId(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const i = ids.indexOf(id);
    commit(move(ids, id, e.key === "ArrowUp" ? i - 1 : i + 1));
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">Przeciągnij za uchwyt, żeby zmienić kolejność</span>
        {order && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onReorder(null)}>
            <ArrowDownUp /> Sortuj po czasie
          </Button>
        )}
      </div>
      <ul className={cn("flex flex-col gap-1.5", dragId && "cursor-grabbing select-none")}>
        {ids.map((id) => {
          const t = byId.get(id);
          if (!t) return null;
          const dragging = id === dragId;
          return (
            <li
              key={id}
              ref={(el) => {
                if (el) itemRefs.current.set(id, el);
                else itemRefs.current.delete(id);
              }}
              className={cn(rowClass, "border border-transparent pl-1", dragging && "border-ring bg-accent shadow-md")}
            >
              <button
                type="button"
                className={cn(
                  "grid shrink-0 touch-none place-items-center rounded p-1 text-muted-foreground outline-none select-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  dragging ? "cursor-grabbing" : "cursor-grab",
                )}
                aria-label={`Przesuń: ${t.action} (strzałki góra/dół)`}
                title="Przeciągnij albo użyj strzałek ↑ ↓"
                onPointerDown={(e) => onPointerDown(e, id)}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) => onKeyDown(e, id)}
              >
                <GripVertical className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => onOpen(t)}
                className="flex min-w-0 flex-1 items-center gap-3 py-1.5 pr-3 text-left"
                title="Pokaż w kalendarzu"
              >
                <TimeLabel task={t} day={multiDay ? dayOf(t, fallbackDay) : undefined} />
                <TaskText task={t} />
                <OpenHint />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function TaskResults(props: Props) {
  const [view, setView] = useState<"days" | "timeline">("days");
  const { tasks } = props;
  const done = tasks.filter((t) => t.done).length;

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">Nie znaleziono żadnych zadań w tej notatce.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Zrobione{" "}
          <span className={cn("ml-1 tabular-nums", done === tasks.length ? "text-success" : "text-foreground")}>
            {done}/{tasks.length}
          </span>
        </h2>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={view}
          onValueChange={(v) => v && setView(v as typeof view)}
        >
          <ToggleGroupItem value="days" className="px-3 text-xs">
            Po dniach
          </ToggleGroupItem>
          <ToggleGroupItem value="timeline" className="px-3 text-xs">
            Oś czasu
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {view === "days" ? <ByDay {...props} /> : <Timeline {...props} />}
    </div>
  );
}
