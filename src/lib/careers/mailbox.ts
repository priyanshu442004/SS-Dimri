import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { notifyUsers } from "@/lib/services/notifications";
import { careersMailbox } from "./mailbox-config";
import { aiDetails } from "./reply-ai";
import { classify, DETAIL_FIELDS, labelledDetails, messageIdsIn, normalizeMessageId, refInSubject, replyBody, type Details, type MailKind } from "./reply-parse";

// Reading candidates' replies from the careers mailbox (client request 28 Nov 2026). Runs on its own:
// every two minutes in the background (instrumentation.ts), whenever someone opens or reloads the app,
// and while the Careers page is open (it asks every few seconds and reloads its data the moment a
// reply is saved). Never more than one check at a time, and not more often than the caller allows.
//
// The mailbox is opened READ-ONLY: nothing is marked read, moved or deleted. Only messages that belong
// to a resume are stored — matched on the email's thread headers (In-Reply-To / References carry the
// Message-ID we sent), else the "[Ref CV-XXXXXX]" in the subject, else the sender being a candidate we
// emailed (after we emailed them). Everything else in the mailbox is ignored and not kept.

const LOOKBACK_DAYS = 60;
const MAX_PER_RUN = 300;

export type SyncResult = { ran: boolean; reason?: string; found: number; checkedAt: Date | null; error?: string };

let running: Promise<SyncResult> | null = null;

/** Check the mailbox unless it was checked less than `minIntervalSeconds` ago (on any server process). */
export function syncCareersMailbox(opts: { minIntervalSeconds?: number } = {}): Promise<SyncResult> {
  running ??= run(opts.minIntervalSeconds ?? 30).finally(() => { running = null; });
  return running;
}

/** When the mailbox was last read successfully, and the last problem (for the page's status line). */
export async function mailboxStatus() {
  const row = await prisma.careersMailSync.findUnique({ where: { folder: "INBOX" } }).catch(() => null);
  return { configured: !!careersMailbox(), lastOkAt: row?.lastOkAt ?? null, lastRunAt: row?.lastRunAt ?? null, lastError: row?.lastError ?? null };
}

async function claim(minIntervalSeconds: number): Promise<boolean> {
  await prisma.careersMailSync.upsert({ where: { folder: "INBOX" }, create: { folder: "INBOX" }, update: {} });
  const got = await prisma.$queryRaw<{ folder: string }[]>`
    UPDATE careers_mail_sync SET last_run_at = now(), runs = runs + 1
    WHERE folder = 'INBOX' AND (last_run_at IS NULL OR last_run_at < now() - make_interval(secs => ${minIntervalSeconds}))
    RETURNING folder`;
  return got.length > 0;
}

type Sub = { id: string; organizationId: string; ref: string; candidateEmail: string; candidateName: string; mailedAt: Date | null; mailMessageIds: string[] };

