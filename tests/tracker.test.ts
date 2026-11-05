import { describe, expect, it } from "vitest";
import { dateOnly } from "@/lib/dates";
import {
  daysAllowed, daysOpen, dueStateOf, needsBankName, onClientReport, refPrefix, timelineFlagOf, trackerDashboard, workStatusOf,
} from "@/lib/domain/tracker";
import { findHeaderRow, guessMapping, mergeRowsByPan, parseRow, parseSheetDate } from "@/lib/domain/client-import";

const today = dateOnly("2026-11-06");
const d = (s: string) => dateOnly(s);

describe("Accounting Workflow Tracker formulas", () => {
  it("Work Status follows the workbook's order of checks", () => {
    expect(workStatusOf({ clientPendingItem: "Bank statement", clientPendingStatus: null })).toBe("Awaiting Data");
    expect(workStatusOf({ clientPendingItem: "Bank statement", clientPendingStatus: "Open", statusOfWork: "IN_PROGRESS" })).toBe("Awaiting Data");
    expect(workStatusOf({ clientPendingItem: "x", clientPendingStatus: "Partial", statusOfWork: "NOT_STARTED" })).toBe("Partial Data");
    expect(workStatusOf({ clientPendingItem: "x", clientPendingStatus: "Partial", statusOfWork: "IN_PROGRESS" })).toBe("Maker In Progress");
    expect(workStatusOf({ clientPendingItem: "x", clientPendingStatus: "Cleared" })).toBe("Not Started");
    expect(workStatusOf({ checkerStatus: "Approved", statusOfWork: "COMPLETED" })).toBe("Completed");
    expect(workStatusOf({ checkerStatus: "Rework Required" })).toBe("Rework");
    expect(workStatusOf({ checkerStatus: "Checking" })).toBe("Under Check");
    expect(workStatusOf({ statusOfWork: "COMPLETED" })).toBe("Ready for Check");
    expect(workStatusOf({ statusOfWork: "ON_HOLD" })).toBe("On Hold");
    expect(workStatusOf({ statusOfWork: "IN_PROGRESS" })).toBe("Maker In Progress");
    expect(workStatusOf({})).toBe("Not Started");
  });

  it("Timeline Flag: done, overdue, client delay, follow-up, on track", () => {
    expect(timelineFlagOf({ checkerStatus: "Approved", teamDueBy: d("2026-01-01") }, today)).toBe("Done");
    expect(timelineFlagOf({ teamDueBy: d("2026-11-05") }, today)).toBe("OVERDUE");
    expect(timelineFlagOf({ teamDueBy: d("2026-11-05"), teamPendingStatus: "Cleared" }, today)).toBe("On Track");
    expect(timelineFlagOf({ clientPendingItem: "x", clientDueBy: d("2026-11-01") }, today)).toBe("CLIENT DELAY");
    expect(timelineFlagOf({ clientPendingItem: "x", clientPendingStatus: "Cleared", clientDueBy: d("2026-11-01") }, today)).toBe("On Track");
    expect(timelineFlagOf({ nextFollowUpOn: d("2026-11-06") }, today)).toBe("FOLLOW-UP DUE");
    expect(timelineFlagOf({ teamDueBy: d("2026-11-06") }, today)).toBe("On Track");
  });

  it("the two 'Days Pending' are deliberately different", () => {
    expect(daysAllowed(d("2026-11-01"), d("2026-11-08"))).toBe(7);
    expect(daysAllowed(d("2026-11-01"), null)).toBeNull();
    expect(daysOpen(d("2026-11-01"), "Open", today)).toBe(5);
    expect(daysOpen(d("2026-11-01"), "Cleared", today)).toBe("Cleared");
  });

  it("due state for the Pending Tracker", () => {
    expect(dueStateOf(d("2026-11-05"), "Open", today)).toBe("OVERDUE");
    expect(dueStateOf(d("2026-11-06"), "Open", today)).toBe("Due today");
    expect(dueStateOf(d("2026-11-09"), "Partial", today)).toBe("On time");
    expect(dueStateOf(d("2026-11-01"), "Cleared", today)).toBe("Cleared");
  });

  it("Ref No. prefix, bank-name rule, client report lines", () => {
    expect(refPrefix("Roshan Di Kulfi & Sons")).toBe("RDK");
    expect(refPrefix("Arthome")).toBe("ART");
    expect(needsBankName("Bank Reconciliation")).toBe(true);
    expect(needsBankName("Credit Card Reconciliation")).toBe(true);
    expect(needsBankName("GST Work")).toBe(false);
    expect(onClientReport({ clientPendingItem: "PAN copy", clientPendingStatus: "Partial" })).toBe(true);
    expect(onClientReport({ clientPendingItem: "PAN copy", clientPendingStatus: "Cleared" })).toBe(false);
    expect(onClientReport({ teamPendingItem: "x" })).toBe(false);
  });

  it("dashboard counts match the workbook's summary", () => {
    const dash = trackerDashboard([
      { clientName: "RDK", typeOfWork: "GST Work", clientPendingItem: "x", clientDueBy: d("2026-11-01"), makerName: "Bishan", checkerName: "Gaurav" },
      { clientName: "RDK", typeOfWork: "GST Work", clientPendingItem: "y", clientPendingStatus: "Cleared", checkerStatus: "Approved", makerName: "Bishan" },
      { clientName: "ART", typeOfWork: "TDS Work", teamDueBy: d("2026-11-02"), issueLevel: "High", issueStatus: "Open", makerName: "Bishan" },
    ], today);
    expect(dash.summary).toMatchObject({ total: 3, pendingFromClient: 1, received: 1, overdue: 1, clientDelay: 1, openIssues: 1, openIssuesSerious: 1 });
    expect(dash.statusCounts.Completed).toBe(1);
    expect(dash.byClient.find((c) => c.name === "RDK")).toMatchObject({ total: 2, completed: 1, open: 1, pendingFromClient: 1 });
    expect(dash.team.find((t) => t.name === "Bishan")).toMatchObject({ openMaker: 2, completedMaker: 1, overdue: 1 });
    expect(dash.team.find((t) => t.name === "Gaurav")).toMatchObject({ openChecker: 1 });
  });
});

