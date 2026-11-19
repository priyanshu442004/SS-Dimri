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
import { loadFile } from "./lib/parse.js";
import { processAssets, pdfModel } from "./lib/assets.js";
import { readInvoice } from "./lib/invoice.js";
import { mailReport, SUBJECT } from "./lib/mail.js";
import { buildWorkbook } from "./lib/excel.js";
import { stream } from "./lib/deepseek.js";
import { assetContext, ASSET_SUGGESTIONS } from "./lib/chatContext.js";
import { mountChat } from "../../_shared/server/chat.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, "data", "runs");
fs.mkdirSync(DATA, { recursive: true });
const PY = path.resolve(ROOT, process.env.PYTHON_BIN || "report/.venv/bin/python");

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "100kb" }));

const SLOTS = ["register", "additions", "disposals", "policy"];
const MAX_INVOICES = 10;
const LABELS = { register: "Existing Fixed Asset Register", additions: "Current Year Additions", disposals: "Disposals", policy: "Depreciation Policy", invoice: "Capital invoice" };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: SLOTS.length + MAX_INVOICES } });
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
const recipients = () => (process.env.MAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);

// ------------------------------------------------------------------ helpers
function renderPdf(model, outPath) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, [path.join(ROOT, "report", "render_assets.py"), outPath], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`renderer exited ${code}: ${err.slice(-400)}`))));
    p.stdin.end(Buffer.from(JSON.stringify(model), "utf8"));
  });
}
const runDir = (id) => (/^[a-f0-9]{16}$/.test(id) ? path.join(DATA, id) : null);
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 1));

async function sendMail(dir, meta) {
  const mail = await mailReport({ pdf: fs.readFileSync(path.join(dir, "report.pdf")), fileName: meta.fileName });
  if (mail.status === "failed") console.error("Report mail failed:", mail.error);
  else console.log(`📧 Fixed asset report ${meta.id} → ${mail.status}${mail.to ? " " + mail.to.join(", ") : ""}`);
  meta.mail = { status: mail.status, to: mail.to, error: mail.error, at: new Date().toISOString() };
  writeJson(path.join(dir, "meta.json"), meta);
  return meta.mail;
}

/**
 * Parse the uploads. Spreadsheets are recognised from their headers wherever they are dropped
 * (register, additions, disposals, policy); a file that can't be recognised is read as the input of
 * the box it was dropped in. PDFs (in any box) are capital invoices. Register + policy are required.
 */
async function parseUploads(files) {
  const all = [...SLOTS, "invoice"].flatMap((slot) => (files?.[slot] || []).map((file) => ({ slot, file })));
  const pdfs = all.filter((x) => /\.pdf$/i.test(x.file.originalname));
  const sheets = all.filter((x) => !/\.pdf$/i.test(x.file.originalname));
  if (pdfs.length > MAX_INVOICES) throw new Error(`Upload up to ${MAX_INVOICES} invoice PDFs at a time.`);
  const parsed = await Promise.all(sheets.map(async (x) => ({ ...x, data: await loadFile(x.file.buffer, x.file.originalname, "auto") })));
  const out = {};
  for (const kind of SLOTS) {
    const x = parsed.find((p) => !p.used && p.data.kind === kind && p.slot === kind) || parsed.find((p) => !p.used && p.data.kind === kind);
    if (x) { x.used = true; out[kind] = x; }
  }
  for (const x of parsed.filter((p) => !p.used)) {
    if (x.slot === "invoice" || out[x.slot]) throw new Error(`${x.file.originalname}: couldn't tell which input this is — expected a fixed asset register, additions, disposals or depreciation policy.`);
    x.used = true;
    out[x.slot] = { ...x, data: await loadFile(x.file.buffer, x.file.originalname, x.slot) };
  }
  for (const kind of ["register", "policy"]) if (!out[kind]) throw new Error(`Upload the ${LABELS[kind]} — it is required.`);
  out.invoices = await Promise.all(pdfs.map(async (x) => ({ file: x.file, data: await readInvoice(x.file.buffer, x.file.originalname) })));
  return out;
}

// ------------------------------------------------------------------ routes
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/settings", (_req, res) => res.json({
  recipients: recipients(),
  mailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  subject: `${SUBJECT} – Dated: DD-MM-YYYY`,
  limits: { maxFileMb: 10, formats: ["XLSX", "CSV", "PDF (invoices)"] },
  version: "1.0.0",
}));

