import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { FIRM } from "@/lib/firm";
import { getContext } from "@/lib/session";
import { signOutAction } from "@/app/app/account-actions";
import { clsx } from "clsx";
import { AuthCard, AuthShell } from "@/components/public/auth-shell";
import { AccessWatcher } from "@/components/access-watcher";

export const metadata: Metadata = { title: "Registration status" };

/** Registration status for client logins (pending, rejected, inactive). Status is read on the server only. */
export default async function RegistrationStatusPage({ searchParams }: PageProps<"/account/pending">) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "CLIENT" || !ctx.client) redirect("/app");
  const sp = await searchParams;
  const c = await prisma.client.findUniqueOrThrow({
    where: { id: ctx.client.id },
    select: { tradeName: true, status: true, submittedAt: true, rejectionReason: true, approvedAt: true, registrationChannel: true },
  });
  if (c.status === "ACTIVE" || c.status === "ON_HOLD") redirect("/client");
  const grace = ctx.access.state === "grace" ? ctx.access.graceEndsAt : null;
  const { approvalGraceDays: graceDays } = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { approvalGraceDays: true } });

  const content = {
    PENDING_APPROVAL: grace
      ? {
          icon: Clock, tone: "text-warn", title: "Your registration is awaiting approval",
          text: `Thank you. Our office will review the details for ${c.tradeName}. Meanwhile you can use the client portal until ${formatDateTime(grace)}; after that, access pauses until the registration is approved.`,
        }
      : {
          icon: Clock, tone: "text-warn", title: "Your access period has ended",
          text: `The ${graceDays}-day access period for ${c.tradeName} ended${ctx.access.graceEndsAt ? ` on ${formatDateTime(ctx.access.graceEndsAt)}` : ""}. You can use your account again as soon as our office approves your registration.`,
        },
    DRAFT: { icon: Clock, tone: "text-warn", title: "Your registration is incomplete", text: "Please contact the office to complete your registration." },
    REJECTED: {
      icon: XCircle, tone: "text-danger", title: "Your registration could not be approved",
      text: c.rejectionReason ? `Reason given: ${c.rejectionReason}. Please contact the office to correct the details.` : "Please contact the office for details.",
    },
    INACTIVE: { icon: XCircle, tone: "text-muted", title: "This account is inactive", text: "The client account has been discontinued. Please contact the office if this is unexpected." },
  }[c.status as "PENDING_APPROVAL" | "DRAFT" | "REJECTED" | "INACTIVE"];

  const reviewState = c.status === "REJECTED" || c.status === "INACTIVE" ? "failed" : "current";
  const track = [
    { label: "Submitted", state: "done" },
    { label: "Office review", state: reviewState },
    { label: "Account active", state: "todo" },
  ] as const;
  const tone = content.tone === "text-danger" ? "danger" : content.tone === "text-warn" ? "warn" : "ink";

  return (
    <AuthShell icon={<content.icon className="size-7" aria-hidden />} tone={tone} eyebrow="Registration status" title={content.title} description={content.text}>
      <AccessWatcher initial={ctx.access.state} />
      {sp.registered === "1" && (
        <p role="status" className="pub-swap mb-5 flex items-center gap-2 rounded-xl border border-ok/30 bg-ok-bg px-4 py-3 text-sm text-ok">
          <CheckCircle2 className="size-4" aria-hidden /> Registration submitted successfully.
        </p>
      )}
      <AuthCard>
        <ol className="grid grid-cols-3 gap-2" aria-label="Registration progress">
          {track.map((t, i) => (
            <li key={t.label} className="relative" style={{ animation: `pub-in 700ms var(--ease-out-expo) ${300 + i * 150}ms both` }}>
              <span className={clsx("block h-1.5 overflow-hidden rounded-full", t.state === "todo" ? "bg-ink/10" : t.state === "failed" ? "bg-danger/80" : "bg-ink")}>
                {t.state === "current" && <span className="block h-full w-1/2 animate-[pub-indeterminate_1.8s_ease-in-out_infinite] rounded-full bg-marigold" />}
              </span>
              <span className={clsx("mt-2 block text-xs", t.state === "todo" ? "text-muted" : "font-medium text-ink")}>
                {t.label}{t.state === "done" ? " ✓" : t.state === "failed" ? " ✕" : ""}
              </span>
            </li>
          ))}
        </ol>
        <dl className="mt-6 grid grid-cols-[7.5rem_1fr] gap-y-2 border-t border-ink/10 pt-5 text-sm">
          <dt className="text-muted">Business</dt><dd className="font-medium">{c.tradeName}</dd>
          <dt className="text-muted">Submitted</dt><dd>{formatDateTime(c.submittedAt)}</dd>
          <dt className="text-muted">Registration</dt><dd>{c.registrationChannel === "CLIENT_QUICK" ? "Quick registration" : "Full registration"}</dd>
        </dl>
      </AuthCard>
      <p className="mt-5 text-sm text-muted">Questions? Call <a className="pub-link text-ink" href="tel:+911147094120">{FIRM.phone}</a> or email <a className="pub-link break-all text-ink" href={`mailto:${FIRM.email}`}>{FIRM.email}</a>.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {grace && <Link href="/client" className="pub-btn">Open the client portal</Link>}
        <Link href="/" transitionTypes={["nav-back"]} className={grace ? "pub-btn pub-btn-ghost" : "pub-btn"}>Back to website</Link>
        <form action={signOutAction}><button className="pub-btn pub-btn-ghost">Sign out</button></form>
      </div>
    </AuthShell>
  );
}
