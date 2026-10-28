import Link from "next/link";
import { Bell, LogOut, Phone } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { signOutAction } from "@/app/app/account-actions";
import { ClientNav, ClientPageTransition, ClientTabBar } from "./nav";
import { formatDateTime } from "@/lib/dates";
import { FIRM } from "@/lib/firm";
import { AccessWatcher } from "@/components/access-watcher";
import { Notice } from "@/components/ui";

export default async function ClientLayout({ children }: LayoutProps<"/client">) {
  // Individual pages enforce access (requireClientContext); the layout only renders chrome.
  const ctx = await getContext();
  const unread = ctx ? await prisma.notification.count({ where: { userId: ctx.user.id, readAt: null } }) : 0;
  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md print:static">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/client" className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="relative grid size-9 shrink-0 place-items-center">
              <svg viewBox="0 0 40 40" className="absolute inset-0 size-full"><circle cx="20" cy="20" r="18.5" fill="none" stroke="#0f1d33" strokeWidth="1.5" strokeDasharray="2 2.6" /><circle cx="20" cy="20" r="15" fill="#0f1d33" /></svg>
              <span className="relative font-editorial text-sm text-paper">OE</span>
            </span>
            <span className="min-w-0">
              <span className="block truncate font-editorial text-lg leading-tight">{ctx?.client?.tradeName ?? "Client portal"}</span>
              <span className="block font-mono text-[10px] text-muted">CLIENT PORTAL · OFFICE ERP</span>
            </span>
          </Link>
          <span className="ml-auto flex items-center gap-1">
            <a href="tel:+911147094120" className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-subtle hover:text-ink lg:flex">
              <Phone className="size-4" aria-hidden /> {FIRM.phone}
            </a>
            <Link href="/client/notifications" className="relative grid size-10 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink" aria-label={`Notifications (${unread} unread)`}>
              <Bell className="size-5" aria-hidden />
              {unread > 0 && <span className="app-bump absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-stamp-bright px-1 text-[10px] font-semibold text-white ring-2 ring-surface">{unread}</span>}
            </Link>
            <form action={signOutAction}>
              <button className="app-btn flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-subtle hover:text-ink">
                <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </span>
        </div>
        <ClientNav />
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 md:pb-10">
        {ctx && <AccessWatcher initial={ctx.access.state} />}
        {ctx?.access.state === "grace" && ctx.access.graceEndsAt && (
          <div className="mb-4">
            <Notice tone="warn">
              Your registration is awaiting approval. You can use the portal until <strong>{formatDateTime(ctx.access.graceEndsAt)}</strong>; after that access pauses until our office approves it.
            </Notice>
          </div>
        )}
        <ClientPageTransition>{children}</ClientPageTransition>
      </main>
      <footer className="border-t border-line py-5 text-center text-xs text-muted print:hidden">
        {FIRM.name} · {FIRM.officeHours} · <a href={`mailto:${FIRM.email}`} className="underline-offset-2 hover:text-ink hover:underline">{FIRM.email}</a>
      </footer>
      <ClientTabBar />
    </div>
  );
}
