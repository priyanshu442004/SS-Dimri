import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getContext, isAwaitingApproval } from "@/lib/session";
import { LETTERS } from "@/lib/hr-letters/specs";
import { printableHtml, renderStoredLetter } from "@/lib/hr-letters/sheet";
import { loadHrDocument } from "@/lib/services/hr-letters";

// Printable letter / memo (browser "Save as PDF"); same access as the letter page.
export async function GET(_req: Request, { params }: RouteContext<"/app/letters/[id]/print">) {
  const ctx = await getContext();
  const { id } = await params;
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const doc = await loadHrDocument(ctx, id, can(ctx.role, "employees.manage") && !isAwaitingApproval(ctx));
  if (!doc?.file) return new NextResponse("Not found", { status: 404 });
  const title = doc.type === "letter" ? `${LETTERS[doc.kind].title} – ${doc.employee.firstName}` : `Memo ${doc.memoNumber ?? ""}`;
  return new NextResponse(printableHtml(title, await renderStoredLetter(doc.file.objectKey)), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
