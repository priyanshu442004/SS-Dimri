import type { CSSProperties, ReactNode } from "react";
import { clsx } from "clsx";
import { ShieldCheck } from "lucide-react";
import { formatDue, upcomingDeadlines } from "@/lib/deadlines";
import { LedgerCard, Stamp } from "./art";
import { Eyebrow, PageTransition, SplitWords } from "./motion";

/**
 * Split-screen frame for sign-in, password and account-status pages: content on
 * paper on the left, an illustrated brand panel on the right (large screens).
 */
export function AuthShell({ eyebrow, title, em, description, icon, children, tone = "ink" }: {
  eyebrow?: string;
  title: string;
  em?: string[];
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  tone?: "ink" | "warn" | "danger" | "ok";
}) {
  const next = upcomingDeadlines(1)[0];
  return (
    <PageTransition>
      <div className="grid min-h-[calc(100dvh-72px)] lg:grid-cols-[1fr_minmax(0,0.95fr)]">
        <div className="pub-grain relative flex items-center px-4 py-14 sm:px-8">
          <div aria-hidden className="pub-dots absolute inset-0 [mask-image:radial-gradient(ellipse_at_20%_10%,#000,transparent_60%)]" />
          <div className="relative mx-auto w-full max-w-md">
            {icon && (
              <span className={clsx("pub-pop mb-6 grid size-14 place-items-center rounded-2xl border",
                tone === "warn" ? "border-warn/30 bg-warn-bg text-warn" : tone === "danger" ? "border-danger/30 bg-danger-bg text-danger" : tone === "ok" ? "border-ok/30 bg-ok-bg text-ok" : "border-ink/15 bg-surface text-ink")}>
                {icon}
              </span>
            )}
            {eyebrow && <div className="pub-in"><Eyebrow>{eyebrow}</Eyebrow></div>}
            <h1 className="mt-4 font-editorial text-[clamp(2.6rem,5.5vw,3.75rem)] leading-[0.98] tracking-[-0.02em]">
              <SplitWords text={title} em={em} />
            </h1>
            {description && <div className="pub-in mt-4 leading-relaxed text-ink/70" style={{ "--d": "250ms" } as CSSProperties}>{description}</div>}
            <div className="pub-in mt-8" style={{ "--d": "380ms" } as CSSProperties}>{children}</div>
          </div>
        </div>

        <aside aria-hidden className="pub-night-grid relative hidden overflow-hidden text-paper lg:block">
          <div className="absolute -right-24 top-10 size-[380px] rounded-full bg-stamp-bright/25 blur-[110px]" />
          <div className="absolute -left-20 bottom-0 size-[320px] rounded-full bg-marigold/15 blur-[100px]" />
          <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
            <p className="max-w-sm font-editorial text-[2.6rem] leading-[1.05]">
              Every return, register and reconciliation — <em className="text-marigold">in one ledger.</em>
            </p>
            <div className="relative mx-auto my-10 w-full max-w-[400px]">
              <div className="pub-in pub-float rotate-[2deg]" style={{ "--d": "200ms", "--t": "10s" } as CSSProperties}>
                <LedgerCard className="text-ink" />
              </div>
              <div className="pub-in pub-float absolute -bottom-8 -left-8 w-52 -rotate-[4deg] rounded-xl border border-ink/10 bg-surface p-4 text-ink shadow-[0_28px_50px_-24px_rgb(0_0_0/.6)]" style={{ "--d": "600ms", "--t": "8s", "--fd": "-3s" } as CSSProperties}>
                <p className="font-mono text-[10px] text-muted">NEXT DUE · {formatDue(next.date).toUpperCase()}</p>
                <p className="mt-1.5 text-sm font-medium leading-snug">{next.title}</p>
              </div>
              <Stamp id="auth" className="pub-stamp absolute -right-6 -top-10 w-32" style={{ "--d": "1000ms" } as CSSProperties} color="#e3a21a" top="CLIENT PORTAL" bottom="S S DIMRI & ASSOCIATES" center="SSDA" />
            </div>
            <p className="flex max-w-sm items-start gap-3 text-sm text-paper/60">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-marigold" />
              Documents are stored privately and are visible only to you and authorised staff. Identity numbers are never shown in full.
            </p>
          </div>
        </aside>
      </div>
    </PageTransition>
  );
}

/** Paper card for forms inside the auth shell. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("pub-form rounded-2xl border border-ink/15 bg-surface p-6 shadow-[0_24px_48px_-32px_rgb(15_29_51/.45)] sm:p-7", className)}>{children}</div>;
}
