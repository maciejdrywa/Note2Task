import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  ListTodo,
  MessageSquarePlus,
  Pencil,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { sampleNotes, USE_MOCK, type Task } from "@/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { dayLabel, noteDay, relativeDayName, shortDay, taskDay } from "@/lib/dates";
import { displayTitle, isStale, taskStats, type Note } from "@/storage";
import { TaskResults } from "./TaskResults";
import { ThinkingIndicator } from "./ThinkingIndicator";

export type ExtractStatus =
  | { state: "idle" }
  | { state: "loading"; startedAt: number }
  | { state: "error"; message: string }
  | { state: "cancelled" };
export type ChatTab = "chat" | "tasks";

interface Props {
  note: Note;
  status: ExtractStatus;
  tab: ChatTab;
  onTab: (tab: ChatTab) => void;
  onChange: (patch: Partial<Pick<Note, "title" | "text">>) => void;
  onAnalyze: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onNew: () => void;
  onToggleTask: (taskId: string) => void;
  onReorder: (order: string[] | null) => void;
  onOpenTask: (task: Task) => void;
}

function plural(n: number) {
  if (n === 1) return "zadanie";
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "zadania" : "zadań";
}

function AssistantAvatar() {
  return (
    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
      <Sparkles className="size-4" />
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
        {text}
      </div>
    </div>
  );
}

/** Odpowiedź po analizie: podsumowanie + przejście do zakładki Zadania. */
function ResultReply({ note, onShow }: { note: Note; onShow: () => void }) {
  const tasks = note.result?.tasks ?? [];
  const days = [...new Set(tasks.map((t) => taskDay(t, note)))].sort();
  const daysText = days.map((d) => relativeDayName(d)?.toLowerCase() ?? shortDay(d)).join(", ");

  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="flex flex-col items-start gap-2 pt-1 text-sm">
        {tasks.length > 0 ? (
          <p>
            Znalazłem <strong>{tasks.length}</strong> {plural(tasks.length)}
            {daysText && <> na: {daysText}</>}.
          </p>
        ) : (
          <p>Nie znalazłem w tej notatce żadnych zadań z terminem.</p>
        )}
        {tasks.length > 0 && (
          <Button size="sm" variant="secondary" onClick={onShow}>
            <ListTodo /> Pokaż zadania
          </Button>
        )}
      </div>
    </div>
  );
}

function ErrorReply({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex gap-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
        <AlertTriangle className="size-4" />
      </div>
      <div className="flex flex-col items-start gap-2 pt-1 text-sm">
        <p className="font-medium text-destructive">Nie udało się przeanalizować notatki.</p>
        <p className="text-muted-foreground">{message}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCcw /> Spróbuj ponownie
        </Button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-10 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
        <Sparkles className="size-6" />
      </div>
      <h2 className="text-xl font-semibold">Co masz do zrobienia?</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Wpisz albo wklej notatkę, a wyciągnę z niej zadania z terminami i dodam je do kalendarza.
      </p>
    </div>
  );
}

