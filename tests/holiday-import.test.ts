import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseHolidayDate, parseHolidayRows } from "@/lib/domain/holiday-import";
import { parseCsv } from "@/lib/table-file";
import { readFirstSheetNumbered } from "@/lib/xlsx";

describe("holiday list upload", () => {
  it("reads the firm's List of Holiday file (ERP Import sheet)", () => {
    const rows = readFirstSheetNumbered(new Uint8Array(readFileSync("tests/fixtures/List_of_Holiday_2026-27.xlsx")), /erp ?import/i);
    const r = parseHolidayRows(rows);
    expect(r.errors).toEqual([]);
    // 24 rows: 2026 and 2027; Maha Shivratri, Diwali 2026, Independence Day and Bhai Duj 2027 fall on Sundays.
    expect(r.holidays.length + r.sundays.length).toBe(24);
    expect(r.sundays.map((s) => s.date)).toEqual(["2026-02-15", "2026-11-08", "2027-08-15", "2027-10-31"]);
    expect(r.holidays[0]).toEqual({ date: "2026-01-01", name: "New Year" });
    expect(r.holidays.find((h) => h.date === "2026-11-09")?.name).toBe("Govardhan Puja");
  });

  it("reads the older CSV layout with written-out dates", () => {
    const csv = 'Sr No.,Holidays,Day & Date,Holiday Type\n1,New Year,"Thursday,  1 January, 2026",Festival\n9,Govardlaan  Puja,"Tuesday.10  November,  2026",Festival\n';
    const r = parseHolidayRows(parseCsv(csv));
    expect(r.errors).toEqual([]);
    expect(r.holidays).toEqual([{ date: "2026-01-01", name: "New Year" }, { date: "2026-11-10", name: "Govardlaan Puja" }]);
  });

  it("joins two holidays on one day, rejects bad dates and half days, skips notes", () => {
    const rows = [
      { n: 1, cells: ["Date", "Holiday Name", "Day", "Year", "Holiday Type", "Remark"] },
      { n: 2, cells: ["2025-10-02", "Gandhi Jayanti", "", "", "Full Day", ""] },
      { n: 3, cells: ["02-10-2025", "Dussehra", "", "", "Full Day", ""] },
      { n: 4, cells: ["", "Dates as per Central Govt. holiday list 2026 (Delhi offices) — please re-check.", "", "", "", ""] },
      { n: 5, cells: ["31-02-2026", "Bad", "", "", "", ""] },
      { n: 6, cells: ["2026-03-04", "Holi", "", "", "Half Day", ""] },
    ];
    const r = parseHolidayRows(rows);
    expect(r.holidays).toEqual([{ date: "2025-10-02", name: "Gandhi Jayanti / Dussehra" }]);
    expect(r.errors.map((e) => e.row)).toEqual([5, 6]);
  });

  it("says what is wrong when the heading row is missing", () => {
    const r = parseHolidayRows([{ n: 1, cells: ["LIST OF HOLIDAYS YEAR 2026"] }, { n: 2, cells: ["1", "2026-01-01", "New Year"] }]);
    expect(r.errors[0].message).toMatch(/Date.*Holiday Name/);
  });

  it("parses common date spellings", () => {
    expect(parseHolidayDate("1 Jan 2027")).toBe("2027-01-01");
    expect(parseHolidayDate("Wednesday.  11 November, 2026")).toBe("2026-11-11");
    expect(parseHolidayDate("tomorrow")).toBeNull();
  });
});
