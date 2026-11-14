import { describe, expect, it } from "vitest";
import { buildXlsx, readFirstSheet } from "@/lib/xlsx";
import { can, canUseModule, isGrantable, landingPath, moduleOf, SUPPORT_STAFF_MODULES, type Member } from "@/lib/permissions";
import { complianceStatus, daysRemaining, isEscalated, nextDueDate, normalizeFrequency } from "@/lib/domain/compliance";
import { assessmentYears, isLateReview, isLateSubmission, minutesBetween, slaOf } from "@/lib/domain/timesheet";
import { monthlyAmount } from "@/lib/domain/payroll";
import { constitutionCode, findHeaderRow, guessMapping, normalizeMobile, parseRow } from "@/lib/domain/client-import";
import { dateOnly } from "@/lib/dates";
import { HI } from "@/lib/i18n/hi";
import { isTranslatedPath, parseLangCookie, translateText } from "@/lib/i18n/translate";

describe("per-person rights and module access", () => {
  const peon: Member = { role: "STAFF", moduleRestricted: true, allowedModules: SUPPORT_STAFF_MODULES };
  const sanjay: Member = { role: "MANAGER", grantedCapabilities: ["employees.invite", "employees.approve"] };

  it("every role can use tasks and create them", () => {
    for (const r of ["OWNER", "ADMIN", "MANAGER", "SENIOR", "STAFF"] as const) {
      expect(can(r, "tasks.use")).toBe(true);
      expect(can(r, "tasks.create")).toBe(true);
    }
    expect(can("CLIENT", "tasks.create")).toBe(false);
  });
  it("a peon or driver reaches only attendance and payroll", () => {
    expect(can(peon, "attendance.mark_own")).toBe(true);
    expect(can(peon, "leave.request")).toBe(true);
    expect(can(peon, "payroll.view_own")).toBe(true);
    for (const cap of ["tasks.use", "tasks.update_assigned", "timesheet.fill_own", "dayreport.submit", "pending.manage_own", "clients.use", "dashboard.use", "compliance.use", "allocations.use", "observations.use"] as const) {
      expect(can(peon, cap), cap).toBe(false);
    }
    expect(landingPath(peon)).toBe("/app/attendance");
  });
  it("pages outside any module stay open to restricted people", () => {
    expect(moduleOf("app.use")).toBeNull();
    expect(can(peon, "app.use")).toBe(true);
  });
  it("a restriction can never lock out an owner or administrator", () => {
    expect(canUseModule({ role: "OWNER", moduleRestricted: true, allowedModules: [] }, "tasks")).toBe(true);
    expect(canUseModule({ role: "ADMIN", moduleRestricted: true, allowedModules: [] }, "employees")).toBe(true);
  });
  it("a manager can be given the right to add, invite and approve staff", () => {
    expect(can("MANAGER", "employees.invite")).toBe(false);
    expect(can(sanjay, "employees.invite")).toBe(true);
    expect(can(sanjay, "employees.approve")).toBe(true);
    expect(can(sanjay, "employees.delete")).toBe(false);
  });
  it("a grant does not get past a module restriction", () => {
    expect(can({ role: "STAFF", grantedCapabilities: ["employees.invite"], moduleRestricted: true, allowedModules: ["attendance"] }, "employees.invite")).toBe(false);
  });
  it("administration itself can never be handed out by a grant", () => {
    expect(isGrantable("access.manage")).toBe(false);
    expect(isGrantable("org.manage")).toBe(false);
    expect(can({ role: "STAFF", grantedCapabilities: ["org.manage", "access.manage"] }, "access.manage")).toBe(false);
    expect(can({ role: "STAFF", grantedCapabilities: ["org.manage"] }, "org.manage")).toBe(false);
  });
  it("clients gain nothing from grants", () => {
    expect(can({ role: "CLIENT", grantedCapabilities: ["employees.invite"] }, "employees.invite")).toBe(false);
  });
  it("delete rights start with administrators and can be granted", () => {
    expect(can("OWNER", "clients.delete")).toBe(true);
    expect(can("MANAGER", "clients.delete")).toBe(false);
    expect(can({ role: "MANAGER", grantedCapabilities: ["clients.delete", "tasks.delete"] }, "tasks.delete")).toBe(true);
  });
});

