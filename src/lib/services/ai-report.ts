import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/db";
import { dateOnly, isoDateInTz, minutesOfDayInTz } from "@/lib/dates";
import { AI_REPORTING_EMAILS, type Role } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { streamStep } from "@/lib/ai/deepseek";
import { opsSummary, type OpsSummary, type PeriodKey } from "./ops-summary";
import { business360, inrShort, parseBizFilters, shiftRange, weekLabel, weekOf, type BizData } from "./business360";

// Reporting (client formats "Daily Summary Report", 17 Nov 2026, and "Weekly Business Report", 20 Nov
// 2026). The figures come from the ERP (ops-summary.ts, business360.ts); the language model writes the
// executive summary and the priorities from those figures only. A report is stored with the figures as
// they were, so the page opens instantly and shows the same report everyone was mailed.
//   Daily:  every evening at 18:00 IST for that day (mailed as a PDF to AI_REPORT_MAIL_TO).
//   Weekly: every Monday at 09:00 IST for the week just ended, Monday to Sunday (mailed the same way).
// Refresh makes a new one from the figures as they are now (weekly: this week so far).

export type Narrative = { summary: { label: string; text: string }[]; priorities: string[]; ai: boolean };
export type ReportKind = "DAILY" | "WEEKLY";
export type WeeklyData = { kind: "WEEKLY"; biz: BizData; ops: OpsSummary; week: { from: string; to: string }; weekText: string; prevWeekText: string; complete: boolean };
type Meta = { id: string; narrative: Narrative; trigger: string; completedAt: string; mailStatus: string | null; mailTo: string | null; mailedAt: string | null };
export type StoredReport = (Meta & { kind: "DAILY"; data: OpsSummary }) | (Meta & { kind: "WEEKLY"; data: WeeklyData });

const EVENING_MINUTE = 18 * 60; // 18:00 in the firm's timezone (IST)
const WEEKLY_MINUTE = 9 * 60; // Monday 09:00 IST
const LABELS = ["Delivery", "Emergency", "Blockers", "People", "Cost"];
const WEEK_LABELS = ["Delivery", "Client blockers", "People", "Finance", "Exposure", "Capacity"];
export const isReportKind = (v: unknown): v is ReportKind => v === "DAILY" || v === "WEEKLY";

// ---------------------------------------------------------------- who and where

/** Firms that have AI Reporting (the firms of the released logins). */
export async function aiReportFirms(): Promise<string[]> {
  const rows = await prisma.organizationMembership.findMany({
    where: { status: "ACTIVE", user: { email: { in: [...AI_REPORTING_EMAILS] } }, organization: { status: "ACTIVE" } },
    select: { organizationId: true },
  });
  return [...new Set(rows.map((r) => r.organizationId))];
}

/** A read context for the scheduled run: the firm's AI Reporting login (an administrator). */
export async function systemContext(organizationId: string): Promise<AppContext> {
  const m = await prisma.organizationMembership.findFirstOrThrow({
    where: { organizationId, status: "ACTIVE", user: { email: { in: [...AI_REPORTING_EMAILS] } } },
    select: {
      id: true, role: true, grantedCapabilities: true, moduleRestricted: true, allowedModules: true,
      user: { select: { id: true, name: true, email: true } },
      organization: { select: { id: true, tradeName: true, timezone: true, pendingDaysBasis: true } },
    },
  });
  return {
    user: { id: m.user.id, name: m.user.name, email: m.user.email, username: null }, role: m.role as Role,
    grantedCapabilities: m.grantedCapabilities, moduleRestricted: m.moduleRestricted, allowedModules: m.allowedModules,
    membershipId: m.id, mustChangePassword: false, tempPasswordExpiresAt: null, organization: m.organization,
    employee: null, client: null, access: { state: "full", graceEndsAt: null },
  };
}

// ---------------------------------------------------------------- the AI-written part

