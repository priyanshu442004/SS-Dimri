"use server";

import { revalidatePath } from "next/cache";
import { BusinessRuleError, parseForm, safeAction, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { decideLeave, ensureAdminEmployee, leaveSchema, markAttendance, markLunch, markSchema, requestLeave } from "@/lib/services/attendance";
import { cancelRequest, decideRequest, decideSchema as requestDecisionSchema, raiseRequest, requestSchema } from "@/lib/services/attendance-requests";
import { lunchShiftSchema, scheduleSchema, setSchedule, shiftLunch } from "@/lib/services/team-schedules";
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
    if (kind === "in") {
      if (r.band === "VERY_LATE") return { ok: true, message: `Marked in, ${r.lateMinutes} minutes late. Late by more than an hour counts as a half day, unless it is your one informed late arrival this month.` };
      if (r.late) return { ok: true, message: `Marked in, ${r.lateMinutes} minutes late. Three late arrivals (15 minutes to 1 hour) in a month make a half day.` };
      return { ok: true, message: "Marked in. Have a good day." };
    }
    if (r.halfDay) return { ok: true, message: "Marked out. Leaving before the half-day time counts as a half day." };
    if (r.early) return { ok: true, message: "Marked out before the end of your day. Leaving early needs your Team Lead's permission." };
    return { ok: true, message: "Marked out. Enjoy your evening." };
  });
}

export async function requestLeaveAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(leaveSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("leave.request");
    const r = await requestLeave(ctx, parsed.data);
    revalidatePath("/app/attendance");
    const notes = [
      r.withIntimation ? "" : "It was raised after the reporting time, so it counts as leave without prior intimation (unpaid).",
      r.sandwiched.length ? `${r.sandwiched.join(", ")} will also count as leave (Sundays and holidays inside a continuous leave).` : "",
    ].filter(Boolean);
    return { ok: true, message: `Leave requested; your Team Lead is informed.${notes.length ? ` ${notes.join(" ")}` : ""}` };
  });
}

export async function decideLeaveAction(requestId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(requestDecisionSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("leave.request"); // Team Lead = whom they report to; checked in the service
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

// ---------------------------------------------------------------- office rules (14 Nov 2026)

export async function raiseRequestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(requestSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("attendance.mark_own");
    const message = await raiseRequest(ctx, parsed.data);
    revalidatePath("/app/attendance");
    return { ok: true, message };
  });
}

export async function cancelRequestAction(id: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("attendance.mark_own");
    await cancelRequest(ctx, id);
    revalidatePath("/app/attendance");
    return { ok: true, message: "Request withdrawn." };
  });
}

export async function decideRequestAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(requestDecisionSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("leave.request"); // Team Lead = whom they report to; checked in the service
    const name = await decideRequest(ctx, id, parsed.data);
    revalidatePath("/app/attendance");
    return { ok: true, message: `Saved. ${name} is notified.` };
  });
}

export async function setScheduleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(scheduleSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("leave.request"); // Team Lead = whom they report to; checked in the service
    const name = await setSchedule(ctx, parsed.data);
    revalidatePath("/app/attendance");
    return { ok: true, message: `${name}'s timing is saved and they are notified. It applies from their next mark-in.` };
  });
}

export async function shiftLunchAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(lunchShiftSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("leave.request"); // Team Lead = whom they report to; checked in the service
    const name = await shiftLunch(ctx, parsed.data);
    revalidatePath("/app/attendance");
    return { ok: true, message: `${name}'s lunch is moved for today and they are notified.` };
  });
}
