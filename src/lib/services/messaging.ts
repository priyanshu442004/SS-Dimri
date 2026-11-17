import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/db";
import { decryptField } from "@/lib/security/encryption";

// Email & WhatsApp for a firm (client feedback, 17 Nov 2026). The firm saves its own sending
// accounts (SMTP for email, the WhatsApp Business Cloud API for WhatsApp) and picks, per ERP event,
// which channel sends a message and with which approved WhatsApp template. Every in-app
// notification passes through notifyUsers(); for the chosen events the same notice also goes out by
// email and / or WhatsApp — automatically, after the change that caused it is saved.

export type Channel = "EMAIL" | "WHATSAPP";
export type Trigger = { email?: boolean; whatsapp?: boolean; template?: string; language?: string; params?: string };
export type Triggers = Record<string, Trigger>;

/** The events a firm can send messages for, grouped for the settings page. */
export const MESSAGE_EVENTS: { key: string; label: string; group: string }[] = [
  { key: "task.assigned", label: "New task assigned", group: "Tasks" },
  { key: "task.reminder", label: "Task reminder", group: "Tasks" },
  { key: "task.overdue", label: "Task overdue", group: "Tasks" },
  { key: "task.review", label: "Task sent for review", group: "Tasks" },
  { key: "task.reviewed", label: "Task approved / changes requested", group: "Tasks" },
  { key: "task.updated", label: "Task details changed", group: "Tasks" },
  { key: "attendance.auto_absent", label: "Marked absent by the ERP", group: "Attendance & leave" },
  { key: "attendance.mark_out_reminder", label: "Reminder to mark out", group: "Attendance & leave" },
  { key: "attendance.request", label: "Late / early / overtime request (to Team Lead)", group: "Attendance & leave" },
  { key: "attendance.request_decided", label: "Late / early / overtime decision", group: "Attendance & leave" },
  { key: "leave.requested", label: "Leave requested (to Team Lead)", group: "Attendance & leave" },
  { key: "leave.decided", label: "Leave approved / rejected", group: "Attendance & leave" },
  { key: "daily_plan.missing", label: "Morning plan not sent", group: "Plan & timesheet" },
  { key: "daily_plan.eod_missing", label: "EOD report not filed", group: "Plan & timesheet" },
  { key: "daily_plan.escalated", label: "Missing EOD escalated", group: "Plan & timesheet" },
  { key: "allocation.created", label: "Allocated to a client", group: "Clients & work" },
  { key: "pending.assigned", label: "Pending item given", group: "Clients & work" },
  { key: "compliance.reminder", label: "Compliance due reminder", group: "Clients & work" },
  { key: "client.approved", label: "Client registration approved (client)", group: "Client portal" },
  { key: "request.update", label: "Update on a client request (client)", group: "Client portal" },
  { key: "task.update", label: "Update on shared work (client)", group: "Client portal" },
  { key: "task.review_requested", label: "Client asked to review work (client)", group: "Client portal" },
  { key: "employee.letter", label: "Letter issued", group: "HR" },
  { key: "employee.memo", label: "Memo issued", group: "HR" },
  { key: "payroll.salary_changed", label: "Salary changed", group: "HR" },
];

/** WhatsApp template variables, in the order the approved template uses {{1}}, {{2}}, … */
export const PARAM_TOKENS = { name: "Recipient's name", title: "Notice title", details: "Details", link: "Link", firm: "Firm name" } as const;
export const DEFAULT_PARAMS = "name,title,details";

export function parseTriggers(raw: unknown): Triggers {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Triggers) : {};
}

// ---------------------------------------------------------------- settings (cached briefly)

type Settings = NonNullable<Awaited<ReturnType<typeof loadSettings>>>;
const cache = new Map<string, { at: number; value: Settings | null }>();

function loadSettings(organizationId: string) {
  return prisma.organizationMessaging.findUnique({ where: { organizationId } });
}

export async function messagingSettings(organizationId: string): Promise<Settings | null> {
  const hit = cache.get(organizationId);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const value = await loadSettings(organizationId).catch(() => null);
  cache.set(organizationId, { at: Date.now(), value });
  return value;
}

export function forgetMessagingSettings(organizationId: string) {
  cache.delete(organizationId);
  transports.delete(organizationId);
}

// ---------------------------------------------------------------- email through the firm's SMTP

const transports = new Map<string, { key: string; t: Transporter }>();

/** The firm's own SMTP transport and sender, when it is set up and switched on. */
export async function firmTransport(organizationId: string): Promise<{ t: Transporter; from: { name: string; address: string } | string } | null> {
  const s = await messagingSettings(organizationId);
  if (!s?.emailEnabled || !s.smtpHost || !s.smtpUser || !s.smtpPassEnc) return null;
  const key = `${s.smtpHost}|${s.smtpPort}|${s.smtpUser}|${s.updatedAt.getTime()}`;
  let entry = transports.get(organizationId);
  if (!entry || entry.key !== key) {
    const port = s.smtpPort ?? 465;
    const t = nodemailer.createTransport({
      host: s.smtpHost, port, secure: port === 465, auth: { user: s.smtpUser, pass: decryptField(s.smtpPassEnc) },
      connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 20_000,
    });
    entry = { key, t };
    transports.set(organizationId, entry);
  }
  const address = s.fromEmail || s.smtpUser;
  return { t: entry.t, from: s.fromName ? { name: s.fromName, address } : address };
}

