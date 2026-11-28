// The email a candidate gets as soon as their resume is uploaded (wording from the client, 28 Nov 2026),
// signed by the firm's recruitment team. Pure: the page shows administrators exactly this text.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** "S S DIMRI & ASSOCIATES" → "S S Dimri & Associates" (names typed in capitals read as shouting in a letter). */
export function firmDisplayName(tradeName: string): string {
  const t = tradeName.trim();
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s(&/-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())
    .replace(/\b(Llp|Llc|Pvt|Ltd|Ca|Cs)\b/g, (w) => (w === "Pvt" || w === "Ltd" ? w : w.toUpperCase()));
}

export const DETAILS_ASKED = [
  "Current/Last Drawn CTC",
  "Expected CTC",
  "Notice Period / Earliest Joining Date",
  "Preferred Time Slots for an Interview",
  "Current Location",
];

export function resumeAckEmail(v: { name: string; firm: string; ref: string }) {
  const team = `${v.firm} Recruitment Team`;
  const subject = `Thank you for sharing your resume – ${v.firm} [Ref ${v.ref}]`;
  const text = `Dear ${v.name},

Greetings from ${team}!

Thank you for sharing your resume with us.

To help us evaluate your profile for relevant opportunities, please reply to this email with the following details:

${DETAILS_ASKED.join("\n")}

Your response will help us understand your preferences and coordinate suitable opportunities and interviews.

Thank you for your time.

Best regards,
${team}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f4f0;font-family:Arial,Helvetica,sans-serif;color:#1b1f24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dedbd3;border-radius:8px">
<tr><td style="padding:18px 24px;border-bottom:1px solid #dedbd3;font-weight:bold;font-size:16px">${esc(v.firm)}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6">
<p style="margin:0 0 14px">Dear ${esc(v.name)},</p>
<p style="margin:0 0 14px">Greetings from ${esc(team)}!</p>
<p style="margin:0 0 14px">Thank you for sharing your resume with us.</p>
<p style="margin:0 0 10px">To help us evaluate your profile for relevant opportunities, please reply to this email with the following details:</p>
<ul style="margin:0 0 14px;padding-left:20px">${DETAILS_ASKED.map((d) => `<li style="margin:2px 0">${esc(d)}</li>`).join("")}</ul>
<p style="margin:0 0 14px">Your response will help us understand your preferences and coordinate suitable opportunities and interviews.</p>
<p style="margin:0 0 14px">Thank you for your time.</p>
<p style="margin:0">Best regards,<br>${esc(team)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

/**
 * A follow-up from an administrator, sent as a reply in the same conversation (the candidate's mail
 * program threads it), signed by the recruitment team, with the candidate's last message quoted.
 */
export function followUpEmail(v: { firm: string; subject: string; message: string; quote?: { at: string; from: string; body: string } | null }) {
  const team = `${v.firm} Recruitment Team`;
  const quoteText = v.quote ? `\n\nOn ${v.quote.at}, ${v.quote.from} wrote:\n${v.quote.body.split("\n").map((l) => `> ${l}`).join("\n")}` : "";
  const text = `${v.message.trim()}\n\nBest regards,\n${team}${quoteText}`;
  const paras = v.message.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1b1f24">
<div style="max-width:600px;padding:8px 4px;font-size:15px;line-height:1.6">${paras}<p style="margin:0 0 18px">Best regards,<br>${esc(team)}</p>
${v.quote ? `<div style="margin-top:12px;color:#5d6470;font-size:13px">On ${esc(v.quote.at)}, ${esc(v.quote.from)} wrote:</div><blockquote style="margin:6px 0 0;padding:0 0 0 12px;border-left:3px solid #dedbd3;color:#5d6470;font-size:13px;white-space:pre-wrap">${esc(v.quote.body)}</blockquote>` : ""}
</div></body></html>`;
  return { subject: v.subject, text, html };
}
