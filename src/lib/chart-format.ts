// Number formatting shared by charts (client) and their table views (server).

export type Format = "count" | "minutes" | "inr" | "percent";

export function fmt(v: number, f: Format = "count") {
  if (f === "minutes") {
    const h = Math.floor(v / 60);
    const m = Math.round(v % 60);
    return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  }
  if (f === "inr") return `₹ ${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  if (f === "percent") return `${Math.round(v)}%`;
  return v.toLocaleString("en-IN");
}

/** Short form for tight spaces (a donut's centre): ₹8.84 L, ₹1.2 Cr, 12.5k. */
export function fmtCompact(v: number, f: Format = "count") {
  const a = Math.abs(v);
  if (f === "inr") {
    if (a >= 1e7) return `₹${(v / 1e7).toFixed(a >= 1e8 ? 1 : 2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")} Cr`;
    if (a >= 1e5) return `₹${(v / 1e5).toFixed(2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")} L`;
    if (a >= 1e3) return `₹${(v / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
    return `₹${Math.round(v)}`;
  }
  if (f === "count" && a >= 1e4) return `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return fmt(v, f);
}
