"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseForm, safeAction, zCheckbox, zOptionalText, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import {
  addAttachment,
  addReminders,
  addRemark,
  cancelReminder,
  createTask,
  performTaskAction,
  setAssignees,
  setClientSharing,
  taskSchema,
  editTask,
  taskEditSchema,
} from "@/lib/services/tasks";
import { hasFile } from "@/lib/services/files";
import { setFlash } from "@/lib/flash";

export async function createTaskAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(taskSchema, fd);
  if (!parsed.success) return parsed.state;
  const ids: string[] = [];
  const clients = [...new Set([...parsed.data["clientIds[]"], ...(parsed.data.clientId ? [parsed.data.clientId] : [])])];
  const r = await safeAction(async () => {
    const ctx = await actionContext("tasks.create");
    // One task per client, each with the same details, people, reminders and attachments, so each
    // client's work, portal and timesheet stay separate.
    for (const clientId of clients.length ? clients : [undefined]) {
      ids.push((await createTask(ctx, { ...parsed.data, clientId, ...(clients.length > 1 ? { clientServiceId: undefined } : {}) }, fd)).id);
    }
  });
  if (r.ok === false) {
    if (ids.length) {
      await setFlash(`${ids.length} of ${clients.length} tasks were created before an error: ${r.message ?? "please check"}`);
      redirect("/app/tasks");
    }
    return r;
  }
  if (ids.length > 1) {
    await setFlash(`${ids.length} tasks created, one for each client.`);
    redirect("/app/tasks");
  }
  await setFlash("Task created.");
  redirect(`/app/tasks/${ids[0]}`);
}

const actionSchema = z.object({
  action: z.enum(["start", "hold", "wait_client", "wait_team", "submit", "approve", "request_changes", "cancel", "reopen"]),
  comment: zOptionalText(2000),
});

export async function taskTransitionAction(taskId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(actionSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("tasks.update_assigned");
    const logged = await performTaskAction(ctx, taskId, parsed.data.action, parsed.data.comment);
    revalidatePath(`/app/tasks/${taskId}`);
    revalidatePath("/app/timesheet");
    return { ok: true, message: logged ? `Sent for review. ${Math.floor(logged / 60)}h ${String(logged % 60).padStart(2, "0")}m added to your timesheet.` : parsed.data.action === "submit" ? "Sent for review." : "Task updated." };
  });
}

export async function editTaskAction(taskId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(taskEditSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("tasks.create");
    const n = await editTask(ctx, taskId, parsed.data);
    revalidatePath(`/app/tasks/${taskId}`);
    return { ok: true, message: n ? "Task updated. The people on it were told." : "Nothing was changed." };
  });
}

const remarkSchema = z.object({ note: z.string().min(1, "Write a remark, or record a voice note").max(2000), clientVisible: zCheckbox.optional() });

export async function addRemarkAction(taskId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(remarkSchema, fd);
  const file = fd.get("attachment");
  const voiceNotes = fd.getAll("voiceNotes").filter(hasFile);
  if (!parsed.success && !hasFile(file) && !voiceNotes.length) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("tasks.update_assigned");
    if (parsed.success) await addRemark(ctx, taskId, parsed.data.note, !!parsed.data.clientVisible);
    if (hasFile(file)) await addAttachment(ctx, taskId, file);
    for (const v of voiceNotes) await addAttachment(ctx, taskId, v);
    revalidatePath(`/app/tasks/${taskId}`);
    return { ok: true, message: "Added." };
  });
}

const assignSchema = z.object({
  "assigneeIds[]": z.array(z.uuid()).default([]),
  makerEmployeeId: z.uuid().optional(),
  checkerEmployeeId: z.uuid().optional(),
});

export async function setAssigneesAction(taskId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(assignSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("tasks.create");
    await setAssignees(ctx, taskId, parsed.data["assigneeIds[]"], parsed.data.makerEmployeeId, parsed.data.checkerEmployeeId);
    revalidatePath(`/app/tasks/${taskId}`);
    return { ok: true, message: "Assignment updated." };
  });
}

const reminderSchema = z.object({
  "remindAt[]": z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter date and time")).min(1, "Choose at least one date and time"),
  audience: z.enum(["me", "team"]).default("team"),
  note: zOptionalText(300),
});

export async function addReminderAction(taskId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(reminderSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("tasks.update_assigned");
    await addReminders(ctx, taskId, parsed.data["remindAt[]"], parsed.data.audience, parsed.data.note);
    revalidatePath(`/app/tasks/${taskId}`);
    return { ok: true, message: parsed.data["remindAt[]"].length > 1 ? "Reminders set." : "Reminder set." };
  });
}

export async function cancelReminderAction(taskId: string, reminderId: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("tasks.update_assigned");
    await cancelReminder(ctx, taskId, reminderId);
    revalidatePath(`/app/tasks/${taskId}`);
    return { ok: true, message: "Reminder removed." };
  });
}

const sharingSchema = z.object({ clientVisible: zCheckbox.optional(), requestReview: zCheckbox.optional() });

export async function setClientSharingAction(taskId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(sharingSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("tasks.review");
    await setClientSharing(ctx, taskId, { clientVisible: !!parsed.data.clientVisible, requestReview: !!parsed.data.requestReview });
    revalidatePath(`/app/tasks/${taskId}`);
    return { ok: true, message: "Client sharing updated." };
  });
}
