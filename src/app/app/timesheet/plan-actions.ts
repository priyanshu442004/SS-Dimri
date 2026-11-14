"use server";

import { revalidatePath } from "next/cache";
import { BusinessRuleError, safeAction, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { escalateEod, leadReviewPlan, parseLines, saveMyEod, saveMyPlan } from "@/lib/services/daily-plans";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const checkDate = (d: string) => {
  if (!ISO.test(d)) throw new BusinessRuleError("Invalid date.");
};

export async function savePlanAction(date: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return safeAction(async () => {
    checkDate(date);
    const ctx = await actionContext("timesheet.fill_own");
    const submit = fd.get("intent") !== "save";
    const r = await saveMyPlan(ctx, date, parseLines(fd.get("items")), submit);
    revalidatePath("/app/timesheet");
    if (!submit) return { ok: true, message: "Plan saved as a draft. Send it to your Team Lead when ready." };
    return { ok: true, message: r.approvedReset ? "Updated plan sent. Your Team Lead will approve it again." : r.first ? "Morning plan sent to your Team Lead." : "Plan updated and sent." };
  });
}

export async function saveEodAction(date: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return safeAction(async () => {
    checkDate(date);
    const ctx = await actionContext("timesheet.fill_own");
    const submit = fd.get("intent") !== "save";
    const note = typeof fd.get("eodNote") === "string" ? String(fd.get("eodNote")).slice(0, 2000) : undefined;
    const r = await saveMyEod(ctx, date, parseLines(fd.get("items")), submit, note);
    revalidatePath("/app/timesheet");
    revalidatePath("/app/attendance");
    if (!submit) return { ok: true, message: "EOD saved as a draft. File it before the deadline." };
    return { ok: true, message: r.late ? "EOD filed, after the deadline: the fine for late filing still applies." : "EOD report filed. Unfinished work will be in tomorrow's plan as old work." };
  });
}

export async function leadPlanAction(planId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("timesheet.fill_own"); // Team Lead = whom they report to; checked in the service
    const intent = String(fd.get("intent") ?? "approve");
    const lines = intent === "approve" ? null : parseLines(fd.get("items"));
    const name = await leadReviewPlan(ctx, planId, lines, intent !== "edit");
    revalidatePath("/app/timesheet");
    return { ok: true, message: intent === "approve" ? `${name}'s plan approved.` : intent === "edit" ? `Changes saved; ${name} is notified.` : `Changes saved and approved; ${name} is notified.` };
  });
}

export async function escalateAction(employeeId: string, date: string): Promise<ActionState> {
  return safeAction(async () => {
    checkDate(date);
    const ctx = await actionContext("timesheet.fill_own"); // Team Lead = whom they report to; checked in the service
    const name = await escalateEod(ctx, employeeId, date);
    revalidatePath("/app/timesheet");
    return { ok: true, message: `Escalated. ${name} is told to update the timesheet and the administrators are informed.` };
  });
}

/** One-click approval from the team list. */
export async function approvePlanAction(planId: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("timesheet.fill_own"); // Team Lead = whom they report to; checked in the service
    const name = await leadReviewPlan(ctx, planId, null, true);
    revalidatePath("/app/timesheet");
    return { ok: true, message: `${name}'s plan approved.` };
  });
}
