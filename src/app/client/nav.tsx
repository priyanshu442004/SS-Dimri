"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ViewTransition, type ReactNode } from "react";
import { clsx } from "clsx";
import { Briefcase, Building2, FolderOpen, Home, Inbox } from "lucide-react";
import { MotionDirector } from "@/components/motion-director";

const ITEMS = [
  { href: "/client", label: "Overview", icon: Home },
  { href: "/client/requests", label: "Requests", icon: Inbox },
  { href: "/client/work", label: "Work", icon: Briefcase },
  { href: "/client/documents", label: "Documents", icon: FolderOpen },
  { href: "/client/profile", label: "Business profile", icon: Building2 },
];

const isActive = (path: string, href: string) => (href === "/client" ? path === "/client" : path.startsWith(href));

/** Segmented top navigation for the client portal; the active pill morphs between items. */
export function ClientNav() {
  const path = usePathname();
  return (
    <nav aria-label="Client portal" className="mx-auto hidden max-w-6xl px-4 pb-3 sm:px-6 md:block">
      <div className="inline-flex gap-1 rounded-full border border-line bg-paper/70 p-1">
        {ITEMS.map((i) => {
          const active = isActive(path, i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active ? "page" : undefined}
              data-ripple
              className={clsx("relative flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors", active ? "text-paper" : "text-muted hover:text-ink")}
            >
              {active && <span aria-hidden className="absolute inset-0 rounded-full bg-ink" style={{ viewTransitionName: "client-nav-indicator" }} />}
              <i.icon className={clsx("relative size-4", active && "text-marigold")} aria-hidden />
              <span className="relative">{i.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Phone tab bar for the client portal. */
export function ClientTabBar() {
  const path = usePathname();
  return (
    <nav aria-label="Client portal (mobile)" className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-2xl border border-white/10 bg-night/95 p-1.5 text-white shadow-[0_20px_40px_-16px_rgb(15_29_51/.7)] backdrop-blur print:hidden md:hidden">
      {ITEMS.map((i) => {
        const active = isActive(path, i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} data-ripple
            className={clsx("relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10.5px] transition-colors", active ? "text-white" : "text-white/55")}>
            {active && <span aria-hidden className="absolute inset-0 rounded-xl bg-white/[0.12]" style={{ viewTransitionName: "client-tab-indicator" }} />}
            <i.icon className={clsx("relative size-5", active && "text-marigold")} aria-hidden />
            <span className="relative">{i.label === "Business profile" ? "Profile" : i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Page enter/exit within the client portal, plus shared pointer effects. */
export function ClientPageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <>
      <MotionDirector />
      <ViewTransition key={path} enter="app-page" exit="app-page" default="none">
        <div>{children}</div>
      </ViewTransition>
    </>
  );
}
