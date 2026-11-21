import { useEffect, useState } from "react";
import { Monitor, Moon, PanelBottom, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Theme } from "@/lib/theme";
import { acceleratorFromEvent, shortcutsSupported } from "@/platform/shortcut";
import { DEFAULT_SETTINGS, type Settings } from "@/storage";

interface Props {
  settings: Settings;
  shortcutError: string | null;
  onChange: (s: Settings) => void;
}

function ShortcutKeys({ accelerator }: { accelerator: string }) {
  if (!accelerator) return <span className="text-sm text-muted-foreground">wyłączony</span>;
  const keys = accelerator.replace("CommandOrControl", "Ctrl").split("+");
  return (
    <KbdGroup>
      {keys.map((k, i) => (
        <Kbd key={i}>{k}</Kbd>
      ))}
    </KbdGroup>
  );
}

/** Zawartość popovera ustawień (prawy dolny róg). */
export function SettingsPanel({ settings, shortcutError, onChange }: Props) {
  const [recording, setRecording] = useState(false);

  // nagrywanie skrótu: przechwytujemy klawisze przed resztą aplikacji (także Esc popovera)
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const acc = acceleratorFromEvent(e);
      if (acc) {
        onChange({ ...settings, shortcut: acc });
        setRecording(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, settings, onChange]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-semibold">Ustawienia</h2>

      <section className="flex flex-col gap-2">
        <div className="text-sm font-medium">Motyw</div>
        <ToggleGroup
          type="single"
          variant="outline"
          value={settings.theme}
          onValueChange={(v) => v && onChange({ ...settings, theme: v as Theme })}
          className="w-full"
        >
          <ToggleGroupItem value="system" className="flex-1">
            <Monitor /> System
          </ToggleGroupItem>
          <ToggleGroupItem value="light" className="flex-1">
            <Sun /> Jasny
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" className="flex-1">
            <Moon /> Ciemny
          </ToggleGroupItem>
        </ToggleGroup>
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <div className="text-sm font-medium">Skrót: notatka ze schowka</div>
        <p className="text-xs text-muted-foreground">
          Skopiuj tekst (Ctrl+C) w dowolnym programie i wciśnij skrót — powstanie nowa notatka i od razu wyciągną się z
          niej zadania.
        </p>
        <div className="flex min-h-8 items-center">
          {recording ? (
            <span className="rounded-md border border-ring px-2 py-1 text-sm">Wciśnij kombinację…</span>
          ) : (
            <ShortcutKeys accelerator={settings.shortcut} />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setRecording((r) => !r)}>
            {recording ? "Anuluj" : "Zmień"}
          </Button>
          {!recording && settings.shortcut !== DEFAULT_SETTINGS.shortcut && (
            <Button variant="ghost" size="sm" onClick={() => onChange({ ...settings, shortcut: DEFAULT_SETTINGS.shortcut })}>
              Domyślny
            </Button>
          )}
          {!recording && settings.shortcut && (
            <Button variant="ghost" size="sm" onClick={() => onChange({ ...settings, shortcut: "" })}>
              Wyłącz
            </Button>
          )}
        </div>
        {recording && <p className="text-xs text-muted-foreground">Wymagany Ctrl lub Alt (albo F1–F24). Esc anuluje.</p>}
        {shortcutError && <p className="text-xs text-destructive">{shortcutError}</p>}
        {!shortcutsSupported && (
          <p className="text-xs text-muted-foreground">Skrót działa tylko w aplikacji desktopowej (npm run tauri dev).</p>
        )}
      </section>

      <Separator />

      <section className="flex gap-2 text-xs text-muted-foreground">
        <PanelBottom className="mt-0.5 size-4 shrink-0" />
        <p>
          Zamknięcie okna (✕) chowa Note2Task do zasobnika obok zegara — aplikacja i skrót działają dalej. Okno
          przywrócisz klikając ikonę, a całkowicie zamkniesz przez jej menu → <strong>Zakończ</strong>.
        </p>
      </section>
    </div>
  );
}
