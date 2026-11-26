// Builds the assistant's files (25 Nov 2026): a well-laid-out PDF report (title band, headline figures,
// sections with text, tables and charts) and a formatted Excel workbook (title block, figures, styled
// tables with real formulas and totals). Input is already checked (make.ts). Pure.

import { buildStyledXlsx, type XCell, type XSheet, type XType } from "@/lib/xlsx-styled";
import type { ChartSpec, ColType } from "./spec";
import type { ResolvedTable, Value } from "./resolve";

export type DocMeta = { firm: string; preparedFor: string; preparedOn: string; asOf: string };
export type PdfDoc = {
  title: string; subtitle?: string; landscape?: boolean;
  kpis: { label: string; value: number | string; type?: ColType; hint?: string }[];
  sections: { heading?: string; text?: string; bullets?: string[]; kpis?: PdfDoc["kpis"]; table?: ResolvedTable; chart?: ChartSpec }[];
};
export type XlsxDoc = { title: string; subtitle?: string; sheets: { name: string; title?: string; kpis: PdfDoc["kpis"]; table: ResolvedTable; notes?: string[] }[] };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatValue(v: Value | undefined, type: ColType): string {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "date" && typeof v === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    return m ? `${Number(m[3])} ${MONTH[Number(m[2]) - 1]} ${m[1]}` : v;
  }
  if (typeof v !== "number") return String(v);
  switch (type) {
    case "inr": return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
    case "int": return Math.round(v).toLocaleString("en-IN");
    case "percent": return `${(Math.round(v * 10) / 10).toLocaleString("en-IN")}%`;
    case "hours": return `${Math.round(v * 100) / 100} h`;
    case "number": return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    default: return Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
}

// ---------------------------------------------------------------- charts (SVG)

const PALETTE = ["#1f3a5f", "#2a9d8f", "#e9a23b", "#c44e52", "#6c5b9e", "#4c8fd6"];

