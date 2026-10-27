"use client";

import { useSyncExternalStore } from "react";

// One shared 1-second ticker. The server snapshot is null so the first client
// render matches the server; the clock fills in right after hydration.
const ticker = {
  subscribe(cb: () => void) {
    const id = setInterval(cb, 1000);
    return () => clearInterval(id);
  },
  get: () => Math.floor(Date.now() / 1000),
  server: () => null,
};

/** Analog dial + digital time in the given time zone. */
export function LiveClock({ timeZone }: { timeZone: string }) {
  const sec = useSyncExternalStore(ticker.subscribe, ticker.get, ticker.server);
  const parts = sec === null ? null : new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone }).formatToParts(new Date(sec * 1000));
  const get = (t: string) => Number(parts?.find((p) => p.type === t)?.value ?? 0);
  const h = get("hour"), m = get("minute"), s = get("second");
  const label = parts ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(sec! * 1000)) : "––:––";
  const hand = (deg: number, len: number, w: number, color: string) => (
    <line x1="50" y1="50" x2="50" y2={50 - len} stroke={color} strokeWidth={w} strokeLinecap="round" transform={`rotate(${deg} 50 50)`}
      style={{ transition: deg === 0 ? "none" : "transform 300ms cubic-bezier(0.34,1.56,0.64,1)" }} />
  );
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="size-20 shrink-0" aria-hidden>
        <circle cx="50" cy="50" r="46" fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="2" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="50" y1="8" x2="50" y2={i % 3 === 0 ? 15 : 12} stroke="var(--color-ink)" strokeOpacity={i % 3 === 0 ? 0.8 : 0.35} strokeWidth={i % 3 === 0 ? 2.5 : 1.5} strokeLinecap="round" transform={`rotate(${i * 30} 50 50)`} />
        ))}
        {parts && hand((h % 12) * 30 + m * 0.5, 24, 4, "var(--color-ink)")}
        {parts && hand(m * 6, 34, 3, "var(--color-ink)")}
        {parts && hand(s * 6, 36, 1.5, "var(--color-stamp-bright)")}
        <circle cx="50" cy="50" r="3.5" fill="var(--color-stamp-bright)" />
      </svg>
      <div>
        <p className="font-editorial text-4xl leading-none tabular-nums" aria-live="off">{label}</p>
        <p className="mt-1 text-xs text-muted">Current time</p>
      </div>
    </div>
  );
}
