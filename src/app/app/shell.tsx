"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, useSyncExternalStore, ViewTransition, type ReactNode } from "react";
import { clsx } from "clsx";
import {
  Bell, BookOpen, Briefcase, Building2, CalendarDays, ChartColumn, ChevronRight, ChevronsLeft, ChevronsRight, Clock, FileText, Flag, Home, IdCard, LayoutGrid, ListChecks,
  LogOut, MessageSquareWarning, Search, Settings, Users, Wallet, X,
} from "lucide-react";
import { CommandPalette, usePaletteShortcut } from "@/components/command-palette";
import { MotionDirector } from "@/components/motion-director";
import type { NavItem } from "./nav";

const ICONS = {
  home: Home, bell: Bell, building: Building2, chart: ChartColumn, users: Users, list: ListChecks, clock: Clock,
  file: FileText, flag: Flag, calendar: CalendarDays, id: IdCard, briefcase: Briefcase, book: BookOpen, settings: Settings, message: MessageSquareWarning, wallet: Wallet,
} as const;
const iconFor = (n: NavItem) => ICONS[n.icon as keyof typeof ICONS] ?? Home;

// Breadcrumb labels for path segments; ids and unknown segments become "Details".
const SEGMENT_LABELS: Record<string, string> = {
  app: "Home", admin: "Dashboard", manager: "Dashboard", senior: "Dashboard", workspace: "Dashboard",
  clients: "Clients", approvals: "Approvals", new: "New", employees: "Employees", allocations: "Team allocation", tasks: "Tasks",
  attendance: "Attendance", timesheet: "Timesheet", "day-reports": "Day reports", pending: "Pending tracker", reports: "Reports",
  services: "Services & departments", compliances: "Compliance calendar", settings: "Settings", notifications: "Notifications",
  onboarding: "My employee record", profile: "My profile", observations: "Client observations", dues: "Fees & dues", search: "Search", "no-access": "No access",
};

// Most-used destinations for the phone tab bar (only those the user can reach are shown).
const TAB_PRIORITY = ["/app", "/app/tasks", "/app/timesheet", "/app/attendance", "/app/clients"];

// Sidebar collapsed preference, per browser. useSyncExternalStore keeps hydration
// consistent (server and first client render are expanded) and syncs across tabs.
const COLLAPSE_KEY = "ssda.sidebar.collapsed";
const collapseStore = {
  subscribe(cb: () => void) {
    window.addEventListener("storage", cb);
    window.addEventListener("ssda-sidebar", cb);
    return () => { window.removeEventListener("storage", cb); window.removeEventListener("ssda-sidebar", cb); };
  },
  get() { try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; } },
  set(v: boolean) { try { localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch { /* storage unavailable */ } window.dispatchEvent(new Event("ssda-sidebar")); },
};

