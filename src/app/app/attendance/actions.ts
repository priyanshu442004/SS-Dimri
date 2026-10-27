"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseForm, safeAction, zOptionalText, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { correctAttendance, correctionSchema, decideLeave, leaveSchema, markAttendance, markSchema, requestLeave } from "@/lib/services/attendance";

export async function markAction(kind: "in" | "out", _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(markSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("attendance.mark_own");
    const r = await markAttendance(ctx, kind, parsed.data, fd);
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
