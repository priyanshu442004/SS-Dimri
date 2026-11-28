import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, ConfirmRequired } from "@/lib/actions";
import { serverEnv } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/dates";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { s3 } from "@/lib/storage/s3";
import { findEmails, findPhone, guessName, isEmailShape, type EmailCandidate } from "@/lib/careers/email-extract";
import { readResume, ResumeReadError } from "@/lib/careers/resume-text";
import { firmDisplayName, followUpEmail, resumeAckEmail } from "@/lib/careers/mail";
import { careersMailbox } from "@/lib/careers/mailbox-config";
import { audit } from "./audit";
import { storeUpload, validateUpload } from "./files";
import { senderAddress, sendMail } from "./mailer";
import { notifyUsers } from "./notifications";

// Careers (client request 28 Nov 2026). Every team member can upload a resume — one at a time — and
// say who referred the candidate (themself or someone else). The candidate is emailed at once, at
// the address found in the resume, for their CTC, notice period, interview slots and location.
// Team members see what they uploaded; administrators see every resume, who uploaded and who
// referred it, the email that went out, and the candidate's reply (read back from the mailbox).
//
// The address is never guessed: it is taken as written in the resume (or its mailto: link), and the
// person uploading sees it before anything is sent. When the resume has several addresses, or the
// file's text needed repairing to read one, they must choose / confirm it; a typed address that is
// not in the resume needs an explicit yes; and a domain that cannot receive email is refused.

export const CAREER_STATUSES = {
  NEW: "New",
  SHORTLISTED: "Shortlisted",
  INTERVIEW: "Interview",
  SELECTED: "Selected",
  ON_HOLD: "On hold",
  REJECTED: "Not selected",
} as const;
export type CareerStatus = keyof typeof CAREER_STATUSES;

export const MAIL_STATUSES = {
  PENDING: "Sending…",
  SENT: "Sent",
  FAILED: "Not sent",
  SKIPPED: "Already emailed",
  BOUNCED: "Bounced",
  TEST: "Test address (not sent)",
} as const;

const RESUME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
/** One resume is emailed once in this many days; a second upload of the same address is saved without a new email. */
const REMAIL_DAYS = 30;

export const canManageCareers = (ctx: AppContext) => can(ctx, "careers.manage");

const fullName = (ctx: AppContext) => (ctx.employee ? `${ctx.employee.firstName} ${ctx.employee.lastName ?? ""}`.trim() : ctx.user.name);

// ---------------------------------------------------------------- reading a resume

export type ResumeScan = {
  readable: boolean;
  candidates: EmailCandidate[];
  name: string | null;
  phone: string | null;
};

async function readFile(file: File) {
  const { buf, type } = await validateUpload(file);
  if (!RESUME_TYPES.has(type.mime)) throw new BusinessRuleError(`“${file.name}” is not a resume file. Upload a PDF or Word (.docx) file, or a photo of the resume.`);
  try {
    return { buf, type, text: await readResume(new Uint8Array(buf), type.mime) };
  } catch (e) {
    if (e instanceof ResumeReadError) throw new BusinessRuleError(e.message);
    throw e;
  }
}

function scanOf(text: Awaited<ReturnType<typeof readResume>>): ResumeScan {
  const first = guessName(text.lines);
  const candidates = findEmails(text.text, text.links, first);
  const name = guessName(text.lines, candidates[0]?.email) ?? first;
  return { readable: text.readable || candidates.length > 0, candidates, name, phone: findPhone(text.text) };
}

/** What the upload form shows as soon as a file is chosen: the address(es) found, the name and phone. */
export async function scanResume(ctx: AppContext, file: File): Promise<ResumeScan & { previous: { at: string; mailed: boolean }[] }> {
  const { text } = await readFile(file);
  const scan = scanOf(text);
  // Aiding the name with DeepSeek is not worth sending a resume out: the name is always editable.
  const emails = scan.candidates.map((c) => c.email.toLowerCase());
  const previous = emails.length
    ? await prisma.resumeSubmission.findMany({
        where: { organizationId: ctx.organization.id, candidateEmail: { in: emails, mode: "insensitive" } },
        orderBy: { createdAt: "desc" }, take: 3, select: { createdAt: true, mailStatus: true },
      })
    : [];
  return { ...scan, previous: previous.map((p) => ({ at: formatDate(p.createdAt), mailed: p.mailStatus === "SENT" })) };
}