/** Figures in, five summary lines and six priorities out. Falls back to the worked-out lines if the AI fails. */
export async function writeNarrative(s: OpsSummary): Promise<Narrative> {
  const fallback: Narrative = { summary: s.summary, priorities: s.priorities, ai: false };
  const facts = {
    date: s.dateLabel, firm: s.firm, compare: s.compareLabel,
    kpis: s.kpis.map((k) => ({ label: k.label, value: k.display, change: k.deltaDisplay, note: k.hint })),
    attendanceByRole: s.attendanceByRole, attendanceTotal: s.attendanceTotal,
    workload: s.workload.slice(0, 10), urgent: s.urgent.map(({ href: _h, ...u }) => u),
    pendingFromClients: s.pendingClient, lateArrivals: s.late, lateByRole: s.lateByRole,
    offsite: s.offsite, offsiteTotal: s.offsiteTotal, lateFees: s.penalties, lateFeeTotal: s.penaltyTotal,
  };
  const system = `You write the management summary of an Indian CA / accounting practice's daily operations report. Use ONLY the figures in the JSON; never invent a number, name, client or date. Plain business English, short and specific, names and figures in every line. Indian number format with ₹. Reply with JSON only:
{"summary":[{"label":"Delivery","text":"…"},{"label":"Emergency","text":"…"},{"label":"Blockers","text":"…"},{"label":"People","text":"…"},{"label":"Cost","text":"…"}],"priorities":["…", "… (exactly 6)"]}
- Delivery: assigned / completed, overdue of open with the change, where overdue concentrates.
- Emergency: the single most urgent case and why (client, item, due, issue).
- Blockers: what waits on clients vs on the team, with changes; which one drives overdue.
- People: present / late / leave / offsite with names where few; workload gaps (e.g. no checker, someone overloaded).
- Cost: estimated statutory late-fee exposure and its change; say "estimate".
- Each text one or two sentences, max 230 characters.
- priorities: 6 concrete actions for tomorrow, most urgent first; start with a time ("9:30 AM —") for the first one or two; name the owner, client and item. Max 160 characters each.`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    const step = await streamStep(
      [{ role: "system", content: system }, { role: "user", content: JSON.stringify(facts) }],
      { signal: ctrl.signal, maxTokens: 2500, thinking: false },
    ).finally(() => clearTimeout(timer));
    const json = step.content.slice(step.content.indexOf("{"), step.content.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { summary?: { label?: string; text?: string }[]; priorities?: unknown[] };
    const summary = LABELS.map((label, i) => {
      const hit = parsed.summary?.find((x) => x.label?.toLowerCase() === label.toLowerCase()) ?? parsed.summary?.[i];
      return { label, text: typeof hit?.text === "string" && hit.text.trim() ? hit.text.trim().slice(0, 400) : s.summary[i].text };
    });
    const priorities = (parsed.priorities ?? []).filter((p): p is string => typeof p === "string" && !!p.trim()).map((p) => p.trim().replace(/^\d+[.)]\s*/, "").slice(0, 240)).slice(0, 6);
    return { summary, priorities: priorities.length >= 3 ? priorities : s.priorities, ai: true };
  } catch (e) {
    console.error("AI report narrative failed", e instanceof Error ? e.message : e);
    return fallback;
  }
}

