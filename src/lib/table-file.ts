// Reads an uploaded spreadsheet for the imports: Excel (.xlsx) or CSV (comma, semicolon or
// tab separated, with or without quotes and a BOM). Rows keep their sheet row numbers so
// errors can say "row 7" and mean the row the user sees. Blank rows are left out.

import { readFirstSheetNumbered, XlsxReadError } from "./xlsx";

export class TableFileError extends Error {}
export type NumberedRow = { n: number; cells: string[] };

export { TABLE_FILE_ACCEPT } from "./table-file-accept";
const MAX_BYTES = 5 * 1024 * 1024;

/** Parses CSV text (RFC 4180 quoting; the separator is guessed from the first line). */
export function parseCsv(text: string): NumberedRow[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = [",", ";", "\t"].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ",");
  const rows: NumberedRow[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    row.push(cell);
    const cells = row.map((c) => c.trim());
    if (cells.some((c) => c !== "")) rows.push({ n: rowLine, cells });
    row = [];
    cell = "";
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === "") { cell = ""; quoted = true; }
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\r") continue;
    else if (ch === "\n") { endRow(); line++; rowLine = line; }
    else cell += ch;
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}

/** Rows of an uploaded .xlsx or .csv file. `preferSheet` picks an Excel tab by name. */
export async function readTableFile(file: File, opts: { preferSheet?: RegExp; what: string }): Promise<NumberedRow[]> {
  if (file.size > MAX_BYTES) throw new TableFileError("The file is larger than 5 MB.");
  const name = file.name.toLowerCase();
  let rows: NumberedRow[];
  if (name.endsWith(".csv")) {
    rows = parseCsv(new TextDecoder("utf-8").decode(await file.arrayBuffer()));
  } else if (name.endsWith(".xlsx")) {
    try {
      rows = readFirstSheetNumbered(new Uint8Array(await file.arrayBuffer()), opts.preferSheet);
    } catch (e) {
      if (e instanceof XlsxReadError) throw new TableFileError(e.message);
      throw e;
    }
  } else if (name.endsWith(".xls")) {
    throw new TableFileError("This is the old Excel format (.xls). In Excel: File → Save As → Excel Workbook (.xlsx), then upload that.");
  } else {
    throw new TableFileError("Upload an Excel (.xlsx) or CSV (.csv) file.");
  }
  if (rows.length < 2) throw new TableFileError(`No ${opts.what} rows were found in the file.`);
  return rows;
}