function chartSvg(spec: ChartSpec): string {
  // Dates read as "2 Nov" on the axis.
  const c = { ...spec, labels: spec.labels.map((l) => (/^\d{4}-\d{2}-\d{2}$/.test(l) ? formatValue(l, "date").replace(/ \d{4}$/, "") : l)) };
  const W = 680, H = 300, fmt = (v: number) => formatValue(v, c.format ?? "number");
  const values = c.series.flatMap((s) => s.values);
  const legend = c.series.length > 1 ? `<div class="legend">${c.series.map((s, i) => `<span><i style="background:${PALETTE[i % 6]}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";
  if (c.chart === "pie" || c.chart === "donut") {
    const s = c.series[0];
    const total = s.values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    let a0 = -Math.PI / 2;
    const cx = 150, cy = 150, r = 120, ri = c.chart === "donut" ? 66 : 0;
    const arcs = s.values.map((v, i) => {
      const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number, rr: number) => `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
      const d = ri ? `M${p(a0, r)} A${r},${r} 0 ${large} 1 ${p(a1, r)} L${p(a1, ri)} A${ri},${ri} 0 ${large} 0 ${p(a0, ri)} Z` : `M${cx},${cy} L${p(a0, r)} A${r},${r} 0 ${large} 1 ${p(a1, r)} Z`;
      a0 = a1;
      return `<path d="${d}" fill="${PALETTE[i % 6]}" stroke="#fff" stroke-width="1.5"/>`;
    }).join("");
    const keys = c.labels.map((l, i) => `<div class="key"><i style="background:${PALETTE[i % 6]}"></i>${esc(l)} — <b>${esc(fmt(s.values[i]))}</b> (${Math.round((Math.max(0, s.values[i]) / total) * 1000) / 10}%)</div>`).join("");
    return `<div class="chart"><div class="ct">${esc(c.title)}</div><div class="pie"><svg width="300" height="300" viewBox="0 0 300 300">${arcs}</svg><div class="keys">${keys}</div></div></div>`;
  }
  const whole = values.every((v) => Number.isInteger(v));
  let max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  if (whole && max - min <= 8) max = min + Math.max(1, Math.ceil(max - min)); // whole-number axis for small counts
  else if (whole) max = min + Math.ceil((max - min) / 4) * 4;
  const span = max - min || 1;
  if (c.chart === "bar") {
    const rowH = 26, left = 190, right = 90, h = c.labels.length * rowH * Math.max(1, c.series.length) + 20;
    const x = (v: number) => left + ((v - min) / span) * (W - left - right);
    let y = 10;
    const bars = c.labels.map((l, i) => {
      const g = c.series.map((s, j) => {
        const v = s.values[i];
        const out = `<rect x="${Math.min(x(0), x(v))}" y="${y + 4}" width="${Math.max(1, Math.abs(x(v) - x(0)))}" height="${rowH - 8}" fill="${v < 0 ? "#c44e52" : PALETTE[j % 6]}" rx="2"/><text x="${Math.max(x(0), x(v)) + 6}" y="${y + rowH / 2 + 4}" class="val">${esc(fmt(v))}</text>`;
        y += rowH;
        return out;
      }).join("");
      return `<text x="${left - 8}" y="${y - (rowH * c.series.length) / 2 + 4}" text-anchor="end" class="lab">${esc(l.length > 28 ? `${l.slice(0, 27)}…` : l)}</text>${g}`;
    }).join("");
    return `<div class="chart"><div class="ct">${esc(c.title)}</div>${legend}<svg width="${W}" height="${h}" viewBox="0 0 ${W} ${h}"><line x1="${x(0)}" y1="6" x2="${x(0)}" y2="${h - 6}" stroke="#cbd5e1"/>${bars}</svg></div>`;
  }
  // column / line: vertical axis
  const top = 20, bottom = 60, left = 70, right = 16, ph = H - top - bottom, pw = W - left - right;
  const y = (v: number) => top + ph - ((v - min) / span) * ph;
  const steps = whole && span <= 8 ? span : 4;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => min + (i / steps) * span);
  const grid = ticks.map((t) => `<line x1="${left}" x2="${W - right}" y1="${y(t)}" y2="${y(t)}" stroke="#e5e7eb"/><text x="${left - 6}" y="${y(t) + 4}" text-anchor="end" class="ax">${esc(fmt(Math.round(t * 100) / 100))}</text>`).join("");
  const step = pw / c.labels.length;
  const labels = c.labels.map((l, i) => `<text x="${left + step * i + step / 2}" y="${H - bottom + 16}" text-anchor="end" transform="rotate(-35 ${left + step * i + step / 2} ${H - bottom + 16})" class="ax">${esc(l.length > 16 ? `${l.slice(0, 15)}…` : l)}</text>`).join("");
  let marks = "";
  if (c.chart === "column") {
    const bw = Math.max(3, (step * 0.7) / c.series.length);
    marks = c.series.map((s, j) => s.values.map((v, i) => {
      const x0 = left + step * i + step * 0.15 + j * bw;
      return `<rect x="${x0}" y="${Math.min(y(v), y(0))}" width="${bw - 1}" height="${Math.max(1, Math.abs(y(v) - y(0)))}" fill="${v < 0 ? "#c44e52" : PALETTE[j % 6]}" rx="1.5"/>${c.labels.length <= 14 && c.series.length === 1 ? `<text x="${x0 + bw / 2}" y="${Math.min(y(v), y(0)) - 4}" text-anchor="middle" class="val">${esc(fmt(v))}</text>` : ""}`;
    }).join("")).join("");
  } else {
    marks = c.series.map((s, j) => {
      const pts = s.values.map((v, i) => `${left + step * i + step / 2},${y(v)}`);
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${PALETTE[j % 6]}" stroke-width="2.5"/>${s.values.map((v, i) => `<circle cx="${left + step * i + step / 2}" cy="${y(v)}" r="3" fill="${PALETTE[j % 6]}"/>`).join("")}`;
    }).join("");
  }
  return `<div class="chart"><div class="ct">${esc(c.title)}</div>${legend}<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${grid}<line x1="${left}" x2="${W - right}" y1="${y(0)}" y2="${y(0)}" stroke="#94a3b8"/>${marks}${labels}</svg></div>`;
}