/** The worked-out weekly summary and priorities (used as they are when the language model is unavailable). */
export function weeklyFallback(w: WeeklyData): Narrative {
  const b = w.biz;
  const o = w.ops;
  const k = (key: string) => b.kpis.find((x) => x.key === key) ?? b.opsKpis.find((x) => x.key === key);
  const open = Number(k("open")?.display ?? 0);
  const overdue = Number(k("overdue")?.display ?? 0);
  const review = Number(k("review")?.display ?? 0);
  const pc = o.pendingClient[0];
  const share = open ? Math.round((o.pendingClientTotal.items / Math.max(open, o.pendingClientTotal.items)) * 100) : 0;
  const late = o.attendanceTotal.late;
  const leave = o.attendanceTotal.leave;
  const teamless = b.opsKpis.find((x) => x.key === "alloc")?.hint ?? "";
  const top = b.openPerMember[0];
  const summary = [
    { label: "Delivery", text: `${b.tasksCreated} tasks created and ${b.tasksCompleted} completed this week; ${open} are open, ${overdue} overdue and ${review} await review.` },
    { label: "Client blockers", text: o.pendingClientTotal.items ? `${o.pendingClientTotal.items} items (${share}% of open) wait on client documents${pc ? `; ${pc.client} holds ${pc.items}, oldest ${pc.age} days` : ""}.` : "Nothing is waiting on client documents." },
    { label: "People", text: `${k("ontime")?.display ?? "—"} on-time attendance; ${late} late and ${leave} leave days this week${o.attendanceTotal.offsite ? `; ${o.attendanceTotal.offsite} days at client sites` : ""}.` },
    { label: "Finance", text: b.finance.revenue > 0 ? `Revenue ${inrShort(b.finance.revenue)}${b.kpis.find((x) => x.key === "profit")?.empty ? "" : `, net profit ${b.kpis.find((x) => x.key === "profit")!.display}`}${b.clientScore[0] ? `; ${b.clientScore[0].client} is the largest client (${b.kpis.find((x) => x.key === "topshare")?.display} of revenue)` : ""}.` : `No fee was earned this week on record: ${b.finance.feesRecorded} of ${b.finance.engagements} active services carry an agreed fee.` },
    { label: "Exposure", text: o.penaltyTotal.penalty ? `Estimated late fees ${inrShort(o.penaltyTotal.penalty)} on ${o.penaltyTotal.note}, rising daily until filed.` : "No late-fee exposure on overdue filings." },
    { label: "Capacity", text: `${teamless}${top ? `; ${top.member.split(" ")[0]} carries the most open tasks (${top.open})` : ""}.` },
  ];
  const next = b.statutory.filter((d) => d.daysLeft <= 7).slice(0, 2).map((d) => `${d.form} (${d.day} ${d.month})`);
  const priorities = [
    ...(next.length ? [`File ${next.join(" and ")} on time.`] : []),
    ...o.priorities.slice(0, 3),
    ...(review || overdue ? [`Clear the ${review}-task review queue and the ${overdue} overdue tasks; one owner each.`] : []),
    ...b.risks.filter((r) => r.label === "Fees" || r.label === "Capacity" || r.label === "People").map((r) => r.text),
  ];
  return { summary, priorities: [...new Set(priorities)].slice(0, 6), ai: false };
}

