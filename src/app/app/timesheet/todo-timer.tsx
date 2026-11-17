"use client";

import { useEffect, useState } from "react";

/** Live "1 h 05 min" for a running to-do timer: minutes already timed plus the running stretch. */
export function Elapsed({ since, base }: { since: string | null; base: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [since]);
  const total = base + (since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000)) : 0);
  const h = Math.floor(total / 60);
  return <span className="tabular-nums">{h ? `${h} h ` : ""}{String(total % 60).padStart(h ? 2 : 1, "0")} min</span>;
}
