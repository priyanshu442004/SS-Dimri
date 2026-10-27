"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { CalendarCheck2, ClipboardList, FileSpreadsheet, Lock, Users } from "lucide-react";
import { clsx } from "clsx";

// Illustrative mock-ups of the real portal modules (sample data, not client records).
const TABS = [
  { key: "clients", icon: Users, title: "Client management", text: "Registration, GSTINs, constitution and representatives, documents and approvals in one record." },
  { key: "tasks", icon: ClipboardList, title: "Task tracker", text: "Assigned work, priorities and deadlines, with maker–checker review and a full history." },
  { key: "attendance", icon: CalendarCheck2, title: "Attendance", text: "In and out times with location for onsite visits, leave requests and team attendance views." },
  { key: "timesheets", icon: FileSpreadsheet, title: "Timesheets & reports", text: "Daily work logs, pending trackers for client-side and internal follow-ups, and client reports." },
] as const;

const DWELL = 6000;

export function PortalPreview() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % TABS.length), DWELL);
    return () => clearTimeout(t);
  }, [active, auto]);

  const pick = (i: number) => {
    setAuto(false);
    setActive(i);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-center">
      <div role="tablist" aria-label="Portal modules" aria-orientation="vertical" className="grid gap-2">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            id={`pp-tab-${t.key}`}
            aria-selected={active === i}
            aria-controls="pp-panel"
            onClick={() => pick(i)}
            data-ripple
            className={clsx(
              "group relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-500 ease-[var(--ease-out-expo)]",
              active === i ? "border-paper/25 bg-paper/[0.07]" : "border-transparent hover:bg-paper/[0.04]",
            )}
          >
            <span className="flex items-center gap-3">
              <span className={clsx("grid size-9 shrink-0 place-items-center rounded-lg transition-colors duration-300", active === i ? "bg-marigold text-night" : "bg-paper/10 text-paper/70")}>
                <t.icon className="size-[18px]" aria-hidden />
              </span>
              <span className={clsx("font-medium transition-colors", active === i ? "text-paper" : "text-paper/65 group-hover:text-paper")}>{t.title}</span>
            </span>
            <span className={clsx("grid transition-[grid-template-rows,opacity] duration-500 ease-[var(--ease-out-expo)]", active === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
              <span className="overflow-hidden">
                <span className="block pl-12 pt-2 text-sm leading-relaxed text-paper/60">{t.text}</span>
              </span>
            </span>
            {active === i && auto && (
              <span aria-hidden className="pub-tab-progress absolute inset-x-0 bottom-0 h-0.5 bg-marigold" style={{ "--dur": `${DWELL}ms` } as CSSProperties} />
            )}
          </button>
        ))}
      </div>

      {/* Browser frame */}
      <div data-tilt="4" className="rounded-2xl border border-paper/15 bg-night-2 p-2 shadow-[0_40px_80px_-30px_rgb(0_0_0/.6)]">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="flex gap-1.5">{["#e86a4a", "#e3a21a", "#5aa874"].map((c) => <span key={c} className="size-2.5 rounded-full" style={{ background: c }} />)}</span>
          <span className="mx-auto flex items-center gap-1.5 rounded-md bg-paper/[0.06] px-3 py-1 font-mono text-[11px] text-paper/50">
            <Lock className="size-3" aria-hidden /> portal · {TABS[active].key}
          </span>
        </div>
        <div id="pp-panel" role="tabpanel" aria-labelledby={`pp-tab-${TABS[active].key}`} className="relative min-h-[320px] overflow-hidden rounded-xl bg-paper p-4 text-ink sm:p-5">
          <div key={active} className="pub-swap">
            {active === 0 && <ClientsMock />}
            {active === 1 && <TasksMock />}
            {active === 2 && <AttendanceMock />}
            {active === 3 && <TimesheetMock />}
          </div>
          <p className="absolute bottom-2 right-3 font-mono text-[10px] text-muted">Illustrative preview · sample data</p>
        </div>
      </div>
    </div>
  );
}

const Row = ({ i, children, className }: { i: number; children: React.ReactNode; className?: string }) => (
  <div className={className} style={{ animation: `pub-in 600ms var(--ease-out-expo) ${120 + i * 70}ms both` }}>{children}</div>
);

function ClientsMock() {
  return (
    <div className="space-y-3">
      <Row i={0} className="flex items-center justify-between">
        <div>
          <p className="font-editorial text-2xl">Mehra Fabrication Works</p>
          <p className="text-xs text-muted">Partnership firm · Manufacturing</p>
        </div>
        <span className="rounded-full bg-ledger-soft px-2.5 py-1 text-xs font-medium text-ledger">Active</span>
      </Row>
      <Row i={1} className="grid gap-2 sm:grid-cols-3">
        {[["GSTIN", "07AAxxx••••1Z5"], ["PAN", "AAxxx••••K"], ["Constitution", "Partnership"]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-ink/10 bg-surface p-2.5">
            <p className="text-[10px] uppercase text-muted">{k}</p>
            <p className="mt-0.5 font-mono text-xs">{v}</p>
          </div>
        ))}
      </Row>
      <Row i={2} className="rounded-lg border border-ink/10 bg-surface p-3">
        <p className="text-xs font-medium">Partners</p>
        <div className="mt-2 flex -space-x-2">
          {["RM", "SK", "AJ"].map((n, i) => (
            <span key={n} className="grid size-8 place-items-center rounded-full border-2 border-surface text-[11px] font-semibold text-paper" style={{ background: ["#3a6ea5", "#d9531f", "#2f6b4f"][i] }}>{n}</span>
          ))}
        </div>
      </Row>
      <Row i={3} className="flex flex-wrap gap-2">
        {["GST certificate.pdf", "Udyam.pdf", "PO-2026-14.pdf"].map((d) => (
          <span key={d} className="rounded-md bg-paper-2 px-2 py-1 font-mono text-[11px] text-muted">{d}</span>
        ))}
      </Row>
    </div>
  );
}