async function run(minIntervalSeconds: number): Promise<SyncResult> {
  const cfg = careersMailbox();
  if (!cfg) return { ran: false, reason: "not configured", found: 0, checkedAt: null };
  // Nothing was emailed recently: there is nothing a reply could belong to.
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);
  const subs: Sub[] = await prisma.resumeSubmission.findMany({
    where: { mailedAt: { gte: since } },
    select: { id: true, organizationId: true, ref: true, candidateEmail: true, candidateName: true, mailedAt: true, mailMessageIds: true },
  });
  await retryFailed();
  if (!subs.length) return { ran: false, reason: "nothing sent", found: 0, checkedAt: null };
  if (!(await claim(minIntervalSeconds))) {
    const row = await prisma.careersMailSync.findUnique({ where: { folder: "INBOX" } });
    return { ran: false, reason: "checked recently", found: 0, checkedAt: row?.lastOkAt ?? null };
  }

  const byMessageId = new Map<string, Sub>();
  const byRef = new Map<string, Sub[]>();
  const byEmail = new Map<string, Sub[]>();
  for (const s of subs) {
    for (const id of s.mailMessageIds) byMessageId.set(normalizeMessageId(id), s);
    byRef.set(s.ref, [...(byRef.get(s.ref) ?? []), s]);
    const e = s.candidateEmail.toLowerCase();
    byEmail.set(e, [...(byEmail.get(e) ?? []), s].sort((a, b) => (b.mailedAt?.getTime() ?? 0) - (a.mailedAt?.getTime() ?? 0)));
  }

  const client = new ImapFlow({
    host: cfg.host, port: cfg.port, secure: cfg.secure, auth: { user: cfg.user, pass: cfg.pass },
    logger: false, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 60_000,
  });
  client.on("error", () => undefined); // a dropped connection is reported by the awaited call below
  let found = 0;
  try {
    await client.connect();
    const folders = ["INBOX"];
    // Replies sometimes land in Junk: read that folder too.
    const junk = (await client.list()).find((f) => f.specialUse === "\\Junk" || /^(?:inbox\.)?(?:junk|spam)$/i.test(f.path));
    if (junk) folders.push(junk.path);
    for (const folder of folders) found += await readFolder(client, folder, { since, byMessageId, byRef, byEmail });
    await prisma.careersMailSync.update({ where: { folder: "INBOX" }, data: { lastOkAt: new Date(), lastError: null, lastFound: found } });
    return { ran: true, found, checkedAt: new Date() };
  } catch (e) {
    const error = (e instanceof Error ? (e as Error & { responseText?: string }).responseText || e.message : "Mailbox check failed").slice(0, 400);
    console.error("careers mailbox check failed", error);
    await prisma.careersMailSync.update({ where: { folder: "INBOX" }, data: { lastError: error } }).catch(() => undefined);
    return { ran: true, found, checkedAt: null, error };
  } finally {
    await client.logout().catch(() => client.close());
  }
}

type Lookup = { since: Date; byMessageId: Map<string, Sub>; byRef: Map<string, Sub[]>; byEmail: Map<string, Sub[]> };
type Pending = { uid: number; messageId: string; sub: Sub | null; kind: MailKind; matchedBy: "THREAD" | "REF" | "SENDER" | null; from: string; fromName: string | null; subject: string | null; date: Date };

function headerMap(buf: Buffer | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of (buf?.toString("utf8") ?? "").replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}

