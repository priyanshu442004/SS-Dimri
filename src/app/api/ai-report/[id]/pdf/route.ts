import { NextResponse } from "next/server";
import { actionContext } from "@/lib/session";
import { reportById, reportPdf } from "@/lib/services/ai-report";

// "PDF" on AI Reporting: the stored report printed exactly as the page shows it.
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
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(report.completedAt)).replaceAll("/", "-");
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Daily_AI_Summary_Report_${day}.pdf"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("AI report PDF failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The PDF could not be made. Please try again." }, { status: 500 });
  }
}
