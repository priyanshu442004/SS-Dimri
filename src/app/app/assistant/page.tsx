import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { aiConfig, sheetFor } from "@/lib/ai/config";
import { AssistantApp } from "./assistant-app";
import { toView } from "./view";

export const metadata: Metadata = { title: "AI reporting" };

export default async function AssistantPage({ searchParams }: PageProps<"/app/assistant">) {
  const ctx = await requireCapability("assistant.use");
  const sp = await searchParams;
  const wanted = typeof sp.c === "string" && /^[0-9a-f-]{36}$/i.test(sp.c) ? sp.c : null;
  const owner = { userId: ctx.user.id, organizationId: ctx.organization.id };

  const [conversations, initial] = await Promise.all([
    prisma.aiConversation.findMany({ where: owner, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], take: 200, select: { id: true, title: true, pinned: true, updatedAt: true } }),
    wanted
      ? prisma.aiConversation.findFirst({
          where: { id: wanted, ...owner },
          select: {
            id: true, title: true,
            messages: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, quote: true, blocks: true, followUp: true, status: true, feedback: true, durationMs: true, createdAt: true } },
          },
        })
      : null,
  ]);

  // Starter questions, only for data this person can actually see.
  const sheet = !!sheetFor(ctx);
  const suggestions = [
    can(ctx, "attendance.view_all") && { title: "Who was late yesterday?", hint: "Names, minutes late and reasons" },
    can(ctx, "attendance.view_all") && { title: "Attendance trend this month", hint: "Present, late and absent per day" },
    can(ctx, "tasks.view_all") && { title: "Which tasks are overdue, by person?", hint: "Open tasks past their due date" },
    can(ctx, "payroll.manage") && { title: "Total net payroll last month", hint: "With fines and deductions" },
    sheet && { title: "Client-wise profit from the sheet", hint: "Revenue, cost and margin per client" },
    sheet && { title: "Which team members are loss-making?", hint: "Team profit from the live sheet" },
    can(ctx, "attendance.view_all") && { title: "Who is on leave this week?", hint: "Approved leave and absences" },
    can(ctx, "clients.view_all") && { title: "How many active clients do we have?", hint: "Split by nature of client" },
  ].filter((x): x is { title: string; hint: string } => !!x).slice(0, 6);

  return (
    <AssistantApp
      initialConversations={conversations.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() }))}
      initialConversation={initial ? { id: initial.id, title: initial.title, messages: initial.messages.map(toView) } : null}
      suggestions={suggestions}
      userFirstName={(ctx.employee?.firstName ?? ctx.user.name).split(" ")[0]}
      firmName={ctx.organization.tradeName}
      modelName={aiConfig().model}
      configured={!!aiConfig().apiKey}
    />
  );
}
