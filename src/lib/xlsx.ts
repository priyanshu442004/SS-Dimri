// Minimal .xlsx writer and reader on top of fflate (already a dependency for Word letters).
// Writer: one styled header row, frozen, filterable, with sensible column widths, as many
// sheets as needed. Reader: the first sheet's cells as text, including shared strings and
// date serials. Enough for exports and for importing what people keep in Excel, without
// pulling in a large spreadsheet library.

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type Cell = string | number | boolean | Date | null | undefined;
export type Sheet = { name: string; rows: Cell[][]; widths?: number[]; title?: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
// Characters XML 1.0 forbids (e.g. copied from another system) would corrupt the file.
// eslint-disable-next-line no-control-regex
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

function colName(i: number) {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const EPOCH = Date.UTC(1899, 11, 30);
const toSerial = (d: Date) => (d.getTime() - EPOCH) / 86_400_000;

function sheetXml(sheet: Sheet) {
  const titleRows = sheet.title ? 1 : 0;
  const widths = sheet.widths ?? (sheet.rows[0] ?? []).map((_, c) => {
    const longest = Math.max(...sheet.rows.slice(0, 200).map((r) => String(r[c] instanceof Date ? "00 000 0000" : r[c] ?? "").length), 8);
    return Math.min(longest + 2, 48);
  });
  const rows: string[] = [];
  if (sheet.title) rows.push(`<row r="1"><c r="A1" s="3" t="inlineStr"><is><t xml:space="preserve">${esc(clean(sheet.title))}</t></is></c></row>`);
  sheet.rows.forEach((row, r) => {
    const rowNo = r + 1 + titleRows;
    const cells = row
      .map((v, c) => {
        const ref = `${colName(c)}${rowNo}`;
        if (v === null || v === undefined || v === "") return r === 0 ? `<c r="${ref}" s="1"/>` : "";
        if (v instanceof Date) return `<c r="${ref}" s="2"><v>${toSerial(v)}</v></c>`;
        if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
        if (typeof v === "boolean") return `<c r="${ref}" t="inlineStr"><is><t>${v ? "Yes" : "No"}</t></is></c>`;
        const style = r === 0 ? ' s="1"' : "";
        return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(clean(v))}</t></is></c>`;
      })
      .join("");
    rows.push(`<row r="${rowNo}">${cells}</row>`);
  });
  const lastCol = colName(Math.max(0, (sheet.rows[0]?.length ?? 1) - 1));
  const headerRow = 1 + titleRows;
  const lastRow = sheet.rows.length + titleRows;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${rows.join("")}</sheetData>` +
    (sheet.rows.length > 1 ? `<autoFilter ref="A${headerRow}:${lastCol}${lastRow}"/>` : "") +
    `</worksheet>`
  );
}

/** Build a workbook. Row 1 of each sheet (after the optional title) is the header. */
export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const safeName = (n: string, i: number) => clean(n).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || `Sheet${i + 1}`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(safeName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\-mmm\\-yyyy"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3D62"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf fontId="2" applyFont="1"/></cellXfs></styleSheet>`,
    ),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });
  return zipSync(files, { level: 6 });
}

/** A workbook as a download response. */
export function xlsxResponse(fileName: string, sheets: Sheet[]) {
  const body = buildXlsx(sheets);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName.replace(/["\\\r\n]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}

// ---------------------------------------------------------------- reading

const unesc = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });

function textOf(xml: string) {
  // Rich text is several <t> runs; phonetic hints (<rPh>) are not part of the value.
  const body = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  return [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1])).join("");
}

function columnIndex(ref: string) {
  let n = 0;
  for (const ch of ref) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** Built-in and custom number formats that are dates (so a serial becomes YYYY-MM-DD). */
function dateStyles(stylesXml: string | null) {
  const out = new Set<number>();
  if (!stylesXml) return out;
  const custom = new Map<string, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(m[1], unesc(m[2]));
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? "";
  [...xfs.matchAll(/<xf\b[^>]*?(?:\/>|>)/g)].forEach((m, i) => {
    const id = /numFmtId="(\d+)"/.exec(m[0])?.[1] ?? "0";
    const n = Number(id);
    const code = custom.get(id);
    const isDate = (n >= 14 && n <= 22) || (n >= 45 && n <= 47) || (!!code && /[dmy]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, "")));
    if (isDate) out.add(i);
  });
  return out;
}

function serialToIso(serial: number) {
  return new Date(EPOCH + Math.round(serial) * 86_400_000).toISOString().slice(0, 10);
}

export class XlsxReadError extends Error {}

/** Read the first worksheet as rows of text. Blank rows are kept out; cells are trimmed. */
export function readFirstSheet(data: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new XlsxReadError("This does not look like an Excel (.xlsx) file.");
  }
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : null);
  const workbook = read("xl/workbook.xml");
  const rels = read("xl/_rels/workbook.xml.rels");
  if (!workbook) throw new XlsxReadError("This does not look like an Excel (.xlsx) file.");

  const firstId = /<sheet\b[^>]*r:id="([^"]+)"/.exec(workbook)?.[1];
  const target = firstId && rels ? new RegExp(`<Relationship\\b(?=[^>]*Id="${firstId}")[^>]*Target="([^"]+)"`).exec(rels)?.[1] : null;
  const path = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target}`) : "xl/worksheets/sheet1.xml";
  const sheet = read(path) ?? read("xl/worksheets/sheet1.xml");
  if (!sheet) throw new XlsxReadError("The first sheet of this workbook could not be read.");

  const sharedXml = read("xl/sharedStrings.xml");
  const shared = sharedXml ? [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => (m[1] ? textOf(m[1]) : "")) : [];
  const dates = dateStyles(read("xl/styles.xml"));

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const body = rowMatch[1];
    if (!body) continue;
    const row: string[] = [];
    let next = 0;
    for (const cell of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const inner = cell[2] ?? "";
      const ref = /\br="([A-Z]+)\d*"/.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const style = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? -1);
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textOf(inner);
      else if (type === "str") value = v ? unesc(v) : "";
      else if (type === "b") value = v === "1" ? "Yes" : "No";
      else if (type === "e") value = "";
      else if (v !== undefined) {
        const n = Number(v);
        value = dates.has(style) && Number.isFinite(n) ? serialToIso(n) : unesc(v);
      }
      row[col] = value.trim();
    }
    for (let i = 0; i < row.length; i++) row[i] ??= "";
    if (row.some((c) => c !== "")) rows.push(row);
  }
  return rows;
}
