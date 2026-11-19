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
import { pdfToRows } from "./lib/pdfText.js";
import { DOCS, checkDocType, extractAll } from "./lib/extract.js";
import { analyse } from "./lib/metrics.js";
import { buildWorkbook } from "./lib/excel.js";
import { answer, SUGGESTIONS } from "./lib/chat.js";
import { mailReport, SUBJECT } from "./lib/mail.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, "data", "analyses");
fs.mkdirSync(DATA, { recursive: true });
const PY = path.resolve(ROOT, process.env.PYTHON_BIN || "report/.venv/bin/python");
const SLOTS = Object.keys(DOCS); // balanceSheet, profitLoss, cashFlow, ratios

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-origin" } }));
app.use(express.json({ limit: "64kb" }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 4 } });
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const recipients = () => (process.env.MAIL_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 1));
const runDir = (id) => (/^[a-f0-9]{16}$/.test(id) ? path.join(DATA, id) : null);

function renderPdf(model, outPath) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, [path.join(ROOT, "report", "render_report.py"), outPath], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`renderer exited ${code}: ${err.slice(-400)}`))));
    p.stdin.end(Buffer.from(JSON.stringify(model), "utf8"));
  });
}

async function sendMail(dir, meta) {
  const mail = await mailReport({ pdf: fs.readFileSync(path.join(dir, "report.pdf")), fileName: meta.pdfName });
  if (mail.status === "failed") console.error("Report mail failed:", mail.error);
  else console.log(`📧 Analysis ${meta.id} → ${mail.status}${mail.to ? " " + mail.to.join(", ") : ""}`);
  meta.mail = { status: mail.status, to: mail.to, error: mail.error, at: new Date().toISOString() };
  writeJson(path.join(dir, "meta.json"), meta);
  return meta.mail;
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/settings", (_req, res) => res.json({
  recipients: recipients(),
  mailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  subject: `${SUBJECT} – Dated: DD-MM-YYYY`,
  model: process.env.DEEPSEEK_MODEL || "deepseek-v4-pro",
  documents: SLOTS.map((s) => DOCS[s].label),
  limits: { maxFileMb: 15, formats: ["PDF (text-based)"] },
  version: "1.0.0",
}));
app.get("/api/suggestions", (_req, res) => res.json({ suggestions: SUGGESTIONS }));

// Upload the four statements → extract, analyse, report, email.
app.post("/api/analyses", limiter, upload.fields(SLOTS.map((name) => ({ name, maxCount: 1 }))), async (req, res) => {
  try {
    const files = Object.fromEntries(SLOTS.map((s) => [s, req.files?.[s]?.[0]]));
    const missing = SLOTS.filter((s) => !files[s]).map((s) => DOCS[s].label);
    if (missing.length) return res.status(400).json({ error: `Upload all four documents. Missing: ${missing.join(", ")}.` });

    const hash = crypto.createHash("sha1");
    SLOTS.forEach((s) => hash.update(s).update(files[s].buffer));
    const id = hash.digest("hex").slice(0, 16);
    const dir = path.join(DATA, id);
    const metaPath = path.join(dir, "meta.json");

    if (!fs.existsSync(metaPath)) {
      const texts = {};
      for (const s of SLOTS) {
        const r = await pdfToRows(files[s].buffer).catch(() => null);
        if (!r || r.charCount < 80) return res.status(422).json({ error: `${DOCS[s].label}: no readable text — upload a text-based PDF, not a scan.` });
        if (!checkDocType(s, r.text)) return res.status(422).json({ error: `The file in “${DOCS[s].label}” doesn't look like a ${DOCS[s].label}. Check the order of the uploads.` });
        texts[s] = r.text;
      }
      const extracted = await extractAll(texts);
      const analysis = analyse(extracted);

      fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
      SLOTS.forEach((s) => fs.writeFileSync(path.join(dir, "docs", `${s}.pdf`), files[s].buffer));
      await renderPdf(analysis.model, path.join(dir, "report.pdf"));
      fs.writeFileSync(path.join(dir, "analysis.xlsx"), await buildWorkbook(analysis));
      writeJson(path.join(dir, "session.json"), { texts, analysis, extracted: extracted.data });
      writeJson(path.join(dir, "chat.json"), []);
      const slug = analysis.company.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "Company";
      writeJson(metaPath, {
        id, createdAt: new Date().toISOString(), company: analysis.company, fy: analysis.fy, pfy: analysis.pfy, periodEnd: analysis.periodEnd,
        score: analysis.score, risk: analysis.risk, status: analysis.status,
        files: Object.fromEntries(SLOTS.map((s) => [s, files[s].originalname])),
        pdfName: `${analysis.fy}_Financial_Health_Summary_${slug}.pdf`, xlsxName: `${analysis.fy}_Financial_Analysis_${slug}.xlsx`,
      });
    }
    const meta = readJson(metaPath);
    if (!meta.mail || meta.mail.status !== "sent") await sendMail(dir, meta);
    res.json({ id, meta });
  } catch (e) {
    console.error("analysis:", e);
    res.status(422).json({ error: e.message || "Could not analyse the documents." });
  }
});

