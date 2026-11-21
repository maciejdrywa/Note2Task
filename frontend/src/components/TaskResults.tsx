import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowDownUp, GripVertical } from "lucide-react";
import { sortByTime, type NoteResult, type Task } from "@/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface Props {
  result: NoteResult;
  order: string[] | null;
  onToggle: (taskId: string) => void;
  onReorder: (order: string[] | null) => void;
}

function Time({ task }: { task: Task }) {
  return (
    <span
      className={cn(
        "shrink-0 tabular-nums",
        task.time ? "font-semibold text-foreground" : "text-muted-foreground",
        task.done && "text-muted-foreground line-through",
      )}
    >
      {task.time ?? "--:--"}
    </span>
  );
}

function Action({ task }: { task: Task }) {
  return (
    <span className={cn("min-w-0 break-words", task.done && "text-muted-foreground line-through")}>{task.action}</span>
  );
}

function TaskItem({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 rounded-md bg-muted/60 px-3 py-2 text-sm transition-colors hover:bg-muted">
        <Checkbox checked={task.done} onCheckedChange={() => onToggle(task.id)} />
        <Time task={task} />
        <Action task={task} />
      </label>
    </li>
  );
}

/** Zadania wg zapisanej kolejności; nowe / nieznane id na końcu (po godzinie). */
function orderTasks(tasks: Task[], order: string[] | null): Task[] {
  if (!order) return sortByTime(tasks);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ordered = order.map((id) => byId.get(id)).filter((t): t is Task => !!t);
  const rest = sortByTime(tasks.filter((t) => !order.includes(t.id)));
  return [...ordered, ...rest];
}

const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

function move(ids: string[], id: string, toIndex: number): string[] {
  const rest = ids.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, id);
  return rest;
}

/** Oś czasu: bez checkboxów, kolejność zmieniana przeciąganiem (uchwyt) lub strzałkami ↑/↓. */
function Timeline({ tasks, order, onReorder }: { tasks: Task[]; order: string[] | null; onReorder: Props["onReorder"] }) {
  const baseIds = useMemo(() => orderTasks(tasks, order).map((t) => t.id), [tasks, order]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const ids = draft ?? baseIds;

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
    // nowa pozycja = liczba pozostałych elementów, których środek jest nad kursorem
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
            <ArrowDownUp /> Sortuj po godzinie
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
              className={cn(
                "flex items-center gap-3 rounded-md border border-transparent bg-muted/60 py-1.5 pr-3 pl-1 text-sm",
                dragging && "border-ring bg-accent shadow-md",
              )}
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
              <Time task={t} />
              <Action task={t} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function TaskResults({ result, order, onToggle, onReorder }: Props) {
  const all = result.sentences.flatMap((s) => s.tasks);
  const done = all.filter((t) => t.done).length;

  if (all.length === 0) {
    return <p className="text-sm text-muted-foreground">Nie znaleziono żadnych zadań w tej notatce.</p>;
  }

  return (
    <Tabs defaultValue="sentences">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Zadania{" "}
          <span className={cn("ml-1 tabular-nums", done === all.length ? "text-success" : "text-foreground")}>
            {done}/{all.length}
          </span>
        </h2>
        <TabsList>
          <TabsTrigger value="sentences">Po zdaniach</TabsTrigger>
          <TabsTrigger value="timeline">Oś czasu</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="sentences" className="divide-y">
        {result.sentences
          .filter((s) => s.tasks.length > 0)
          .map((s) => (
            <section key={s.id} className="py-3 first:pt-1 last:pb-0">
              <p className="mb-2 text-xs text-muted-foreground">{s.text}</p>
              <ul className="flex flex-col gap-1.5">
                {s.tasks.map((t) => (
                  <TaskItem key={t.id} task={t} onToggle={onToggle} />
                ))}
              </ul>
            </section>
          ))}
      </TabsContent>

      <TabsContent value="timeline">
        <Timeline tasks={all} order={order} onReorder={onReorder} />
      </TabsContent>
    </Tabs>
  );
}