// ---------------------------------------------------------------- WhatsApp Cloud API

/** Indian mobile numbers to the international form WhatsApp needs (91XXXXXXXXXX). */
export function waNumber(mobile: string | null | undefined): string | null {
  const d = (mobile ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10) return `91${d}`;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

export async function sendWhatsApp(
  s: Pick<Settings, "waPhoneNumberId" | "waTokenEnc" | "waApiVersion">,
  to: string, template: string, language: string, params: string[],
): Promise<{ ok: boolean; error?: string }> {
  if (!s.waPhoneNumberId || !s.waTokenEnc) return { ok: false, error: "WhatsApp is not set up (phone number ID and access token)." };
  const body = {
    messaging_product: "whatsapp", to, type: "template",
    template: { name: template, language: { code: language || "en" }, ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: text.slice(0, 1000) || "-" })) }] } : {}) },
  };
  try {
    const res = await fetch(`https://graph.facebook.com/${s.waApiVersion || "v21.0"}/${encodeURIComponent(s.waPhoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${decryptField(s.waTokenEnc)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    const err = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
    return { ok: false, error: `${res.status}: ${err?.error?.message ?? res.statusText}`.slice(0, 300) };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : "Send failed").slice(0, 300) };
  }
}

async function log(organizationId: string, channel: Channel, event: string, recipient: string, r: { ok: boolean; error?: string }) {
  await prisma.messageLog.create({ data: { organizationId, channel, event, recipient: recipient.slice(0, 200), status: r.ok ? "SENT" : "FAILED", error: r.error } }).catch(() => undefined);
}

// ---------------------------------------------------------------- dispatch for ERP events

type Note = { type: string; title: string; body?: string | null; link?: string | null };

function baseUrl() {
  return (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
}

/**
 * Called by notifyUsers() for every notice. Runs a moment later, outside the database transaction,
 * and only for notices that were really saved (a rolled-back change sends nothing).
 */
export function queueExternal(organizationId: string, notificationIds: string[], note: Note) {
  if (!notificationIds.length) return;
  setTimeout(() => {
    void sendExternal(organizationId, notificationIds, note).catch((e) => console.error("message dispatch failed", e instanceof Error ? e.message : e));
  }, 1500);
}

async function sendExternal(organizationId: string, notificationIds: string[], note: Note) {
  const s = await messagingSettings(organizationId);
  if (!s) return;
  const trigger = parseTriggers(s.triggers)[note.type];
  const wantEmail = !!trigger?.email;
  const wantWa = !!trigger?.whatsapp && s.whatsappEnabled && !!trigger.template;
  if (!wantEmail && !wantWa) return;
  const saved = await prisma.notification.findMany({
    where: { id: { in: notificationIds } },
    select: {
      user: {
        select: {
          name: true, email: true,
          memberships: { where: { organizationId }, take: 1, select: { employee: { select: { mobile: true, firstName: true } }, client: { select: { contacts: { where: { isPrimary: true }, take: 1, select: { mobile: true } } } } } },
        },
      },
    },
  });
  if (!saved.length) return;
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { tradeName: true } });
  const firm = org?.tradeName ?? "";
  const link = note.link ? `${baseUrl()}${note.link}` : "";
  const { sendMail, notificationEmail } = await import("./mailer");
  for (const { user } of saved) {
    const m = user.memberships[0];
    const name = m?.employee?.firstName ?? user.name;
    if (wantEmail && user.email && !user.email.toLowerCase().endsWith(".invalid")) {
      const mail = notificationEmail({ name, firm, title: note.title, body: note.body ?? null, url: link || null });
      await sendMail({ organizationId, to: user.email, template: `event.${note.type}`, ...mail });
    }
    if (wantWa) {
      const to = waNumber(m?.employee?.mobile ?? m?.client?.contacts[0]?.mobile);
      if (!to) { await log(organizationId, "WHATSAPP", note.type, user.name, { ok: false, error: "No mobile number on record." }); continue; }
      const values: Record<string, string> = { name, title: note.title, details: note.body ?? "", link, firm };
      const params = (trigger!.params || DEFAULT_PARAMS).split(",").map((p) => p.trim()).filter((p) => p in values).map((p) => values[p]);
      await log(organizationId, "WHATSAPP", note.type, to, await sendWhatsApp(s, to, trigger!.template!, trigger!.language ?? "en", params));
    }
  }
}

/** "Send a test" from the settings page. */
export async function sendTestMessage(organizationId: string, channel: Channel, to: string, template?: string, language?: string) {
  if (channel === "WHATSAPP") {
    const s = await loadSettings(organizationId);
    const number = waNumber(to);
    if (!s || !number) return { ok: false, error: !s ? "Save the WhatsApp settings first." : "Enter a valid mobile number." };
    // Meta's ready-made "hello_world" template works on every new account.
    const r = await sendWhatsApp(s, number, template || "hello_world", template ? language || "en" : "en_US", []);
    await log(organizationId, "WHATSAPP", "test", number, r);
    return r;
  }
  forgetMessagingSettings(organizationId);
  const { sendMail, notificationEmail } = await import("./mailer");
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { tradeName: true } });
  const mail = notificationEmail({ name: "there", firm: org?.tradeName ?? "", title: "Test email from your Office ERP", body: "Email from the ERP is working.", url: null });
  const r = await sendMail({ organizationId, to, template: "test", ...mail });
  return { ok: r.status === "SENT", error: r.error };
}
