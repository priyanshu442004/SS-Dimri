// GST Reconciliation helpers.
import { inr } from "@shared/format";

export const money = (n) => (n == null ? "—" : inr(n, { dp: 0 }));

/** FastAPI errors come back as {detail}; the shared api() helper expects {error}. */
export async function gst(path, opts = {}) {
  const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const res = await fetch(`${base}${path}`, opts);
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  if (!res.ok) {
    const d = body?.detail;
    throw new Error(typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join("; ") : `Request failed (${res.status})`);
  }
  return body;
}
export const reportUrl = (id, name) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/cases/${id}/reports/${encodeURIComponent(name)}`;

export const ROLE = {
  outward_register: "Outward register", inward_register: "Inward register", gstr2b: "GSTR-2B", gstr1_summary: "GSTR-1 summary",
  gstr3b_summary: "GSTR-3B summary", cash_ledger: "Cash ledger", credit_ledger: "Credit ledger", rcm_working: "RCM working",
  hsn_outward: "HSN outward", hsn_inward: "HSN inward", inward_reconciliation: "Inward reconciliation",
  table8_reconciliation: "Table 8 reconciliation", tax_rate_summary: "Tax-rate summary", portal_gstr9: "Portal GSTR-9",
  reference_gstr9: "Reference GSTR-9", reference_gstr9c: "Reference GSTR-9C", unknown: "Needs confirmation",
};

export const riskTone = (r) => ({ High: "bad", Medium: "warn", Low: "good" }[r] || "neutral");
export const statusTone = (s = "") => (/fail/i.test(s) ? "bad" : /review|data/i.test(s) ? "warn" : /ready|complete|normalized|mapped/i.test(s) ? "good" : "neutral");
export const label = (k) => k.replaceAll("_", " ").replace(/gstr9/gi, "GSTR-9").replace(/\bitc\b/gi, "ITC").replace(/^\w/, (c) => c.toUpperCase());

export const FY = ["2025-26", "2024-25", "2023-24", "2022-23"];