// ---------------------------------------------------------------- can the domain receive mail?

const KNOWN_MAIL_DOMAINS = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.in", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "rediffmail.com", "protonmail.com", "proton.me", "zoho.com", "zohomail.in", "aol.com", "ymail.com"]);
const dnsCache = new Map<string, { at: number; v: "ok" | "none" | "unknown" }>();

/** "ok" (it has a mail server), "none" (the domain does not exist or takes no mail) or "unknown" (DNS did not answer). */
export async function mailDomainStatus(email: string): Promise<"ok" | "none" | "unknown"> {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  // Test addresses (*.invalid) are never sent (see mailer), so there is nothing to check.
  if (KNOWN_MAIL_DOMAINS.has(domain) || domain.endsWith(".invalid")) return "ok";
  const hit = dnsCache.get(domain);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.v;
  const r = new Resolver({ timeout: 3000, tries: 2 });
  let v: "ok" | "none" | "unknown";
  try {
    const mx = await r.resolveMx(domain);
    // RFC 7505 "null MX" (a single "." host) means the domain takes no mail.
    v = mx.length && !(mx.length === 1 && (mx[0].exchange === "" || mx[0].exchange === ".")) ? "ok" : "none";
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "NXDOMAIN") v = "none";
    else if (code === "ENODATA") {
      // No MX: mail falls back to the domain's own address (A / AAAA record).
      v = await r.resolve4(domain).then((a) => (a.length ? "ok" : "none"), () => r.resolve6(domain).then((a) => (a.length ? "ok" : "none"), () => "none" as const));
    } else v = "unknown";
  }
  dnsCache.set(domain, { at: Date.now(), v });
  return v;
}

// ---------------------------------------------------------------- upload

