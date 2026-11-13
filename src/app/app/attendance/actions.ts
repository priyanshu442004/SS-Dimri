"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BusinessRuleError, parseForm, safeAction, zOptionalText, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { correctAttendance, correctionSchema, decideLeave, ensureAdminEmployee, leaveSchema, markAttendance, markLunch, markSchema, requestLeave } from "@/lib/services/attendance";
import { proxyMark, proxyMarkSchema, reviewPhoto, reviewSchema } from "@/lib/services/attendance-proxy";
import { endVisit, startVisit, visitEndSchema, visitSchema } from "@/lib/services/client-visits";
import { saveWorker, saveWorkerDay, setWorkerActive, setWorkerPaid, workerDaySchema, workerSchema } from "@/lib/services/daily-workers";

export async function markAction(kind: "in" | "out", _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(markSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("attendance.mark_own");
    // The owner and administrators get their attendance record at their first mark-in.
    const me = await ensureAdminEmployee(ctx);
    const r = await markAttendance(me, kind, parsed.data, fd);
    revalidatePath("/app/attendance");
    return { ok: true, message: kind === "in" ? (r.late ? "Marked in (after the 9:45 grace time)." : "Marked in.") : "Marked out." };
  });
}

export async function correctAttendanceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(correctionSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("attendance.correct");
    await correctAttendance(ctx, parsed.data);
    revalidatePath("/app/attendance");
    return { ok: true, message: "Attendance saved. The correction is recorded in the audit trail." };
  });
}

export async function requestLeaveAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(leaveSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("leave.request");
    const r = await requestLeave(ctx, parsed.data);
    revalidatePath("/app/attendance");
    return {
      ok: true,
      message: r.shortNotice
        ? `Leave requested. Note: planned leave should be requested ${r.required} days in advance (this is ${r.noticeDays} days).`
        : "Leave requested.",
    };
  });
}

const decideSchema = z.object({ decision: z.enum(["approve", "reject"]), note: zOptionalText(500) });

export async function decideLeaveAction(requestId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(decideSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("leave.decide");
    await decideLeave(ctx, requestId, parsed.data.decision === "approve", parsed.data.note);
    revalidatePath("/app/attendance");
    return { ok: true, message: "Decision saved." };
  });
}

// ---------------------------------------------------------------- client feedback 12 Nov 2026

export async function lunchAction(kind: "out" | "in", _p: ActionState, _fd: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("attendance.mark_own");
    await markLunch(ctx, kind);
    revalidatePath("/app/attendance");
    return { ok: true, message: kind === "out" ? "Lunch started. Enjoy your meal." : "Welcome back. Lunch time is recorded." };
  });
}

export async function proxyMarkAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(proxyMarkSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("attendance.mark_others");
    const message = await proxyMark(ctx, parsed.data, fd);
    revalidatePath("/app/attendance");
    return { ok: true, message };
  });
}

export async function reviewPhotoAction(recordId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(reviewSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("attendance.mark_own");
    const message = await reviewPhoto(ctx, recordId, parsed.data);
    revalidatePath("/app/attendance");
    return { ok: true, message };
  });
}

export async function startVisitAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(visitSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("attendance.mark_own");
    const message = await startVisit(ctx, parsed.data);
    revalidatePath("/app/attendance");
    return { ok: true, message };
  });
}

export async function endVisitAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(visitEndSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("attendance.mark_own");
    const message = await endVisit(ctx, parsed.data);
    revalidatePath("/app/attendance");
    return { ok: true, message };
  });
}

export async function saveWorkerAction(workerId: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(workerSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("attendance.workers");
    await saveWorker(ctx, workerId, parsed.data);
    revalidatePath("/app/attendance");
    return { ok: true, message: workerId ? "Worker updated." : `${parsed.data.name.trim()} added to the daily workers.` };
  });
}

export async function toggleWorkerAction(workerId: string, active: boolean): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("attendance.workers");
    await setWorkerActive(ctx, workerId, active);
    revalidatePath("/app/attendance");
    return { ok: true, message: active ? "Worker is active again." : "Worker set inactive. Their past days and pay stay." };
  });
}

export async function saveWorkerDayAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(workerDaySchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("attendance.workers");
    await saveWorkerDay(ctx, parsed.data);
    revalidatePath("/app/attendance");
    return { ok: true, message: "Day saved." };
  });
}

export async function workerPaidAction(workerId: string, from: string, to: string, paid: boolean): Promise<ActionState> {
  return safeAction(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new BusinessRuleError("Invalid period.");
    const ctx = await actionContext("attendance.workers");
    const r = await setWorkerPaid(ctx, workerId, from, to, paid);
    revalidatePath("/app/attendance");
    return { ok: true, message: paid ? `${r.name}: ${r.days} day(s) marked paid.` : `${r.name}: payment undone for ${r.days} day(s).` };
  });
}
