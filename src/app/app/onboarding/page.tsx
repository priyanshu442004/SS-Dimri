import { requireContext } from "@/lib/session";
import { Clock } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { loadEmployeeProfile, onboardingDefaults } from "@/lib/services/employee-view";
import { Card, Notice, PageHeader } from "@/components/ui";
import { OnboardingForm } from "../employees/onboarding-form";
import { saveMyOnboardingAction } from "../employees/actions";
import { ChangePasswordForm } from "@/components/change-password-form";
import { MyLetters } from "../letters/my-letters";

export default async function MyOnboardingPage() {
  const ctx = await requireContext();
  if (!ctx.employee) {
    return (
      <>
        <PageHeader title="My account" description={`${ctx.user.name} · ${ctx.user.email}`} />
        <Card title="Change password" className="max-w-md"><ChangePasswordForm /></Card>
      </>
    );
  }
  const e = await loadEmployeeProfile(ctx.organization.id, ctx.employee.id);
  if (!e) return null;
  const status = e.approvalStatus;
  const inReview = status === "UNDER_REVIEW" || status === "ON_HOLD" || (status === "PENDING" && !!e.onboardingSubmittedAt);

  // Submitted and waiting: the review status is all the person sees, on every sign-in, until a decision.
  if (inReview) {
    return (
      <div className="mx-auto max-w-xl py-6">
        <div className="rounded-lg border border-line bg-surface p-6">
          <Clock className="size-7 text-warn" aria-hidden />
          <h1 className="mt-3 font-display text-2xl font-semibold text-ink">Your details are under review</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Thank you, {e.firstName}. An administrator at {ctx.organization.tradeName} is reviewing the details you submitted
            {e.onboardingSubmittedAt ? ` on ${formatDateTime(e.onboardingSubmittedAt)}` : ""}. You will get an email at <strong>{e.email ?? ctx.user.email}</strong> as soon as they are approved, and then you can use the portal.
          </p>
          {status === "ON_HOLD" && <div className="mt-4"><Notice tone="warn">Your details are on hold{e.reviewNotes ? `: ${e.reviewNotes}` : "."}</Notice></div>}
          <p className="mt-4 text-xs text-muted">This page updates by itself when a decision is made.</p>
        </div>
        <MyLetters employeeId={e.id} organizationId={ctx.organization.id} className="mt-6" />
      </div>
    );
  }
  return (
    <>
      <PageHeader title={status === "APPROVED" ? "My employee record" : "Complete your details"} description="Your personal, bank and document details. Sensitive numbers are encrypted and visible only to administrators." />
      <div className="mb-4 max-w-4xl">
        {status === "APPROVED" && <Notice tone="ok">Your account is approved. Employee ID {e.permanentEmployeeCode}.</Notice>}
        {status === "PENDING" && (
          <Notice tone="info">Welcome, {e.firstName}! Fill in your details and upload your documents, then tick “submit for approval”. You can use the portal once an administrator approves them. Mobile, PAN, Aadhaar and current address are required to submit.</Notice>
        )}
        {status === "REJECTED" && <Notice tone="danger">Corrections needed: {e.reviewNotes ?? "see your administrator"}. Update your details and submit again.</Notice>}
      </div>
      <MyLetters employeeId={e.id} organizationId={ctx.organization.id} className="mb-6 max-w-4xl" />
      <Card className="max-w-4xl">
        <OnboardingForm action={saveMyOnboardingAction} d={onboardingDefaults(e)} selfService={status !== "APPROVED"} aadhaarLast4={e.aadhaarLast4} />
      </Card>
      <Card title="Change password" className="mt-6 max-w-md"><ChangePasswordForm /></Card>
    </>
  );
}