export const submitSchema = z.object({
  candidateName: z.string({ error: "Enter the candidate's name" }).trim().min(2, "Enter the candidate's name").max(200),
  candidateEmail: z.string({ error: "Choose or enter the candidate's email" }).trim().toLowerCase().refine(isEmailShape, "Enter a valid email address"),
  referredBy: z.enum(["SELF", "OTHER"], { error: "Choose who referred this candidate" }),
  referrerName: z.string().trim().max(200).optional(),
  confirmed: z.literal("on").optional(),
  addressChecked: z.literal("on").optional(),
}).superRefine((v, c) => {
  if (v.referredBy === "OTHER" && (!v.referrerName || v.referrerName.length < 2)) c.addIssue({ code: "custom", path: ["referrerName"], message: "Enter the name of the person who referred this candidate" });
});

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newRef = () => `CV-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

// Each upload sends an email from the firm's address: a sane limit per person stops misuse.
const uploads = new Map<string, number[]>();
function underLimit(userId: string) {
  const now = Date.now();
  const recent = (uploads.get(userId) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 40) return false;
  recent.push(now);
  uploads.set(userId, recent);
  return true;
}

export async function submitResume(ctx: AppContext, files: File[], v: z.infer<typeof submitSchema>) {
  if (files.length !== 1) throw new BusinessRuleError(files.length ? "Upload one resume at a time." : "Choose the resume file.");
  const file = files[0];
  const { text } = await readFile(file);
  const scan = scanOf(text);
  const email = v.candidateEmail;
  const match = scan.candidates.find((c) => c.email.toLowerCase() === email);
  const source = match ? (match.sources.includes("text") || match.sources.includes("link") ? "RESUME" : "CHECKED") : "TYPED";

  // An address pieced together from damaged text is used only once the uploader has checked it.
  if (source === "CHECKED" && !v.addressChecked) throw new BusinessRuleError(`Check ${email} against the resume and tick that it is right before sending.`);
  // A typed address the resume does not contain: say so and ask before sending to it.
  if (source === "TYPED" && scan.candidates.length && !v.confirmed) {
    throw new ConfirmRequired(`${email} is not written in this resume (it has ${scan.candidates.map((c) => c.email).join(", ")}). Send the email to ${email} anyway?`);
  }
  const domain = await mailDomainStatus(email);
  if (domain === "none") throw new BusinessRuleError(`${email.split("@")[1]} does not receive email, so ${email} cannot be right. Check the address in the resume.`);

  const earlier = await prisma.resumeSubmission.findFirst({
    where: { organizationId: ctx.organization.id, candidateEmail: { equals: email, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, mailStatus: true, mailedAt: true, uploadedBy: { select: { name: true } } },
  });
  const recentlyMailed = earlier?.mailStatus === "SENT" && earlier.mailedAt && Date.now() - earlier.mailedAt.getTime() < REMAIL_DAYS * 86400_000;
  if (earlier && !v.confirmed) {
    const by = canManageCareers(ctx) && earlier.uploadedBy ? ` by ${earlier.uploadedBy.name}` : "";
    throw new ConfirmRequired(`${email} was already uploaded on ${formatDate(earlier.createdAt)}${by}. Save this resume as well?${recentlyMailed ? " The candidate was emailed then, so the email will not be sent again." : ""}`);
  }
  if (!underLimit(ctx.user.id)) throw new BusinessRuleError("You have uploaded many resumes in the last hour. Please wait a while and try again.");

  const stored = await storeUpload(ctx, file, { area: "careers", ownerId: ctx.user.id });
  const referrerName = v.referredBy === "SELF" ? fullName(ctx) : v.referrerName!;
  const sub = await prisma.$transaction(async (tx) => {
    let ref = newRef();
    for (let i = 0; i < 5 && (await tx.resumeSubmission.findFirst({ where: { organizationId: ctx.organization.id, ref }, select: { id: true } })); i++) ref = newRef();
    const s = await tx.resumeSubmission.create({
      data: {
        organizationId: ctx.organization.id, ref, fileId: stored.id, candidateName: v.candidateName, candidateEmail: email,
        candidatePhone: scan.phone, emailSource: source, emailsFound: scan.candidates.map((c) => c.email),
        referredBy: v.referredBy, referrerName, uploadedById: ctx.user.id,
        mailStatus: recentlyMailed ? "SKIPPED" : "PENDING",
        mailError: recentlyMailed ? `Already emailed on ${formatDate(earlier!.mailedAt!)}; not sent again.` : null,
      },
    });
    await audit(tx, ctx, "careers.resume_uploaded", "resume_submission", s.id, { ref, source, referredBy: v.referredBy });
    const admins = await tx.organizationMembership.findMany({ where: { organizationId: ctx.organization.id, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] }, userId: { not: ctx.user.id } }, select: { userId: true } });
    await notifyUsers(tx, ctx.organization.id, admins.map((a) => a.userId), {
      type: "careers.resume", title: `New resume: ${v.candidateName}`,
      body: `Uploaded by ${fullName(ctx)}${v.referredBy === "OTHER" ? `, referred by ${referrerName}` : ""}.`, link: `/app/careers?view=${s.id}`,
    });
    return s;
  });
  const mail = recentlyMailed ? null : await sendAck(sub.id);
  return { id: sub.id, email, mail, skipped: !!recentlyMailed, earlier: earlier ? formatDate(earlier.createdAt) : null };
}

/** Send (or send again) the careers email for one resume; records the result on it. */
export async function sendAck(submissionId: string, to?: string) {
  const s = await prisma.resumeSubmission.findUnique({ where: { id: submissionId }, include: { organization: { select: { tradeName: true } } } });
  if (!s) throw new BusinessRuleError("Resume not found.");
  const address = to ?? s.candidateEmail;
  const firm = firmDisplayName(s.organization.tradeName);
  const mail = resumeAckEmail({ name: s.candidateName, firm, ref: s.ref });
  const box = careersMailbox();
  const domain = (box?.address ?? senderAddress()).split("@")[1] || "localhost";
  const messageId = `<careers.${s.ref.toLowerCase()}.${randomBytes(6).toString("hex")}@${domain}>`;
  const result = await sendMail({
    organizationId: s.organizationId, to: address, template: "careers.resume_ack", ...mail, relatedUserId: s.uploadedById ?? undefined,
    // Replies must reach the mailbox the ERP reads, so they show up on the Careers page.
    ...(box ? { replyTo: box.address, serverAccount: true } : {}),
    messageId,
  });
  await prisma.resumeSubmission.update({
    where: { id: s.id },
    data: {
      mailStatus: result.status === "SKIPPED" ? "TEST" : result.status, mailError: result.error?.slice(0, 400) ?? null, mailTo: address,
      ...(result.status === "SENT" ? { mailedAt: new Date(), mailCount: { increment: 1 }, mailMessageIds: { push: (result.messageId ?? messageId).replace(/^<|>$/g, "").toLowerCase() } } : {}),
    },
  });
  return result;
}

// ---------------------------------------------------------------- administrators

const mustManage = (ctx: AppContext) => { if (!canManageCareers(ctx)) throw new BusinessRuleError("Only an administrator can do this."); };

async function ownSubmission(ctx: AppContext, id: string) {
  const s = await prisma.resumeSubmission.findFirst({ where: { id, organizationId: ctx.organization.id } });
  if (!s) throw new BusinessRuleError("This resume was not found. It may have been removed.");
  return s;
}

/** Send the email again, to the same address or a corrected one. */
export async function resendAck(ctx: AppContext, id: string, newEmail?: string) {
  mustManage(ctx);
  const s = await ownSubmission(ctx, id);
  const to = (newEmail ?? s.candidateEmail).trim().toLowerCase();
  if (!isEmailShape(to)) throw new BusinessRuleError("Enter a valid email address.");
  if ((await mailDomainStatus(to)) === "none") throw new BusinessRuleError(`${to.split("@")[1]} does not receive email. Check the address.`);
  if (to !== s.candidateEmail) {
    await prisma.$transaction(async (tx) => {
      await tx.resumeSubmission.update({ where: { id }, data: { candidateEmail: to, emailSource: s.emailsFound.some((e) => e.toLowerCase() === to) ? "RESUME" : "TYPED" } });
      await audit(tx, ctx, "careers.email_corrected", "resume_submission", id, { from: s.candidateEmail, to });
    });
  }
  return sendAck(id, to);
}

export const followUpSchema = z.object({
  subject: z.string().trim().max(300).optional(),
  message: z.string({ error: "Write the message" }).trim().min(2, "Write the message").max(10_000),
});

/**
 * An administrator writes to the candidate (e.g. to fix an interview time). It goes out as a reply in
 * the same email conversation, from the careers mailbox, so the candidate's answer comes back to it and
 * is read like any other reply. It is kept in the conversation on the page, sent or not.
 */
export async function sendFollowUp(ctx: AppContext, id: string, v: z.infer<typeof followUpSchema>) {
  mustManage(ctx);
  const s = await ownSubmission(ctx, id);
  if (s.mailStatus === "BOUNCED") throw new BusinessRuleError("The candidate's address bounced. Correct it under “Email again” first.");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { tradeName: true } });
  const firm = firmDisplayName(org.tradeName);
  const last = await prisma.candidateReply.findFirst({ where: { submissionId: s.id, kind: "REPLY" }, orderBy: { receivedAt: "desc" } });
  const base = last?.subject ?? resumeAckEmail({ name: s.candidateName, firm, ref: s.ref }).subject;
  let subject = v.subject?.trim() || `Re: ${base.replace(/^(?:\s*(?:re|fwd?|aw)\s*:\s*)+/i, "")}`;
  if (!/\bCV-[A-Z0-9]{6}\b/.test(subject)) subject = `${subject} [Ref ${s.ref}]`;
  const mail = followUpEmail({
    firm, subject, message: v.message,
    quote: last ? { at: formatDateTime(last.receivedAt, ctx.organization.timezone), from: last.fromName || last.fromEmail, body: last.bodyText.slice(0, 4000) } : null,
  });
  const box = careersMailbox();
  const domain = (box?.address ?? senderAddress()).split("@")[1] || "localhost";
  const messageId = `<careers.${s.ref.toLowerCase()}.${randomBytes(6).toString("hex")}@${domain}>`;
  const thread = [...s.mailMessageIds, ...(last && !last.messageId.includes(":") ? [last.messageId] : [])].slice(-10).map((m) => `<${m}>`);
  const to = s.mailTo ?? s.candidateEmail;
  const result = await sendMail({
    organizationId: s.organizationId, to, template: "careers.follow_up", ...mail, relatedUserId: ctx.user.id,
    ...(box ? { replyTo: box.address, serverAccount: true } : {}),
    messageId, inReplyTo: thread[thread.length - 1], references: thread,
  });
  const sentId = (result.messageId ?? messageId).replace(/^<|>$/g, "").toLowerCase();
  await prisma.$transaction(async (tx) => {
    await tx.candidateReply.create({
      data: {
        organizationId: s.organizationId, submissionId: s.id,
        // A failed send has no Message-ID on the wire; keep a unique placeholder.
        messageId: result.status === "SENT" ? sentId : `unsent:${randomBytes(12).toString("hex")}`,
        folder: "SENT", fromEmail: (box?.address ?? senderAddress()).slice(0, 254), fromName: fullName(ctx).slice(0, 200),
        subject: subject.slice(0, 500), receivedAt: new Date(), kind: "FOLLOW_UP", matchedBy: "THREAD",
        bodyText: v.message.trim(), status: result.status === "SENT" ? "SENT" : "FAILED", error: result.error?.slice(0, 400) ?? null,
      },
    });
    if (result.status === "SENT") await tx.resumeSubmission.update({ where: { id: s.id }, data: { mailMessageIds: { push: sentId } } });
    await audit(tx, ctx, "careers.follow_up", "resume_submission", s.id, { status: result.status });
  });
  return result;
}

/** "Send all again" once email works again: every resume whose email did not go out. */
export async function resendFailed(ctx: AppContext) {
  mustManage(ctx);
  const rows = await prisma.resumeSubmission.findMany({ where: { organizationId: ctx.organization.id, mailStatus: { in: ["FAILED", "PENDING"] }, createdAt: { lt: new Date(Date.now() - 60_000) } }, select: { id: true }, take: 50 });
  let sent = 0;
  for (const r of rows) if ((await sendAck(r.id)).status === "SENT") sent++;
  return { tried: rows.length, sent };
}

export const statusSchema = z.object({
  status: z.enum(Object.keys(CAREER_STATUSES) as [CareerStatus, ...CareerStatus[]]),
  adminNote: z.string().trim().max(2000).optional(),
});

export async function updateResume(ctx: AppContext, id: string, v: z.infer<typeof statusSchema>) {
  mustManage(ctx);
  await ownSubmission(ctx, id);
  await prisma.$transaction(async (tx) => {
    await tx.resumeSubmission.update({ where: { id }, data: { status: v.status, adminNote: v.adminNote ?? null } });
    await audit(tx, ctx, "careers.status", "resume_submission", id, { status: v.status });
  });
}

/** Remove a resume entirely (an upload by mistake): the record, its replies and the stored file. */
export async function deleteResume(ctx: AppContext, id: string) {
  mustManage(ctx);
  const s = await ownSubmission(ctx, id);
  const file = s.fileId ? await prisma.storedFile.findUnique({ where: { id: s.fileId }, select: { id: true, bucket: true, objectKey: true } }) : null;
  await prisma.$transaction(async (tx) => {
    await tx.resumeSubmission.delete({ where: { id } });
    if (file) await tx.storedFile.update({ where: { id: file.id }, data: { deletedAt: new Date() } });
    await audit(tx, ctx, "careers.resume_deleted", "resume_submission", id, { ref: s.ref });
  });
  if (file && file.bucket === serverEnv().AWS_BUCKET_NAME) {
    await s3().send(new DeleteObjectCommand({ Bucket: file.bucket, Key: file.objectKey })).catch((e) => console.error("resume object not removed", e instanceof Error ? e.name : e));
  }
  return s.candidateName;
}

// ---------------------------------------------------------------- lists

export type ResumeFilters = { q: string; status: string; mail: string; replied: string; page: number };

export function parseResumeFilters(sp: Record<string, string | string[] | undefined>): ResumeFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  return {
    q: one("q").slice(0, 100),
    status: one("status") in CAREER_STATUSES ? one("status") : "",
    mail: ["SENT", "FAILED", "BOUNCED", "SKIPPED"].includes(one("mail")) ? one("mail") : "",
    replied: ["yes", "no"].includes(one("replied")) ? one("replied") : "",
    page: Math.max(1, Number.parseInt(one("page"), 10) || 1),
  };
}

function whereFor(ctx: AppContext, f: ResumeFilters, all: boolean): Prisma.ResumeSubmissionWhereInput {
  const q = f.q;
  return {
    organizationId: ctx.organization.id,
    ...(all ? {} : { uploadedById: ctx.user.id }),
    ...(f.status ? { status: f.status } : {}),
    ...(f.mail ? { mailStatus: f.mail } : {}),
    ...(f.replied === "yes" ? { replyCount: { gt: 0 } } : f.replied === "no" ? { replyCount: 0 } : {}),
    ...(q ? { OR: [
      { candidateName: { contains: q, mode: "insensitive" } }, { candidateEmail: { contains: q, mode: "insensitive" } },
      { candidatePhone: { contains: q.replace(/\s/g, "") } }, { referrerName: { contains: q, mode: "insensitive" } },
      { ref: { contains: q, mode: "insensitive" } }, ...(all ? [{ uploadedBy: { name: { contains: q, mode: "insensitive" as const } } }] : []),
    ] } : {}),
  };
}

export const PAGE_SIZE = 25;

export async function listResumes(ctx: AppContext, f: ResumeFilters, opts: { all: boolean; take?: number }) {
  const where = whereFor(ctx, f, opts.all);
  const [rows, total] = await Promise.all([
    prisma.resumeSubmission.findMany({
      where, orderBy: { createdAt: "desc" }, skip: opts.take ? 0 : (f.page - 1) * PAGE_SIZE, take: opts.take ?? PAGE_SIZE,
      include: { uploadedBy: { select: { name: true } }, file: { select: { id: true, originalFileName: true, deletedAt: true } } },
    }),
    prisma.resumeSubmission.count({ where }),
  ]);
  return { rows, total };
}

export async function careerStats(ctx: AppContext) {
  const org = ctx.organization.id;
  const monthStart = new Date(Date.now() - 30 * 86400_000);
  const [total, month, replied, failed, fresh] = await Promise.all([
    prisma.resumeSubmission.count({ where: { organizationId: org } }),
    prisma.resumeSubmission.count({ where: { organizationId: org, createdAt: { gte: monthStart } } }),
    prisma.resumeSubmission.count({ where: { organizationId: org, replyCount: { gt: 0 } } }),
    prisma.resumeSubmission.count({ where: { organizationId: org, mailStatus: { in: ["FAILED", "BOUNCED"] } } }),
    prisma.resumeSubmission.count({ where: { organizationId: org, status: "NEW" } }),
  ]);
  return { total, month, replied, failed, fresh };
}

export async function resumeDetail(ctx: AppContext, id: string) {
  mustManage(ctx);
  const s = await prisma.resumeSubmission.findFirst({
    where: { id, organizationId: ctx.organization.id },
    include: {
      uploadedBy: { select: { name: true, email: true } },
      file: { select: { id: true, originalFileName: true, sizeBytes: true, deletedAt: true } },
      replies: { orderBy: { receivedAt: "asc" } },
      organization: { select: { tradeName: true } },
    },
  });
  if (!s) return null;
  const attempts = await prisma.emailOutbox.findMany({
    where: { organizationId: ctx.organization.id, template: { in: ["careers.resume_ack", "careers.follow_up"] }, toEmail: { in: [...new Set([s.candidateEmail, s.mailTo ?? s.candidateEmail])], mode: "insensitive" }, createdAt: { gte: s.createdAt } },
    orderBy: { createdAt: "desc" }, take: 20, select: { id: true, template: true, toEmail: true, status: true, error: true, createdAt: true },
  });
  const email = resumeAckEmail({ name: s.candidateName, firm: firmDisplayName(s.organization.tradeName), ref: s.ref });
  return { ...s, attempts, email, replyTo: careersMailbox()?.address ?? null };
}

/**
 * A short fingerprint of what the Careers page shows: when it changes (a reply came in, a mail was
 * sent or bounced, someone uploaded), the open page reloads its data on its own.
 */
export async function careersVersion(ctx: AppContext): Promise<string> {
  const all = canManageCareers(ctx);
  const where = { organizationId: ctx.organization.id, ...(all ? {} : { uploadedById: ctx.user.id }) };
  const [agg, replies] = await Promise.all([
    prisma.resumeSubmission.aggregate({ where, _max: { updatedAt: true }, _count: { _all: true } }),
    all ? prisma.candidateReply.aggregate({ where: { organizationId: ctx.organization.id }, _max: { updatedAt: true }, _count: { _all: true } }) : null,
  ]);
  return [agg._count._all, agg._max.updatedAt?.getTime() ?? 0, replies?._count._all ?? 0, replies?._max.updatedAt?.getTime() ?? 0].join(".");
}

/** Replies received since `since` (for the "new reply" toast on the open page). */
export async function repliesSince(ctx: AppContext, since: Date) {
  if (!canManageCareers(ctx)) return [];
  const rows = await prisma.candidateReply.findMany({
    where: { organizationId: ctx.organization.id, createdAt: { gt: since }, kind: { in: ["REPLY", "BOUNCE"] } },
    orderBy: { createdAt: "asc" }, take: 5, select: { id: true, kind: true, submission: { select: { id: true, candidateName: true } } },
  });
  return rows.map((r) => ({ id: r.id, kind: r.kind, submissionId: r.submission.id, name: r.submission.candidateName }));
}

