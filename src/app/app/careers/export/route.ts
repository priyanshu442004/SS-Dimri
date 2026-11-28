import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getContext } from "@/lib/session";
import { isoDateInTz } from "@/lib/dates";
import { xlsxResponse } from "@/lib/xlsx";
import { CAREER_STATUSES, MAIL_STATUSES, listResumes, parseResumeFilters } from "@/lib/services/careers";

/** Every resume (with the filters on the page) as Excel: candidate, referral, email and the details from the reply. */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "careers.manage")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const f = parseResumeFilters(Object.fromEntries(new URL(request.url).searchParams));
  const { rows } = await listResumes(ctx, f, { all: true, take: 5000 });
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const label = <T extends Record<string, string>>(m: T, k: string) => m[k as keyof T] ?? k;
  return xlsxResponse(`resumes-${today}.xlsx`, [{
    name: "Resumes",
    title: `${ctx.organization.tradeName} – Resumes · ${today}`,
    rows: [
      ["Uploaded on", "Ref", "Candidate", "Email", "Phone", "Referred by", "Self / other", "Uploaded by", "Email status", "Emailed on", "Replied on", "Current CTC", "Expected CTC", "Notice period", "Interview slots", "Current location", "Status", "Note"],
      ...rows.map((r) => [
        r.createdAt, r.ref, r.candidateName, r.candidateEmail, r.candidatePhone ?? "", r.referrerName, r.referredBy === "SELF" ? "Self" : "Other",
        r.uploadedBy?.name ?? "", label(MAIL_STATUSES, r.mailStatus), r.mailedAt, r.lastReplyAt,
        r.currentCtc ?? "", r.expectedCtc ?? "", r.noticePeriod ?? "", r.interviewSlots ?? "", r.currentLocation ?? "", label(CAREER_STATUSES, r.status), r.adminNote ?? "",
      ]),
    ],
  }]);
}