describe("compliance tracker rules (Compliance Tracker workbook)", () => {
  const today = dateOnly("2026-08-12");
  const row = (due: string, lead: number, done = false) => ({ dueDate: dateOnly(due), reminderLeadDays: lead, actionTaken: done });
  it("derives days remaining and status like the workbook", () => {
    expect(daysRemaining(dateOnly("2026-08-13"), today)).toBe(1);
    expect(complianceStatus(row("2026-08-13", 3), today)).toBe("DUE_THIS_WEEK");
    expect(complianceStatus(row("2026-08-20", 3), today)).toBe("OK");
    expect(complianceStatus(row("2026-09-05", 30), today)).toBe("UPCOMING");
    expect(complianceStatus(row("2026-08-01", 3), today)).toBe("OVERDUE");
    expect(complianceStatus(row("2026-08-01", 3, true), today)).toBe("COMPLETED");
  });
  it("escalates within 7 days until action is taken", () => {
    expect(isEscalated(row("2026-08-17", 5), today)).toBe(true);
    expect(isEscalated(row("2026-08-20", 3), today)).toBe(false);
    expect(isEscalated(row("2026-08-13", 3, true), today)).toBe(false);
  });
  it("rolls recurring filings forward and keeps month ends sensible", () => {
    expect(nextDueDate(dateOnly("2026-08-20"), "Monthly")).toEqual(dateOnly("2026-09-20"));
    expect(nextDueDate(dateOnly("2027-01-31"), "Monthly")).toEqual(dateOnly("2027-02-28"));
    expect(nextDueDate(dateOnly("2026-10-18"), "Quarterly")).toEqual(dateOnly("2027-01-18"));
    expect(nextDueDate(dateOnly("2026-09-30"), "Annual")).toEqual(dateOnly("2027-09-30"));
    expect(nextDueDate(dateOnly("2026-09-30"), "One-Time")).toBeNull();
  });
  it("maps the master list's wording to the tracker's frequencies", () => {
    expect(normalizeFrequency("Month 1 & 2 of quarter")).toBe("Monthly");
    expect(normalizeFrequency("Half-yearly (turnover > ₹5 cr) / Annual")).toBe("Half-Yearly");
    expect(normalizeFrequency("Event-based")).toBe("One-Time");
  });
});

describe("timesheet rules (Team Timesheet workbook)", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 7, 1, h));
  it("applies the 24 h / 36 h review window", () => {
    expect(slaOf({ submittedAt: at(0), status: "SUBMITTED" }, at(23))).toBe("WITHIN");
    expect(slaOf({ submittedAt: at(0), status: "SUBMITTED" }, new Date(at(0).getTime() + 30 * 3_600_000))).toBe("DUE_SOON");
    expect(slaOf({ submittedAt: at(0), status: "SUBMITTED" }, new Date(at(0).getTime() + 37 * 3_600_000))).toBe("OVERDUE");
    expect(slaOf({ submittedAt: at(0), status: "REVIEWED" }, new Date(at(0).getTime() + 99 * 3_600_000))).toBe("REVIEWED");
  });
  it("calculates hours from the time block", () => {
    expect(minutesBetween("10:00", "18:30")).toBe(510);
    expect(minutesBetween("18:30", "10:00")).toBeNull();
    expect(minutesBetween("10:00", null)).toBeNull();
  });
  it("charges late submission only when not filled on the day of work", () => {
    expect(isLateSubmission("2026-08-01", "2026-08-01")).toBe(false);
    expect(isLateSubmission("2026-08-02", "2026-08-01")).toBe(true);
  });
  it("charges late review past 36 hours, reviewed or not", () => {
    const submittedAt = at(0);
    const later = (h: number) => new Date(submittedAt.getTime() + h * 3_600_000);
    expect(isLateReview({ submittedAt, reviewedAt: later(10), status: "REVIEWED" }, later(50))).toBe(false);
    expect(isLateReview({ submittedAt, reviewedAt: later(40), status: "REVIEWED" }, later(50))).toBe(true);
    expect(isLateReview({ submittedAt, status: "SUBMITTED" }, later(40))).toBe(true);
    expect(isLateReview({ submittedAt, status: "SUBMITTED" }, later(10))).toBe(false);
  });
  it("offers assessment years around the current one", () => {
    expect(assessmentYears(dateOnly("2026-11-05"))).toEqual(["AY 2023-24", "AY 2024-25", "AY 2025-26", "AY 2026-27", "AY 2027-28"]);
    expect(assessmentYears(dateOnly("2027-02-05")).at(-1)).toBe("AY 2027-28");
  });
});

describe("salary", () => {
  it("converts an annual salary to monthly", () => {
    expect(monthlyAmount(120000, "ANNUAL")).toBe(10000);
    expect(monthlyAmount(25000, "MONTHLY")).toBe(25000);
  });
});

