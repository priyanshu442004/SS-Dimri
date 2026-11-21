"use server";

import { revalidatePath } from "next/cache";
import { parseForm, safeAction, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { addNotice, noticeSchema, setNoticeStatus } from "@/lib/services/reminders";

export async function addNoticeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(noticeSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("compliance.use");
    await addNotice(ctx, parsed.data);
    revalidatePath("/app/reminders");
    return { ok: true, message: "Notice recorded: its reply due date now shows in Reminders." };
  });
}

export async function setNoticeStatusAction(id: string, status: "OPEN" | "REPLIED" | "CLOSED"): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("compliance.use");
    await setNoticeStatus(ctx, id, status);
    revalidatePath("/app/reminders");
    return { ok: true, message: status === "REPLIED" ? "Marked replied." : status === "CLOSED" ? "Notice closed." : "Notice reopened." };
  });
}