// ---------------------------------------------------------------- PDF (HTML)

const isNum = (t: ColType) => t !== "text" && t !== "date";

function tableHtml(t: ResolvedTable): string {
  const head = t.columns.map((c) => `<th class="${isNum(c.type) ? "n" : ""}">${esc(c.header)}</th>`).join("");
  const body = t.rows.map((r) => `<tr>${t.columns.map((c, i) => `<td class="${isNum(c.type) ? "n" : ""}">${esc(formatValue(r[i], c.type))}</td>`).join("")}</tr>`).join("");
  const tot = t.totals ? `<tr class="tot">${t.columns.map((c, i) => `<td class="${isNum(c.type) ? "n" : ""}">${t.totals![i] === undefined ? "" : esc(i === 0 ? "Total" : formatValue(t.totals![i] ?? null, c.type))}</td>`).join("")}</tr>` : "";
  return `${t.title ? `<div class="tt">${esc(t.title)}</div>` : ""}<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}${tot}</tbody></table>${t.rows.length ? `<div class="cnt">${t.rows.length} row${t.rows.length === 1 ? "" : "s"}</div>` : `<div class="cnt">No rows.</div>`}`;
}

function kpiHtml(k: PdfDoc["kpis"]): string {
  if (!k.length) return "";
  return `<div class="kpis">${k.map((x) => `<div class="kpi"><div class="kl">${esc(x.label)}</div><div class="kv">${esc(typeof x.value === "number" ? formatValue(x.value, x.type ?? "number") : x.value)}</div>${x.hint ? `<div class="kh">${esc(x.hint)}</div>` : ""}</div>`).join("")}</div>`;
}