function Breadcrumbs({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs = parts.map((p, i) => {
    const href = "/" + parts.slice(0, i + 1).join("/");
    return { href, label: href === "/app/reports/clients" ? "Client reports" : SEGMENT_LABELS[p] ?? "Details" };
  });
  // "/app/reports" has no page of its own.
  const visible = crumbs.filter((c) => c.href !== "/app/reports");
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 truncate text-sm text-muted">
        {visible.map((c, i) => (
          <li key={c.href} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-ink/25" aria-hidden />}
            {i === visible.length - 1 ? (
              <span aria-current="page" className="truncate font-medium text-ink">{c.label}</span>
            ) : (
              <Link href={c.href} className="truncate transition-colors hover:text-ink">{c.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function AppShell({
  nav,
  badges,
  orgName,
  userName,
  roleLabel,
  unread,
  signOut,
  children,
}: {
  nav: NavItem[];
  badges: Record<string, number>;
  orgName: string;
  userName: string;
  roleLabel: string;
  unread: number;
  signOut: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // The drawer remembers the page it was opened on, so navigating closes it.
  const [drawerOn, setDrawerOn] = useState<string | null>(null);
  const drawer = drawerOn === pathname;
  const [palette, setPalette] = useState(false);
  const closePalette = useCallback(() => setPalette(false), []);
  usePaletteShortcut(setPalette);
  const collapsed = useSyncExternalStore(collapseStore.subscribe, collapseStore.get, () => false);
  const initials = userName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" || /^\/app\/(admin|manager|senior|workspace)$/.test(pathname) : pathname.startsWith(href);
  const sections = [...new Set(nav.map((n) => n.section))];
  const countFor = (n: NavItem) => (n.icon === "bell" ? unread : badges[n.href] ?? 0);
  const tabs = TAB_PRIORITY.map((h) => nav.find((n) => n.href === h)).filter((n): n is NavItem => !!n).slice(0, 4);

  const sidebar = (mini: boolean) => (
    <nav aria-label="Application" className="flex h-full flex-col">
      <div className={clsx("flex h-16 items-center gap-2.5 border-b border-white/10", mini ? "justify-center px-2" : "px-4")}>
        <span aria-hidden className="relative grid size-8 shrink-0 place-items-center">
          <svg viewBox="0 0 40 40" className="absolute inset-0 size-full"><circle cx="20" cy="20" r="18.5" fill="none" stroke="#f5f1e8" strokeOpacity=".6" strokeWidth="1.5" strokeDasharray="2 2.6" /><circle cx="20" cy="20" r="15" fill="#f5f1e8" /></svg>
          <span className="relative font-editorial text-sm text-night">OE</span>
        </span>
        {!mini && <span className="truncate font-editorial text-lg leading-tight">{orgName}</span>}
      </div>
      <div className={clsx("app-sidebar-scroll flex-1 overflow-y-auto py-4", mini ? "px-2" : "px-3")}>
        {sections.map((s) => (
          <div key={s} className="mb-5">
            {mini ? <hr className="mx-2 mb-2 border-white/10" /> : <p className="px-2 pb-1.5 font-mono text-[10.5px] text-white/40">{s}</p>}
            {nav.filter((n) => n.section === s).map((n) => {
              const Icon = iconFor(n);
              const active = isActive(n.href);
              const count = countFor(n);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  title={mini ? n.label : undefined}
                  data-ripple
                  className={clsx(
                    "group relative flex items-center gap-2.5 rounded-lg text-sm transition-colors duration-200",
                    mini ? "justify-center px-0 py-2.5" : "px-2.5 py-2",
                    active ? "text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  {active && (
                    <span aria-hidden className="absolute inset-0 rounded-lg bg-white/[0.12] shadow-[inset_0_1px_0_rgb(255_255_255/.08)]" style={{ viewTransitionName: "app-nav-indicator" }}>
                      <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-marigold" />
                    </span>
                  )}
                  <Icon className={clsx("relative size-[18px] shrink-0 transition-transform duration-300 group-hover:scale-110", active && "text-marigold")} aria-hidden />
                  {!mini && <span className="relative truncate">{n.label}</span>}
                  {count > 0 && (
                    <span className={clsx("app-bump grid min-w-5 place-items-center rounded-full bg-marigold px-1.5 text-[11px] font-semibold text-night", mini ? "absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[9px]" : "relative ml-auto h-5")}>
                      {count}
                      <span className="sr-only"> needing attention</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className={clsx("border-t border-white/10", mini ? "p-2" : "p-3")}>
        <Link href="/app/profile" className={clsx("flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-white/[0.06]", mini && "justify-center")} title={mini ? `${userName} · ${roleLabel}` : undefined}>
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-marigold text-xs font-semibold text-night">{initials}</span>
          {!mini && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{userName}</span>
              <span className="block text-xs text-white/50">{roleLabel}</span>
            </span>
          )}
        </Link>
        <form action={signOut} className="mt-1">
          <button type="submit" className={clsx("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white", mini && "justify-center px-0")} title={mini ? "Sign out" : undefined}>
            <LogOut className="size-4" aria-hidden /> {!mini && "Sign out"}
          </button>
        </form>
      </div>
    </nav>
  );

  const paletteButton = (compact: boolean) => (
    <button
      type="button"
      onClick={() => setPalette(true)}
      className={clsx(
        "group flex items-center gap-2 rounded-lg border border-line bg-paper/70 text-sm text-muted transition-[border-color,background-color,box-shadow] hover:border-ink/25 hover:bg-surface hover:shadow-sm",
        compact ? "size-10 justify-center" : "h-10 w-72 px-3",
      )}
      aria-label="Search or jump to (Ctrl+K)"
    >
      <Search className="size-4 shrink-0 transition-transform group-hover:scale-110" aria-hidden />
      {!compact && (
        <>
          <span className="flex-1 text-left">Search or jump to…</span>
          <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
        </>
      )}
    </button>
  );

  const bell = (
    <Link href="/app/notifications" className="relative grid size-10 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink" aria-label={`Notifications (${unread} unread)`}>
      <Bell className="size-5" aria-hidden />
      {unread > 0 && <span className="app-bump absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-stamp-bright px-1 text-[10px] font-semibold text-white ring-2 ring-surface">{unread}</span>}
    </Link>
  );

  return (
    <div className="flex min-h-full flex-1 bg-canvas">
      <MotionDirector />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className={clsx("pub-night-grid sticky top-0 hidden h-dvh shrink-0 text-white transition-[width] duration-300 ease-[var(--ease-out-expo)] print:!hidden lg:block", collapsed ? "w-[72px]" : "w-64")}>
        {sidebar(collapsed)}
        <button
          type="button"
          onClick={() => collapseStore.set(!collapsed)}
          className="absolute -right-3 top-[76px] grid size-6 place-items-center rounded-full border border-line bg-surface text-muted shadow-sm transition-colors hover:text-ink"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
        >
          {collapsed ? <ChevronsRight className="size-3.5" aria-hidden /> : <ChevronsLeft className="size-3.5" aria-hidden />}
        </button>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="app-palette-backdrop absolute inset-0 bg-night/50" aria-label="Close navigation" onClick={() => setDrawerOn(null)} />
          <aside className="app-drawer pub-night-grid relative h-full w-72 max-w-[85vw] text-white">
            <button className="absolute right-2 top-4 z-10 rounded-lg p-1.5 text-white/80 hover:bg-white/10" onClick={() => setDrawerOn(null)} aria-label="Close navigation">
              <X className="size-5" aria-hidden />
            </button>
            {sidebar(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md print:hidden sm:px-6">
          <span className="truncate font-editorial text-lg lg:hidden">{orgName}</span>
          <div className="hidden min-w-0 lg:block"><Breadcrumbs pathname={pathname} /></div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden md:block">{paletteButton(false)}</span>
            <span className="md:hidden">{paletteButton(true)}</span>
            {bell}
            <Link href="/app/profile" className="ml-1 hidden items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2.5 transition-colors hover:bg-subtle lg:flex" title={`${userName} · ${roleLabel}`}>
              <span aria-hidden className="grid size-8 place-items-center rounded-full bg-ink text-xs font-semibold text-paper">{initials}</span>
              <span className="hidden text-sm xl:inline">{userName.split(" ")[0]}</span>
              <span className="sr-only">My profile</span>
            </Link>
          </div>
        </header>
        <div className="px-4 pt-3 sm:px-6 lg:hidden print:hidden"><Breadcrumbs pathname={pathname} /></div>

        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          <ViewTransition key={pathname} enter="app-page" exit="app-page" default="none">
            <div>{children}</div>
          </ViewTransition>
        </main>
      </div>

      {/* Phone tab bar */}
      {nav.length > 1 && (
        <nav aria-label="Quick navigation" className="fixed inset-x-3 bottom-3 z-40 grid grid-flow-col auto-cols-fr rounded-2xl border border-white/10 bg-night/95 p-1.5 text-white shadow-[0_20px_40px_-16px_rgb(15_29_51/.7)] backdrop-blur print:hidden lg:hidden">
          {tabs.map((n) => {
            const Icon = iconFor(n);
            const active = isActive(n.href);
            const count = countFor(n);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} data-ripple
                className={clsx("relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10.5px] transition-colors", active ? "text-white" : "text-white/55")}>
                {active && <span aria-hidden className="absolute inset-0 rounded-xl bg-white/[0.12]" style={{ viewTransitionName: "app-tab-indicator" }} />}
                <span className="relative">
                  <Icon className={clsx("size-5", active && "text-marigold")} aria-hidden />
                  {count > 0 && <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-marigold px-1 text-[9px] font-semibold text-night">{count}</span>}
                </span>
                <span className="relative">{n.href === "/app" ? "Home" : n.label}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setDrawerOn(pathname)} className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10.5px] text-white/55" aria-label="Open navigation">
            <LayoutGrid className="size-5" aria-hidden />
            More
          </button>
        </nav>
      )}

      {palette && (
        <CommandPalette
          onClose={closePalette}
          items={nav.map((n) => ({ href: n.href, label: n.label, section: n.section, icon: iconFor(n) }))}
          searchHref={nav.length > 1 ? (q) => `/app/search?q=${encodeURIComponent(q)}` : undefined}
          signOut={signOut}
        />
      )}
    </div>
  );
}
