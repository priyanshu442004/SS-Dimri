import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/db";
import { dateOnly, isoDateInTz, minutesOfDayInTz } from "@/lib/dates";
import { AI_REPORTING_EMAILS, type Role } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { streamStep } from "@/lib/ai/deepseek";
import { opsSummary, type OpsSummary, type PeriodKey } from "./ops-summary";

// AI Reporting (client format "Daily AI Summary Report", 17 Nov 2026). The figures come from the ERP
// (ops-summary.ts); the AI writes the executive summary and tomorrow's priorities from those figures
// only. A report is stored with the figures as they were, so the page opens instantly and shows the
// same report everyone was mailed. It is made every evening at 18:00 IST (and mailed as a PDF to
// AI_REPORT_MAIL_TO), and again whenever someone presses Refresh.

export type Narrative = { summary: { label: string; text: string }[]; priorities: string[]; ai: boolean };
export type StoredReport = { id: string; data: OpsSummary; narrative: Narrative; trigger: string; completedAt: string; mailStatus: string | null; mailTo: string | null; mailedAt: string | null };

const EVENING_MINUTE = 18 * 60; // 18:00 in the firm's timezone (IST)
const LABELS = ["Delivery", "Emergency", "Blockers", "People", "Cost"];

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
async function systemContext(organizationId: string): Promise<AppContext> {
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

// ---------------------------------------------------------------- making and reading reports

function toStored(r: { id: string; data: unknown; narrative: unknown; trigger: string; completedAt: Date | null; createdAt: Date; mailStatus: string | null; mailTo: string | null; mailedAt: Date | null }): StoredReport {
  return {
    id: r.id, data: r.data as OpsSummary, narrative: r.narrative as Narrative, trigger: r.trigger,
    completedAt: (r.completedAt ?? r.createdAt).toISOString(), mailStatus: r.mailStatus, mailTo: r.mailTo, mailedAt: r.mailedAt?.toISOString() ?? null,
  };
}

export async function latestReport(organizationId: string): Promise<StoredReport | null> {
  const r = await prisma.aiReport.findFirst({ where: { organizationId, status: "DONE" }, orderBy: { completedAt: "desc" } });
  return r ? toStored(r) : null;
}

export async function reportById(organizationId: string, id: string): Promise<StoredReport | null> {
  const r = await prisma.aiReport.findFirst({ where: { id, organizationId, status: "DONE" } });
  return r ? toStored(r) : null;
}

/** Builds and stores one report. `rowId` = an already claimed row (the evening run). */
export async function generateReport(ctx: AppContext, opts: { trigger: "SCHEDULED" | "MANUAL"; rowId?: string; period?: PeriodKey }): Promise<StoredReport> {
  const row = opts.rowId
    ? { id: opts.rowId }
    : await prisma.aiReport.create({ data: { organizationId: ctx.organization.id, trigger: opts.trigger, requestedById: ctx.user.id } });
  try {
    const data = await opsSummary(ctx, opts.period ?? "today");
    const narrative = await writeNarrative(data);
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
      return await page.pdf({ format: "A4", landscape: true, printBackground: true, margin: { top: "7mm", bottom: "7mm", left: "7mm", right: "7mm" }, scale: 0.7 });
    } finally {
      await browser.close();
    }
  });
  printing = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------- mail (same format as the AI products' reports)

const ddmmyyyy = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(d).replaceAll("/", "-");
export const MAIL_SUBJECT = "AI Summary Report – Daily Operations & Compliance";
export const MAIL_BODY = "Dear Sir/Mam,\n\nPlease find attached the daily AI summary report for your reference.\n\nRegards,\nAI Reporting System";

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
  if (!cfg.host || !cfg.user || !cfg.pass || !to.length) return { status: "DISABLED", to, error: "AI report mail is not configured (AI_REPORT_SMTP_* / AI_REPORT_MAIL_TO)." };
  let result: { status: "SENT" | "FAILED"; to: string[]; error?: string };
  const row = await prisma.aiReport.findUnique({ where: { id: reportId }, select: { data: true } });
  const asOf = (row?.data as { asOfDate?: string } | null)?.asOfDate;
  const day = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? `${asOf.slice(8, 10)}-${asOf.slice(5, 7)}-${asOf.slice(0, 4)}` : ddmmyyyy(new Date());
  try {
    const pdf = await reportPdf(reportId);
    transport ??= nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.port === 465, auth: { user: cfg.user, pass: cfg.pass }, connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 60_000 });
    await transport.sendMail({
      from: cfg.from, to, subject: `${MAIL_SUBJECT} – Dated: ${day}`, text: MAIL_BODY,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937">${MAIL_BODY.split("\n\n").map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>`,
      attachments: [{ filename: `Daily_AI_Summary_Report_${day}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    result = { status: "SENT", to };
  } catch (e) {
    result = { status: "FAILED", to, error: (e instanceof Error ? e.message : "Send failed").slice(0, 400) };
    console.error("AI report mail failed", result.error);
  }
  await prisma.aiReport.update({
    where: { id: reportId },
    data: { mailStatus: result.status, mailTo: to.join(", "), mailError: result.error ?? null, mailedAt: new Date() },
  }).catch(() => undefined);
  return result;
}

// ---------------------------------------------------------------- the evening run (18:00 IST)

let eveningRunning = false;

/**
 * Called by the scheduled job (crontab at 18:00 IST, and the 15-minute sweep as a safety net). For each
 * firm with AI Reporting: after 18:00, once a day, make the report and mail it. A mail that failed is
 * tried again on the next call until 22:00.
 */
export async function runEveningReports(force = false) {
  if (eveningRunning) return { started: 0, busy: true };
  eveningRunning = true;
  const out: { firm: string; report?: string; mail?: string; error?: string }[] = [];
  try {
    for (const organizationId of await aiReportFirms()) {
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
      const now = new Date();
      const minute = minutesOfDayInTz(now, org.timezone);
      if (!force && minute < EVENING_MINUTE) continue;
      const day = dateOnly(isoDateInTz(now, org.timezone));
      const existing = await prisma.aiReport.findUnique({ where: { organizationId_scheduledFor: { organizationId, scheduledFor: day } } });
      try {
        if (!existing || (existing.status === "FAILED")) {
          // Claim the day's run (the unique day key stops a second server call from making it twice).
          const row = existing
            ? await prisma.aiReport.update({ where: { id: existing.id }, data: { status: "RUNNING", error: null, createdAt: new Date() } })
            : await prisma.aiReport.create({ data: { organizationId, scheduledFor: day, trigger: "SCHEDULED" } }).catch(() => null);
          if (!row) continue;
          const report = await generateReport(await systemContext(organizationId), { trigger: "SCHEDULED", rowId: row.id });
          const mail = await mailReport(report.id);
          out.push({ firm: organizationId, report: report.id, mail: mail.status });
        } else if (existing.status === "DONE" && existing.mailStatus !== "SENT" && existing.mailStatus !== "DISABLED" && minute < 22 * 60) {
          const mail = await mailReport(existing.id);
          out.push({ firm: organizationId, report: existing.id, mail: mail.status });
        } else if (existing.status === "RUNNING" && now.getTime() - existing.createdAt.getTime() > 20 * 60_000) {
          await prisma.aiReport.update({ where: { id: existing.id }, data: { status: "FAILED", error: "Did not finish (timed out)." } });
        }
      } catch (e) {
        out.push({ firm: organizationId, error: e instanceof Error ? e.message : String(e) });
        console.error("Evening AI report failed", e instanceof Error ? e.message : e);
      }
    }
  } finally {
    eveningRunning = false;
  }
  return { started: out.length, results: out };
}