app.post("/api/process", limiter, upload.fields([...SLOTS.map((name) => ({ name, maxCount: 1 })), { name: "invoice", maxCount: MAX_INVOICES }]), async (req, res) => {
  try {
    const inputs = await parseUploads(req.files);
    const result = processAssets({ register: inputs.register.data, additions: inputs.additions?.data, disposals: inputs.disposals?.data, policy: inputs.policy.data, invoices: inputs.invoices.map((i) => i.data) });

    // identical files → same run (no duplicate report or email)
    const h = crypto.createHash("sha1");
    for (const k of SLOTS) if (inputs[k]) h.update(k).update(inputs[k].file.buffer);
    for (const i of inputs.invoices) h.update("invoice").update(i.file.buffer);
    const id = h.digest("hex").slice(0, 16);
    const dir = path.join(DATA, id);
    fs.mkdirSync(path.join(dir, "inputs"), { recursive: true });
    const metaPath = path.join(dir, "meta.json");
    const prior = fs.existsSync(metaPath) ? readJson(metaPath) : null;
    const existing = prior?.id && fs.existsSync(path.join(dir, "report.pdf")) && fs.existsSync(path.join(dir, "report.xlsx")) ? prior : null;

    if (!existing) {
      await renderPdf(pdfModel(result), path.join(dir, "report.pdf"));
      fs.writeFileSync(path.join(dir, "report.xlsx"), await buildWorkbook(result));
      for (const k of SLOTS) if (inputs[k]) fs.writeFileSync(path.join(dir, "inputs", `${k}${path.extname(inputs[k].file.originalname).toLowerCase()}`), inputs[k].file.buffer);
      inputs.invoices.forEach((x, n) => fs.writeFileSync(path.join(dir, "inputs", `invoice${n + 1}.pdf`), x.file.buffer));
      writeJson(path.join(dir, "result.json"), result);
    }
    const tag = result.period.label.replace(/[^A-Za-z0-9-]+/g, "_").replace(/[^A-Za-z0-9-]+/g, "_").replace(/^_|_$/g, "");
    const meta = existing || {
      id, createdAt: new Date().toISOString(),
      fileName: `fixed_asset_processing_summary_${tag}.pdf`, xlsxName: `fixed_asset_schedule_${tag}.xlsx`,
      period: result.period, subtitle: result.subtitle,
      stats: result.stats, status: result.status,
      inputs: { ...Object.fromEntries(SLOTS.filter((k) => inputs[k]).map((k) => [k, inputs[k].file.originalname])), ...Object.fromEntries(inputs.invoices.map((x, n) => [`invoice${n + 1}`, x.file.originalname])) },
      ...(prior?.mail ? { mail: prior.mail } : {}),
    };
    writeJson(metaPath, meta);
    // the PDF goes out as soon as the report exists (once per unique set of files)
    if (!meta.mail || meta.mail.status !== "sent") await sendMail(dir, meta);

    res.json({ id, meta, result });
  } catch (e) {
    console.error("process:", e);
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
  if (!dir || !fs.existsSync(path.join(dir, "result.json"))) return res.status(404).json({ error: "Run not found" });
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

// original uploaded files
app.get("/api/runs/:id/inputs/:kind", (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !(SLOTS.includes(req.params.kind) || /^invoice\d{1,2}$/.test(req.params.kind))) return res.status(404).end();
  const meta = fs.existsSync(path.join(dir, "meta.json")) ? readJson(path.join(dir, "meta.json")) : null;
  const f = fs.existsSync(path.join(dir, "inputs")) && fs.readdirSync(path.join(dir, "inputs")).find((n) => n.startsWith(`${req.params.kind}.`));
  if (!meta || !f) return res.status(404).json({ error: "File not found" });
  res.setHeader("Content-Disposition", `attachment; filename="${String(meta.inputs?.[req.params.kind] || f).replace(/["\r\n]/g, "")}"`);
  res.setHeader("Content-Type", f.endsWith(".csv") ? "text/csv" : f.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  fs.createReadStream(path.join(dir, "inputs", f)).pipe(res);
});

// chat with a processed run (DeepSeek, streamed) — grounded in the output + every uploaded file
mountChat(app, {
  stream, runDir, context: assetContext, suggestions: ASSET_SUGGESTIONS,
  assistant: "Fixed Asset Assistant", product: "Fixed Asset Register & Depreciation",
  limiter: rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }),
});

app.post("/api/runs/:id/email", limiter, async (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !fs.existsSync(path.join(dir, "meta.json"))) return res.status(404).json({ error: "Run not found" });
  res.json({ mail: await sendMail(dir, readJson(path.join(dir, "meta.json"))) });
});

app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Each file must be under 10 MB." });
  if (err?.code === "LIMIT_UNEXPECTED_FILE" || err?.code === "LIMIT_FILE_COUNT") return res.status(400).json({ error: `One file per box, except capital invoices (up to ${MAX_INVOICES} PDFs).` });
  console.error(err);
  res.status(500).json({ error: "Unexpected error" });
});

const PORT = Number(process.env.PORT) || 8009;
app.listen(PORT, process.env.HOST || "0.0.0.0", () => console.log(`Fixed Asset Register API on :${PORT}`));