app.get("/api/runs", (_req, res) => {
  const runs = fs.readdirSync(DATA).map((id) => path.join(DATA, id, "meta.json")).filter((p) => fs.existsSync(p)).map(readJson)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ runs });
});
app.get("/api/runs/:id", (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !fs.existsSync(path.join(dir, "session.json"))) return res.status(404).json({ error: "Analysis not found" });
  const { analysis } = readJson(path.join(dir, "session.json"));
  res.json({ meta: readJson(path.join(dir, "meta.json")), analysis, chat: readJson(path.join(dir, "chat.json")) });
});

const FILES = { pdf: ["report.pdf", "application/pdf", "pdfName"], xlsx: ["analysis.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsxName"] };
app.get("/api/runs/:id/:kind(pdf|xlsx)", (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !fs.existsSync(path.join(dir, "meta.json"))) return res.status(404).end();
  const [file, type, key] = FILES[req.params.kind];
  const meta = readJson(path.join(dir, "meta.json"));
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", `${req.params.kind === "pdf" && !req.query.download ? "inline" : "attachment"}; filename="${meta[key]}"`);
  fs.createReadStream(path.join(dir, file)).pipe(res);
});
app.get("/api/runs/:id/docs/:slot", (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !SLOTS.includes(req.params.slot)) return res.status(404).end();
  const f = path.join(dir, "docs", `${req.params.slot}.pdf`);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.setHeader("Content-Type", "application/pdf");
  fs.createReadStream(f).pipe(res);
});

// Chat transcript as Markdown
app.get("/api/runs/:id/transcript", (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !fs.existsSync(path.join(dir, "chat.json"))) return res.status(404).end();
  const meta = readJson(path.join(dir, "meta.json"));
  const chat = readJson(path.join(dir, "chat.json"));
  const md = [`# CFO Intelligence — ${meta.company}`, `${meta.fy} vs ${meta.pfy} · exported ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`, "",
    ...chat.map((m) => `## ${m.role === "user" ? "You" : "CFO Intelligence"}\n\n${m.content}\n`)].join("\n");
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="CFO_chat_${meta.fy}.md"`);
  res.send(md);
});

// Streaming chat (Server-Sent Events). Body: { message }
app.post("/api/runs/:id/chat", chatLimiter, async (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !fs.existsSync(path.join(dir, "session.json"))) return res.status(404).json({ error: "Analysis not found" });
  const question = String(req.body?.message || "").trim().slice(0, 2000);
  if (!question) return res.status(400).json({ error: "Empty message" });

  const session = readJson(path.join(dir, "session.json"));
  const chatPath = path.join(dir, "chat.json");
  const history = readJson(chatPath);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no"); // nginx: don't buffer the stream
  res.flushHeaders();
  const ctrl = new AbortController();
  res.on("close", () => ctrl.abort());

  let full = "";
  try {
    for await (const delta of answer(session, history, question, ctrl.signal)) {
      full += delta;
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }
    const at = new Date().toISOString();
    history.push({ role: "user", content: question, at }, { role: "assistant", content: full, at });
    writeJson(chatPath, history);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (e) {
    if (!ctrl.signal.aborted) {
      console.error("chat:", e.message);
      res.write(`data: ${JSON.stringify({ error: "The CFO assistant is unavailable right now. Please try again." })}\n\n`);
    }
  }
  res.end();
});
app.post("/api/runs/:id/chat/reset", (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !fs.existsSync(path.join(dir, "chat.json"))) return res.status(404).end();
  writeJson(path.join(dir, "chat.json"), []);
  res.json({ ok: true });
});

app.post("/api/runs/:id/email", limiter, async (req, res) => {
  const dir = runDir(req.params.id);
  if (!dir || !fs.existsSync(path.join(dir, "meta.json"))) return res.status(404).json({ error: "Analysis not found" });
  res.json({ mail: await sendMail(dir, readJson(path.join(dir, "meta.json"))) });
});

app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Each PDF must be under 15 MB." });
  console.error(err);
  res.status(500).json({ error: "Unexpected error" });
});

const PORT = Number(process.env.PORT) || 8001;
app.listen(PORT, process.env.HOST || "0.0.0.0", () => console.log(`Financial Statement Analysis API on :${PORT}`));
