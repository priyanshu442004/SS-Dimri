// Well-presented .xlsx reports (25 Nov 2026) on top of fflate, like lib/xlsx but with a title block,
// summary figures, a styled header, borders, light banding, number formats (₹ in Indian grouping, %,
// dates, hours), real Excel formulas for computed columns and totals (with their values cached, so
// the file shows them at once and recalculates if edited), frozen header, filter and column widths.
// Used by the AI assistant's Excel files and the conveyance sheet export. Pure (no I/O).

import { strToU8, zipSync } from "fflate";

export type XType = "text" | "int" | "number" | "inr" | "percent" | "date" | "hours";
export type XCell = string | number | boolean | Date | null | undefined | { formula: string; value: number | null };
export type XColumn = { header: string; type?: XType; width?: number; total?: "sum" | "avg" | "count" | "none" };
export type XSheet = {
  name: string;
  title: string;
  subtitle?: string;
  /** Lines such as ["Period", "1 Nov 2026 – 26 Nov 2026"], ["Source", "ERP attendance"]. */
  meta?: [string, string][];
  /** Headline figures shown above the table. */
  kpis?: { label: string; value: number | string; type?: XType }[];
  columns: XColumn[];
  rows: XCell[][];
  /** Adds a bold totals row (columns with total "sum" / "avg" / "count"; numeric columns sum by default). */
  totals?: boolean;
  notes?: string[];
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
export function colName(i: number) {
  let n = i + 1;
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const EPOCH = Date.UTC(1899, 11, 30);
const serial = (d: Date) => (d.getTime() - EPOCH) / 86_400_000;

// ---------------------------------------------------------------- styles
// numFmt ids: 164 date, 165 ₹ Indian, 166 ₹ with negatives, 167 percent value (92.3 → 92.3%), 168 hours
const NUMFMTS: Record<number, string> = {
  164: "dd\\-mmm\\-yyyy",
  165: '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"#,##0.00',
  166: '"₹"#,##0.00;[Red]\\-"₹"#,##0.00',
  167: '0.0"%"',
  168: '0.00" h"',
};
const FMT: Record<XType, number> = { text: 0, int: 3, number: 4, inr: 165, percent: 167, date: 164, hours: 168 };
// fonts: 0 normal, 1 title, 2 subtitle, 3 bold, 4 header white bold, 5 kpi value, 6 note
const FONTS = [
  '<font><sz val="10"/><name val="Calibri"/></font>',
  '<font><b/><sz val="16"/><color rgb="FF1F3A5F"/><name val="Calibri"/></font>',
  '<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font>',
  '<font><b/><sz val="10"/><color rgb="FF374151"/><name val="Calibri"/></font>',
  '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
  '<font><b/><sz val="12"/><color rgb="FF1F3A5F"/><name val="Calibri"/></font>',
  '<font><i/><sz val="9"/><color rgb="FF6B7280"/><name val="Calibri"/></font>',
];
// fills: 0 none, 1 gray125, 2 header navy, 3 band, 4 total, 5 kpi
const FILLS = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF5F7FB"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F8"/></patternFill></fill>'];
// borders: 0 none, 1 thin all, 2 total (thin + double top)
const BORDERS = ['<border/>', '<border><left style="thin"><color rgb="FFD5DBE3"/></left><right style="thin"><color rgb="FFD5DBE3"/></right><top style="thin"><color rgb="FFD5DBE3"/></top><bottom style="thin"><color rgb="FFD5DBE3"/></bottom></border>',
  '<border><left style="thin"><color rgb="FFD5DBE3"/></left><right style="thin"><color rgb="FFD5DBE3"/></right><top style="double"><color rgb="FF1F3A5F"/></top><bottom style="thin"><color rgb="FF1F3A5F"/></bottom></border>'];

type Xf = { numFmt: number; font: number; fill: number; border: number; wrap?: boolean; align?: "center" | "right" | "left" };
class Styles {
  xfs: Xf[] = [{ numFmt: 0, font: 0, fill: 0, border: 0 }];
  private keys = new Map<string, number>([["0|0|0|0||", 0]]);
  get(x: Xf) {
    const k = `${x.numFmt}|${x.font}|${x.fill}|${x.border}|${x.wrap ? 1 : ""}|${x.align ?? ""}`;
    let i = this.keys.get(k);
    if (i === undefined) { i = this.xfs.length; this.xfs.push(x); this.keys.set(k, i); }
    return i;
  }
  xml() {
    const nf = Object.entries(NUMFMTS).map(([id, code]) => `<numFmt numFmtId="${id}" formatCode="${esc(code)}"/>`).join("");
    const xf = this.xfs.map((x) => `<xf numFmtId="${x.numFmt}" fontId="${x.font}" fillId="${x.fill}" borderId="${x.border}"${x.numFmt ? ' applyNumberFormat="1"' : ""}${x.font ? ' applyFont="1"' : ""}${x.fill ? ' applyFill="1"' : ""}${x.border ? ' applyBorder="1"' : ""}${x.wrap || x.align ? ` applyAlignment="1"><alignment${x.wrap ? ' wrapText="1"' : ""}${x.align ? ` horizontal="${x.align}"` : ""} vertical="center"/></xf>` : "/>"}`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="${Object.keys(NUMFMTS).length}">${nf}</numFmts><fonts count="${FONTS.length}">${FONTS.join("")}</fonts><fills count="${FILLS.length}">${FILLS.join("")}</fills><borders count="${BORDERS.length}">${BORDERS.join("")}</borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="${this.xfs.length}">${xf}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

const isNumType = (t?: XType) => !!t && t !== "text" && t !== "date";

function cellXml(ref: string, v: XCell, style: number): string {
  if (v === null || v === undefined || v === "") return style ? `<c r="${ref}" s="${style}"/>` : "";
  if (typeof v === "object" && !(v instanceof Date)) {
    return `<c r="${ref}" s="${style}"><f>${esc(v.formula)}</f>${v.value === null || !Number.isFinite(v.value) ? "" : `<v>${v.value}</v>`}</c>`;
  }
  if (v instanceof Date) return `<c r="${ref}" s="${style}"><v>${serial(v)}</v></c>`;
  if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}" s="${style}"><v>${v}</v></c>` : `<c r="${ref}" s="${style}"/>`;
  if (typeof v === "boolean") return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${v ? "Yes" : "No"}</t></is></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(clean(v))}</t></is></c>`;
}

const numeric = (v: XCell): number | null => (typeof v === "number" ? v : v && typeof v === "object" && !(v instanceof Date) ? v.value : null);

function sheetXml(sh: XSheet, st: Styles) {
  const cols = sh.columns;
  const n = Math.max(1, cols.length);
  const anyNegative = (c: number) => sh.rows.some((r) => (numeric(r[c]) ?? 0) < 0);
  const fmtOf = (c: number) => { const t = cols[c]?.type ?? "text"; return t === "inr" && anyNegative(c) ? 166 : FMT[t]; };
  const S = {
    title: st.get({ numFmt: 0, font: 1, fill: 0, border: 0 }),
    sub: st.get({ numFmt: 0, font: 2, fill: 0, border: 0 }),
    metaK: st.get({ numFmt: 0, font: 3, fill: 0, border: 0 }),
    metaV: st.get({ numFmt: 0, font: 0, fill: 0, border: 0 }),
    kpiL: st.get({ numFmt: 0, font: 3, fill: 5, border: 1 }),
    head: st.get({ numFmt: 0, font: 4, fill: 2, border: 1, wrap: true, align: "center" }),
    note: st.get({ numFmt: 0, font: 6, fill: 0, border: 0 }),
  };
  const body = (c: number, band: boolean) => st.get({ numFmt: fmtOf(c), font: 0, fill: band ? 3 : 0, border: 1, wrap: (cols[c]?.type ?? "text") === "text" });
  const tot = (c: number) => st.get({ numFmt: c === 0 ? 0 : fmtOf(c), font: 3, fill: 4, border: 2 });
  const out: string[] = [];
  let r = 0;
  const row = (cells: string) => { r++; out.push(`<row r="${r}">${cells}</row>`); };
  const rowH = (cells: string, ht: number) => { r++; out.push(`<row r="${r}" ht="${ht}" customHeight="1">${cells}</row>`); };
  const merges: string[] = [];
  rowH(cellXml(`A${r + 1}`, sh.title, S.title), 24);
  if (n > 1) merges.push(`A${r}:${colName(n - 1)}${r}`);
  if (sh.subtitle) { row(cellXml(`A${r + 1}`, sh.subtitle, S.sub)); if (n > 1) merges.push(`A${r}:${colName(n - 1)}${r}`); }
  for (const [k, v] of sh.meta ?? []) row(cellXml(`A${r + 1}`, k, S.metaK) + cellXml(`B${r + 1}`, v, S.metaV));
  if (sh.kpis?.length) {
    r++; out.push(`<row r="${r}"/>`);
    for (const k of sh.kpis) {
      const vStyle = st.get({ numFmt: typeof k.value === "number" ? FMT[k.type ?? "number"] || 4 : 0, font: 5, fill: 5, border: 1, align: "right" });
      row(cellXml(`A${r + 1}`, k.label, S.kpiL) + cellXml(`B${r + 1}`, k.value, vStyle));
    }
  }
  r++; out.push(`<row r="${r}"/>`);
  const headerRow = r + 1;
  rowH(cols.map((c, i) => cellXml(`${colName(i)}${headerRow}`, c.header, S.head)).join(""), 30);
  const first = headerRow + 1;
  sh.rows.forEach((cells, i) => {
    const rr = first + i;
    // A formula may say {r} for "this row" (computed columns): it becomes the row number here.
    row(cols.map((_, c) => {
      const v = cells[c] as XCell;
      const cell = v && typeof v === "object" && !(v instanceof Date) ? { ...v, formula: v.formula.replace(/\{r\}/g, String(rr)) } : v;
      return cellXml(`${colName(c)}${rr}`, cell, body(c, i % 2 === 1));
    }).join(""));
  });
  const last = first + sh.rows.length - 1;
  if (sh.totals && sh.rows.length) {
    const tr = last + 1;
    const cells = cols.map((c, i) => {
      const ref = `${colName(i)}${tr}`;
      if (i === 0) return cellXml(ref, "Total", tot(0));
      const kind = c.total ?? (isNumType(c.type) && c.type !== "percent" ? "sum" : "none");
      if (kind === "none") return cellXml(ref, null, tot(i));
      const vals = sh.rows.map((x) => numeric(x[i] as XCell)).filter((x): x is number => x !== null);
      const value = kind === "count" ? vals.length : kind === "avg" ? (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null) : vals.reduce((a, b) => a + b, 0);
      const fn = kind === "count" ? "COUNT" : kind === "avg" ? "AVERAGE" : "SUM";
      return cellXml(ref, { formula: `${fn}(${colName(i)}${first}:${colName(i)}${last})`, value: value === null ? null : Math.round(value * 100) / 100 }, tot(i));
    }).join("");
    row(cells);
  }
  for (const note of sh.notes ?? []) { row(cellXml(`A${r + 1}`, note, S.note)); if (n > 1) merges.push(`A${r}:${colName(n - 1)}${r}`); }
  const widths = cols.map((c, i) => c.width ?? Math.min(50, Math.max(10, c.header.length + 2, ...sh.rows.slice(0, 300).map((x) => {
    const v = x[i];
    if (v instanceof Date) return 12;
    if (typeof v === "number") return String(Math.round(v * 100) / 100).length + 4;
    if (v && typeof v === "object") return 12;
    return String(v ?? "").length + 2;
  }))));
  const lastCol = colName(n - 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="15"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    + `<sheetData>${out.join("")}</sheetData>`
    + (sh.rows.length ? `<autoFilter ref="A${headerRow}:${lastCol}${last}"/>` : "")
    + (merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "")
    + `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="${n > 7 ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>`
    + `</worksheet>`;
}

export function buildStyledXlsx(sheets: XSheet[], opts: { creator?: string } = {}): Uint8Array {
  const st = new Styles();
  const used = new Set<string>();
  const names = sheets.map((s, i) => {
    let base = clean(s.name).replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || `Sheet${i + 1}`;
    let k = 2;
    while (used.has(base.toLowerCase())) base = `${base.slice(0, 28)} ${k++}`;
    used.add(base.toLowerCase());
    return base;
  });
  const sheetFiles = sheets.map((s) => sheetXml(s, st));
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(clean(sheets[0]?.title ?? "Report"))}</dc:title><dc:creator>${esc(clean(opts.creator ?? "Office ERP"))}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView/></bookViews><sheets>${names.map((nm, i) => `<sheet name="${esc(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
  };
  sheetFiles.forEach((x, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(x); });
  files["xl/styles.xml"] = strToU8(st.xml());
  return zipSync(files, { level: 6 });
}

export function styledXlsxResponse(fileName: string, sheets: XSheet[]) {
  return new Response(new Uint8Array(buildStyledXlsx(sheets)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName.replace(/["\\\r\n]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
