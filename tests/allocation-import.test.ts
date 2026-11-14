import { describe, expect, it } from "vitest";
import { dateOnly } from "@/lib/dates";
import { findConflicts, type AllocationSpan } from "@/lib/domain/allocation";
import {
  describeSchedule, isPlannedOn, parseFrequency, parseVisitDays, parseWeekDays, plannedDates, scheduleWarnings, visitDatesInMonth,
} from "@/lib/domain/allocation-schedule";
import { findAllocationHeaderRow, guessAllocationMapping, matchName, nameKey, parseAllocationRow } from "@/lib/domain/allocation-import";
import { guessMapping, parseRow } from "@/lib/domain/client-import";
import { parseCsv } from "@/lib/table-file";

const cap = { first: 3.5, second: 5 };
const d = dateOnly;
// The firm's "Allocation" sheet headings (row 2).
const HEADER = ["Client *", "Team member *", "Role on this client", "Resource type", "From *", "To", "Week days", "Full Day", "Frequency", "Visit day(s) of month",
  "1st half (hours)", "2nd half (hours)", "Reports to (timesheet reviewer)", "Team leader (escalation)", "Allow overlap with other allocations", "Remark"];
const map = guessAllocationMapping(HEADER);
const row = (cells: (string | number)[], n = 3) => parseAllocationRow(cells.map(String), HEADER, map, n, cap);

describe("allocation schedule", () => {
  it("reads the sheet's frequencies and week days", () => {
    expect(parseFrequency("3 days a week")).toBe("THREE_A_WEEK");
    expect(parseFrequency("Twice a month (every 15 days)")).toBe("TWICE_A_MONTH");
    expect(parseFrequency("As required")).toBe("AS_REQUIRED");
    expect(parseFrequency("Once a week")).toBe("ONCE_A_WEEK");
    expect(parseFrequency("whenever")).toBeNull();
    expect(parseWeekDays("Mon–Sat (all days)").days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseWeekDays("Mon, Wed, Fri").days).toEqual([1, 3, 5]);
    expect(parseWeekDays("Mon-Fri").days).toEqual([1, 2, 3, 4, 5]);
    expect(parseWeekDays("Tue & Thu").days).toEqual([2, 4]);
    expect(parseWeekDays("Mon, Funday").unknown).toEqual(["funday"]);
  });

  it("reads visit days: dates, week patterns and last working day", () => {
    expect(parseVisitDays("5, 20")).toEqual({ kind: "dates", days: [5, 20] });
    expect(parseVisitDays("7")).toEqual({ kind: "dates", days: [7] });
    expect(parseVisitDays("10th and 25th")).toEqual({ kind: "dates", days: [10, 25] });
    expect(parseVisitDays("1st & 3rd Tue")).toEqual({ kind: "nthWeekday", nth: [1, 3], weekday: 2 });
    expect(parseVisitDays("Last working day")).toEqual({ kind: "lastWorkingDay" });
    expect(parseVisitDays("sometime")).toBeNull();
  });

  it("moves a Sunday visit to the next working day; last working day skips Sunday", () => {
    // 15 Nov 2026 is a Sunday → Monday 16th. 1st & 3rd Tue of Nov 2026 = 3rd and 17th.
    expect(visitDatesInMonth({ kind: "dates", days: [15] }, 2026, 10).map((x) => x.toISOString().slice(0, 10))).toEqual(["2026-11-16"]);
    expect(visitDatesInMonth({ kind: "nthWeekday", nth: [1, 3], weekday: 2 }, 2026, 10).map((x) => x.toISOString().slice(0, 10))).toEqual(["2026-11-03", "2026-11-17"]);
    // 31 Jan 2027 is a Sunday → last working day is Sat 30th.
    expect(visitDatesInMonth({ kind: "lastWorkingDay" }, 2027, 0)[0].toISOString().slice(0, 10)).toBe("2027-01-30");
    // 31 Oct 2027 is a Sunday → visit moves to Mon 1 Nov, which counts in November.
    expect(isPlannedOn({ frequency: "MONTHLY", visitDays: "31" }, d("2027-11-01"))).toBe(true);
  });

  it("plans only the right days", () => {
    const mwf = { frequency: "THREE_A_WEEK" as const, weekDays: [1, 3, 5] };
    expect(isPlannedOn(mwf, d("2026-11-16"))).toBe(true); // Mon
    expect(isPlannedOn(mwf, d("2026-11-17"))).toBe(false); // Tue
    expect(isPlannedOn({ frequency: "AS_REQUIRED" }, d("2026-11-16"))).toBe(false);
    expect(isPlannedOn({}, d("2026-11-15"))).toBe(false); // Sunday
    const twiceMonth = { frequency: "TWICE_A_MONTH" as const, visitDays: "5, 20", startDate: d("2026-11-01"), endDate: null };
    expect(plannedDates(twiceMonth, d("2026-11-01"), d("2026-12-31")).map((x) => x.toISOString().slice(0, 10))).toEqual(["2026-11-05", "2026-11-20", "2026-12-05", "2026-12-21"]);
    expect(describeSchedule(mwf)).toBe("3 days a week · Mon, Wed, Fri");
    expect(describeSchedule({ frequency: "MONTHLY", visitDays: "Last working day" })).toBe("Monthly · Last working day");
  });

  it("warns, without blocking, when days do not fit the frequency", () => {
    expect(scheduleWarnings({ frequency: "THREE_A_WEEK", weekDays: [1, 3, 4, 6] })[0]).toMatch(/usually means 3 days/);
    expect(scheduleWarnings({ frequency: "MONTHLY" })[0]).toMatch(/blank/);
    expect(scheduleWarnings({ frequency: "DAILY", weekDays: [] })).toEqual([]);
  });
});

