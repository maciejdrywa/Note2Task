import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthLabel, monthOf, monthWeeks, todayIso, WEEKDAYS_SHORT } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface Props {
  /** Dni, w których są zadania (kropka). */
  busyDays: Set<string>;
  /** Wybrany dzień (gdy otwarty jest duży kalendarz). */
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}

/** Mały kalendarz w pasku bocznym; kliknięcie dnia otwiera duży kalendarz. */
export function MiniCalendar({ busyDays, selectedDay, onSelectDay }: Props) {
  const [{ year, month }, setMonth] = useState(() => monthOf(selectedDay ?? todayIso()));
  const today = todayIso();

  // gdy duży kalendarz przejdzie na inny miesiąc, mały podąża za nim
  useEffect(() => {
    if (selectedDay) setMonth(monthOf(selectedDay));
  }, [selectedDay]);

  const shift = (delta: number) =>
    setMonth(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  return (
    <div className="rounded-lg border bg-background p-2">
      <div className="mb-1 flex items-center justify-between">
        <Button variant="ghost" size="icon" className="size-7" onClick={() => shift(-1)} aria-label="Poprzedni miesiąc">
          <ChevronLeft />
        </Button>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-sm font-medium hover:bg-accent"
          onClick={() => onSelectDay(selectedDay && monthOf(selectedDay).month === month ? selectedDay : today)}
          title="Otwórz kalendarz"
        >
          {monthLabel(year, month)}
        </button>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => shift(1)} aria-label="Następny miesiąc">
          <ChevronRight />
        </Button>
      </div>

      <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
        {WEEKDAYS_SHORT.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      {monthWeeks(year, month).map((week) => (
        <div key={week[0]} className="grid grid-cols-7">
          {week.map((day) => {
            const inMonth = monthOf(day).month === month;
            const selected = day === selectedDay;
            return (
              <button
                key={day}
                type="button"
                onClick={() => onSelectDay(day)}
                className={cn(
                  "relative mx-auto my-0.5 grid size-7 place-items-center rounded-md text-xs tabular-nums transition-colors hover:bg-accent",
                  !inMonth && "text-muted-foreground/50",
                  day === today && !selected && "font-bold ring-1 ring-ring",
                  selected && "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {Number(day.slice(8))}
                {busyDays.has(day) && (
                  <span
                    className={cn(
                      "absolute bottom-0.5 size-1 rounded-full",
                      selected ? "bg-primary-foreground" : "bg-foreground/70",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
