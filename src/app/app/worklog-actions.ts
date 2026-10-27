"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseForm, safeAction, zOptionalText, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { setFlash } from "@/lib/flash";
import {
  acknowledgeDayReport,
  addTimesheetEntry,
  correctTimesheetEntry,
  entryCorrectionSchema,
  entryReviewSchema,
  reviewTimesheetEntry,
  createPendingItem,
  dayReportSchema,
  deleteOwnTimesheetEntry,
  pendingSchema,
  pendingUpdateSchema,
  reviewTimesheet,
  saveDayReport,
  timesheetSchema,
  updatePendingItem,
} from "@/lib/services/worklog";

export async function addTimesheetAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(timesheetSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("timesheet.fill_own");
    await addTimesheetEntry(ctx, parsed.data);
    revalidatePath("/app/timesheet");
    return { ok: true, message: "Entry added." };
  });
}

export async function deleteTimesheetAction(entryId: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("timesheet.fill_own");
    await deleteOwnTimesheetEntry(ctx, entryId);
    revalidatePath("/app/timesheet");
  });
}

const reviewSchema = z.object({ "entryIds[]": z.array(z.uuid()).min(1, "Select entries"), note: zOptionalText(500) });

export async function reviewTimesheetAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(reviewSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("timesheet.review");
    const n = await reviewTimesheet(ctx, parsed.data["entryIds[]"], parsed.data.note);
    revalidatePath("/app/timesheet");
    return { ok: true, message: `${n} entr${n === 1 ? "y" : "ies"} marked reviewed.` };
  });
}

export async function createPendingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(pendingSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("pending.manage_own");
    await createPendingItem(ctx, parsed.data);
    revalidatePath("/app/pending");
    revalidatePath("/app/timesheet");
    return { ok: true, message: "Pending item added." };
  });
}

export async function updatePendingAction(itemId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(pendingUpdateSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("pending.manage_own");
    await updatePendingItem(ctx, itemId, parsed.data);
    revalidatePath("/app/pending");
    return { ok: true, message: "Updated." };
  });
}

export async function saveDayReportAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(dayReportSchema, fd);
  if (!parsed.success) return parsed.state;
  let id = "";
  const r = await safeAction(async () => {
    const ctx = await actionContext("dayreport.submit");
    id = (await saveDayReport(ctx, parsed.data)).id;
  });
  if (r.ok === false) return r;
  if (parsed.data.submit === "send") {
    await setFlash("Day report sent.");
    redirect(`/app/day-reports/${id}`);
  }
  revalidatePath("/app/day-reports");
  return { ok: true, message: "Draft saved." };
}

const dayReportReviewSchema = z.object({ remark: zOptionalText(2000) });

export async function acknowledgeDayReportAction(reportId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(dayReportReviewSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("dayreport.submit");
    await acknowledgeDayReport(ctx, reportId, parsed.data.remark);
    revalidatePath(`/app/day-reports/${reportId}`);
    return { ok: true, message: "Review recorded." };
  });
}

export async function reviewEntryAction(entryId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(entryReviewSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("timesheet.review");
    await reviewTimesheetEntry(ctx, entryId, parsed.data.decision, parsed.data.note);
    revalidatePath(`/app/timesheet/${entryId}`);
    return { ok: true, message: parsed.data.decision === "REVIEWED" ? "Marked as reviewed." : "Returned to the employee for correction." };
  });
}

export async function correctEntryAction(entryId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(entryCorrectionSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("timesheet.fill_own");
    await correctTimesheetEntry(ctx, entryId, parsed.data);
    revalidatePath(`/app/timesheet/${entryId}`);
    return { ok: true, message: "Entry corrected. The change is recorded in its history." };
  });
}
