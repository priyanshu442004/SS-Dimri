export const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

export const inr = (n, { sign = false, dp = 2 } = {}) => {
  if (n == null || Number.isNaN(n)) return "—";
  const s = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return `${sign && n < 0 ? "−" : sign && n > 0 ? "+" : ""}₹${s}`;
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d} ${MON[+m - 1]} ${y.slice(2)}`;
};

export const kb = (bytes) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Quick client-side row count for CSVs (instant feedback before upload). */
export async function previewFile(file) {
  if (!/\.(csv|txt)$/i.test(file.name)) return { rows: null };
  const text = await file.slice(0, 2 * 1024 * 1024).text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return { rows: Math.max(0, lines.length - 1), header: lines[0]?.split(",").slice(0, 6) };
}

// exception classes → label + tone
export const CLASSES = {
  "unrecorded-bank": { label: "Not in books", tone: "rose" },
  "unrecorded-book": { label: "Not in bank", tone: "rose" },
  timing: { label: "Timing", tone: "amber" },
  group: { label: "Group match", tone: "teal" },
  mismatch: { label: "Amount mismatch", tone: "rose" },
  duplicate: { label: "Possible duplicate", tone: "rose" },
};

export const MATCH_TYPES = {
  exact: { label: "Exact", hint: "Reference + amount" },
  "amount-date": { label: "Amount + date", hint: "Same amount within the date window" },
  mismatch: { label: "Mismatch", hint: "Same reference, different amount" },
  "one-to-many": { label: "One → many", hint: "One bank row = several book rows" },
  "many-to-one": { label: "Many → one", hint: "Several bank rows = one book row" },
  "split-fee": { label: "Split + fee", hint: "Group match with a fee component" },
};