export function ChatView(props: Props) {
  const { note, status, tab, onTab, onChange, onAnalyze, onCancel, onDelete, onNew } = props;
  const [editing, setEditing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loading = status.state === "loading";
  const analyzed = note.extractedText !== null;
  const showComposer = !loading && (!analyzed || editing);
  const canAnalyze = note.text.trim().length > 0 && !loading;
  const { total } = taskStats(note);

  // przewijanie na dół przy nowych „wiadomościach”
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [status.state, analyzed]);

  const analyze = () => {
    if (!canAnalyze) return;
    setEditing(false);
    onAnalyze();
  };

  const cancelEdit = () => {
    onChange({ text: note.extractedText ?? note.text });
    setEditing(false);
  };

  return (
    <Tabs value={tab} onValueChange={(v) => onTab(v as ChatTab)} className="flex h-full min-h-0 flex-col gap-0">
      {/* nagłówek */}
      <header className="flex items-center gap-3 border-b bg-background px-6 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <input
            className="min-w-0 bg-transparent text-base font-semibold outline-none placeholder:text-foreground/80 focus:placeholder:text-muted-foreground/60"
            value={note.title}
            placeholder={displayTitle({ ...note, title: "" })}
            onChange={(e) => onChange({ title: e.currentTarget.value })}
            aria-label="Nazwa czatu"
          />
          <span className="text-xs text-muted-foreground">{dayLabel(noteDay(note))}</span>
        </div>

        <TabsList>
          <TabsTrigger value="chat">Czat</TabsTrigger>
          <TabsTrigger value="tasks" disabled={!note.result}>
            Zadania
            {total > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 tabular-nums">
                {total}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label="Usuń czat">
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Usunąć czat?</AlertDialogTitle>
              <AlertDialogDescription>
                „{displayTitle(note)}” zostanie usunięty razem z zadaniami (znikną też z kalendarza). Tego nie da się
                cofnąć.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anuluj</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDelete}>
                Usuń
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </header>

      {/* zakładka: czat */}
      <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-6">
            {!analyzed && status.state === "idle" && <EmptyState />}

            {(loading || analyzed) && <UserBubble text={loading ? note.text : (note.extractedText ?? "")} />}

            {status.state === "loading" && <ThinkingIndicator startedAt={status.startedAt} />}
            {status.state === "cancelled" && (
              <div className="flex flex-1 flex-col items-center justify-end gap-1 pb-2 text-center text-sm text-muted-foreground">
                <Square className="size-4" />
                Analiza zatrzymana. Możesz poprawić notatkę i spróbować ponownie.
              </div>
            )}
            {!loading && status.state === "error" && <ErrorReply message={status.message} onRetry={analyze} />}
            {!loading && status.state !== "error" && analyzed && (
              <ResultReply note={note} onShow={() => onTab("tasks")} />
            )}
          </div>
        </div>

        {/* kompozytor */}
        {/* pr-16: miejsce na przycisk ustawień w prawym dolnym rogu */}
        <div className="border-t bg-background py-4 pr-16 pl-6">
          <div className="mx-auto w-full max-w-2xl">
            {showComposer ? (
              <div className="rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
                <Textarea
                  value={note.text}
                  autoFocus
                  onChange={(e) => onChange({ text: e.currentTarget.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      analyze();
                    }
                  }}
                  placeholder="Np. Jutro o 10 idę do sklepu, a wieczorem o 19 kolacja…"
                  className="max-h-60 min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                  aria-label="Treść notatki"
                />
                <div className="flex items-center gap-2 px-1 pt-1">
                  {USE_MOCK && !note.text && sampleNotes.length > 0 && (
                    <select
                      aria-label="Wstaw przykładową notatkę"
                      value=""
                      className="h-8 max-w-[45%] min-w-0 rounded-md border bg-background px-2 text-xs"
                      onChange={(e) => {
                        const s = sampleNotes.find((n) => n.id === e.currentTarget.value);
                        if (s) onChange({ text: s.text });
                      }}
                    >
                      <option value="">Przykład…</option>
                      {sampleNotes.map((n) => (
                        <option key={n.id} value={n.id}>
                          #{n.id}: {n.text.slice(0, 40)}…
                        </option>
                      ))}
                    </select>
                  )}
                  {editing && (
                    <Button variant="ghost" size="sm" onClick={cancelEdit}>
                      Anuluj
                    </Button>
                  )}
                  <KbdGroup className="ml-auto text-muted-foreground">
                    <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd>
                  </KbdGroup>
                  <Button size="sm" disabled={!canAnalyze} onClick={analyze}>
                    Analizuj <ArrowUp />
                  </Button>
                </div>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center">
                <Button variant="outline" size="sm" onClick={onCancel}>
                  <Square className="fill-current" /> Zatrzymaj
                </Button>
              </div>
            ) : (
              !loading && (
                <div className="flex items-center justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Pencil /> Edytuj notatkę
                  </Button>
                  <Button variant="outline" size="sm" onClick={onNew}>
                    <MessageSquarePlus /> Nowy czat
                  </Button>
                </div>
              )
            )}
          </div>
        </div>
      </TabsContent>

      {/* zakładka: zadania */}
      <TabsContent value="tasks" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          {note.result && (
            <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
              {isStale(note) && (
                <p className="mb-4 flex items-center gap-2 rounded-md bg-warning px-3 py-2 text-sm text-warning-foreground">
                  <AlertTriangle className="size-4 shrink-0" />
                  Notatka zmieniła się od ostatniej analizy — przeanalizuj ją ponownie w zakładce Czat.
                </p>
              )}
              <TaskResults
                tasks={note.result.tasks}
                fallbackDay={noteDay(note)}
                order={note.taskOrder ?? null}
                onToggle={props.onToggleTask}
                onReorder={props.onReorder}
                onOpen={props.onOpenTask}
              />
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
