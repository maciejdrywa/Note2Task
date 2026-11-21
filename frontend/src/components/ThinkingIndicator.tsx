import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Backend nie wysyła postępu — kroki są tylko wizualnym „myśleniem” na czas oczekiwania.
const STEPS = ["Czytam notatkę", "Szukam terminów i godzin", "Wyodrębniam czynności", "Układam zadania w kalendarzu"];
const STEP_MS = 900;

export function ThinkingIndicator() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), STEP_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex gap-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
        <Sparkles className="size-4 animate-pulse" />
      </div>
      <div className="flex flex-col gap-2 pt-1">
        <span className="thinking-shimmer text-sm font-medium">Myślę…</span>
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
      </div>
    </div>
  );
}
