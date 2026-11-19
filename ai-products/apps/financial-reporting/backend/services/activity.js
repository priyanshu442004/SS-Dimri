// Activity log behind the dashboard stats, "Recent uploads", notifications and
// History page. Every tracked API call is recorded with its outcome and duration
// in data/activity.json (newest first, capped).
import fs from "fs";
import path from "path";
import crypto from "crypto";

const FILE = path.join(process.cwd(), "data", "activity.json");
const MAX = 500;

// method + path → what the event means. kind: "upload" (a file came in), "process"
// (a statement was produced), "download", "email", "delete".
const ROUTES = [
  { m: "POST", p: "/api/trial-balance/upload", kind: "upload", title: "Trial balance uploaded" },
  { m: "POST", p: "/api/trial-balance/process", kind: "process", title: "Trial balance processed" },
  { m: "POST", p: "/api/trial-balance/process/BalanceSheet", kind: "process", title: "Balance Sheet generated" },
  { m: "POST", p: "/api/trial-balance/process/PL", kind: "process", title: "Profit & Loss generated" },
  { m: "POST", p: "/api/v1/upload/upload", kind: "upload", title: "Sales MIS file processed" },
  { m: "POST", p: "/api/ai/upload", kind: "upload", title: "Trial balance uploaded to AI" },
  { m: "DELETE", p: "/api/trial-balance/delete", kind: "delete", title: "Trial balance removed" },
  { m: "GET", p: "/api/download/download-financials", kind: "download", title: "All statements downloaded" },
];

export function readActivity() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; }
}

export function recordActivity(e) {
  try {
    const list = readActivity();
    list.unshift({ id: crypto.randomBytes(6).toString("hex"), at: new Date().toISOString(), ...e });
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(list.slice(0, MAX), null, 1));
  } catch (err) {
    console.error("activity log write failed:", err.message);
  }
}

/** Express middleware: records the tracked routes once the response is sent. */
export function activityMiddleware(req, res, next) {
  const route = ROUTES.find((r) => r.m === req.method && req.path === r.p);
  if (!route) return next();
  const started = Date.now();
  let body;
  const json = res.json.bind(res);
  res.json = (b) => { body = b; return json(b); };
  res.on("finish", () => {
    const files = [req.file, ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat())].filter(Boolean);
    const file = files.map((f) => f.originalname).join(", ")
      || (route.kind === "process" || route.kind === "download" ? currentTbName() : "")
      || "";
    const ok = res.statusCode < 400 && body?.extracted !== false && body?.success !== false;
    recordActivity({
      kind: route.kind, title: ok ? route.title : `${route.title.replace(/ (uploaded|processed|generated|removed|downloaded)$/, "")} failed`,
      file, ok, ms: Date.now() - started,
      detail: ok ? "" : String(body?.message || body?.error || `HTTP ${res.statusCode}`).slice(0, 200),
    });
  });
  next();
}

function currentTbName() {
  try {
    const dir = path.join(process.cwd(), "uploads");
    return fs.readdirSync(dir).map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs })).sort((a, b) => b.t - a.t)[0]?.n || "";
  } catch { return ""; }
}

const istDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(d));

/** Summary for the dashboard. */
export function activitySummary() {
  const all = readActivity();
  const work = all.filter((e) => e.kind === "upload" || e.kind === "process");
  const done = work.filter((e) => e.ok);
  const today = istDay(Date.now());
  return {
    stats: {
      documentsProcessed: done.length,
      filesToday: new Set(work.filter((e) => istDay(e.at) === today && e.file).map((e) => e.file)).size,
      avgProcessingMs: done.length ? Math.round(done.reduce((s, e) => s + (e.ms || 0), 0) / done.length) : null,
      successRate: work.length ? Math.round((done.length / work.length) * 1000) / 10 : null,
      total: work.length,
    },
    uploads: all.filter((e) => e.kind === "upload").slice(0, 8),
    events: all.slice(0, 100),
  };
}
