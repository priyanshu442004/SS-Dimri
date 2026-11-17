import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { REPORT_TITLE } from "./report-prompt";
import { ReportView } from "./report-view";

export const metadata: Metadata = { title: "AI reporting" };

// The Business 360° report: built by the AI from the live sheet and the ERP, shown full size.
// The latest report opens instantly; "Generate new report" builds a fresh one.
export default async function ReportingPage() {
  const ctx = await requireCapability("assistant.use");
  const last = await prisma.aiMessage.findFirst({
    where: { role: "assistant", status: "done", conversation: { userId: ctx.user.id, organizationId: ctx.organization.id, title: REPORT_TITLE } },
    orderBy: { createdAt: "desc" },
    select: { content: true, blocks: true, createdAt: true, conversationId: true },
  });
  return (
    <ReportView
      firm={ctx.organization.tradeName}
      initial={last ? { content: last.content, blocks: (last.blocks as unknown[] | null) ?? [], createdAt: last.createdAt.toISOString(), conversationId: last.conversationId } : null}
    />
  );
}