/** Light markdown: **bold**, paragraphs, "- " bullets. */
function textHtml(s: string): string {
  const inline = (x: string) => esc(x).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`); list = []; } };
  for (const line of s.split(/\n/)) {
    const m = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (m) { list.push(m[1]); continue; }
    flush();
    if (line.trim()) out.push(`<p>${inline(line.trim())}</p>`);
  }
  flush();
  return out.join("");
}

export function pdfHtml(doc: PdfDoc, meta: DocMeta): string {
  const sections = doc.sections.map((s) => `<section${s.table ? "" : ' class="keep"'}>${s.heading ? `<h2>${esc(s.heading)}</h2>` : ""}${s.kpis ? kpiHtml(s.kpis) : ""}${s.text ? textHtml(s.text) : ""}${s.bullets?.length ? `<ul>${s.bullets.map((b) => `<li>${esc(b).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</li>`).join("")}</ul>` : ""}${s.chart ? chartSvg(s.chart) : ""}${s.table ? tableHtml(s.table) : ""}</section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Sans", "Segoe UI", Arial, sans-serif; color: #1f2937; font-size: 11px; line-height: 1.45; }
  .band { background: #1f3a5f; color: #fff; padding: 16px 20px; border-radius: 6px; }
  .band .firm { font-size: 11px; opacity: .85; letter-spacing: .4px; text-transform: uppercase; }
  .band h1 { margin: 4px 0 2px; font-size: 21px; } .band .sub { font-size: 12px; opacity: .9; }
  .meta { display: flex; gap: 18px; flex-wrap: wrap; color: #6b7280; font-size: 10px; margin: 8px 2px 4px; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin: 12px 0; }
  .kpi { border: 1px solid #dbe3ee; border-left: 4px solid #1f3a5f; border-radius: 6px; padding: 8px 10px; background: #f8fafc; break-inside: avoid; }
  .kl { color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: .3px; } .kv { font-size: 17px; font-weight: 700; color: #1f3a5f; margin-top: 2px; } .kh { color: #6b7280; font-size: 9.5px; }
  section { margin-top: 14px; } section.keep { break-inside: avoid; } h2 { break-after: avoid; } h2 { font-size: 13.5px; color: #1f3a5f; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin: 0 0 8px; }
  p { margin: 0 0 6px; } ul { margin: 0 0 6px 18px; padding: 0; } li { margin: 2px 0; }
  table.data { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 10px; }
  table.data thead { display: table-header-group; } table.data tr { break-inside: avoid; }
  table.data th { background: #1f3a5f; color: #fff; text-align: left; padding: 6px 7px; font-weight: 600; }
  table.data td { border-bottom: 1px solid #e5e7eb; padding: 5px 7px; vertical-align: top; }
  table.data tbody tr:nth-child(even) td { background: #f5f7fb; }
  table.data .n { text-align: right; white-space: nowrap; }
  table.data tr.tot td { font-weight: 700; background: #e8eef7 !important; border-top: 2px solid #1f3a5f; }
  .tt { font-weight: 700; margin-top: 8px; color: #374151; } .cnt { color: #9ca3af; font-size: 9px; margin-top: 3px; }
  .chart { margin: 8px 0 10px; break-inside: avoid; } .ct { font-weight: 700; color: #374151; margin-bottom: 4px; }
  .chart .lab, .chart .ax { font-size: 10px; fill: #4b5563; } .chart .val { font-size: 9.5px; fill: #111827; }
  .legend { display: flex; gap: 12px; font-size: 10px; color: #4b5563; margin-bottom: 4px; } .legend i, .key i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
  .pie { display: flex; align-items: center; gap: 16px; } .keys { font-size: 10.5px; } .key { margin: 3px 0; }
  .foot { margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 6px; color: #9ca3af; font-size: 9px; }
</style></head><body>
<div class="band"><div class="firm">${esc(meta.firm)}</div><h1>${esc(doc.title)}</h1>${doc.subtitle ? `<div class="sub">${esc(doc.subtitle)}</div>` : ""}</div>
<div class="meta"><span>Prepared on ${esc(meta.preparedOn)}</span><span>For ${esc(meta.preparedFor)}</span><span>Data as of ${esc(meta.asOf)}</span></div>
${kpiHtml(doc.kpis)}${sections}
<div class="foot">Every figure in this report is taken from ${esc(meta.firm)}'s records in the Office ERP${meta.asOf ? ` as of ${esc(meta.asOf)}` : ""}; totals and percentages are worked out from those records.</div>
</body></html>`;
}

// ---------------------------------------------------------------- Excel

const XT: Record<ColType, XType> = { text: "text", int: "int", number: "number", inr: "inr", percent: "percent", date: "date", hours: "hours" };

export function xlsxBytes(doc: XlsxDoc, meta: DocMeta): Uint8Array {
  const sheets: XSheet[] = doc.sheets.map((s) => {
    const t = s.table;
    return {
      name: s.name,
      title: s.title ?? doc.title,
      subtitle: doc.subtitle,
      meta: [["Prepared on", meta.preparedOn], ["Prepared for", meta.preparedFor], ["Data as of", meta.asOf], ["Source", `${meta.firm} — Office ERP records`]],
      kpis: s.kpis.map((k) => ({ label: k.label, value: k.value, type: k.type ? XT[k.type] : undefined })),
      columns: t.columns.map((c) => ({ header: c.header, type: XT[c.type], total: c.total })),
      rows: t.rows.map((r) => t.columns.map((c, i): XCell => {
        const v = r[i];
        if (c.excel) return { formula: `IFERROR(${c.excel},"")`, value: typeof v === "number" ? Math.round(v * 100) / 100 : null };
        if (c.type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00Z`);
        return v;
      })),
      totals: !!t.totals,
      notes: [...(s.notes ?? []), "Every figure is taken from the firm's ERP records; calculated columns and totals are Excel formulas."],
    };
  });
  return buildStyledXlsx(sheets, { creator: meta.firm });
}
