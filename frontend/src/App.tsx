import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { EXTRACT_TIMEOUT_MS, extractTasks, type Task } from "@/api";
import { CalendarView, type TaskRef } from "@/components/CalendarView";
import { ChatView, type ChatTab, type ExtractStatus } from "@/components/ChatView";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildCalendarIndex, taskDay } from "@/lib/dates";
import { applyTheme } from "@/lib/theme";
import { focusMainWindow, readClipboardText, registerGlobalShortcut, shortcutsSupported } from "@/platform/shortcut";
import {
  carryOverDone,
  createNote,
  DEFAULT_SETTINGS,
  loadNotes,
  loadSettings,
  saveNotes,
  saveSettings,
  type Note,
  type Settings,
} from "@/storage";

/** Główne okno: czat (z zakładkami Czat / Zadania) albo duży kalendarz. */
type View =
  | { kind: "chat"; noteId: string; tab: ChatTab }
  | { kind: "calendar"; day: string; highlight: TaskRef | null };

const isEmpty = (n: Note) => !n.text.trim() && !n.title.trim();
const IDLE: ExtractStatus = { state: "idle" };

function App() {
  const [loaded, setLoaded] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [view, setView] = useState<View | null>(null);
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<Record<string, ExtractStatus>>({});
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  const notesRef = useRef(notes);
  notesRef.current = notes;
  const aborts = useRef(new Map<string, AbortController>());

  // --- wczytanie i zapis ---
  useEffect(() => {
    Promise.all([loadNotes(), loadSettings()]).then(([saved, s]) => {
      const sorted = [...saved].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const initial = sorted.length ? sorted : [createNote()];
      setNotes(initial);
      setView({ kind: "chat", noteId: initial[0].id, tab: "chat" });
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => saveNotes(notes), 300);
    return () => clearTimeout(t);
  }, [notes, loaded]);

  useEffect(() => {
    if (loaded) applyTheme(settings.theme);
  }, [settings.theme, loaded]);

  const updateNote = useCallback((id: string, fn: (n: Note) => Note) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? fn(n) : n)));
  }, []);

  /** Zmiana widoku; puste szkice czatów (poza otwieranym) są usuwane. */
  const navigate = useCallback((next: View) => {
    const keep = next.kind === "chat" ? next.noteId : null;
    setNotes((prev) => prev.filter((n) => n.id === keep || !isEmpty(n)));
    setView(next);
  }, []);

  // --- akcje ---
  const openNote = useCallback((id: string, tab: ChatTab = "chat") => navigate({ kind: "chat", noteId: id, tab }), [navigate]);

  const openDay = useCallback(
    (day: string, highlight: TaskRef | null = null) => navigate({ kind: "calendar", day, highlight }),
    [navigate],
  );

  const addNote = useCallback(
    (text = "") => {
      const note = createNote(text);
      setNotes((prev) => [note, ...prev.filter((n) => !isEmpty(n))]);
      setView({ kind: "chat", noteId: note.id, tab: "chat" });
      setQuery("");
      return note;
    },
    [],
  );

  const extract = useCallback(
    async (id: string, textOverride?: string) => {
      const text = textOverride ?? notesRef.current.find((n) => n.id === id)?.text ?? "";
      if (!text.trim()) return;

      aborts.current.get(id)?.abort();
      const ctrl = new AbortController();
      aborts.current.set(id, ctrl);
      setStatuses((s) => ({ ...s, [id]: { state: "loading", startedAt: Date.now() } }));

      // limit czasu: model nie odpowiedział -> przerywamy zapytanie
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
      }, EXTRACT_TIMEOUT_MS);

      try {
        const result = await extractTasks(text, ctrl.signal);
        updateNote(id, (n) => ({
          ...n,
          result: carryOverDone(n.result, result),
          extractedText: text,
          taskOrder: null, // nowe zadania = nowe id, więc wracamy do sortowania po czasie
          updatedAt: new Date().toISOString(),
        }));
        setStatuses((s) => ({ ...s, [id]: IDLE }));
        // po analizie: zakładka z zadaniami (jeśli użytkownik nadal jest w tym czacie)
        if (result.tasks.length > 0) {
          setView((v) => (v?.kind === "chat" && v.noteId === id ? { ...v, tab: "tasks" } : v));
        }
      } catch (e) {
        if (timedOut) {
          const message = `Brak odpowiedzi w ciągu ${Math.round(EXTRACT_TIMEOUT_MS / 1000)} s. Backend mógł zapisać wydarzenia. Sprawdź Google Calendar przed ponowieniem.`;
          setStatuses((s) => ({ ...s, [id]: { state: "error", message } }));
          return;
        }
        if (ctrl.signal.aborted) return; // zatrzymane przez użytkownika albo nowe zapytanie
        setStatuses((s) => ({ ...s, [id]: { state: "error", message: e instanceof Error ? e.message : String(e) } }));
      } finally {
        clearTimeout(timer);
        if (aborts.current.get(id) === ctrl) aborts.current.delete(id);
      }
    },
    [updateNote],
  );

  /** „Zatrzymaj”: przerywa zapytanie; poprzednie zadania (jeśli były) zostają. */
  const cancelExtract = useCallback((id: string) => {
    aborts.current.get(id)?.abort();
    aborts.current.delete(id);
    const hadResult = !!notesRef.current.find((n) => n.id === id)?.result;
    setStatuses((s) => ({ ...s, [id]: hadResult ? IDLE : { state: "cancelled" } }));
  }, []);

  const deleteNote = useCallback((id: string) => {
    aborts.current.get(id)?.abort();
    const rest = notesRef.current.filter((n) => n.id !== id && !isEmpty(n));
    const next = rest.length ? rest : [createNote()];
    setNotes(next);
    setView({ kind: "chat", noteId: next[0].id, tab: "chat" });
  }, []);

  const toggleTask = useCallback(
    ({ noteId, taskId }: TaskRef) => {
      updateNote(noteId, (n) =>
        n.result
          ? { ...n, result: { ...n.result, tasks: n.result.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)) } }
          : n,
      );
    },
    [updateNote],
  );

  const openTaskInCalendar = useCallback(
    (note: Note, task: Task) => openDay(taskDay(task, note), { noteId: note.id, taskId: task.id }),
    [openDay],
  );

  const changeSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
  }, []);

  // --- globalny skrót: notatka ze schowka ---
  const onShortcut = useRef<() => void>(() => {});
  onShortcut.current = async () => {
    const text = (await readClipboardText()).trim();
    await focusMainWindow();
    if (!text) return;
    const note = addNote(text);
    extract(note.id, text);
  };

  const shortcutChain = useRef(Promise.resolve());
  useEffect(() => {
    if (!loaded || !shortcutsSupported || !settings.shortcut) {
      setShortcutError(null);
      return;
    }
    let unregister: (() => void) | null = null;
    let cancelled = false;
    shortcutChain.current = shortcutChain.current.then(async () => {
      if (cancelled) return;
      try {
        unregister = await registerGlobalShortcut(settings.shortcut, () => onShortcut.current());
        setShortcutError(null);
      } catch (e) {
        setShortcutError(`Nie udało się ustawić skrótu (może jest zajęty przez inny program): ${String(e)}`);
      }
    });
    return () => {
      cancelled = true;
      shortcutChain.current = shortcutChain.current.then(() => unregister?.());
    };
  }, [settings.shortcut, loaded]);

  // --- kalendarz: zadania ze wszystkich czatów po dniach ---
  const calendarIndex = useMemo(() => buildCalendarIndex(notes), [notes]);
  const busyDays = useMemo(() => new Set(calendarIndex.keys()), [calendarIndex]);

  const activeNote = view?.kind === "chat" ? (notes.find((n) => n.id === view.noteId) ?? null) : null;

  return (
    <TooltipProvider>
      <div className="grid h-full grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar
          notes={notes}
          activeNoteId={activeNote?.id ?? null}
          calendarDay={view?.kind === "calendar" ? view.day : null}
          busyDays={busyDays}
          query={query}
          onQuery={setQuery}
          onSelectNote={(id) => openNote(id)}
          onSelectDay={(day) => openDay(day)}
          onNew={() => addNote()}
        />

        <main className="min-h-0 overflow-hidden bg-muted/30">
          {view?.kind === "chat" && activeNote && (
            <ChatView
              key={activeNote.id}
              note={activeNote}
              status={statuses[activeNote.id] ?? IDLE}
              tab={view.tab}
              onTab={(tab) => setView({ ...view, tab })}
              onChange={(patch) =>
                updateNote(activeNote.id, (n) => ({ ...n, ...patch, updatedAt: new Date().toISOString() }))
              }
              onAnalyze={() => extract(activeNote.id)}
              onCancel={() => cancelExtract(activeNote.id)}
              onDelete={() => deleteNote(activeNote.id)}
              onNew={() => addNote()}
              onToggleTask={(taskId) => toggleTask({ noteId: activeNote.id, taskId })}
              onReorder={(order) => updateNote(activeNote.id, (n) => ({ ...n, taskOrder: order }))}
              onOpenTask={(task) => openTaskInCalendar(activeNote, task)}
            />
          )}
          {view?.kind === "calendar" && (
            <CalendarView
              index={calendarIndex}
              day={view.day}
              highlight={view.highlight}
              onSelectDay={(day) => openDay(day)}
              onToggleTask={toggleTask}
              onOpenNote={(id) => openNote(id, "tasks")}
            />
          )}
        </main>
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="fixed right-5 bottom-5 rounded-full shadow-md"
            aria-label="Ustawienia"
          >
            <SettingsIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-96">
          <SettingsPanel settings={settings} shortcutError={shortcutError} onChange={changeSettings} />
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

export default App;