describe("Excel files", () => {
  it("round-trips text, numbers, dates and Hindi", () => {
    const bytes = buildXlsx([{ name: "Sheet", title: "Heading", rows: [["Name", "Fee", "Due"], ["Sample & Sons <Pvt>", 5000, new Date("2026-08-13T00:00:00Z")], ["सुनील", null, null]] }]);
    const rows = readFirstSheet(bytes);
    expect(rows[0]).toEqual(["Heading"]);
    expect(rows[1]).toEqual(["Name", "Fee", "Due"]);
    expect(rows[2][0]).toBe("Sample & Sons <Pvt>");
    expect(rows[2][1]).toBe("5000");
    expect(rows[2][2]).toBe("2026-08-13");
    expect(rows[3][0]).toBe("सुनील");
  });
  it("rejects a file that is not a workbook", () => {
    expect(() => readFirstSheet(new TextEncoder().encode("not a zip"))).toThrow(/Excel/);
  });
});

describe("client import", () => {
  const header = ["S.No.", "Client Code", "Client Name (as used in office)", "Legal Name (as per PAN / GST)", "Visit Days (Oct-25 to Oct-26, WhatsApp)", "Team Visiting", "Services Taken", "Constitution", "Nature of Business", "GSTIN", "PAN", "Contact Person", "Mobile", "Email", "Address", "Place of Work", "Billing Basis", "Fee (₹)", "Status"];
  it("recognises the firm's Client Details sheet", () => {
    const m = guessMapping(header);
    expect(m[1]).toBe("clientCode");
    expect(m[2]).toBe("tradeName");
    expect(m[3]).toBe("legalName");
    expect(m[0]).toBe("");
    expect(m[4]).toBe("extra"); // kept as an extra detail on the client
    expect(m[9]).toBe("gstin");
    expect(m[12]).toBe("contactMobile");
    expect(m[17]).toBe("fee");
    expect(m[18]).toBe("status");
  });
  it("finds the header row under a title", () => {
    expect(findHeaderRow([["12. CLIENT DETAILS"], ["Client names compiled from the team group"], header, ["1", "CL-001", "Bansi"]])).toBe(2);
  });
  it("needs a client name; bad identifiers are dropped with a warning", () => {
    const mapping = guessMapping(["Client Name", "GSTIN", "PAN", "Mobile", "Email", "Fee"]);
    expect(parseRow(["", "", "", "", "", ""], mapping, 3).errors).toEqual(["Client name is empty"]);
    const r = parseRow(["Acme", "07AAAAA0000A1Z5, BADGST", "abcde1234f", "+91 98765 43210", "not-an-email", "₹5,000"], mapping, 4);
    expect(r.errors).toEqual([]);
    expect(r.values.gstins).toEqual(["07AAAAA0000A1Z5"]);
    expect(r.values.pan).toBe("ABCDE1234F");
    expect(r.values.contactMobile).toBe("9876543210");
    expect(r.values.contactEmail).toBeUndefined();
    expect(r.values.fee).toBe("5000");
    expect(r.warnings).toHaveLength(2);
  });
  it("understands everyday wording", () => {
    expect(constitutionCode("Pvt Ltd")).toBe("CON-06");
    expect(constitutionCode("Proprietorship")).toBe("CON-03");
    expect(constitutionCode("LLP")).toBe("CON-05");
    expect(normalizeMobile("09876543210")).toBe("9876543210");
    expect(normalizeMobile("12345")).toBeNull();
  });
});

describe("Hindi interface", () => {
  it("translates known text and leaves names and data alone", () => {
    expect(translateText("Tasks")).toBe(HI.Tasks);
    expect(translateText("  Tasks ")).toBe(`  ${HI.Tasks} `);
    expect(translateText("Sanjay Kumar")).toBe("Sanjay Kumar");
    expect(translateText("GSTR-3B")).toBe("GSTR-3B");
    expect(translateText("42")).toBe("42");
  });
  it("fills patterns", () => {
    expect(translateText("Page 2 of 5")).toBe("पृष्ठ 2 / 5");
    expect(translateText("Due diligence")).toBe("Due diligence");
    expect(translateText("Due 05 Nov 2026")).toBe("नियत 05 नव 2026");
  });
  it("translates month names in dates", () => {
    expect(translateText("05 Nov 2026")).toBe("05 नव 2026");
  });
  it("applies only inside the signed-in portals", () => {
    expect(isTranslatedPath("/app/tasks")).toBe(true);
    expect(isTranslatedPath("/client")).toBe(true);
    expect(isTranslatedPath("/application")).toBe(false);
    expect(isTranslatedPath("/login")).toBe(false);
    expect(parseLangCookie("a=1; ss_lang=hi; b=2")).toBe("hi");
    expect(parseLangCookie("ss_lang=en")).toBe("en");
    expect(parseLangCookie("not_ss_lang=hi")).toBe("en");
  });
  it("every pattern has the same number of placeholders on both sides", () => {
    for (const [from, to] of Object.entries(HI)) {
      const n = (s: string) => s.split(/{#?}/).length;
      expect(n(to), from).toBe(n(from));
    }
  });
});
