import "dotenv/config";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { loadRows } from "./lib/parse.js";
import { buildReconciliation, pdfModel } from "./lib/report.js";
import { mailReport, SUBJECT } from "./lib/mail.js";
import { buildWorkbook } from "./lib/excel.js";
import { stream } from "./lib/deepseek.js";
import { bankContext, BANK_SUGGESTIONS } from "./lib/chatContext.js";
import { mountChat } from "../../_shared/server/chat.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, "data", "reports");
fs.mkdirSync(DATA, { recursive: true });
const PY = path.resolve(ROOT, process.env.PYTHON_BIN || "report/.venv/bin/python");

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "100kb" }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 2 } });
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
const recipients = () => (process.env.MAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);

// ------------------------------------------------------------------ helpers
function renderPdf(model, outPath) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, [path.join(ROOT, "report", "render_brs.py"), outPath], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`renderer exited ${code}: ${err.slice(-400)}`))));
    p.stdin.end(Buffer.from(JSON.stringify(model), "utf8"));
  });
}
const num = (v, d = 0) => {
  const n = parseFloat(String(v ?? "").replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : d;
};
const runDir = (id) => (/^[a-f0-9]{16}$/.test(id) ? path.join(DATA, id) : null);
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 1));

async function sendMail(dir, meta) {
  const mail = await mailReport({ pdf: fs.readFileSync(path.join(dir, "report.pdf")), fileName: meta.fileName });
  if (mail.status === "failed") console.error("Report mail failed:", mail.error);
  else console.log(`📧 Report ${meta.id} → ${mail.status}${mail.to ? " " + mail.to.join(", ") : ""}`);
  meta.mail = { status: mail.status, to: mail.to, error: mail.error, at: new Date().toISOString() };
  writeJson(path.join(dir, "meta.json"), meta);
  return meta.mail;
}

// ------------------------------------------------------------------ routes
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/settings", (_req, res) => res.json({
  recipients: recipients(),
  mailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  subject: `${SUBJECT} – Dated: DD-MM-YYYY`,
  defaults: { tolerance: 3, signMode: "auto" },
  limits: { maxFileMb: 10, formats: ["CSV", "XLSX"] },
  version: "1.0.0",
}));

app.post("/api/reconcile", limiter, upload.fields([{ name: "bank", maxCount: 1 }, { name: "books", maxCount: 1 }]), async (req, res) => {
  try {
    const bankFile = req.files?.bank?.[0], booksFile = req.files?.books?.[0];
    if (!bankFile || !booksFile) return res.status(400).json({ error: "Upload both the bank statement and the books ledger." });

    // No opening balance is asked for: both sides start at 0, so the difference is
    // the difference in the period's movements (equal openings cancel out).
    const openingBank = 0, openingBooks = 0;
    const tolerance = Math.min(15, Math.max(0, Math.round(num(req.body.tolerance, 3))));
    const signMode = ["auto", "bank", "accounting"].includes(req.body.signMode) ? req.body.signMode : "auto";
    const accountName = String(req.body.accountName || "").replace(/[\r\n]+/g, " ").trim().slice(0, 80);

    const [bank, books] = await Promise.all([
      loadRows(bankFile.buffer, bankFile.originalname, "bank"),
      loadRows(booksFile.buffer, booksFile.originalname, "books", signMode),
    ]);
    if (!bank.rows.length || !books.rows.length) return res.status(422).json({ error: "No dated transactions found in one of the files." });

    const result = buildReconciliation({ bank, books, opening: { bank: openingBank, books: openingBooks }, tolerance, accountName });

    // identical inputs + settings → same run (no duplicate report or email)
    const id = crypto.createHash("sha1").update(bankFile.buffer).update(booksFile.buffer)
      .update(JSON.stringify({ openingBank, openingBooks, tolerance, signMode, accountName })).digest("hex").slice(0, 16);
    const dir = path.join(DATA, id);
    fs.mkdirSync(path.join(dir, "inputs"), { recursive: true });
    const metaPath = path.join(dir, "meta.json");
    const prior = fs.existsSync(metaPath) ? readJson(metaPath) : null;
    const existing = prior?.id && fs.existsSync(path.join(dir, "report.xlsx")) ? prior : null; // older runs get rebuilt

    if (!existing) {
      await renderPdf(pdfModel(result), path.join(dir, "report.pdf"));
      fs.writeFileSync(path.join(dir, "report.xlsx"), await buildWorkbook(result));
      fs.writeFileSync(path.join(dir, "inputs", `bank-statement${path.extname(bankFile.originalname)}`), bankFile.buffer);
      fs.writeFileSync(path.join(dir, "inputs", `books-ledger${path.extname(booksFile.originalname)}`), booksFile.buffer);
      writeJson(path.join(dir, "result.json"), result);
    }
    const ym = result.period.start?.slice(0, 7) || "period";
    const meta = existing || {
      id, createdAt: new Date().toISOString(),
      fileName: `bank_reconciliation_report_${ym}.pdf`, xlsxName: `bank_reconciliation_${ym}.xlsx`,
      accountName: result.accountName, period: result.period, reconciled: result.status.reconciled,
      difference: result.summary.difference, residual: result.bridge.residual, exceptions: result.stats.exceptions,
      matchedPct: Math.round((result.stats.matchedBank / result.stats.bankRows) * 100),
      inputs: { bank: bankFile.originalname, books: booksFile.originalname },
      ...(prior?.mail ? { mail: prior.mail } : {}),
    };
    writeJson(metaPath, meta);
    if (!meta.mail || meta.mail.status !== "sent") await sendMail(dir, meta);

    res.json({ id, meta, result });
  } catch (e) {
    console.error("reconcile:", e);
    res.status(422).json({ error: e.message || "Could not process the files." });
  }
});

