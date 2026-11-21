import { useCallback, useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { API_URL, extractTasks, USE_MOCK } from "@/api";
import { NoteEditor, type ExtractStatus } from "@/components/NoteEditor";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Sidebar } from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

const isEmpty = (n: Note) => !n.text.trim() && !n.title.trim();
const IDLE: ExtractStatus = { state: "idle" };

function App() {
  const [loaded, setLoaded] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      setSelectedId(initial[0].id);
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

  // --- akcje ---
  const select = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id === id || !isEmpty(n)));
    setSelectedId(id);
  }, []);

  const addNote = useCallback((text = "") => {
    const note = createNote(text);
    setNotes((prev) => [note, ...prev.filter((n) => !isEmpty(n))]);
    setSelectedId(note.id);
    setQuery("");
    return note;
  }, []);

  const extract = useCallback(
    async (id: string, textOverride?: string) => {
      const text = textOverride ?? notesRef.current.find((n) => n.id === id)?.text ?? "";
      if (!text.trim()) return;

      aborts.current.get(id)?.abort();
      const ctrl = new AbortController();
      aborts.current.set(id, ctrl);
      setStatuses((s) => ({ ...s, [id]: { state: "loading" } }));

      try {
        const result = await extractTasks(text, ctrl.signal);
        updateNote(id, (n) => ({
          ...n,
          result: carryOverDone(n.result, result),
          extractedText: text,
          taskOrder: null, // nowe zadania = nowe id, więc wracamy do sortowania po godzinie
          updatedAt: new Date().toISOString(),
        }));
        setStatuses((s) => ({ ...s, [id]: IDLE }));
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setStatuses((s) => ({ ...s, [id]: { state: "error", message: e instanceof Error ? e.message : String(e) } }));
      } finally {
        if (aborts.current.get(id) === ctrl) aborts.current.delete(id);
      }
    },
    [updateNote],
  );

  const deleteNote = useCallback((id: string) => {
    aborts.current.get(id)?.abort();
    const rest = notesRef.current.filter((n) => n.id !== id);
    const next = rest.length ? rest : [createNote()];
    setNotes(next);
    setSelectedId(next[0].id);
  }, []);

  const toggleTask = useCallback(
    (noteId: string, taskId: string) => {
      updateNote(noteId, (n) =>
        n.result
          ? {
              ...n,
              result: {
                sentences: n.result.sentences.map((s) => ({
                  ...s,
                  tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
                })),
              },
            }
          : n,
      );
    },
    [updateNote],
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

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  return (
    <TooltipProvider>
      <div className="grid h-full grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar
          notes={notes}
          selectedId={selectedId}
          query={query}
          onQuery={setQuery}
          onSelect={select}
          onNew={() => addNote()}
        />

        <main className="overflow-y-auto bg-muted/30 px-7 pt-6 pb-24">
          {selected && (
            <NoteEditor
              key={selected.id}
              note={selected}
              status={statuses[selected.id] ?? IDLE}
              onChange={(patch) => updateNote(selected.id, (n) => ({ ...n, ...patch, updatedAt: new Date().toISOString() }))}
              onExtract={() => extract(selected.id)}
              onDelete={() => deleteNote(selected.id)}
              onToggleTask={(taskId) => toggleTask(selected.id, taskId)}
              onReorder={(order) => updateNote(selected.id, (n) => ({ ...n, taskOrder: order }))}
            />
          )}
        </main>
      </div>

      <div className="fixed right-5 bottom-5 flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="uppercase">
              {USE_MOCK ? "mock" : "API"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{USE_MOCK ? "Dane z ../Data (VITE_USE_MOCK=true)" : API_URL}</TooltipContent>
        </Tooltip>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="rounded-full shadow-md" aria-label="Ustawienia">
              <SettingsIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-96">
            <SettingsPanel settings={settings} shortcutError={shortcutError} onChange={changeSettings} />
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}

export default App;
