"use client";

import { ActionForm, Checkbox, SubmitButton, TextField, type FormState } from "@/components/form";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Trigger = { email?: boolean; whatsapp?: boolean; template?: string; language?: string; params?: string };
export type MessagingDefaults = {
  emailEnabled: boolean; smtpHost: string; smtpPort: string; smtpUser: string; hasSmtpPass: boolean; fromEmail: string; fromName: string;
  whatsappEnabled: boolean; waPhoneNumberId: string; waBusinessAccountId: string; hasWaToken: boolean; waApiVersion: string;
  triggers: Record<string, Trigger>;
};

const cell = "h-8 w-full rounded border border-line bg-surface px-2 text-xs";

export function MessagingForm({ action, d, events, defaultParams }: { action: Act; d: MessagingDefaults; events: { key: string; label: string; group: string }[]; defaultParams: string }) {
  const groups = [...new Set(events.map((e) => e.group))];
  return (
    <ActionForm action={action}>
      <fieldset className="space-y-3 rounded-lg border border-line p-4">
        <legend className="px-1 text-sm font-semibold">Email account (SMTP)</legend>
        <p className="text-xs text-muted">Leave this off to keep sending from the portal&apos;s own email. Any provider works through SMTP (Gmail / Google Workspace, Zoho, Microsoft 365, SendGrid, Amazon SES…).</p>
        <Checkbox name="emailEnabled" label="Send the firm's email from this account" defaultChecked={d.emailEnabled} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="SMTP server" name="smtpHost" defaultValue={d.smtpHost} placeholder="smtp.gmail.com" />
          <TextField label="Port" name="smtpPort" defaultValue={d.smtpPort} placeholder="465" inputMode="numeric" />
          <TextField label="User name" name="smtpUser" defaultValue={d.smtpUser} autoComplete="off" />
          <TextField label="Password / app password" name="smtpPass" type="password" autoComplete="new-password" placeholder={d.hasSmtpPass ? "Saved — type to change" : ""} hint="Stored encrypted" />
          <TextField label="From address" name="fromEmail" type="email" defaultValue={d.fromEmail} hint="Blank = the user name" />
          <TextField label="From name" name="fromName" defaultValue={d.fromName} placeholder="S S Dimri & Associates" />
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-line p-4">
        <legend className="px-1 text-sm font-semibold">WhatsApp Business (Cloud API)</legend>
        <p className="text-xs text-muted">From Meta Business → WhatsApp → API setup. Use a permanent (system user) access token. Messages go out as templates approved in WhatsApp Manager.</p>
        <Checkbox name="whatsappEnabled" label="Send WhatsApp messages" defaultChecked={d.whatsappEnabled} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Phone number ID" name="waPhoneNumberId" defaultValue={d.waPhoneNumberId} inputMode="numeric" autoComplete="off" />
          <TextField label="WhatsApp Business account ID" name="waBusinessAccountId" defaultValue={d.waBusinessAccountId} inputMode="numeric" autoComplete="off" hint="For reference" />
          <TextField label="Access token" name="waToken" type="password" autoComplete="new-password" placeholder={d.hasWaToken ? "Saved — type to change" : ""} hint="Stored encrypted" />
          <TextField label="Graph API version" name="waApiVersion" defaultValue={d.waApiVersion} />
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-line">
        <legend className="ml-3 px-1 text-sm font-semibold">When to send</legend>
        <p className="px-4 pt-1 text-xs text-muted">
          Tick the events that should also go out by email and / or WhatsApp. The message goes to the same people who get the notice in the ERP. For WhatsApp, give the approved template&apos;s name, its language code, and the variables it uses in order ({"{{1}}"}, {"{{2}}"}, …) from: name, title, details, link, firm. Blank variables = {defaultParams}.
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-y border-line bg-subtle/60 text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">Event</th><th className="px-2 py-2 font-medium">Email</th><th className="px-2 py-2 font-medium">WhatsApp</th>
              <th className="px-2 py-2 font-medium">Template name</th><th className="px-2 py-2 font-medium">Language</th><th className="px-2 py-2 font-medium">Variables</th>
            </tr></thead>
            {groups.map((g) => (
              <tbody key={g}>
                <tr><td colSpan={6} className="bg-paper px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g}</td></tr>
                {events.filter((e) => e.group === g).map((e) => {
                  const t = d.triggers[e.key] ?? {};
                  return (
                    <tr key={e.key} className="border-b border-line/60">
                      <td className="px-3 py-1.5">{e.label}</td>
                      <td className="px-2 py-1.5"><input type="checkbox" name={`email.${e.key}`} defaultChecked={!!t.email} aria-label={`${e.label}: email`} className="accent-brand-700" /></td>
                      <td className="px-2 py-1.5"><input type="checkbox" name={`wa.${e.key}`} defaultChecked={!!t.whatsapp} aria-label={`${e.label}: WhatsApp`} className="accent-brand-700" /></td>
                      <td className="px-2 py-1.5"><input name={`tpl.${e.key}`} defaultValue={t.template ?? ""} placeholder="template_name" aria-label={`${e.label}: template name`} className={cell} /></td>
                      <td className="w-20 px-2 py-1.5"><input name={`lang.${e.key}`} defaultValue={t.language ?? "en"} aria-label={`${e.label}: language`} className={cell} /></td>
                      <td className="px-2 py-1.5"><input name={`params.${e.key}`} defaultValue={t.params ?? ""} placeholder={defaultParams} aria-label={`${e.label}: variables`} className={cell} /></td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      </fieldset>
      <SubmitButton>Save email & WhatsApp settings</SubmitButton>
    </ActionForm>
  );
}

export function TestMessageForm({ action, channel }: { action: Act; channel: "EMAIL" | "WHATSAPP" }) {
  return (
    <ActionForm action={action}>
      <div className="flex flex-wrap items-end gap-2">
        <TextField label={channel === "EMAIL" ? "Send a test email to" : "Send a test WhatsApp to"} name="to" type={channel === "EMAIL" ? "email" : "tel"} placeholder={channel === "EMAIL" ? "name@example.com" : "98XXXXXXXX"} className="min-w-56 flex-1" />
        {channel === "WHATSAPP" && <TextField label="Template" name="template" placeholder="hello_world" className="w-40" />}
        <SubmitButton>Send test</SubmitButton>
      </div>
    </ActionForm>
  );
}
