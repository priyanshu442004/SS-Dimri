"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, LayoutDashboard, Phone } from "lucide-react";
import { clsx } from "clsx";
import { PUBLIC_NAV } from "./nav";


const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

export function Wordmark({ light }: { light?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="S S Dimri & Associates — home">
      <span aria-hidden className="relative grid size-9 place-items-center">
        <svg viewBox="0 0 40 40" className="absolute inset-0 size-full transition-transform duration-700 ease-[var(--ease-spring)] group-hover:rotate-[22deg]">
          <circle cx="20" cy="20" r="18.5" fill="none" stroke={light ? "#f5f1e8" : "#0f1d33"} strokeWidth="1.5" strokeDasharray="2 2.6" />
          <circle cx="20" cy="20" r="15" fill={light ? "#f5f1e8" : "#0f1d33"} />
        </svg>
        <span className={clsx("relative font-editorial text-[15px] leading-none", light ? "text-night" : "text-paper")}>SD</span>
      </span>
      <span className={clsx("font-editorial text-[1.35rem] leading-none tracking-[-0.01em]", light ? "text-paper" : "text-ink")}>
        S S Dimri <span className={clsx("italic", light ? "text-paper/60" : "text-muted")}>&amp; Associates</span>
      </span>
    </Link>
  );
}

/**
 * Whether the visitor is signed in. Checked in the browser so public pages stay
 * statically cached; /app sends each signed-in user to their own dashboard.
 */
function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/session/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { state?: string } | null) => live && setSignedIn(!!d?.state && d.state !== "signed_out" && d.state !== "inactive"))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return signedIn;
}

export function SiteHeader({ phone, tel }: { phone: string; tel: string }) {
  const path = usePathname();
  const signedIn = useSignedIn();
  // The sheet remembers the path it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (next: boolean | ((o: boolean) => boolean)) =>
    setOpenOn((typeof next === "function" ? next(open) : next) ? path : null);

  // Lock scroll and listen for Escape while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="pub-header sticky top-0 z-40 border-b border-transparent" style={{ viewTransitionName: "site-header" }}>
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Wordmark />
        <nav className="hidden items-center gap-1 rounded-full border border-ink/10 bg-paper/60 p-1 md:flex" aria-label="Main">
          {PUBLIC_NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                data-ripple
                className={clsx("relative rounded-full px-4 py-2 text-sm transition-colors duration-300", active ? "text-paper" : "text-ink/70 hover:text-ink")}
              >
                {active && <span aria-hidden className="absolute inset-0 rounded-full bg-ink" style={{ viewTransitionName: "nav-indicator" }} />}
                <span className="relative">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <Link href="/app" className="pub-btn pub-btn-sm">
              <LayoutDashboard className="size-4" aria-hidden /> Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="pub-link px-2 py-1 text-sm font-medium text-ink">Sign in</Link>
              <Link href="/register" className="pub-btn pub-btn-sm">
                Create account <ArrowUpRight className="arrow size-4" aria-hidden />
              </Link>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="pub-mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          data-ripple
          className="relative grid size-11 place-items-center rounded-full border border-ink/15 bg-paper md:hidden"
        >
          <span aria-hidden className="relative block h-3 w-5">
            <span className={clsx("absolute left-0 top-0 h-[1.5px] w-5 bg-ink transition-transform duration-500 ease-[var(--ease-out-expo)]", open && "translate-y-[5.25px] rotate-45")} />
            <span className={clsx("absolute bottom-0 left-0 h-[1.5px] w-5 bg-ink transition-transform duration-500 ease-[var(--ease-out-expo)]", open && "-translate-y-[5.25px] -rotate-45")} />
          </span>
        </button>
      </div>
      <div aria-hidden className="pub-progress absolute inset-x-0 bottom-0 h-[2px] bg-stamp-bright" />

      {/* Mobile sheet */}
      <div
        id="pub-mobile-menu"
        data-open={open}
        className={clsx(
          "pub-sheet pub-grain fixed inset-x-0 top-[72px] z-30 h-[calc(100dvh-72px)] overflow-y-auto bg-paper px-6 pb-10 pt-6 md:hidden",
          open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-4 opacity-0",
        )}
      >
        <nav aria-label="Mobile">
          <ul className="space-y-1">
            {PUBLIC_NAV.map((n, i) => (
              <li key={n.href} className="pub-sheet-item" style={{ "--i": i } as CSSProperties}>
                <Link href={n.href} className="flex items-baseline justify-between border-b border-ink/10 py-4" aria-current={isActive(path, n.href) ? "page" : undefined}>
                  <span className={clsx("font-editorial text-4xl", isActive(path, n.href) ? "italic text-stamp" : "text-ink")}>{n.label}</span>
                  <span className="font-mono text-xs text-muted">0{i + 1}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="pub-sheet-item mt-8 grid gap-3" style={{ "--i": 5 } as CSSProperties}>
            {signedIn ? (
              <Link href="/app" className="pub-btn pub-btn-block"><LayoutDashboard className="size-4" aria-hidden /> Dashboard</Link>
            ) : (
              <>
                <Link href="/register" className="pub-btn pub-btn-block">Create account</Link>
                <Link href="/login" className="pub-btn pub-btn-ghost pub-btn-block">Sign in</Link>
              </>
            )}
            <a href={tel} className="mt-3 flex items-center gap-2 text-sm text-muted"><Phone className="size-4" aria-hidden /> {phone}</a>
          </div>
        </nav>
      </div>
    </header>
  );
}
