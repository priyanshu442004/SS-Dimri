// Emails the Financial Health Summary PDF to MAIL_TO in the client's format.
import nodemailer from "nodemailer";

let transporter;
function tx() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT) || 465;
  transporter = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  return transporter;
}

/** DD-MM-YYYY in India time, for the "Dated:" suffix the client requires in every subject. */
export const todayIST = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()).replaceAll("/", "-");
export const SUBJECT = "AI Summary Report – Company Health CFO Intelligence";
export const subject = () => `${SUBJECT} – Dated: ${todayIST()}`;
export const BODY = "Dear Sir/Mam,\n\nPlease find attached the requested company health report for your reference.\n\nRegards,\nAI Products Team";

export async function mailReport({ pdf, fileName }) {
  const t = tx();
  const to = (process.env.MAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!t || !to.length) return { status: "disabled" };
  try {
    const info = await t.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to, subject: subject(), text: BODY,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937">${BODY.split("\n\n").map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>`,
      attachments: [{ filename: fileName, content: pdf, contentType: "application/pdf" }],
    });
    return { status: "sent", to, id: info.messageId };
  } catch (e) {
    return { status: "failed", error: e.message };
  }
}
