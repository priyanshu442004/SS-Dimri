"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { BusinessRuleError, safeAction, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { audit } from "@/lib/services/audit";
import { encryptField } from "@/lib/security/encryption";
import { forgetMessagingSettings, MESSAGE_EVENTS, PARAM_TOKENS, sendTestMessage, type Triggers } from "@/lib/services/messaging";

const text = (fd: FormData, k: string, max = 200) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
};
const on = (fd: FormData, k: string) => fd.get(k) === "on";

/** The firm's email account, WhatsApp account and which events send messages. Secrets are kept encrypted. */
export async function saveMessagingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("org.manage");
    const org = ctx.organization.id;
    const old = await prisma.organizationMessaging.findUnique({ where: { organizationId: org } });
    const smtpPass = text(fd, "smtpPass", 500);
    const waToken = text(fd, "waToken", 2000);
    const port = text(fd, "smtpPort", 6);
    const emailEnabled = on(fd, "emailEnabled");
    const whatsappEnabled = on(fd, "whatsappEnabled");
    const data = {
      emailEnabled,
      smtpHost: text(fd, "smtpHost"), smtpPort: port ? Number(port) : null, smtpUser: text(fd, "smtpUser"),
      fromEmail: text(fd, "fromEmail"), fromName: text(fd, "fromName"),
      whatsappEnabled,
      waPhoneNumberId: text(fd, "waPhoneNumberId", 40), waBusinessAccountId: text(fd, "waBusinessAccountId", 40),
      waApiVersion: text(fd, "waApiVersion", 10) ?? "v21.0",
      ...(smtpPass ? { smtpPassEnc: encryptField(smtpPass) } : {}),
      ...(waToken ? { waTokenEnc: encryptField(waToken) } : {}),
    };
    if (data.smtpPort !== null && (!Number.isInteger(data.smtpPort) || data.smtpPort < 1 || data.smtpPort > 65535)) throw new BusinessRuleError("Enter the SMTP port as a number (usually 465 or 587).");
    if (data.waApiVersion && !/^v\d+\.\d+$/.test(data.waApiVersion)) throw new BusinessRuleError("The Graph API version looks like v21.0.");
    if (emailEnabled && (!data.smtpHost || !data.smtpUser || !(smtpPass || old?.smtpPassEnc))) throw new BusinessRuleError("To send email from your own account, fill the SMTP server, user name and password.");
    if (whatsappEnabled && (!data.waPhoneNumberId || !(waToken || old?.waTokenEnc))) throw new BusinessRuleError("To send WhatsApp messages, fill the phone number ID and the access token.");

    const triggers: Triggers = {};
    for (const e of MESSAGE_EVENTS) {
      const email = on(fd, `email.${e.key}`);
      const whatsapp = on(fd, `wa.${e.key}`);
      const template = text(fd, `tpl.${e.key}`, 120)?.toLowerCase() ?? "";
      const language = text(fd, `lang.${e.key}`, 10) ?? "en";
      const params = (text(fd, `params.${e.key}`, 120) ?? "").split(",").map((p) => p.trim()).filter(Boolean);
      if (template && !/^[a-z0-9_]+$/.test(template)) throw new BusinessRuleError(`"${e.label}": a WhatsApp template name has only small letters, digits and _ (as approved in Meta).`);
      if (whatsapp && !template) throw new BusinessRuleError(`"${e.label}": enter the approved WhatsApp template name, or untick WhatsApp.`);
      const bad = params.find((p) => !(p in PARAM_TOKENS));
      if (bad) throw new BusinessRuleError(`"${e.label}": unknown variable "${bad}". Use ${Object.keys(PARAM_TOKENS).join(", ")}.`);
      if (email || whatsapp || template) triggers[e.key] = { email, whatsapp, template, language, params: params.join(",") };
    }
    await prisma.$transaction(async (tx) => {
      await tx.organizationMessaging.upsert({
        where: { organizationId: org },
        update: { ...data, triggers, updatedById: ctx.user.id },
        create: { organizationId: org, ...data, triggers, updatedById: ctx.user.id },
      });
      await audit(tx, ctx, "organization.messaging_updated", "organization", org, {
        emailEnabled, whatsappEnabled, events: Object.keys(triggers), smtpPasswordChanged: !!smtpPass, whatsappTokenChanged: !!waToken,
      });
    });
    forgetMessagingSettings(org);
    revalidatePath("/app/settings");
    const n = Object.values(triggers).filter((t) => t.email || t.whatsapp).length;
    return { ok: true, message: `Saved. ${n} event${n === 1 ? "" : "s"} will send messages automatically.` };
  });
}

export async function testMessageAction(channel: "EMAIL" | "WHATSAPP", _p: ActionState, fd: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("org.manage");
    const to = text(fd, "to", 200);
    if (!to) throw new BusinessRuleError(channel === "EMAIL" ? "Enter the email address to send the test to." : "Enter the mobile number to send the test to.");
    const r = await sendTestMessage(ctx.organization.id, channel, to, text(fd, "template", 120) ?? undefined, text(fd, "language", 10) ?? undefined);
    revalidatePath("/app/settings");
    if (!r.ok) throw new BusinessRuleError(`Not sent: ${r.error ?? "unknown error"}`);
    return { ok: true, message: channel === "EMAIL" ? `Test email sent to ${to}.` : `Test WhatsApp message sent to ${to}.` };
  });
}