async function readFolder(client: ImapFlow, folder: string, look: Lookup): Promise<number> {
  const lock = await client.getMailboxLock(folder, { readOnly: true });
  const pending: Pending[] = [];
  let maxUid = 0;
  try {
    const box = client.mailbox;
    const validity = box && typeof box === "object" ? BigInt(box.uidValidity ?? 0) : BigInt(0);
    const row = await prisma.careersMailSync.upsert({ where: { folder }, create: { folder }, update: {} });
    const fresh = row.uidValidity === null || row.uidValidity !== validity || row.lastUid === 0;
    const found = fresh
      ? await client.search({ since: look.since }, { uid: true })
      : await client.search({ uid: `${row.lastUid + 1}:*` }, { uid: true });
    const all = (found || []).filter((u) => fresh || u > row.lastUid).sort((a, b) => a - b);
    const uids = all.slice(0, MAX_PER_RUN);
    const capped = all.length > uids.length;
    const uidNext = box && typeof box === "object" ? Number(box.uidNext ?? 1) : 1;
    maxUid = fresh ? 0 : row.lastUid;
    if (uids.length) {
      const known = new Set<string>();
      for await (const msg of client.fetch(uids, { uid: true, envelope: true, internalDate: true, headers: ["references", "in-reply-to", "auto-submitted", "x-autoreply", "x-autorespond", "precedence", "content-type"] }, { uid: true })) {
        maxUid = Math.max(maxUid, msg.uid);
        const env = msg.envelope;
        const messageId = normalizeMessageId(env?.messageId) || `${folder}:${validity}:${msg.uid}`;
        if (look.byMessageId.has(messageId)) continue; // a copy of an email we sent
        const headers = headerMap(msg.headers as Buffer | undefined);
        const from = (env?.from?.[0]?.address ?? "").toLowerCase();
        const subject = env?.subject ?? null;
        const date = env?.date ? new Date(env.date) : msg.internalDate ? new Date(msg.internalDate) : new Date();
        const kind = classify({ from, subject, headers });
        let sub: Sub | null = null;
        let matchedBy: Pending["matchedBy"] = null;
        for (const id of [normalizeMessageId(env?.inReplyTo), ...messageIdsIn(headers["references"]), ...messageIdsIn(headers["in-reply-to"])]) {
          if (id && look.byMessageId.has(id)) { sub = look.byMessageId.get(id)!; matchedBy = "THREAD"; break; }
        }
        const ref = !sub ? refInSubject(subject) : null;
        if (!sub && ref) {
          const cands = look.byRef.get(ref) ?? [];
          sub = cands.find((c) => c.candidateEmail.toLowerCase() === from) ?? (cands.length === 1 ? cands[0] : null);
          if (sub) matchedBy = "REF";
        }
        if (!sub && kind !== "BOUNCE") {
          sub = (look.byEmail.get(from) ?? []).find((c) => c.mailedAt && date.getTime() >= c.mailedAt.getTime() - 60_000) ?? null;
          if (sub) matchedBy = "SENDER";
        }
        // A bounce may not quote our headers in its own: its body is checked below.
        if (!sub && kind !== "BOUNCE") continue;
        if (known.has(messageId)) continue;
        known.add(messageId);
        pending.push({ uid: msg.uid, messageId, sub, kind, matchedBy, from, fromName: env?.from?.[0]?.name ?? null, subject, date });
      }
    }
    // Already stored (an earlier run, or another folder): skip.
    const stored = new Set((await prisma.candidateReply.findMany({ where: { messageId: { in: pending.map((p) => p.messageId) } }, select: { messageId: true } })).map((r) => r.messageId));
    let saved = 0;
    for (const p of pending) {
      if (stored.has(p.messageId)) continue;
      const msg = await client.fetchOne(String(p.uid), { source: true }, { uid: true });
      if (!msg || !msg.source) continue;
      const source = msg.source as Buffer;
      if (!p.sub) {
        // A bounce: find which of our emails it returns (its Message-ID or the reference is in the body).
        const raw = source.toString("utf8").toLowerCase();
        const hit = [...look.byMessageId.entries()].find(([id]) => raw.includes(id)) ?? null;
        const refHit = !hit ? [...look.byRef.entries()].find(([ref]) => raw.includes(ref.toLowerCase())) : null;
        p.sub = hit?.[1] ?? (refHit && refHit[1].length === 1 ? refHit[1][0] : null);
        p.matchedBy = hit ? "THREAD" : p.sub ? "REF" : null;
        if (!p.sub) continue;
      }
      if (await saveReply(folder, p, source)) saved++;
    }
    await prisma.careersMailSync.update({ where: { folder }, data: { uidValidity: validity, lastUid: capped ? maxUid : Math.max(maxUid, uidNext - 1), ...(folder !== "INBOX" ? { lastRunAt: new Date(), lastOkAt: new Date(), runs: { increment: 1 } } : {}) } });
    return saved;
  } finally {
    lock.release();
  }
}

const stripHtml = (h: string) => h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>|<\/(?:p|div|li|tr|h\d)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

/** The reason a bounce gives ("550 5.1.1 The email account that you tried to reach does not exist"). */
function bounceReason(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find((l) => /\b[45]\d\d\b|does not exist|no such user|user unknown|mailbox (?:unavailable|not found)|address not found|recipient address rejected/i.test(l));
  return (line ?? "The candidate's mail server returned the email as undeliverable.").slice(0, 300);
}