describe("SSDA Client Master import", () => {
  const header = ["S.No.", "Name", "Legal Name (as per PAN)", "Address", "GSTIN", "PAN", "Constitution of Business", "GST User ID", "GST Password", "Income Tax User ID", "Income Tax Password", "TRACES User ID", "TRACES Password", "State", "TAN", "Mobile", "Email", "DOB", "IT File No.", "Applicable Department", "Remark"];
  const map = guessMapping(header);

  it("recognises every Client Master column, and not S.No.", () => {
    expect(map).toEqual(["", "tradeName", "legalName", "address", "gstin", "pan", "constitution", "gstUserId", "gstPassword", "incomeTaxUserId", "incomeTaxPassword", "tracesUserId", "tracesPassword", "state", "tan", "contactMobile", "contactEmail", "dateOfBirth", "itFileNo", "departments", "remark"]);
    const sheet = [["S S DIMRI & ASSOCIATES – CLIENT MASTER"], ["Combined from GST list…"], [], header];
    expect(findHeaderRow(sheet)).toBe(3);
  });

  it("reads DD/MM/YYYY dates and department lists", () => {
    expect(parseSheetDate("05/03/1980")).toBe("1980-03-05");
    expect(parseSheetDate("2015-04-01")).toBe("2015-04-01");
    expect(parseSheetDate("31/02/2020")).toBeNull();
    const row = ["1", "X", "", "", "", "", "", "", "", "", "", "", "", "Delhi", "", "", "", "31/12/1990", "SSDA-1", "GST, Income Tax, Day Book", ""];
    const r = parseRow(row, map, 5);
    expect(r.values.dateOfBirth).toBe("1990-12-31");
    expect(r.values.departmentList).toEqual(["GST", "Income Tax", "Day Book"]);
  });

  it("rows of one PAN become one client with all GSTINs; same name with another PAN stays separate", () => {
    const row = (n: number, name: string, gstin: string, pan: string, dept: string) => {
      const r = Array(header.length).fill("");
      [r[0], r[1], r[4], r[5], r[19]] = [String(n), name, gstin, pan, dept];
      return parseRow(r, map, n + 4);
    };
    const merged = mergeRowsByPan([
      row(1, "DNS Electronics Pvt Ltd", "06AACCD1234E1Z5", "AACCD1234E", "GST, Day Book"),
      row(2, "DNS Electronics Pvt Ltd", "07AACCD1234E1Z3", "AACCD1234E", "GST, Income Tax"),
      row(3, "4th Avenue", "", "AELPA1234B", "GST, Income Tax"),
      row(4, "4th Avenue", "", "AACFA1234C", "TDS"),
      row(5, "AiAuth Technologies Pvt Ltd", "", "AAWCA1234D", "Income Tax"),
      row(6, "AIAUTH TECHNOLOGIES PVT LTD", "", "", "TDS"),
    ]);
    expect(merged[0].values.gstins).toEqual(["06AACCD1234E1Z5", "07AACCD1234E1Z3"]);
    expect(merged[0].values.departmentList).toEqual(["GST", "Day Book", "Income Tax"]);
    expect(merged[1].mergedInto).toBe(merged[0].row);
    expect(merged[2].mergedInto).toBeUndefined();
    expect(merged[3].mergedInto).toBeUndefined();
    expect(merged[5].mergedInto).toBe(merged[4].row);
    expect(merged[4].values.departmentList).toEqual(["Income Tax", "TDS"]);
  });
});
