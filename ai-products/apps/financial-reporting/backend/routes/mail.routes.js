import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { sendFinancialReport, currentTrialBalanceHash, subject, BODY, sendSupportMessage } from "../services/mailService.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 2 } });
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// xlsx files are zip archives: must start with "PK"
const isXlsx = (f) => f && f.size > 100 && f.buffer[0] === 0x50 && f.buffer[1] === 0x4b;
const safeName = (n, fallback) => (String(n || "").replace(/[^\w.\- &()]/g, "_").slice(0, 80) || fallback).replace(/(\.xlsx)?$/i, ".xlsx");

/**
 * POST /api/mail/financial-report  (multipart: balanceSheet, profitLoss)
 * Called by the frontend after a trial balance upload. Sends ONE email with the
 * two statements; the server de-duplicates per trial-balance file.
 */
router.post(
  "/financial-report",
  limiter,
  upload.fields([{ name: "balanceSheet", maxCount: 1 }, { name: "profitLoss", maxCount: 1 }]),
  async (req, res) => {
    const bs = req.files?.balanceSheet?.[0];
    const pl = req.files?.profitLoss?.[0];
    if (!isXlsx(bs) || !isXlsx(pl)) {
      return res.status(400).json({ success: false, message: "Both Balance Sheet and Profit & Loss .xlsx files are required" });
    }
    res.status(202).json({ success: true, queued: true });
    sendFinancialReport({
      balanceSheet: { buffer: bs.buffer, name: safeName(bs.originalname, "Balance_Sheet.xlsx") },
      profitLoss: { buffer: pl.buffer, name: safeName(pl.originalname, "Profit_and_Loss.xlsx") },
      sourceKey: currentTrialBalanceHash()?.hash,
    }).catch((e) => console.error("financial-report mail:", e.message));
  }
);

const supportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
// Support page → email to the team (reply-to the user)
router.post("/support", supportLimiter, express.json({ limit: "50kb" }), async (req, res) => {
  const { name = "", email = "", topic = "General question", message = "" } = req.body || {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "A valid email address is required." });
  if (String(message).trim().length < 10) return res.status(400).json({ error: "Please describe the issue (at least 10 characters)." });
  try {
    const r = await sendSupportMessage({ name: String(name).slice(0, 80), email: String(email).slice(0, 120), topic: String(topic).slice(0, 80), message: String(message).slice(0, 5000) });
    if (r.status === "disabled") return res.status(503).json({ error: "Email is not configured on the server." });
    res.json({ ok: true });
  } catch (e) {
    console.error("support mail:", e.message);
    res.status(502).json({ error: "Couldn't send your message. Please try again in a minute." });
  }
});

// Read-only view of the report-email configuration for the Settings page
router.get("/settings", (req, res) => {
  const to = (process.env.MAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  res.json({
    enabled: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && to.length),
    from: process.env.MAIL_FROM || process.env.SMTP_USER || "",
    to, subject: subject(), body: BODY,
    attachments: ["Balance Sheet (.xlsx)", "Profit & Loss (.xlsx)"],
  });
});

export default router;