app.get("/api/runs", (_req, res) => {
  const runs = fs.readdirSync(DATA)
    .map((id) => path.join(DATA, id, "meta.json"))
    .filter((p) => fs.existsSync(p))
    .map(readJson)
    .filter((m) => m.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ runs });
});

app.get("/api/runs/:id", (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !fs.existsSync(path.join(dir, "result.json"))) return res.status(404).json({ error: "Reconciliation not found" });
  res.json({ meta: readJson(path.join(dir, "meta.json")), result: readJson(path.join(dir, "result.json")) });
});

const sendFile = (kind) => (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir) return res.status(400).end();
  const meta = fs.existsSync(path.join(dir, "meta.json")) ? readJson(path.join(dir, "meta.json")) : null;
  const file = path.join(dir, kind === "pdf" ? "report.pdf" : "report.xlsx");
  if (!meta || !fs.existsSync(file)) return res.status(404).json({ error: "File not found" });
  const name = kind === "pdf" ? meta.fileName : meta.xlsxName;
  res.setHeader("Content-Type", kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `${kind === "pdf" && !req.query.download ? "inline" : "attachment"}; filename="${name}"`);
  fs.createReadStream(file).pipe(res);
};
app.get("/api/runs/:id/pdf", sendFile("pdf"));
app.get("/api/runs/:id/xlsx", sendFile("xlsx"));
app.get("/api/reports/:id/pdf", sendFile("pdf")); // backward-compatible link

// chat with a processed reconciliation (DeepSeek, streamed)
mountChat(app, {
  stream, runDir, context: bankContext, suggestions: BANK_SUGGESTIONS,
  assistant: "Reconciliation Assistant", product: "Bank Reconciliation",
  limiter: rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }),
});

app.post("/api/runs/:id/email", limiter, async (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !fs.existsSync(path.join(dir, "meta.json"))) return res.status(404).json({ error: "Reconciliation not found" });
  res.json({ mail: await sendMail(dir, readJson(path.join(dir, "meta.json"))) });
});

app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Each file must be under 10 MB." });
  console.error(err);
  res.status(500).json({ error: "Unexpected error" });
});

const PORT = Number(process.env.PORT) || 8002;
app.listen(PORT, process.env.HOST || "0.0.0.0", () => console.log(`Bank Reconciliation API on :${PORT}`));