/** Figures in, six summary lines and six priorities for next week out. Falls back to the worked-out lines. */
export async function writeWeeklyNarrative(w: WeeklyData): Promise<Narrative> {
  const fallback = weeklyFallback(w);
  const b = w.biz;
  const o = w.ops;
  const facts = {
    week: w.weekText, comparedWith: w.prevWeekText, firm: b.firm,
    kpis: [...b.kpis, ...b.opsKpis].map((x) => ({ label: x.label, value: x.display, change: x.deltaDisplay, previous: x.prevDisplay, note: x.hint })),
    finance: b.finance, clientScorecard: b.clientScore, teamScorecard: b.teamScore,
    tasksByStatus: b.tasksByStatus, tasksCreated: b.tasksCreated, tasksCompleted: b.tasksCompleted,
    hoursByClient: b.hoursByClient.map((h) => ({ client: h.client, hours: Math.round(h.minutes / 6) / 10 })),
    openTasksPerMember: b.openPerMember, attendanceTotal: o.attendanceTotal, lateByRole: o.lateByRole, peopleInsights: b.insights,
    urgent: o.urgent.map(({ href: _h, ...u }) => u), pendingFromClients: o.pendingClient, lateFees: o.penalties, lateFeeTotal: o.penaltyTotal,
    risks: b.risks, statutoryNext: b.statutory,
  };
  const system = `You write the weekly management summary of an Indian CA / accounting practice. Use ONLY the figures in the JSON; never invent a number, name, client or date. Plain business English, short and specific, names and figures in every line. Indian number format with ₹. Reply with JSON only:
{"summary":[{"label":"Delivery","text":"…"},{"label":"Client blockers","text":"…"},{"label":"People","text":"…"},{"label":"Finance","text":"…"},{"label":"Exposure","text":"…"},{"label":"Capacity","text":"…"}],"priorities":["…", "… (exactly 6)"]}
- Delivery: tasks created / completed this week, open, overdue, awaiting review.
- Client blockers: items waiting on client documents, which client holds most and how old.
- People: on-time %, late and leave days, who stands out.
- Finance: revenue, net profit / margin, largest client's share; if fees or salaries are missing from the records, say so plainly.
- Exposure: estimated statutory late fees and what drives them (say "estimated").
- Capacity: clients without a team, who carries the most open tasks.
- Each text one or two sentences, max 230 characters.
- priorities: 6 concrete actions for next week, most urgent first (statutory dates first); name the owner, client and item. Max 160 characters each.`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    const step = await streamStep(
      [{ role: "system", content: system }, { role: "user", content: JSON.stringify(facts) }],
      { signal: ctrl.signal, maxTokens: 2500, thinking: false },
    ).finally(() => clearTimeout(timer));
    const json = step.content.slice(step.content.indexOf("{"), step.content.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { summary?: { label?: string; text?: string }[]; priorities?: unknown[] };
    const summary = WEEK_LABELS.map((label, i) => {
      const hit = parsed.summary?.find((x) => x.label?.toLowerCase() === label.toLowerCase()) ?? parsed.summary?.[i];
      return { label, text: typeof hit?.text === "string" && hit.text.trim() ? hit.text.trim().slice(0, 400) : fallback.summary[i].text };
    });
    const priorities = (parsed.priorities ?? []).filter((p): p is string => typeof p === "string" && !!p.trim()).map((p) => p.trim().replace(/^\d+[.)]\s*/, "").slice(0, 240)).slice(0, 6);
    return { summary, priorities: priorities.length >= 3 ? priorities : fallback.priorities, ai: true };
  } catch (e) {
    console.error("Weekly report narrative failed", e instanceof Error ? e.message : e);
    return fallback;
  }
}

// ---------------------------------------------------------------- making and reading reports

function toStored(r: { id: string; kind: string; data: unknown; narrative: unknown; trigger: string; completedAt: Date | null; createdAt: Date; mailStatus: string | null; mailTo: string | null; mailedAt: Date | null }): StoredReport {
  const base: Meta = { id: r.id, narrative: r.narrative as Narrative, trigger: r.trigger, completedAt: (r.completedAt ?? r.createdAt).toISOString(), mailStatus: r.mailStatus, mailTo: r.mailTo, mailedAt: r.mailedAt?.toISOString() ?? null };
  return r.kind === "WEEKLY" ? { ...base, kind: "WEEKLY", data: r.data as WeeklyData } : { ...base, kind: "DAILY", data: r.data as OpsSummary };
}

export async function latestReport(organizationId: string, kind: ReportKind = "DAILY"): Promise<StoredReport | null> {
  const r = await prisma.aiReport.findFirst({ where: { organizationId, status: "DONE", kind }, orderBy: { completedAt: "desc" } });
  return r ? toStored(r) : null;
}

/** Id of the newest finished report of a kind: the page checks it to show a new report by itself. */
export async function latestReportStamp(organizationId: string, kind: ReportKind) {
  return prisma.aiReport.findFirst({ where: { organizationId, status: "DONE", kind }, orderBy: { completedAt: "desc" }, select: { id: true, completedAt: true } });
}

export async function reportById(organizationId: string, id: string): Promise<StoredReport | null> {
  const r = await prisma.aiReport.findFirst({ where: { id, organizationId, status: "DONE" } });
  return r ? toStored(r) : null;
}