function TasksMock() {
  const cols = [
    { h: "Maker", items: [["GSTR-1 · Oct", "Due 11 Nov"], ["Bank reco · Sep", "In progress"]] },
    { h: "Checker", items: [["TDS 26Q · Q2", "Under review"]] },
    { h: "Done", items: [["GSTR-3B · Sep", "Approved"], ["DSC renewal", "Closed"]] },
  ];
  return (
    <div>
      <Row i={0}><p className="font-editorial text-2xl">This week</p></Row>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {cols.map((c, ci) => (
          <Row key={c.h} i={ci + 1} className="rounded-lg bg-paper-2/70 p-2">
            <p className="px-1 text-[11px] font-semibold text-muted">{c.h}</p>
            <div className="mt-2 space-y-2">
              {c.items.map(([t, s]) => (
                <div key={t} className="rounded-md border border-ink/10 bg-surface p-2 shadow-sm">
                  <p className="text-xs font-medium">{t}</p>
                  <p className={clsx("mt-1 text-[10px]", ci === 2 ? "text-ledger" : ci === 1 ? "text-stamp" : "text-muted")}>{s}</p>
                </div>
              ))}
            </div>
          </Row>
        ))}
      </div>
    </div>
  );
}

function AttendanceMock() {
  // October 2026 starts on a Thursday.
  const marks: Record<number, string> = { 2: "h", 4: "o", 11: "o", 18: "o", 25: "o", 14: "l", 20: "s", 21: "s" };
  return (
    <div>
      <Row i={0} className="flex items-center justify-between">
        <p className="font-editorial text-2xl">October</p>
        <span className="rounded-md bg-ink px-2.5 py-1 text-xs text-paper">Marked in · 9:34</span>
      </Row>
      <Row i={1} className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-muted">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </Row>
      <Row i={2} className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: 3 }, (_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: 31 }, (_, i) => {
          const d = i + 1;
          const m = marks[d];
          return (
            <span key={d} className={clsx("grid aspect-square place-items-center rounded-md text-[11px]",
              d > 27 ? "text-ink/30" : m === "o" ? "bg-paper-2 text-muted" : m === "l" ? "bg-info-bg text-info" : m === "s" ? "bg-marigold-soft text-[#8a5a00]" : m === "h" ? "bg-paper-2 text-muted" : "bg-ledger-soft text-ledger")}>
              {d}
            </span>
          );
        })}
      </Row>
      <Row i={3} className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted">
        <span className="flex items-center gap-1"><i className="size-2 rounded-sm bg-ledger-soft" /> Present</span>
        <span className="flex items-center gap-1"><i className="size-2 rounded-sm bg-marigold-soft" /> On-site</span>
        <span className="flex items-center gap-1"><i className="size-2 rounded-sm bg-info-bg" /> Leave</span>
      </Row>
    </div>
  );
}

function TimesheetMock() {
  const bars = [["Mon", 7.5], ["Tue", 8], ["Wed", 6], ["Thu", 8.5], ["Fri", 7], ["Sat", 4]] as const;
  return (
    <div>
      <Row i={0} className="flex items-end justify-between">
        <p className="font-editorial text-2xl">Hours by day</p>
        <p className="font-mono text-xs text-muted">41.0 h</p>
      </Row>
      <Row i={1} className="mt-4 flex h-36 items-end gap-3 border-b border-ink/15 px-1">
        {bars.map(([d, h], i) => (
          <div key={d} className="flex flex-1 flex-col items-center gap-1">
            <span className="font-mono text-[10px] text-muted">{h}</span>
            <span className="w-full origin-bottom rounded-t-md bg-ink" style={{ height: `${(h / 9) * 100}px`, animation: `pub-bar 900ms var(--ease-out-expo) ${200 + i * 80}ms both` }} />
          </div>
        ))}
      </Row>
      <Row i={2} className="mt-1 flex gap-3 px-1">
        {bars.map(([d]) => <span key={d} className="flex-1 text-center text-[10px] text-muted">{d}</span>)}
      </Row>
      <Row i={3} className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <span className="rounded-md bg-surface p-2">Pending · client side <b className="float-right">3</b></span>
        <span className="rounded-md bg-surface p-2">Pending · internal <b className="float-right">5</b></span>
      </Row>
    </div>
  );
}
