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
