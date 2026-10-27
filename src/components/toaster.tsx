"use client";

import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";

// Global toast notifications for action results ("Invite sent", "Saved", errors).
// Brief and non-blocking: field-level validation stays inline next to the field.
// Every toast closes itself after 10 seconds (paused while hovered or focused) and
// can be closed with its ✕ button. Timers, not CSS animation events, decide when a
// toast closes, so it works with reduced motion too. Identical messages replace the
// visible one instead of stacking, and at most three are shown at once.

export type ToastTone = "success" | "error" | "info" | "warning";
type Toast = { id: number; message: string; tone: ToastTone; leaving: boolean; stamp: number };

const DURATION_MS = 10_000;
const EXIT_MS = 220;
const MAX = 3;
const EMPTY: Toast[] = [];

let toasts: Toast[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const store = {
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  get: () => toasts,
  server: () => EMPTY,
};

export function toast(message: string, tone: ToastTone = "success") {
  if (!message) return;
  const existing = toasts.find((t) => t.message === message && !t.leaving);
  if (existing) {
    // Restart the same toast rather than showing a duplicate.
    toasts = toasts.map((t) => (t === existing ? { ...t, tone, stamp: Date.now() } : t));
  } else {
    toasts = [...toasts, { id: nextId++, message, tone, leaving: false, stamp: Date.now() }];
    const live = toasts.filter((t) => !t.leaving);
    if (live.length > MAX) dismiss(live[0].id, false);
  }
  emit();
}

function dismiss(id: number, notify = true) {
  if (!toasts.some((t) => t.id === id && !t.leaving)) return;
  toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  // Remove after the exit animation has had time to play.
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, EXIT_MS);
  if (notify) emit();
}

// ---------------------------------------------------------------- flash (across redirects)

const FLASH_COOKIE = "ssda-flash";

/** Shows a message a server action left in the flash cookie before redirecting, then clears it. */
function readFlash() {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${FLASH_COOKIE}=`));
  if (!raw) return;
  document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
  try {
    const { message, tone } = JSON.parse(decodeURIComponent(raw.slice(FLASH_COOKIE.length + 1))) as { message: string; tone?: ToastTone };
    toast(message, tone ?? "success");
  } catch {
    /* malformed cookie: ignore */
  }
}

// ---------------------------------------------------------------- UI

const TONE = {
  success: { icon: CircleCheck, chip: "bg-ok text-white", bar: "bg-ok" },
  error: { icon: CircleAlert, chip: "bg-danger text-white", bar: "bg-danger" },
  warning: { icon: TriangleAlert, chip: "bg-marigold text-night", bar: "bg-marigold" },
  info: { icon: Info, chip: "bg-info text-white", bar: "bg-info" },
} as const;

/** One toast with its own pausable 10-second timer. */
function ToastItem({ t }: { t: Toast }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(DURATION_MS);
  const startedAt = useRef(0);

  const start = () => {
    if (timer.current) clearTimeout(timer.current);
    startedAt.current = Date.now();
    timer.current = setTimeout(() => dismiss(t.id), remaining.current);
  };
  const pause = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
  };

  // (Re)start the full countdown when the toast appears or is repeated.
  useEffect(() => {
    remaining.current = DURATION_MS;
    start();
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only on a new stamp
  }, [t.stamp]);

  const tone = TONE[t.tone];
  const Icon = tone.icon;
  return (
    <div
      role={t.tone === "error" ? "alert" : "status"}
      aria-live={t.tone === "error" ? "assertive" : "polite"}
      onMouseEnter={pause}
      onMouseLeave={start}
      onFocus={pause}
      onBlur={start}
      className={clsx(
        "group pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border border-white/10 bg-night py-3 pl-3 pr-11 text-sm text-paper shadow-[0_18px_40px_-16px_rgb(15_29_51/.7)] transition-[opacity,translate] duration-200 sm:w-96",
        t.leaving ? "toast-out pointer-events-none translate-x-6 opacity-0" : "toast-in",
      )}
    >
      <span className={clsx("grid size-6 shrink-0 place-items-center rounded-full", tone.chip)}>
        <Icon className="size-3.5" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 pt-0.5 leading-snug">{t.message}</p>
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-lg text-paper/60 transition-colors hover:bg-white/10 hover:text-paper focus-visible:outline-2 focus-visible:outline-marigold"
        aria-label="Dismiss notification"
      >
        <X className="pointer-events-none size-4" aria-hidden />
      </button>
      {/* Visual countdown only; the timer above decides when the toast closes. */}
      <span
        key={t.stamp}
        aria-hidden
        className={clsx("toast-bar pointer-events-none absolute bottom-0 left-0 h-0.5 w-full origin-left", tone.bar)}
        style={{ "--dur": `${DURATION_MS}ms` } as CSSProperties}
      />
    </div>
  );
}

export function Toaster() {
  const list = useSyncExternalStore(store.subscribe, store.get, store.server);
  const pathname = usePathname();

  useEffect(() => readFlash(), [pathname]);

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-3 bottom-24 z-[80] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:items-end lg:bottom-6 print:hidden"
    >
      {list.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>
  );
}
