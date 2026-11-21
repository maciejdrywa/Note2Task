import { AlertTriangle, Loader2, Sparkles, Trash2 } from "lucide-react";
import { sampleNotes, USE_MOCK } from "@/api";
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
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { displayTitle, formatDate, isStale, type Note } from "@/storage";
import { TaskResults } from "./TaskResults";

export type ExtractStatus = { state: "idle" } | { state: "loading" } | { state: "error"; message: string };

interface Props {
  note: Note;
  status: ExtractStatus;
  onChange: (patch: Partial<Pick<Note, "title" | "text">>) => void;
  onExtract: () => void;
  onDelete: () => void;
  onToggleTask: (taskId: string) => void;
  onReorder: (order: string[] | null) => void;
}

const card = "rounded-xl border bg-card text-card-foreground p-5 shadow-sm";

export function NoteEditor({ note, status, onChange, onExtract, onDelete, onToggleTask, onReorder }: Props) {
  const loading = status.state === "loading";
  const canExtract = note.text.trim().length > 0 && !loading;
  const stale = isStale(note);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className={card}>
        <div className="mb-3 flex items-center gap-3">
          <input
            className="min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none placeholder:text-foreground/80 focus:placeholder:text-muted-foreground/60"
            value={note.title}
            placeholder={displayTitle({ ...note, title: "" })}
            onChange={(e) => onChange({ title: e.currentTarget.value })}
            aria-label="Tytuł notatki"
          />
          <span className="shrink-0 text-sm text-muted-foreground">{formatDate(note.createdAt)}</span>
        </div>

        <Textarea
          value={note.text}
          autoFocus={!note.text}
          onChange={(e) => onChange({ text: e.currentTarget.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (canExtract) onExtract();
            }
          }}
          placeholder="Np. O 14.10 po szkole skoczyć po chleb, a w południe oddać zeszyt Oli…"
          className="min-h-40 resize-y"
          aria-label="Treść notatki"
        />

        <div className="mt-3 flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                <Trash2 /> Usuń
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Usunąć notatkę?</AlertDialogTitle>
                <AlertDialogDescription>
                  „{displayTitle(note)}” zostanie usunięta razem z zadaniami. Tego nie da się cofnąć.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Anuluj</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Usuń
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {USE_MOCK && !note.text && sampleNotes.length > 0 && (
            <select
              aria-label="Wstaw przykładową notatkę"
              value=""
              className="h-8 max-w-[40%] min-w-0 rounded-md border bg-background px-2 text-sm"
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

          <KbdGroup className="ml-auto text-muted-foreground">
            <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd>
          </KbdGroup>
          <Button disabled={!canExtract} onClick={onExtract}>
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {loading ? "Analizuję…" : note.result ? "Wyciągnij ponownie" : "Wyciągnij zadania"}
          </Button>
        </div>
      </div>

      {status.state === "loading" && (
        <div className={`${card} flex items-center gap-3 text-muted-foreground`}>
          <Loader2 className="size-4 animate-spin" /> Model analizuje notatkę…
        </div>
      )}
      {status.state === "error" && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive">
          <p className="font-semibold">Nie udało się pobrać zadań.</p>
          <p className="mt-1 text-sm">{status.message}</p>
        </div>
      )}
      {note.result && status.state !== "loading" && (
        <div className={card}>
          {stale && (
            <p className="mb-4 flex items-center gap-2 rounded-md bg-warning px-3 py-2 text-sm text-warning-foreground">
              <AlertTriangle className="size-4 shrink-0" />
              Notatka zmieniła się od ostatniej analizy — wyciągnij zadania ponownie.
            </p>
          )}
          <TaskResults result={note.result} order={note.taskOrder ?? null} onToggle={onToggleTask} onReorder={onReorder} />
        </div>
      )}
    </div>
  );
}
