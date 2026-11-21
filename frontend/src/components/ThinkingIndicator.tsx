import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Backend nie wysyła postępu — kroki są tylko wizualnym „myśleniem” na czas oczekiwania.
const STEPS = ["Czytam notatkę", "Szukam terminów i godzin", "Wyodrębniam czynności", "Układam zadania w kalendarzu"];
const STEP_MS = 900;

/** Po tylu sekundach podpowiadamy, że lokalny model po prostu długo liczy. */
const SLOW_AFTER_S = 15;

export function ThinkingIndicator({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const elapsedMs = Math.max(0, now - startedAt);
  const seconds = Math.floor(elapsedMs / 1000);
  const step = Math.min(Math.floor(elapsedMs / STEP_MS), STEPS.length - 1);

  return (
    <div className="flex gap-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
        <Sparkles className="size-4 animate-pulse" />
      </div>
      <div className="flex flex-col gap-2 pt-1">
        <span className="flex items-baseline gap-2">
          <span className="thinking-shimmer text-sm font-medium">Myślę…</span>
          <span className="text-xs text-muted-foreground tabular-nums">{seconds} s</span>
        </span>
        <ul className="flex flex-col gap-1 border-l pl-3">
          {STEPS.slice(0, step + 1).map((s, i) => {
            const current = i === step;
            return (
              <li
                key={s}
                className={cn(
                  "flex animate-in items-center gap-2 text-xs duration-300 fade-in slide-in-from-left-1",
                  current ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {current ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                {s}
                {current && "…"}
              </li>
            );
          })}
        </ul>
        {seconds >= SLOW_AFTER_S && (
          <p className="animate-in text-xs text-muted-foreground fade-in">
            Lokalny model potrzebuje chwili — możesz poczekać albo zatrzymać analizę.
          </p>
        )}
      </div>
    </div>
  );
}
