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
import { extractInvoice } from "./lib/extract.js";
import { validateBatch, buildBatch, pdfModel, registerCsv } from "./lib/report.js";
import { buildWorkbook } from "./lib/excel.js";
import { mailReport, SUBJECT } from "./lib/mail.js";
import { batchSummary } from "./lib/summary.js";
import { stream } from "./lib/deepseek.js";
import { invoiceContext, INVOICE_SUGGESTIONS } from "./lib/chatContext.js";
import { mountChat } from "../../_shared/server/chat.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, "data", "batches");
fs.mkdirSync(DATA, { recursive: true });
const PY = path.resolve(ROOT, process.env.PYTHON_BIN || "report/.venv/bin/python");
const MAX_FILES = 100;

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-origin" } }));
app.use(express.json({ limit: "100kb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_FILES },
  fileFilter: (_req, f, cb) => cb(null, /\.pdf$/i.test(f.originalname)),
});
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const recipients = () => (process.env.MAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 1));
const runDir = (id) => (/^[a-f0-9]{16}$/.test(id) ? path.join(DATA, id) : null);

function renderPdf(model, outPath) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, [path.join(ROOT, "report", "render_inv.py"), outPath], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`renderer exited ${code}: ${err.slice(-400)}`))));
    p.stdin.end(Buffer.from(JSON.stringify(model), "utf8"));
  });
}

/** Run fn over items with at most `n` in flight. */
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

async function sendMail(dir, meta) {
  const mail = await mailReport({ attachments: [
    { filename: meta.pdfName, content: fs.readFileSync(path.join(dir, "report.pdf")), contentType: "application/pdf" },
    { filename: meta.xlsxName, content: fs.readFileSync(path.join(dir, "register.xlsx")), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  ] });
  if (mail.status === "failed") console.error("Report mail failed:", mail.error);
  else console.log(`📧 Batch ${meta.id} → ${mail.status}${mail.to ? " " + mail.to.join(", ") : ""}`);
  meta.mail = { status: mail.status, to: mail.to, error: mail.error, at: new Date().toISOString() };
  writeJson(path.join(dir, "meta.json"), meta);
  return meta.mail;
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/settings", (_req, res) => res.json({
  recipients: recipients(),
  mailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  subject: `${SUBJECT} – Dated: DD-MM-YYYY`,
  limits: { maxFiles: MAX_FILES, maxFileMb: 10, formats: ["PDF (text-based)"] },
  extraction: { model: process.env.DEEPSEEK_MODEL || "deepseek-v4-pro" },
  version: "1.0.0",
}));

app.post("/api/batches", limiter, upload.array("invoices", MAX_FILES), async (req, res) => {
  try {
    const files = (req.files || []).sort((a, b) => a.originalname.localeCompare(b.originalname, undefined, { numeric: true }));
    if (!files.length) return res.status(400).json({ error: "Upload at least one invoice PDF." });
    const batchName = String(req.body.batchName || "").replace(/[\r\n]+/g, " ").trim().slice(0, 80);

    const hash = crypto.createHash("sha1");
    files.forEach((f) => hash.update(f.originalname).update(f.buffer));
    hash.update(batchName);
    const id = hash.digest("hex").slice(0, 16);
    const dir = path.join(DATA, id);
    const metaPath = path.join(dir, "meta.json");

    if (!fs.existsSync(metaPath)) {
      const extracted = await pool(files, 4, async (f) => {
        try { return await extractInvoice(f.buffer); }
        catch (e) { return { error: `Could not read this PDF (${e.message}).`, method: "none" }; }
      });
      const names = files.map((f) => f.originalname);
      const batch = buildBatch(validateBatch(extracted), { batchName: batchName || `Invoice batch · ${names.length} files`, files: names });

      fs.mkdirSync(path.join(dir, "invoices"), { recursive: true });
      files.forEach((f, i) => fs.writeFileSync(path.join(dir, "invoices", `${i + 1}.pdf`), f.buffer));
      await renderPdf(pdfModel(batch), path.join(dir, "report.pdf"));
      fs.writeFileSync(path.join(dir, "register.xlsx"), await buildWorkbook(batch));
      fs.writeFileSync(path.join(dir, "register.csv"), registerCsv(batch));
      writeJson(path.join(dir, "batch.json"), batch);
      const stamp = (batch.period?.to || new Date().toISOString().slice(0, 10)).slice(0, 7);
      writeJson(metaPath, {
        id, createdAt: new Date().toISOString(), batchName: batch.batchName, period: batch.period, totals: batch.totals, ok: batch.status.ok,
        pdfName: `invoice_report_${stamp}.pdf`, xlsxName: `invoice_register_${stamp}.xlsx`, csvName: `invoice_register_${stamp}.csv`,
      });
    }
    const meta = readJson(metaPath);
    if (!meta.mail || meta.mail.status !== "sent") await sendMail(dir, meta);
    res.json({ id, meta, batch: readJson(path.join(dir, "batch.json")) });
    batchSummary(dir).catch((e) => console.error("summary pre-generation:", e.message)); // ready before the Overview is opened
  } catch (e) {
    console.error("batch:", e);
    res.status(422).json({ error: e.message || "Could not process the invoices." });
  }
});