/** The weekly figures: `week` Monday to Sunday (or Monday to today), against the same days a week earlier. */
export async function weeklyData(ctx: AppContext, week: { from: string; to: string }): Promise<WeeklyData> {
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const cur = { from: week.from, to: week.to > today ? today : week.to };
  const prev = shiftRange(cur, -7);
  const complete = cur.to === week.to && week.to < today;
  const range = { cur, prev, compare: "vs previous week", label: complete ? "Week" : "This week so far" };
  const biz = await business360(ctx, parseBizFilters({}), range);
  const ops = await opsSummary(ctx, { cur, prev, label: range.label, compare: range.compare });
  return { kind: "WEEKLY", biz, ops, week: cur, weekText: weekLabel(cur), prevWeekText: weekLabel(prev), complete };
}

/** Builds and stores one report. `rowId` = an already claimed row (the scheduled runs). */
export async function generateReport(ctx: AppContext, opts: { trigger: "SCHEDULED" | "MANUAL"; rowId?: string; period?: PeriodKey; kind?: ReportKind; week?: { from: string; to: string } }): Promise<StoredReport> {
  const kind = opts.kind ?? "DAILY";
  const row = opts.rowId
    ? { id: opts.rowId }
    : await prisma.aiReport.create({ data: { organizationId: ctx.organization.id, kind, trigger: opts.trigger, requestedById: ctx.user.id } });
  try {
    let data: OpsSummary | WeeklyData;
    let narrative: Narrative;
    if (kind === "WEEKLY") {
      const week = opts.week ?? weekOf(isoDateInTz(new Date(), ctx.organization.timezone));
      const w = await weeklyData(ctx, week);
      data = w;
      narrative = await writeWeeklyNarrative(w);
    } else {
      const d = await opsSummary(ctx, opts.period ?? "today");
      data = d;
      narrative = await writeNarrative(d);
    }
    const done = await prisma.aiReport.update({
      where: { id: row.id },
      data: { status: "DONE", data: JSON.parse(JSON.stringify(data)), narrative, completedAt: new Date(), error: null },
    });
    return toStored(done);
  } catch (e) {
    await prisma.aiReport.update({ where: { id: row.id }, data: { status: "FAILED", error: (e instanceof Error ? e.message : String(e)).slice(0, 500) } }).catch(() => undefined);
    throw e;
  }
}

// ---------------------------------------------------------------- PDF (headless Chromium prints the report page)

const secret = () => process.env.BETTER_AUTH_SECRET ?? "";
/** A short-lived signature that lets the server's own browser open one report's print page. */
export function printToken(reportId: string, ttlSeconds = 300) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac("sha256", secret()).update(`ai-report:${reportId}:${exp}`).digest("base64url");
  return `${exp}.${sig}`;
}
export function checkPrintToken(reportId: string, token: string | null | undefined) {
  const [exp, sig] = (token ?? "").split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000 || !secret()) return false;
  const want = Buffer.from(createHmac("sha256", secret()).update(`ai-report:${reportId}:${exp}`).digest("base64url"));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want);
}

