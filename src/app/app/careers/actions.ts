"use server";

import { revalidatePath } from "next/cache";
import { BusinessRuleError, parseForm, safeAction, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { hasFile } from "@/lib/services/files";
import { deleteResume, followUpSchema, sendFollowUp, resendAck, resendFailed, scanResume, statusSchema, submitResume, submitSchema, updateResume, type ResumeScan } from "@/lib/services/careers";
import { rereadReply, syncCareersMailbox } from "@/lib/careers/mailbox";

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const done = () => revalidatePath("/app/careers");

export type ScanState = { ok: boolean; message?: string; scan?: ResumeScan & { previous: { at: string; mailed: boolean }[] } };

/** As soon as a file is chosen: read it and return the address(es), name and phone found. Nothing is stored. */
export async function scanResumeAction(fd: FormData): Promise<ScanState> {
  try {
    const ctx = await actionContext("careers.use");
    const files = fd.getAll("resume").filter(hasFile);
    if (files.length !== 1) return { ok: false, message: "Choose one resume file." };
    return { ok: true, scan: await scanResume(ctx, files[0]) };
  } catch (e) {
    if (e instanceof BusinessRuleError) return { ok: false, message: e.message };
    console.error("resume scan failed", e instanceof Error ? e.message : e);
    return { ok: false, message: "This file could not be read. Try again, or upload it as a PDF." };
  }
}

export async function submitResumeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(submitSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("careers.use");
    const r = await submitResume(ctx, fd.getAll("resume").filter(hasFile), parsed.data);
    done();
    if (r.skipped) return { ok: true, message: `Resume saved. ${r.email} was emailed recently, so the email was not sent again.` };
    if (r.mail?.status === "SKIPPED") return { ok: true, message: `Resume saved. ${r.email} is a test address, so no email was sent.` };
    if (r.mail?.status === "SENT") return { ok: true, message: `Resume saved and the email is on its way to ${r.email}.` };
    return { ok: true, message: `Resume saved, but the email to ${r.email} could not be sent right now. An administrator can send it again from Careers.` };
  });
}

export async function resendAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return safeAction(async () => {
    if (!isId(id)) throw new BusinessRuleError("Resume not found.");
    const ctx = await actionContext("careers.manage");
    const to = String(fd.get("email") ?? "").trim() || undefined;
    const r = await resendAck(ctx, id, to);
    done();
    return r.status === "SENT" ? { ok: true, message: "Email sent." } : { ok: false, message: `Not sent: ${r.error ?? "the mail server did not accept it."}` };
  });
}

export async function followUpAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(followUpSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    if (!isId(id)) throw new BusinessRuleError("Resume not found.");
    const ctx = await actionContext("careers.manage");
    const r = await sendFollowUp(ctx, id, parsed.data);
    done();
    return r.status === "SENT" ? { ok: true, message: "Sent to the candidate. Their answer will appear here." } : { ok: false, message: `Not sent: ${r.error ?? "the mail server did not accept it."} It is kept in the conversation.` };
  });
}

export async function resendFailedAction(): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("careers.manage");
    const r = await resendFailed(ctx);
    done();
    if (!r.tried) return { ok: true, message: "Every email has gone out — nothing to send." };
    return r.sent === r.tried ? { ok: true, message: `Sent ${r.sent} email${r.sent === 1 ? "" : "s"}.` } : { ok: false, message: `Sent ${r.sent} of ${r.tried}. Email is still not going out from the server — check the mail settings.` };
  });
}

export async function updateResumeAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(statusSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    if (!isId(id)) throw new BusinessRuleError("Resume not found.");
    const ctx = await actionContext("careers.manage");
    await updateResume(ctx, id, parsed.data);
    done();
    return { ok: true, message: "Saved." };
  });
}

export async function deleteResumeAction(id: string): Promise<ActionState> {
  return safeAction(async () => {
    if (!isId(id)) throw new BusinessRuleError("Resume not found.");
    const ctx = await actionContext("careers.manage");
    const name = await deleteResume(ctx, id);
    done();
    return { ok: true, message: `Removed ${name}'s resume.` };
  });
}

export async function rereadReplyAction(replyId: string): Promise<ActionState> {
  return safeAction(async () => {
    if (!isId(replyId)) throw new BusinessRuleError("Reply not found.");
    const ctx = await actionContext("careers.manage");
    if (!(await rereadReply(ctx.organization.id, replyId))) throw new BusinessRuleError("Reply not found.");
    done();
    return { ok: true, message: "Details read again." };
  });
}

/** "Check now": read the mailbox at once (at most every few seconds). */
export async function checkRepliesAction(): Promise<ActionState> {
  return safeAction(async () => {
    await actionContext("careers.manage");
    const r = await syncCareersMailbox({ minIntervalSeconds: 5 });
    done();
    if (r.error) return { ok: false, message: `Could not read the mailbox: ${r.error}` };
    if (r.reason === "not configured") return { ok: false, message: "The careers mailbox is not set up on the server (IMAP / SMTP settings)." };
    return { ok: true, message: r.found ? `${r.found} new message${r.found === 1 ? "" : "s"} from candidates.` : "Up to date — no new replies." };
  });
}