app.get("/api/runs", (_req, res) => {
  const runs = fs.readdirSync(DATA).map((id) => path.join(DATA, id, "meta.json")).filter((p) => fs.existsSync(p)).map(readJson)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ runs });
});
// AI summary report (DeepSeek) — latest batch by default, or ?id=…; ?refresh=1 regenerates
app.get("/api/summary", async (req, res) => {
  try {
    const ids = fs.readdirSync(DATA).filter((id) => fs.existsSync(path.join(DATA, id, "meta.json")))
      .map((id) => readJson(path.join(DATA, id, "meta.json"))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((m) => m.id);
    const id = req.query.id && ids.includes(req.query.id) ? req.query.id : ids[0];
    if (!id) return res.json({ empty: true, message: "Process a batch of invoices to get an AI summary." });
    res.json(await batchSummary(path.join(DATA, id), { refresh: req.query.refresh === "1" }));
  } catch (e) {
    console.error("summary:", e.message);
    res.status(502).json({ error: "The AI summary couldn't be generated right now. Please try again." });
  }
});

app.get("/api/runs/:id", (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !fs.existsSync(path.join(dir, "batch.json"))) return res.status(404).json({ error: "Batch not found" });
  res.json({ meta: readJson(path.join(dir, "meta.json")), batch: readJson(path.join(dir, "batch.json")) });
});

const TYPES = {
  pdf: ["report.pdf", "application/pdf", "pdfName"],
  xlsx: ["register.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsxName"],
  csv: ["register.csv", "text/csv; charset=utf-8", "csvName"],
};
app.get("/api/runs/:id/:kind(pdf|xlsx|csv)", (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !fs.existsSync(path.join(dir, "meta.json"))) return res.status(404).json({ error: "Not found" });
  const [file, type, nameKey] = TYPES[req.params.kind];
  const meta = readJson(path.join(dir, "meta.json"));
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", `${req.params.kind === "pdf" && !req.query.download ? "inline" : "attachment"}; filename="${meta[nameKey]}"`);
  fs.createReadStream(path.join(dir, file)).pipe(res);
});
// original invoice PDFs, for side-by-side review
app.get("/api/runs/:id/invoices/:n", (req, res) => {
  const dir = runDir(req.params.id);
  const n = Number(req.params.n);
  const file = dir && Number.isInteger(n) ? path.join(dir, "invoices", `${n}.pdf`) : null;
  if (!file || !fs.existsSync(file)) return res.status(404).end();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline");
  fs.createReadStream(file).pipe(res);
});
// chat with a processed batch of invoices (DeepSeek, streamed)
mountChat(app, {
  stream, runDir, context: invoiceContext, suggestions: INVOICE_SUGGESTIONS,
  assistant: "Invoice Assistant", product: "Invoice Automation",
  limiter: rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }),
});

app.post("/api/runs/:id/email", limiter, async (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !fs.existsSync(path.join(dir, "meta.json"))) return res.status(404).json({ error: "Batch not found" });
  res.json({ mail: await sendMail(dir, readJson(path.join(dir, "meta.json"))) });
});

app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Each PDF must be under 10 MB." });
  if (err?.code === "LIMIT_FILE_COUNT") return res.status(413).json({ error: `Up to ${MAX_FILES} invoices per batch.` });
  console.error(err);
  res.status(500).json({ error: "Unexpected error" });
});

const PORT = Number(process.env.PORT) || 8003;
app.listen(PORT, process.env.HOST || "0.0.0.0", () => console.log(`Invoice Automation API on :${PORT}`));