describe("allocation clashes follow the planned days", () => {
  const span = (from: string, s: Partial<AllocationSpan>): AllocationSpan => ({ startDate: d(from), endDate: null, firstHalfHours: null, secondHalfHours: null, ...s });
  it("Mon/Wed/Fri at one client and Tue/Thu/Sat at another do not clash (Sonu, rows 7-8)", () => {
    const a = span("2026-11-01", { frequency: "THREE_A_WEEK", weekDays: [1, 3, 5] });
    const b = span("2026-11-01", { frequency: "THREE_A_WEEK", weekDays: [2, 4, 6] });
    expect(findConflicts(b, [a], cap).isConflict).toBe(false);
  });
  it("full days on the same week days clash, and say on which day", () => {
    const a = span("2026-11-01", { weekDays: [1, 3, 5] });
    const r = findConflicts(span("2026-11-01", { weekDays: [5] }), [a], cap);
    expect(r.isConflict).toBe(true);
    expect(r.clashDay?.toISOString().slice(0, 10)).toBe("2026-11-06"); // first Friday
  });
  it("first half at one client and second half at another do not clash (Akash, rows 5-6)", () => {
    expect(findConflicts(span("2026-11-01", { firstHalfHours: 0, secondHalfHours: 5 }), [span("2026-11-01", { firstHalfHours: 3.5, secondHalfHours: 0 })], cap).isConflict).toBe(false);
  });
  it("an allocation that allows overlap never counts against others (Gaurav, rows 19-20)", () => {
    const backend = span("2026-10-01", { firstHalfHours: 3.5, secondHalfHours: 0, allowOverlap: true });
    expect(findConflicts(span("2026-10-01", { firstHalfHours: 2, secondHalfHours: 0 }), [backend], cap).isConflict).toBe(false);
  });
  it("monthly visits clash only on the visit day", () => {
    const daily = span("2026-11-01", { firstHalfHours: 3.5, secondHalfHours: 0 });
    expect(findConflicts(span("2026-11-01", { frequency: "MONTHLY", visitDays: "7", firstHalfHours: 0, secondHalfHours: 2 }), [daily], cap).isConflict).toBe(false);
    const r = findConflicts(span("2026-11-01", { frequency: "MONTHLY", visitDays: "7", firstHalfHours: 2, secondHalfHours: 0 }), [daily], cap);
    expect(r.clashDay?.toISOString().slice(0, 10)).toBe("2026-11-07");
  });
});

