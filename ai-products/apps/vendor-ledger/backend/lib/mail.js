// Emails the Vendor Reconciliation Summary (PDF) to MAIL_TO via SMTP as soon as a report is generated.
// Subject/body follow the client's standard format used across all AI Products.
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

export const SUBJECT = "AI Summary Report – Vendor Ledger Reconciliation";
/** DD-MM-YYYY in India time, for the "Dated:" suffix the client requires in every subject. */
export const todayIST = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()).replaceAll("/", "-");
export const subject = () => `${SUBJECT} – Dated: ${todayIST()}`;

export const BODY = "Dear Sir/Mam,\n\nPlease find attached the requested vendor reconciliation summary report for your reference.\n\nRegards,\nAI Products Team";

/** @returns {Promise<{status:"sent"|"disabled"|"failed", to?:string[], id?:string, error?:string}>} */
export async function mailReport({ pdf, fileName }) {
  const to = (process.env.MAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!tx() || !to.length) return { status: "disabled" };
  // SMTP servers occasionally drop a fresh connection ("Connection closed unexpectedly"):
  // retry twice with a new transport before reporting the email as failed.
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const info = await tx().sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to,
        subject: subject(),
        text: BODY,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937">${BODY.split("\n\n").map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>`,
        attachments: [{ filename: fileName, content: pdf, contentType: "application/pdf" }],
      });
      return { status: "sent", to, id: info.messageId };
    } catch (e) {
      last = e;
      console.warn(`Report mail attempt ${attempt} failed: ${e.message}`);
      transporter = null;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
  return { status: "failed", error: last.message };
}
