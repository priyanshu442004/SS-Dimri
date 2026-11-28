"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { RefreshCw } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { toast } from "@/components/toaster";
import { checkRepliesAction } from "./actions";

// Keeps the Careers page up to date on its own. While the page is open (and the tab is visible) it asks
// the server every few seconds; the server reads the mailbox if nobody did in the last 20 seconds and
// answers with a fingerprint of the page's data. When that changes — a reply arrived, an email was sent
// or bounced, someone uploaded a resume — the page reloads its data in place (no full reload, no lost
// scroll or typing) and a new reply is announced. Coming back to the tab checks at once.
// "Check now" reads the mailbox straight away and always reloads the data, whatever the result.

type Live = { version: string; now: number; replies: { id: string; kind: string; submissionId: string; name: string }[]; mailbox: { configured: boolean; lastOkAt: number | null; lastError: string | null } | null };

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

export function CareersLive({ initialVersion, admin }: { initialVersion: string; admin: boolean }) {
  const router = useRouter();
  // The fingerprint of the data on screen right now: the page passes it in on every render, so it
  // only changes when fresh data has actually arrived.
  const rendered = useRef(initialVersion);
  useEffect(() => { rendered.current = initialVersion; }, [initialVersion]);
  const since = useRef(0);
  const seen = useRef(new Set<string>());
  const busy = useRef(false);
  const [state, setState] = useState<{ lastOkAt: number | null; error: string | null; configured: boolean; online: boolean }>({ lastOkAt: null, error: null, configured: true, online: true });
  const [now, setNow] = useState(0);
  const [checking, startCheck] = useTransition();

  const poll = useCallback(async () => {
    if (busy.current || document.visibilityState !== "visible") return;
    busy.current = true;
    try {
      const res = await fetch(`/api/careers/live?since=${since.current || Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Live;
      setState({ lastOkAt: data.mailbox?.lastOkAt ?? null, error: data.mailbox?.lastError ?? null, configured: data.mailbox?.configured ?? true, online: true });
      for (const r of data.replies) {
        if (seen.current.has(r.id)) continue;
        seen.current.add(r.id);
        toast(r.kind === "BOUNCE" ? `The email to ${r.name} bounced — the address does not accept mail.` : `${r.name} replied. Their details are on the page.`, r.kind === "BOUNCE" ? "warning" : "info");
      }
      if (data.replies.length) since.current = data.now;
      // Compared with what is on screen, not with what was last asked for: if a reload raced with a
      // save and brought slightly older data, the next check sees the difference and reloads again,
      // so the page always ends up showing what is in the database.
      if (data.version !== rendered.current) router.refresh();
    } catch {
      setState((s) => ({ ...s, online: false }));
    } finally {
      busy.current = false;
    }
  }, [router]);

  useEffect(() => {
    if (!since.current) since.current = Date.now();
    const first = setTimeout(() => { setNow(Date.now()); void poll(); }, 600);
    const every = setInterval(poll, admin ? 8_000 : 20_000);
    const clock = setInterval(() => setNow(Date.now()), 5_000);
    const wake = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      clearTimeout(first); clearInterval(every); clearInterval(clock);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [poll, admin]);

  if (!admin) {
    return (
      <button type="button" disabled={checking} className={buttonClass("secondary", "md")} onClick={() => startCheck(async () => { router.refresh(); await poll(); })}>
        <RefreshCw className={clsx("size-4", checking && "cv-spin")} aria-hidden /> Refresh
      </button>
    );
  }

  const problem = !state.configured ? "Mailbox not set up" : !state.online ? "Offline — retrying" : state.error ? "Mailbox not reachable" : null;
  const label = problem ?? (state.lastOkAt ? `Live · replies checked ${ago(now - state.lastOkAt)}` : "Live · checking replies…");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span title={state.error ?? undefined} className={clsx("inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-medium", problem ? "border-warn/30 bg-warn-bg text-warn" : "border-ok/25 bg-ok-bg text-ok")} role="status" aria-live="polite">
        <span aria-hidden className={clsx("size-2 rounded-full bg-current", !problem && "cv-live-dot")} />
        {label}
      </span>
      <button type="button" disabled={checking} aria-busy={checking} className={buttonClass("secondary", "md")}
        onClick={() => startCheck(async () => {
          const r = await checkRepliesAction().catch(() => ({ ok: false, message: "Could not check the mailbox." }));
          toast(r.message ?? (r.ok ? "Up to date." : "Could not check."), r.ok ? "success" : "error");
          // Always re-read the page's data, even when the check failed.
          router.refresh();
          void poll();
        })}>
        <RefreshCw className={clsx("size-4", checking && "cv-spin")} aria-hidden /> {checking ? "Checking…" : "Check now"}
      </button>
    </div>
  );
}
