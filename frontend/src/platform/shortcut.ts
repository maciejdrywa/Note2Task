// Globalny skrót + schowek. Działa tylko w aplikacji Tauri.
import { isTauri } from "@tauri-apps/api/core";

export const shortcutsSupported = isTauri();

/** Rejestruje skrót; zwraca funkcję wyrejestrowującą. Rzuca błąd, gdy skrót jest zajęty/niepoprawny. */
export async function registerGlobalShortcut(accelerator: string, onPressed: () => void): Promise<() => void> {
  const { register, unregister, isRegistered } = await import("@tauri-apps/plugin-global-shortcut");
  // po przeładowaniu strony (HMR) skrót może zostać zarejestrowany po stronie Rusta
  if (await isRegistered(accelerator).catch(() => false)) await unregister(accelerator).catch(() => {});
  await register(accelerator, (e) => {
    if (e.state === "Pressed") onPressed();
  });
  return () => {
    unregister(accelerator).catch(() => {});
  };
}

export async function readClipboardText(): Promise<string> {
  const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
  try {
    return (await readText()) ?? "";
  } catch {
    return ""; // schowek pusty lub nie-tekstowy
  }
}

export async function focusMainWindow(): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const w = getCurrentWindow();
  await w.unminimize().catch(() => {});
  await w.show().catch(() => {});
  await w.setFocus().catch(() => {});
}

// --- Zapis skrótu: KeyboardEvent <-> format Tauri ("CommandOrControl+Shift+Space") ---

const MODIFIER_CODES = new Set(["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"]);

function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  const map: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
  };
  return map[code] ?? null;
}

/** null = jeszcze niekompletny skrót (sam modyfikator) albo niedozwolony klawisz. */
export function acceleratorFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  const key = keyFromCode(e.code);
  if (!key) return null;
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("CommandOrControl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  // wymagamy modyfikatora innego niż sam Shift, żeby nie przejąć zwykłego pisania
  const isFKey = /^F\d+$/.test(key);
  if (!isFKey && !mods.some((m) => m !== "Shift")) return null;
  return [...mods, key].join("+");
}

export function formatAccelerator(acc: string): string {
  if (!acc) return "wyłączony";
  return acc.replace("CommandOrControl", "Ctrl").split("+").join(" + ");
}