async function saveReply(folder: string, p: Pending, source: Buffer): Promise<boolean> {
  const sub = p.sub!;
  const parsed = await simpleParser(source, { skipImageLinks: true, skipTextToHtml: true });
  const text = (parsed.text?.trim() ? parsed.text : stripHtml(typeof parsed.html === "string" ? parsed.html : "")).slice(0, 50_000);
  const body = replyBody(text).slice(0, 20_000);
  let row;
  try {
    // Claimed first, so two checks at the same moment never handle one message twice.
    row = await prisma.candidateReply.create({
      data: {
        organizationId: sub.organizationId, submissionId: sub.id, messageId: p.messageId, folder,
        fromEmail: p.from.slice(0, 254) || "unknown", fromName: p.fromName?.slice(0, 200) || null, subject: p.subject?.slice(0, 500) ?? null,
        receivedAt: p.date, kind: p.kind, matchedBy: p.matchedBy ?? "SENDER", bodyText: body || "(empty)", status: p.kind === "REPLY" ? "PROCESSING" : "SKIPPED",
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
  if (p.kind === "BOUNCE") {
    const reason = bounceReason(text);
    await prisma.$transaction(async (tx) => {
      await tx.resumeSubmission.update({ where: { id: sub.id }, data: { mailStatus: "BOUNCED", mailError: reason } });
      await notifyAdmins(tx, sub, { type: "careers.bounce", title: `Email to ${sub.candidateName} bounced`, body: `${sub.candidateEmail}: ${reason}` });
    });
    return true;
  }
  if (p.kind === "AUTO_REPLY") {
    await prisma.resumeSubmission.update({ where: { id: sub.id }, data: { updatedAt: new Date() } });
    return true;
  }
  await applyDetails(row.id, text, body);
  return true;
}

/** Read the five details from a reply (labels first, DeepSeek for the rest) and put them on the resume. */
async function applyDetails(replyId: string, fullText: string, body: string) {
  const reply = await prisma.candidateReply.findUniqueOrThrow({ where: { id: replyId }, include: { submission: { select: { id: true, organizationId: true, candidateName: true, candidateEmail: true, ref: true, mailedAt: true, mailMessageIds: true, replyCount: true } } } });
  const labelled = labelledDetails(fullText);
  const missing = DETAIL_FIELDS.filter((f) => !labelled[f]);
  const ai = await aiDetails(body, missing);
  const details: Details = { ...ai.details, ...labelled };
  const any = Object.keys(details).length > 0;
  const failed = !!ai.error && ai.used && !any;
  const first = reply.attempts === 0;
  await prisma.$transaction(async (tx) => {
    await tx.candidateReply.update({ where: { id: replyId }, data: { details, status: failed ? "FAILED" : any ? "APPLIED" : "NO_DETAILS", error: ai.error ?? null, attempts: { increment: 1 } } });
    await tx.resumeSubmission.update({
      where: { id: reply.submission.id },
      data: {
        // A later reply's answers replace earlier ones; a field it does not mention is kept.
        ...(details as Prisma.ResumeSubmissionUpdateInput),
        ...(any ? { detailsAt: new Date() } : {}),
        ...(first ? { replyCount: { increment: 1 }, lastReplyAt: reply.receivedAt } : {}),
      },
    });
    if (first) {
      await notifyAdmins(tx, reply.submission, {
        type: "careers.reply", title: `${reply.submission.candidateName} replied`,
        body: any ? Object.entries(details).map(([k, v]) => `${k === "currentCtc" ? "Current CTC" : k === "expectedCtc" ? "Expected CTC" : k === "noticePeriod" ? "Notice" : k === "interviewSlots" ? "Interview slots" : "Location"}: ${v}`).join(" · ").slice(0, 400) : "Open the resume to read the reply.",
      });
    }
  });
}

async function notifyAdmins(tx: Prisma.TransactionClient, sub: { id: string; organizationId: string }, note: { type: string; title: string; body: string }) {
  const admins = await tx.organizationMembership.findMany({ where: { organizationId: sub.organizationId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } }, select: { userId: true } });
  await notifyUsers(tx, sub.organizationId, admins.map((a) => a.userId), { ...note, link: `/app/careers?view=${sub.id}` });
}

/** Replies whose details could not be read (the AI was down): tried again, up to three times. */
async function retryFailed() {
  const rows = await prisma.candidateReply.findMany({ where: { kind: "REPLY", status: "FAILED", attempts: { lt: 3 }, updatedAt: { lt: new Date(Date.now() - 60_000) } }, take: 5, select: { id: true, bodyText: true } });
  for (const r of rows) await applyDetails(r.id, r.bodyText, r.bodyText).catch(() => undefined);
}

/** Read one reply's details again (the administrator's "Read again" on a reply). */
export async function rereadReply(organizationId: string, replyId: string) {
  const r = await prisma.candidateReply.findFirst({ where: { id: replyId, organizationId, kind: "REPLY" }, select: { id: true, bodyText: true } });
  if (!r) return false;
  await applyDetails(r.id, r.bodyText, r.bodyText);
  return true;
}
