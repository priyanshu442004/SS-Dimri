// Sends the client's standard "financial report" email: ONE message per uploaded
// trial balance, with exactly two attachments (Balance Sheet + Profit & Loss).
// Subject and body are fixed by the client. De-duplicated per trial-balance file
// for 12 hours so re-processing the same file does not resend.

import nodemailer from "nodemailer";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { recordActivity } from "./activity.js";

dotenv.config();

export const SUBJECT_BASE = "Trial Balance – Financial Report Generated";
export const subject = () => `${SUBJECT_BASE} – Dated: ${todayIST()}`;
/** DD-MM-YYYY in India time, for the "Dated:" suffix the client requires in every subject. */
export const todayIST = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()).replaceAll("/", "-");

export const BODY = "Dear Sir/Mam,\n\nPlease find attached the requested financial report for your reference.\n\nRegards,\nAI Products Team";

const DEDUP_WINDOW_MS = 12 * 60 * 60 * 1000;
const LOG_FILE = path.join(process.cwd(), "data", "mail-log.json");
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT) || 465;
  transporter = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  return transporter;
}

const recipients = () => (process.env.MAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
export const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");

/** Hash + name of the trial balance currently in uploads/ (newest file), or null. */
export function currentTrialBalanceHash() {
  try {
    const dir = path.join(process.cwd(), "uploads");
    const newest = fs.readdirSync(dir)
      .map((name) => ({ name, t: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0];
    return newest ? { hash: sha1(fs.readFileSync(path.join(dir, newest.name))), name: newest.name } : null;
  } catch {
    return null;
  }
}

function readLog() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, "utf8")); } catch { return {}; }
}
function writeLog(log) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    fs.writeFileSync(LOG_FILE, JSON.stringify(Object.fromEntries(Object.entries(log).filter(([, t]) => t > cutoff)), null, 1));
  } catch (e) {
    console.error("mail-log write failed:", e.message);
  }
}

/**
 * @param {{balanceSheet:{buffer:Buffer,name:string}, profitLoss:{buffer:Buffer,name:string}, sourceKey?:string}} o
 * @returns {Promise<{status:"sent"|"duplicate"|"disabled"|"failed", id?:string, error?:string}>}
 */
export async function sendFinancialReport({ balanceSheet, profitLoss, sourceKey }) {
  const t = getTransporter();
  const to = recipients();
  if (!t || !to.length) {
    console.warn("📭 Mail disabled (SMTP_* / MAIL_TO not set)");
    return { status: "disabled" };
  }

  const key = `financial-report:${sourceKey || sha1(Buffer.concat([balanceSheet.buffer, profitLoss.buffer]))}`;
  const log = readLog();
  if (log[key] && Date.now() - log[key] < DEDUP_WINDOW_MS) {
    console.log("📭 Financial report already mailed for this trial balance — skipped");
    return { status: "duplicate" };
  }
  log[key] = Date.now(); // reserve first so concurrent duplicates are skipped
  writeLog(log);

  try {
    const t0 = Date.now();
    const info = await t.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject: subject(),
      text: BODY,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937">${BODY.split("\n\n").map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>`,
      attachments: [
        { filename: balanceSheet.name, content: balanceSheet.buffer, contentType: XLSX },
        { filename: profitLoss.name, content: profitLoss.buffer, contentType: XLSX },
      ],
    });
    console.log(`📧 Financial report mailed to ${to.join(", ")} (${info.messageId})`);
    recordActivity({ kind: "email", title: "Financial report emailed", file: `${balanceSheet.name}, ${profitLoss.name}`, ok: true, ms: Date.now() - t0, detail: `To ${to.join(", ")}` });
    return { status: "sent", id: info.messageId };
  } catch (e) {
    const l = readLog(); delete l[key]; writeLog(l); // allow a retry
    console.error("📧 Financial report mail failed:", e.message);
    recordActivity({ kind: "email", title: "Financial report email failed", file: `${balanceSheet.name}, ${profitLoss.name}`, ok: false, detail: e.message.slice(0, 200) });
    return { status: "failed", error: e.message };
  }
}

/** Support-page message → the report recipients, reply-to the user. */
export async function sendSupportMessage({ name, email, topic, message }) {
  const t = getTransporter();
  const to = recipients();
  if (!t || !to.length) return { status: "disabled" };
  const text = `New support request from the Trial Balance app.\n\nFrom: ${name || "Not given"} <${email}>\nTopic: ${topic}\n\n${message}`;
  const info = await t.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to, replyTo: email,
    subject: `Trial Balance – Support Request – Dated: ${todayIST()}`,
    text,
  });
  recordActivity({ kind: "email", title: "Support request sent", file: topic, ok: true, detail: `From ${email}` });
  return { status: "sent", id: info.messageId };
}
