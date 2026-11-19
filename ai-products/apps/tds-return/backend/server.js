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
import { buildTds, pdfModel, RATE_RULES } from "./lib/tds.js";
import { mailReport, SUBJECT } from "./lib/mail.js";
import { buildWorkbook } from "./lib/excel.js";
import { stream } from "./lib/deepseek.js";
import { tdsContext, TDS_SUGGESTIONS } from "./lib/chatContext.js";
import { mountChat } from "../../_shared/server/chat.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, "data", "runs");
fs.mkdirSync(DATA, { recursive: true });
const PY = path.resolve(ROOT, process.env.PYTHON_BIN || "report/.venv/bin/python");

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "100kb" }));

const SLOTS = ["payments", "vendors", "challans", "notes"];
const LABELS = { payments: "Payment Ledger", vendors: "Vendor Master", challans: "TDS Challan Register", notes: "Review notes" };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 4 } });
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
const recipients = () => (process.env.MAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);

// ------------------------------------------------------------------ helpers
function renderPdf(model, outPath) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, [path.join(ROOT, "report", "render_tds.py"), outPath], { stdio: ["pipe", "ignore", "pipe"] });
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
  else console.log(`📧 TDS report ${meta.id} → ${mail.status}${mail.to ? " " + mail.to.join(", ") : ""}`);
  meta.mail = { status: mail.status, to: mail.to, error: mail.error, at: new Date().toISOString() };
  writeJson(path.join(dir, "meta.json"), meta);
  return meta.mail;
}

/**
 * Parse the uploads. Each file's type is detected from its headers, so a file dropped in
 * the wrong box still lands in the right place; a box whose file isn't recognised is
 * parsed as the type of that box (with AI header mapping as the fallback).
 */
async function parseUploads(files) {
  const given = SLOTS.map((slot) => ({ slot, file: files?.[slot]?.[0] })).filter((x) => x.file);
  const parsed = await Promise.all(given.map(async (x) => ({ ...x, data: await loadFile(x.file.buffer, x.file.originalname, "auto") })));
  const out = {};
  for (const x of parsed) if (x.data.kind !== "notes" && !out[x.data.kind]) { out[x.data.kind] = x; x.used = true; }
  for (const kind of ["payments", "vendors", "challans"]) {
    if (out[kind]) continue;
    const x = parsed.find((p) => p.slot === kind && !p.used);
    if (!x) throw new Error(`Upload the ${LABELS[kind]} — it is required.`);
    out[kind] = { ...x, data: await loadFile(x.file.buffer, x.file.originalname, kind) };
    x.used = true;
  }
  const n = parsed.find((p) => !p.used && (p.slot === "notes" || p.data.kind === "notes"));
  if (n) out.notes = { ...n, data: n.data.kind === "notes" ? n.data : await loadFile(n.file.buffer, n.file.originalname, "notes") };
  return out;
}

// ------------------------------------------------------------------ routes
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/settings", (_req, res) => res.json({
  recipients: recipients(),
  mailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  subject: `${SUBJECT} – Dated: DD-MM-YYYY`,
  rules: Object.entries(RATE_RULES).map(([section, r]) => ({ section, label: r.label, basis: r.basis })),
  limits: { maxFileMb: 10, formats: ["XLSX", "CSV"] },
  version: "1.0.0",
}));

app.post("/api/process", limiter, upload.fields(SLOTS.map((name) => ({ name, maxCount: 1 }))), async (req, res) => {
  try {
    const inputs = await parseUploads(req.files);
    const result = buildTds({ payments: inputs.payments.data, vendors: inputs.vendors.data, challans: inputs.challans.data, notes: inputs.notes?.data });

    // identical files → same run (no duplicate report or email)
    const h = crypto.createHash("sha1");
    for (const k of SLOTS) if (inputs[k]) h.update(k).update(inputs[k].file.buffer);
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
      writeJson(path.join(dir, "result.json"), result);
    }
    const tag = result.period.label.replace(/[^A-Za-z0-9-]+/g, "_");
    const meta = existing || {
      id, createdAt: new Date().toISOString(),
      fileName: `tds_processing_summary_${tag}.pdf`, xlsxName: `tds_processing_output_${tag}.xlsx`,
      period: result.period, subtitle: result.subtitle, totals: result.totals, exceptions: result.exceptions.length,
      flagged: result.stats.flagged, status: result.status,
      inputs: Object.fromEntries(SLOTS.filter((k) => inputs[k]).map((k) => [k, inputs[k].file.originalname])),
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
  if (!dir || !SLOTS.includes(req.params.kind)) return res.status(404).end();
  const meta = fs.existsSync(path.join(dir, "meta.json")) ? readJson(path.join(dir, "meta.json")) : null;
  const f = fs.existsSync(path.join(dir, "inputs")) && fs.readdirSync(path.join(dir, "inputs")).find((n) => n.startsWith(`${req.params.kind}.`));
  if (!meta || !f) return res.status(404).json({ error: "File not found" });
  res.setHeader("Content-Disposition", `attachment; filename="${String(meta.inputs?.[req.params.kind] || f).replace(/["\r\n]/g, "")}"`);
  res.setHeader("Content-Type", f.endsWith(".csv") ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  fs.createReadStream(path.join(dir, "inputs", f)).pipe(res);
});

// chat with a processed run (DeepSeek, streamed) — grounded in the output + every uploaded file
mountChat(app, {
  stream, runDir, context: tdsContext, suggestions: TDS_SUGGESTIONS,
  assistant: "TDS Assistant", product: "TDS Return Preparation & Reconciliation",
  limiter: rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }),
});

app.post("/api/runs/:id/email", limiter, async (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !fs.existsSync(path.join(dir, "meta.json"))) return res.status(404).json({ error: "Run not found" });
  res.json({ mail: await sendMail(dir, readJson(path.join(dir, "meta.json"))) });
});

app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Each file must be under 10 MB." });
  console.error(err);
  res.status(500).json({ error: "Unexpected error" });
});

const PORT = Number(process.env.PORT) || 8005;
app.listen(PORT, process.env.HOST || "0.0.0.0", () => console.log(`TDS Returns API on :${PORT}`));
