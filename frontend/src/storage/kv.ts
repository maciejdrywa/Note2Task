// Prosty magazyn klucz-wartość: w aplikacji Tauri plik w danych aplikacji
// (plugin-store), w zwykłej przeglądarce (npm run dev) localStorage.
import { isTauri } from "@tauri-apps/api/core";
import type { Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "note2task.json";
const LS_PREFIX = "note2task:";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= import("@tauri-apps/plugin-store").then(({ load }) =>
    load(STORE_FILE, { defaults: {}, autoSave: 300 }),
  );
  return storePromise;
}

export async function getItem<T>(key: string): Promise<T | undefined> {
  if (isTauri()) {
    return (await (await getStore()).get<T>(key)) ?? undefined;
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  if (isTauri()) {
    await (await getStore()).set(key, value);
    return;
  }
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* brak miejsca / tryb prywatny — trudno */
  }
}
