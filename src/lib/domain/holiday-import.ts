// Office holiday list from the firm's Excel (List_of_Holiday, "ERP Import" sheet):
//   Date | Holiday Name | Day | Year | Holiday Type | Remark
// Also reads the older layout (Sr No. | Holidays | Day & Date | Holiday Type), with dates such as
// "Thursday, 1 January, 2026". Pure: no database access.

import { parseSheetDate } from "./client-import";

export type HolidayRow = { date: string; name: string };
export type HolidayParse = {
  holidays: HolidayRow[];
  /** Rows on a Sunday: Sundays are always off, so they are not stored. */
  sundays: HolidayRow[];
  errors: { row: number; message: string }[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z& ]/g, " ").replace(/\s+/g, " ").trim();
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "2026-01-01", "01/01/2026", "Thursday, 1 January, 2026" or "1 Jan 2026" → YYYY-MM-DD. */
export function parseHolidayDate(raw: string): string | null {
  const direct = parseSheetDate(raw);
  if (direct) return direct;
  const t = raw.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const m = /(\d{1,2}) ([a-z]+) (\d{4})/.exec(t);
  if (!m) return null;
  const month = MONTHS.findIndex((x) => x.startsWith(m[2].slice(0, 3)) && m[2].length >= 3);
  if (month < 0) return null;
  return parseSheetDate(`${m[1]}/${month + 1}/${m[3]}`);
}

function findColumns(cells: string[]) {
  const h = cells.map(norm);
  const date = h.findIndex((x) => x === "date" || x === "day & date" || x === "holiday date" || x === "date of holiday");
  const name = h.findIndex((x) => x === "holiday name" || x === "holidays" || x === "holiday" || x === "name" || x === "occasion");
  const type = h.findIndex((x) => x === "holiday type" || x === "type");
  return date >= 0 && name >= 0 ? { date, name, type } : null;
}

export function parseHolidayRows(rows: { n: number; cells: string[] }[]): HolidayParse {
  const out: HolidayParse = { holidays: [], sundays: [], errors: [] };
  const headerAt = rows.findIndex((r) => findColumns(r.cells));
  if (headerAt < 0) {
    out.errors.push({ row: rows[0]?.n ?? 1, message: "No heading row with “Date” and “Holiday Name” was found. Use the “ERP Import” sheet layout: Date | Holiday Name | Day | Year | Holiday Type | Remark." });
    return out;
  }
  const col = findColumns(rows[headerAt].cells)!;
  const byDate = new Map<string, string[]>();
  for (const r of rows.slice(headerAt + 1)) {
    const rawDate = (r.cells[col.date] ?? "").trim();
    const name = (r.cells[col.name] ?? "").replace(/\s+/g, " ").trim();
    if (!rawDate && !name) continue;
    // A note under the table ("Dates as per Central Govt. holiday list …") has no date: skip it.
    if (!rawDate && name.length > 60) continue;
    const date = parseHolidayDate(rawDate);
    if (!date) { out.errors.push({ row: r.n, message: `“${rawDate || "(blank)"}” is not a date. Use DD-MM-YYYY.` }); continue; }
    if (!name) { out.errors.push({ row: r.n, message: "The holiday name is blank." }); continue; }
    const type = col.type >= 0 ? norm(r.cells[col.type] ?? "") : "";
    if (type.includes("half")) { out.errors.push({ row: r.n, message: `${name}: half-day holidays are not supported. Make it a full day, or leave it out.` }); continue; }
    byDate.set(date, [...(byDate.get(date) ?? []), name.slice(0, 120)]);
  }
  for (const [date, names] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // Two holidays on one day (e.g. Gandhi Jayanti and Dussehra) become one entry.
    const row = { date, name: [...new Set(names)].join(" / ").slice(0, 120) };
    (new Date(`${date}T00:00:00Z`).getUTCDay() === 0 ? out.sundays : out.holidays).push(row);
  }
  if (!out.holidays.length && !out.sundays.length && !out.errors.length) out.errors.push({ row: rows[headerAt].n, message: "No holidays were found under the heading row." });
  return out;
}
