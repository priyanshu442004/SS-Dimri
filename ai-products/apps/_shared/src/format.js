export const inr = (n, { sign = false, dp = 2 } = {}) => {
  if (n == null || Number.isNaN(+n)) return "—";
  const s = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return `${sign && n < 0 ? "−" : sign && n > 0 ? "+" : n < 0 ? "−" : ""}₹${s}`;
};

/** ₹ in crore / lakh, e.g. 154771430 -> "₹15.48 Cr". */
export const inrShort = (rupees) => {
  if (rupees == null) return "—";
  const a = Math.abs(rupees), s = rupees < 0 ? "−" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  return `${s}₹${a.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d} ${MON[+m - 1]} ${y}`;
};
export const dateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
export const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
export const kb = (bytes) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
export const pct = (n, dp = 1) => (n == null ? "—" : `${n.toFixed(dp)}%`);
