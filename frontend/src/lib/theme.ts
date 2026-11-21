// Motyw: klasa .dark na <html>. "system" śledzi ustawienie systemu na bieżąco.
// Kopia w localStorage pozwala ustawić motyw przed startem Reacta (skrypt w index.html) — bez mignięcia.
export type Theme = "system" | "light" | "dark";

const CACHE_KEY = "note2task:theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");
let unsubscribe: (() => void) | null = null;

function setDark(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  unsubscribe?.();
  unsubscribe = null;

  if (theme === "system") {
    setDark(media.matches);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    media.addEventListener("change", onChange);
    unsubscribe = () => media.removeEventListener("change", onChange);
  } else {
    setDark(theme === "dark");
  }

  try {
    localStorage.setItem(CACHE_KEY, theme);
  } catch {
    /* ignore */
  }
}
