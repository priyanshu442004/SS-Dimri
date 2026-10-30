import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/db";

// Outgoing email over SMTP (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM).
// sendMail never throws: a failed email must not undo the business change that
// triggered it. Every attempt is logged in email_outbox (never the body or a password).
// Addresses ending in ".invalid" (end-to-end tests) are never sent; when
// MAIL_CAPTURE_DIR is set, their messages are written there for the tests to read.
// Mail sent for a firm shows that firm's name as the sender (on the server's own
// address, so SPF/DKIM still pass) and replies go to the firm's contact email.

export type MailResult = { status: "SENT" | "FAILED" | "SKIPPED"; error?: string };

/** The sending address: the address part of MAIL_FROM ("Name <addr>" or "addr"), else SMTP_USER. */
function senderAddress() {
  const raw = process.env.MAIL_FROM ?? process.env.SMTP_USER ?? "";
  return /<([^>]+)>/.exec(raw)?.[1]?.trim() ?? raw.trim();
}

/** From/Reply-To for a firm's mail; platform mail keeps MAIL_FROM as configured. */
async function senderFor(organizationId: string | null) {
  const fallback = { from: process.env.MAIL_FROM ?? process.env.SMTP_USER, replyTo: undefined as string | undefined };
  if (!organizationId) return fallback;
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { tradeName: true, contactEmail: true } }).catch(() => null);
  if (!org) return fallback;
  return { from: { name: org.tradeName, address: senderAddress() }, replyTo: org.contactEmail ?? undefined };
}

let transport: Transporter | null = null;
function smtp(): Transporter | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT ?? 465);
  transport ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  return transport;
}

export async function sendMail(m: {
  organizationId: string | null;
  to: string;
  template: string;
  subject: string;
  text: string;
  html: string;
  relatedUserId?: string;
  attachments?: { filename: string; content: Uint8Array; contentType: string }[];
}): Promise<MailResult> {
  let result: MailResult;
  if (m.to.toLowerCase().endsWith(".invalid")) {
    result = { status: "SKIPPED", error: "Test address (.invalid): not sent." };
    const dir = process.env.MAIL_CAPTURE_DIR;
    if (dir) {
      await mkdir(dir, { recursive: true }).catch(() => undefined);
      const file = path.join(dir, `${m.to.toLowerCase().replace(/[^a-z0-9@._-]/g, "_")}--${m.template}.json`);
      await writeFile(file, JSON.stringify({ to: m.to, subject: m.subject, text: m.text, attachments: m.attachments?.map((a) => a.filename) })).catch(() => undefined);
    }
  } else {
    const t = smtp();
    if (!t) {
      result = { status: "FAILED", error: "Email is not configured on the server (SMTP settings missing)." };
    } else {
      try {
        const { from, replyTo } = await senderFor(m.organizationId);
        await t.sendMail({
          from, replyTo, to: m.to, subject: m.subject, text: m.text, html: m.html,
          attachments: m.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType })),
        });
        result = { status: "SENT" };
      } catch (e) {
        // Keep the reason short and free of credentials.
        result = { status: "FAILED", error: (e instanceof Error ? e.message : "Send failed").slice(0, 300) };
      }
    }
  }
  await prisma.emailOutbox
    .create({ data: { organizationId: m.organizationId, toEmail: m.to, template: m.template, subject: m.subject, status: result.status, error: result.error, relatedUserId: m.relatedUserId } })
    .catch(() => undefined);
  return result;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(firm: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f4f0;font-family:Arial,Helvetica,sans-serif;color:#1b1f24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dedbd3;border-radius:8px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #dedbd3;font-weight:bold">${esc(firm)}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">${body}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #dedbd3;font-size:12px;color:#5d6470">This is an automated message from the ${esc(firm)} practice portal. Do not share your password with anyone.</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#1e3a5f;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">${esc(label)}</a></p>`;

export function invitationEmail(v: { name: string; firm: string; email: string; tempPassword: string; loginUrl: string; expiresAt: string }) {
  const subject = `Your ${v.firm} staff account`;
  const text = `Hello ${v.name},

${v.firm} has created a staff account for you.

Sign in: ${v.loginUrl}
Email: ${v.email}
Temporary password: ${v.tempPassword}

The temporary password works until ${v.expiresAt}. After signing in you will choose your own password, then fill in your details for review. You can use the portal once your details are approved.`;
  const html = layout(v.firm, `<p>Hello ${esc(v.name)},</p><p>${esc(v.firm)} has created a staff account for you.</p>
<table role="presentation" cellpadding="6" style="background:#f5f4f0;border-radius:6px;font-size:14px"><tr><td>Email</td><td><strong>${esc(v.email)}</strong></td></tr><tr><td>Temporary password</td><td><strong style="font-family:monospace">${esc(v.tempPassword)}</strong></td></tr></table>
${button(v.loginUrl, "Sign in")}
<p>The temporary password works until <strong>${esc(v.expiresAt)}</strong>. After signing in you will choose your own password, then fill in your details for review. You can use the portal once your details are approved.</p>`);
  return { subject, text, html };
}

export function decisionEmail(v: { name: string; firm: string; email: string; loginUrl: string; decision: "APPROVED" | "REJECTED" | "ON_HOLD"; note?: string | null }) {
  const subject = { APPROVED: `Your ${v.firm} account is approved`, REJECTED: `Your ${v.firm} details need changes`, ON_HOLD: `Your ${v.firm} details are on hold` }[v.decision];
  const lead = {
    APPROVED: "Your details have been approved. You can now sign in and use the portal with your email and the password you chose.",
    REJECTED: "Your details could not be approved yet. Please sign in, correct them and submit again.",
    ON_HOLD: "Your details are on hold for now. We will email you again when they have been reviewed.",
  }[v.decision];
  const note = v.note ? `\n\nNote from the administrator: ${v.note}` : "";
  const text = `Hello ${v.name},\n\n${lead}${note}\n\nSign in: ${v.loginUrl}\nEmail: ${v.email}`;
  const html = layout(v.firm, `<p>Hello ${esc(v.name)},</p><p>${esc(lead)}</p>${v.note ? `<p style="background:#f5f4f0;padding:10px;border-radius:6px">Note from the administrator: ${esc(v.note)}</p>` : ""}
${button(v.loginUrl, "Sign in")}<p style="font-size:13px;color:#5d6470">Email: ${esc(v.email)}</p>`);
  return { subject, text, html };
}

export function hrDocumentEmail(v: { name: string; firm: string; title: string; url: string; action: string }) {
  const subject = `${v.title} – ${v.firm}`;
  const text = `Hello ${v.name},

${v.firm} has issued you a ${v.title.toLowerCase()}. It is attached to this email.

You can also read it in the portal and ${v.action}: ${v.url}`;
  const html = layout(v.firm, `<p>Hello ${esc(v.name)},</p><p>${esc(v.firm)} has issued you a <strong>${esc(v.title.toLowerCase())}</strong>. It is attached to this email.</p>
<p>You can also read it in the portal and ${esc(v.action)}.</p>${button(v.url, `Open ${v.title.toLowerCase()}`)}`);
  return { subject, text, html };
}
