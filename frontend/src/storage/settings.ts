import type { Theme } from "@/lib/theme";
import { getItem, setItem } from "./kv";

export interface Settings {
  /** Globalny skrót w formacie Tauri, np. "CommandOrControl+Shift+Space"; "" = wyłączony. */
  shortcut: string;
  theme: Theme;
}

export const DEFAULT_SETTINGS: Settings = {
  shortcut: "CommandOrControl+Shift+Space",
  theme: "system",
};

const KEY = "settings";

export async function loadSettings(): Promise<Settings> {
  const saved = await getItem<Partial<Settings>>(KEY);
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function saveSettings(settings: Settings): Promise<void> {
  return setItem(KEY, settings);
}
