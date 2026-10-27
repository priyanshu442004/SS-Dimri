import Link from "next/link";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyArt } from "@/components/empty-art";

export type CalendarEvent = { date: string; label: string; href?: string; tone?: "ok" | "warn" | "danger" | "info" | "neutral"; sub?: string };

const TONE: Record<NonNullable<CalendarEvent["tone"]>, string> = {
  ok: "border-l-ok bg-ok-bg text-ok",
  warn: "border-l-warn bg-warn-bg text-warn",
  danger: "border-l-danger bg-danger-bg text-danger",
  info: "border-l-info bg-info-bg text-info",
  neutral: "border-l-line bg-subtle text-ink",
};

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Server-rendered month view. Grid on wide screens, agenda list on phones. */
export function MonthCalendar({
  month,
  events,
  hrefForMonth,
  today,
}: {
  month: string; // "YYYY-MM"
  events: CalendarEvent[];
  hrefForMonth: (m: string) => string;
  today: string; // "YYYY-MM-DD"
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => {
    const day = i - lead + 1;
    return day >= 1 && day <= days ? `${month}-${String(day).padStart(2, "0")}` : null;
  });
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const title = first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  const Item = ({ e }: { e: CalendarEvent }) => {
    const cls = clsx("block truncate rounded-md border-l-2 px-1.5 py-0.5 text-xs transition-[translate,box-shadow] duration-200", e.href && "hover:-translate-y-px hover:shadow-sm", TONE[e.tone ?? "neutral"]);
    return e.href ? <Link href={e.href} className={cls} title={e.label}>{e.label}</Link> : <span className={cls} title={e.label}>{e.label}</span>;
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(15_29_51/.04)]">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <Link href={hrefForMonth(shiftMonth(month, -1))} className="grid size-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-ink/30 hover:text-ink active:scale-95" aria-label="Previous month"><ChevronLeft className="size-4" aria-hidden /></Link>
        <h2 className="font-editorial text-xl">{title}</h2>
        <Link href={hrefForMonth(shiftMonth(month, 1))} className="grid size-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-ink/30 hover:text-ink active:scale-95" aria-label="Next month"><ChevronRight className="size-4" aria-hidden /></Link>
      </div>
      <div className="hidden md:block">
        <div className="grid grid-cols-7 border-b border-line bg-paper/60 text-center text-xs font-medium text-muted">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1.5">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => (
            <div key={i} className={clsx("min-h-24 border-b border-r border-line/70 p-1 transition-colors", !date && "bg-subtle/40", date && i % 7 >= 5 && "bg-paper/50", date && "hover:bg-paper")}>
              {date && (
                <>
                  <div className="mb-1 flex justify-end">
                    <span className={clsx("grid size-6 place-items-center rounded-full text-xs", date === today ? "bg-ink font-semibold text-paper" : "text-muted")}>{Number(date.slice(8))}</span>
                  </div>
                  <div className="space-y-0.5">
                    {(byDate.get(date) ?? []).slice(0, 4).map((e, j) => <Item key={j} e={e} />)}
                    {(byDate.get(date)?.length ?? 0) > 4 && <p className="px-1 text-[11px] text-muted">+{byDate.get(date)!.length - 4} more</p>}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <ol className="divide-y divide-line md:hidden">
        {[...byDate.keys()].sort().map((date) => (
          <li key={date} className="px-4 py-2">
            <p className="text-xs font-semibold text-muted">{new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</p>
            <div className="mt-1 space-y-1">{byDate.get(date)!.map((e, j) => <Item key={j} e={e} />)}</div>
          </li>
        ))}
        {byDate.size === 0 && <li className="flex flex-col items-center px-4 py-6 text-center text-sm text-muted"><EmptyArt kind="calendar" className="h-14 w-16" />Nothing scheduled this month.</li>}
      </ol>
    </div>
  );
}