const baseUrl = () => (process.env.AI_REPORT_BASE_URL || process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

let printing: Promise<unknown> = Promise.resolve();
/** The report as an A4 landscape PDF, exactly as the page shows it. One print at a time (small server). */
export async function reportPdf(reportId: string): Promise<Buffer> {
  const run = printing.then(async () => {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    try {
      const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
      const res = await page.goto(`${baseUrl()}/print/ai-report/${reportId}?t=${printToken(reportId)}`, { waitUntil: "networkidle", timeout: 60_000 });
      if (!res?.ok()) throw new Error(`Print page answered ${res?.status() ?? "nothing"}`);
      await page.emulateMedia({ media: "print" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      return await page.pdf({ format: "A4", landscape: true, printBackground: true, margin: { top: "7mm", bottom: "7mm", left: "7mm", right: "7mm" }, scale: 0.6 });
    } finally {
      await browser.close();
    }
  });
  printing = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------- mail

const ddmmyyyy = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(d).replaceAll("/", "-");
const dmy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
export const MAIL_SUBJECT = "Daily Summary Report – Operations & Compliance";
export const WEEKLY_SUBJECT = "Weekly Business Report";

/** Subject, text and attachment name of a report's mail (and of its PDF download). */
export function reportMailParts(r: { kind: string; data: unknown; completedAt: Date | string }, firm: string) {
  const regards = `Regards,\n${firm}`;
  if (r.kind === "WEEKLY") {
    const w = (r.data as WeeklyData | null)?.week;
    const from = w ? dmy(w.from) : ddmmyyyy(new Date(r.completedAt));
    const to = w ? dmy(w.to) : from;
    return {
      subject: `${WEEKLY_SUBJECT} – ${from} to ${to}`,
      body: `Dear Sir/Mam,\n\nPlease find attached the weekly business report for the week ${from} to ${to} (Monday to Sunday) for your reference.\n\n${regards}`,
      filename: `Weekly_Business_Report_${from}_to_${to}.pdf`,
    };
  }
  const asOf = (r.data as { asOfDate?: string } | null)?.asOfDate;
  const day = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? dmy(asOf) : ddmmyyyy(new Date(r.completedAt));
  return {
    subject: `${MAIL_SUBJECT} – Dated: ${day}`,
    body: `Dear Sir/Mam,\n\nPlease find attached the daily summary report for your reference.\n\n${regards}`,
    filename: `Daily_Summary_Report_${day}.pdf`,
  };
}

export function reportMailConfig() {
  const host = process.env.AI_REPORT_SMTP_HOST || process.env.SMTP_HOST;
  const user = process.env.AI_REPORT_SMTP_USER || process.env.SMTP_USER;
  const pass = process.env.AI_REPORT_SMTP_PASS || process.env.SMTP_PASS;
  const port = Number(process.env.AI_REPORT_SMTP_PORT || process.env.SMTP_PORT || 465);
  const from = process.env.AI_REPORT_MAIL_FROM || process.env.MAIL_FROM || user;
  const to = (process.env.AI_REPORT_MAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { host, user, pass, port, from, to, ready: !!(host && user && pass && to.length) };
}

let transport: Transporter | null = null;

/** Mails the PDF of a report and records the result on the report. Never throws. */
export async function mailReport(reportId: string, toOverride?: string[]): Promise<{ status: "SENT" | "FAILED" | "DISABLED"; to: string[]; error?: string }> {
  const cfg = reportMailConfig();
  const to = toOverride?.length ? toOverride : cfg.to;
  if (!cfg.host || !cfg.user || !cfg.pass || !to.length) return { status: "DISABLED", to, error: "Report mail is not configured (AI_REPORT_SMTP_* / AI_REPORT_MAIL_TO)." };
  let result: { status: "SENT" | "FAILED"; to: string[]; error?: string };
  const row = await prisma.aiReport.findUnique({ where: { id: reportId }, select: { kind: true, data: true, completedAt: true, createdAt: true, organization: { select: { tradeName: true } } } });
  const parts = reportMailParts({ kind: row?.kind ?? "DAILY", data: row?.data ?? null, completedAt: row?.completedAt ?? row?.createdAt ?? new Date() }, row?.organization.tradeName ?? "Office ERP");
  try {
    const pdf = await reportPdf(reportId);
    transport ??= nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.port === 465, auth: { user: cfg.user, pass: cfg.pass }, connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 60_000 });
    await transport.sendMail({
      from: cfg.from, to, subject: parts.subject, text: parts.body,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937">${parts.body.split("\n\n").map((p) => `<p style="margin:0 0 14px">${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`).join("")}</div>`,
      attachments: [{ filename: parts.filename, content: pdf, contentType: "application/pdf" }],
    });
    result = { status: "SENT", to };
  } catch (e) {
    result = { status: "FAILED", to, error: (e instanceof Error ? e.message : "Send failed").slice(0, 400) };
    console.error("Report mail failed", result.error);
  }
  await prisma.aiReport.update({
    where: { id: reportId },
    data: { mailStatus: result.status, mailTo: to.join(", "), mailError: result.error ?? null, mailedAt: new Date() },
  }).catch(() => undefined);
  return result;
}

// ---------------------------------------------------------------- the scheduled runs

let running = false;

/**
 * One scheduled report for a firm: claim the slot (the unique kind + day key stops a second server call
 * from making it twice), make it and mail it. A failed run is tried again on the next call; a mail that
 * failed is tried again until `retryUntil`; a run stuck for 20 minutes is marked failed.
 */
async function scheduled(organizationId: string, kind: ReportKind, slot: Date, make: (rowId: string) => Promise<StoredReport>, retryMail: boolean) {
  const existing = await prisma.aiReport.findUnique({ where: { organizationId_kind_scheduledFor: { organizationId, kind, scheduledFor: slot } } });
  const now = new Date();
  if (!existing || existing.status === "FAILED") {
    const row = existing
      ? await prisma.aiReport.update({ where: { id: existing.id }, data: { status: "RUNNING", error: null, createdAt: now } })
      : await prisma.aiReport.create({ data: { organizationId, kind, scheduledFor: slot, trigger: "SCHEDULED" } }).catch(() => null);
    if (!row) return null;
    const report = await make(row.id);
    const mail = await mailReport(report.id);
    return { firm: organizationId, kind, report: report.id, mail: mail.status };
  }
  if (existing.status === "DONE" && existing.mailStatus !== "SENT" && existing.mailStatus !== "DISABLED" && retryMail) {
    const mail = await mailReport(existing.id);
    return { firm: organizationId, kind, report: existing.id, mail: mail.status };
  }
  if (existing.status === "RUNNING" && now.getTime() - existing.createdAt.getTime() > 20 * 60_000) {
    await prisma.aiReport.update({ where: { id: existing.id }, data: { status: "FAILED", error: "Did not finish (timed out)." } });
  }
  return null;
}

/**
 * Called by the scheduled jobs (crontab at 18:00 IST, and the 15-minute sweep as a safety net). For each
 * firm with Reporting:
 *   daily  — after 18:00, once a day, for that day (a failed mail is retried until 22:00);
 *   weekly — from Monday 09:00, once a week, for the week just ended, Monday to Sunday (a run missed on
 *            Monday is made on Tuesday; a failed mail is retried until Tuesday).
 */
export async function runEveningReports(force = false) {
  if (running) return { started: 0, busy: true };
  running = true;
  const out: { firm: string; kind?: string; report?: string; mail?: string; error?: string }[] = [];
  try {
    for (const organizationId of await aiReportFirms()) {
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
      const now = new Date();
      const minute = minutesOfDayInTz(now, org.timezone);
      const today = isoDateInTz(now, org.timezone);
      try {
        if (force || minute >= EVENING_MINUTE) {
          const r = await scheduled(organizationId, "DAILY", dateOnly(today), async (rowId) => generateReport(await systemContext(organizationId), { trigger: "SCHEDULED", rowId }), minute < 22 * 60);
          if (r) out.push(r);
        }
      } catch (e) {
        out.push({ firm: organizationId, kind: "DAILY", error: e instanceof Error ? e.message : String(e) });
        console.error("Daily report failed", e instanceof Error ? e.message : e);
      }
      try {
        const thisWeek = weekOf(today);
        const lastWeek = shiftRange(thisWeek, -7);
        const isMonday = today === thisWeek.from;
        const tuesday = shiftRangeDay(thisWeek.from, 1);
        // Monday from 09:00; a run missed on Monday is caught up on Tuesday (never later: no stale weekly mail).
        if (force || (isMonday && minute >= WEEKLY_MINUTE) || today === tuesday) {
          const r = await scheduled(organizationId, "WEEKLY", dateOnly(lastWeek.from), async (rowId) => generateReport(await systemContext(organizationId), { trigger: "SCHEDULED", rowId, kind: "WEEKLY", week: lastWeek }), today <= tuesday);
          if (r) out.push(r);
        }
      } catch (e) {
        out.push({ firm: organizationId, kind: "WEEKLY", error: e instanceof Error ? e.message : String(e) });
        console.error("Weekly report failed", e instanceof Error ? e.message : e);
      }
    }
  } finally {
    running = false;
  }
  return { started: out.length, results: out };
}

const shiftRangeDay = (iso: string, days: number) => shiftRange({ from: iso, to: iso }, days).from;
