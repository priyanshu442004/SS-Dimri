// AI summary report for the Overview page: DeepSeek turns a checked batch into a
// short, decision-ready summary. Generated once per batch (cached in its folder).
import fs from "fs";
import path from "path";
import { complete } from "./deepseek.js";

const inflight = new Map();

/** Compact, already-validated facts — the model summarises; it never recomputes the checks. */
function facts(meta, b) {
  const t = b.totals;
  return {
    batch: b.batchName || meta.batchName, period: b.period,
    totals: { invoicesReceived: t.invoices, invoicesInTotals: t.invoices - t.duplicates, note: "taxable, gst and payable totals exclude duplicate copies", passed: t.passed, needReview: t.exceptions, suppliers: t.suppliers, taxable: t.taxable, gst: t.gst, payableAsPrinted: t.printed, payableAsCalculated: t.expected, overchargedBy: t.variance, duplicates: t.duplicates },
    issues: b.issues.map((i) => ({ title: i.title, detail: i.text, nextStep: i.next })),
    gstByRate: b.gstByRate.map((g) => ({ rate: g.rate, invoices: g.invoices, taxable: g.taxable, gst: g.gst })),
    topSuppliers: [...b.suppliers].sort((x, y) => y.total - x.total).slice(0, 5).map((s) => ({ name: s.name, invoices: s.invoices, total: s.total, exceptions: s.exceptions })),
  };
}

const PROMPT = `You are an accounts-payable controller. Write the AI summary report for this checked batch of supplier invoices.
Return ONLY JSON:
{"verdict": "Clear to pay" | "Review before paying" | "Hold payment",
 "headline": "one sentence, max 24 words: what the AP team must know, with the key amount",
 "points": [3 to 4 items, each {"title": "2-4 words", "text": "max 22 words, concrete with ₹ amounts and invoice numbers"}],
 "action": "one sentence, max 22 words: the next step"}
Cover: what was processed and the total payable, each issue found (duplicates, total mismatches) with invoice number and amount, GST/input-tax-credit position, and supplier concentration if notable.
Rules: use only the facts given; Indian ₹ format (e.g. ₹64,494.00); no filler words, no markdown.`;

export async function batchSummary(dir, { refresh = false } = {}) {
  const file = path.join(dir, "ai-summary.json");
  if (!refresh && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  if (inflight.has(dir)) return inflight.get(dir);
  const job = (async () => {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
    const b = JSON.parse(fs.readFileSync(path.join(dir, "batch.json"), "utf8"));
    const j = await complete([
      { role: "system", content: PROMPT },
      { role: "user", content: JSON.stringify(facts(meta, b)) },
    ], { json: true, maxTokens: 600, temperature: 0.2 });
    const points = (Array.isArray(j.points) ? j.points : []).filter((p) => p?.title && p?.text).slice(0, 4);
    if (!j.headline || points.length < 2) throw new Error("Incomplete summary from the AI model");
    const verdicts = ["Clear to pay", "Review before paying", "Hold payment"];
    const out = {
      runId: meta.id, batchName: meta.batchName, createdAt: meta.createdAt,
      verdict: verdicts.includes(j.verdict) ? j.verdict : (b.status.ok ? "Clear to pay" : "Review before paying"),
      headline: String(j.headline), points, action: j.action ? String(j.action) : "",
      generatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(file, JSON.stringify(out, null, 1));
    return out;
  })().finally(() => inflight.delete(dir));
  inflight.set(dir, job);
  return job;
}