describe("Team Allocation sheet import", () => {
  it("recognises every heading of the firm's sheet, under its title row", () => {
    expect(map).toEqual(["client", "employee", "role", "resourceType", "from", "to", "weekDays", "fullDay", "frequency", "visitDays", "firstHalfHours", "secondHalfHours", "reportsTo", "teamLeader", "allowOverlap", "remark"]);
    expect(findAllocationHeaderRow([["S S DIMRI & ASSOCIATES – Team Allocation (ERP Import)", "", "", "", "DUMMY DATA…"], HEADER])).toBe(1);
    expect(guessAllocationMapping(["S.No.", "Client", "Team member", "From", "Branch"])).toEqual(["", "client", "employee", "from", "extra"]);
  });

  it("reads a full-day daily row (row 3)", () => {
    const r = row(["Lucky Brass Pvt Ltd", "Manas", "Mid level", "Onsite (at client office)", "2026-10-01", "", "Mon–Sat (all days)", "Yes", "Daily", "", "", "", "Vishal Nagarwal", "Sanjay Kumar", "No", "1. Daily"]);
    expect(r.errors).toEqual([]);
    expect(r.values).toMatchObject({ role: "MID_LEVEL", resourceType: "Onsite (at client office)", from: "2026-10-01", weekDays: [1, 2, 3, 4, 5, 6], frequency: "DAILY", firstHalfHours: null, secondHalfHours: null, allowOverlap: false });
  });

  it("reads half-day hours, month patterns, as-required rows, team leaders and trainees", () => {
    expect(row(["Bansi", "Ajeet", "Junior", "Onsite (at client office)", "2026-11-01", "", "Mon–Sat (all days)", "No", "Daily", "", 3.5, 0, "", "", "No", ""]).values).toMatchObject({ firstHalfHours: 3.5, secondHalfHours: 0 });
    expect(row(["AK Enterprises", "Nisha", "Junior", "Backend Team", "2026-11-01", "", "", "No", "Twice a month (every 15 days)", "5, 20", 2, 0, "Ginish", "", "Yes", ""]).values).toMatchObject({ frequency: "TWICE_A_MONTH", visitDays: "5, 20", allowOverlap: true });
    expect(row(["Harman Motors", "Vishal", "Senior", "Visiting", "2026-11-01", "", "Tue", "No", "Twice a month (every 15 days)", "1st & 3rd Tue", 0, 3, "", "", "No", ""]).values.visitDays).toBe("1st & 3rd Tue");
    const asRequired = row(["Carewell Computers", "Lucky Rawat", "Trainee", "Backend Team", "2026-11-01", "", "", "No", "As required", "", "", "", "Ginish", "", "Yes", ""]);
    expect(asRequired.errors).toEqual([]);
    expect(asRequired.values).toMatchObject({ role: "TRAINEE", firstHalfHours: 0, secondHalfHours: 0 });
    expect(row(["Tulip", "Komal Mandal (Kamal)", "Team Leader", "Onsite", "16-11-2026", "30-11-2026", "", "Yes", "Daily", "", "", "", "", "", "No", ""]).values).toMatchObject({ role: "TEAM_LEADER", from: "2026-11-16", to: "2026-11-30" });
    expect(row(["Phul Kari", "Satyam", "Junior", "Backup / Standby", "2026-11-01", "", "", "No", "As required", "", "", "", "", "", "Yes", ""]).values.resourceType).toBe("Backup / Standby");
  });

  it("rejects rows with clear reasons, and warns about values it left out", () => {
    expect(row(["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]).errors).toEqual(["Client is empty", "Team member is empty", "From date is empty"]);
    expect(row(["A", "B", "", "", "2026-11-10", "2026-11-01", "", "", "", "", "", "", "", "", "", ""]).errors).toEqual(["To date is before the From date"]);
    expect(row(["A", "B", "", "", "2026-11-01", "", "", "No", "Daily", "", "", "", "", "", "", ""]).errors[0]).toMatch(/Full Day is No/);
    expect(row(["A", "B", "", "", "2026-11-01", "", "", "No", "Daily", "", 4, 0, "", "", "", ""]).errors[0]).toMatch(/only 3.5 h/);
    const w = row(["A", "B", "Partner", "Somewhere", "2026-11-01", "", "", "", "Daily", "", "", "", "", "", "Maybe", ""]);
    expect(w.errors).toEqual([]);
    expect(w.values.resourceType).toBe("Somewhere");
    expect(w.warnings.join(" ")).toMatch(/Role “Partner”.*Resource type “Somewhere”.*Allow overlap “Maybe”/);
  });

  it("matches names by full name, bracket alias, unique first name, code or PAN", () => {
    const people = [
      { id: "1", label: "Komal Mandal", keys: [nameKey("Komal Mandal"), nameKey("SSDA-E01")], firstKey: nameKey("Komal") },
      { id: "2", label: "Nisha Kushwaha", keys: [nameKey("Nisha Kushwaha")], firstKey: nameKey("Nisha") },
      { id: "3", label: "Amit Rawat", keys: [nameKey("Amit Rawat")], firstKey: nameKey("Amit") },
      { id: "4", label: "Amit Singh", keys: [nameKey("Amit Singh")], firstKey: nameKey("Amit") },
    ];
    expect(matchName("Komal Mandal (Kamal)", people)).toEqual({ id: "1" });
    expect(matchName("Nisha", people)).toEqual({ id: "2" });
    expect(matchName("ssda-e01", people)).toEqual({ id: "1" });
    expect(matchName("Amit", people)).toEqual({ error: "ambiguous", labels: ["Amit Rawat", "Amit Singh"] });
    expect(matchName("Ravi", people)).toEqual({ error: "missing" });
    const clients = [{ id: "c", label: "Lucky Brass Pvt Ltd", keys: [nameKey("Lucky Brass Pvt Ltd"), nameKey("AAACL1234Q")] }];
    expect(matchName("LUCKY BRASS PRIVATE LIMITED", clients)).toEqual({ id: "c" });
    expect(matchName("aaacl1234q", clients)).toEqual({ id: "c" });
    const twins = [
      { id: "a", label: "Phul Kari the Suit Shop", keys: [nameKey("Phul Kari the Suit Shop")], exact: ["phul kari the suit shop"] },
      { id: "b", label: "Phulkari The Suit Shop", keys: [nameKey("Phulkari The Suit Shop")], exact: ["phulkari the suit shop"] },
    ];
    expect(matchName("Phul Kari the  Suit Shop", twins)).toEqual({ id: "a" });
    expect(matchName("PHULKARI THE SUIT SHOP", twins)).toEqual({ id: "b" });
    expect(matchName("Phul-kari the Suit Shop", twins)).toMatchObject({ error: "ambiguous" });
  });
});

describe("CSV files and extra columns", () => {
  it("reads quoted CSV with commas, new lines and a BOM, keeping row numbers", () => {
    const rows = parseCsv('﻿Name,PAN,Note\r\n"Sharma, & Co",ABCDE1234F,"two\nlines"\r\n\r\nX Ltd,,\r\n');
    expect(rows).toEqual([
      { n: 1, cells: ["Name", "PAN", "Note"] },
      { n: 2, cells: ["Sharma, & Co", "ABCDE1234F", "two\nlines"] },
      { n: 5, cells: ["X Ltd", "", ""] },
    ]);
    expect(parseCsv("a;b\n1;2")[1].cells).toEqual(["1", "2"]);
  });
  it("keeps client columns that have no field as extra details", () => {
    const header = ["S.No.", "Name", "PAN", "Branch", "Partner in charge"];
    const m = guessMapping(header);
    expect(m).toEqual(["", "tradeName", "pan", "extra", "extra"]);
    expect(parseRow(["1", "Acme", "ABCDE1234F", "Naraina", "SD"], m, 5, header).values.extra).toEqual({ Branch: "Naraina", "Partner in charge": "SD" });
  });
});
