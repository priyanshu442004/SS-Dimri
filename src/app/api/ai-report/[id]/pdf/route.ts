import { NextResponse } from "next/server";
import { actionContext } from "@/lib/session";
import { reportById, reportMailParts, reportPdf } from "@/lib/services/ai-report";

// "PDF" on Reporting: the stored report (daily or weekly) printed exactly as the page shows it.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await actionContext("assistant.use");
  } catch {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const { id } = await params;
  const report = /^[0-9a-f-]{36}$/i.test(id) ? await reportById(ctx.organization.id, id) : null;
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  try {
    const pdf = await reportPdf(report.id);
    const { filename } = reportMailParts(report, ctx.organization.tradeName);
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("Report PDF failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The PDF could not be made. Please try again." }, { status: 500 });
  }
}
