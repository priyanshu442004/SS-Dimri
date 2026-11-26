// Tracker 25 Nov 2026 (S.No. 99–112) and the follow-up asks: attendance marked on request (3 a month),
// own working hours, the SSDA salary slip and conveyance sheet, ISD / state-wise GSTINs, Sunday at
// clients, notification tabs, and the assistant's PDF / Excel files (nothing out of the blue).
import { describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/services/files", () => ({ hasFile: () => false, storeUpload: vi.fn() }));
vi.mock("@/lib/services/notifications", () => ({ notifyEmployees: vi.fn(), notifyRoles: vi.fn() }));
vi.mock("@/lib/services/audit", () => ({ audit: vi.fn() }));

const { computePay, scheduleFor, scoreMonth, hhmm } = await import("@/lib/domain/attendance-policy");
const { addDays, dateOnly, toIsoDate } = await import("@/lib/dates");
const { rupeesInWords, numberInWords } = await import("@/lib/domain/amount-words");
const { lengthOfService, salarySlipHtml, slipFileName, slipLines, websiteFromEmail } = await import("@/lib/domain/salary-slip");
const { gstItemApplies } = await import("@/lib/domain/gst-type");
const { gstState, gstinLabel } = await import("@/lib/domain/gst-state");
const { formatWeekDays, isPlannedOn, parseWeekDays } = await import("@/lib/domain/allocation-schedule");
const { notificationTab } = await import("@/lib/domain/notification-kind");
const { conveyanceAmount, isOwnVehicle } = await import("@/lib/domain/conveyance");
const { FactIndex, toIso, toNumber } = await import("@/lib/ai/files/facts");
const { resolveTable, parseFormula, evalFormula, documentNumbers } = await import("@/lib/ai/files/resolve");
const { buildStyledXlsx } = await import("@/lib/xlsx-styled");
const { pdfHtml, xlsxBytes, formatValue } = await import("@/lib/ai/files/render");

type DayInput = Parameters<typeof scoreMonth>[0][number];
const TZ = "Asia/Kolkata";
const ist = (iso: string) => new Date(`${iso}+05:30`);
const TIMES = { officeStart: "09:30", reportingGraceUntil: "09:45", officeEnd: "18:30", leavingGraceUntil: "18:45", halfDayIfLeavingBefore: "17:30", autoAbsentAt: "12:00", onsiteRequiredMinutes: 480 };
const NUM = { lateArrivalsPerHalfDay: 3, lateGracePerMonth: 1, veryLateAfterMinutes: 60, paidLeavesPerMonth: 1, unrequestedAbsenceDays: 2, noLeaveBonusDays: 2, overtimeMinutesPerDay: 540, requestMarksPerMonth: 3 };
const OFFICE = scheduleFor(TIMES, null);

function month(over: Record<string, Partial<DayInput>> = {}) {
  const out: DayInput[] = [];
  for (let d = dateOnly("2026-10-25"); d <= dateOnly("2026-12-06"); d = addDays(d, 1)) {
    const iso = toIsoDate(d);
    const off = d.getUTCDay() === 0;
    const future = iso > "2026-11-30";
    const base = {
      iso, off, employed: true, future, schedule: OFFICE, leave: null, requested: false, lateIntimated: false, earlyLeaveApproved: false, overtimeApproved: false,
      record: off || future ? null : { status: "PRESENT" as const, timeIn: ist(`${iso}T09:30:00`), timeOut: ist(`${iso}T18:30:00`) },
    };
    out.push({ ...base, ...over[iso], inMonth: iso.startsWith("2026-11") } as DayInput);
  }
  return out;
}
const marked = (iso: string, inT = "09:35") => ({ record: { status: "PRESENT" as const, timeIn: ist(`${iso}T${inT}:00`), timeOut: ist(`${iso}T18:30:00`), markedOnRequest: true } });

describe("attendance marked on request: 3 days a month, then half a day each (25 Nov 2026)", () => {
  it("the first three marked days count in full; the 4th and 5th are half days", () => {
    const s = scoreMonth(month({ "2026-11-02": marked("2026-11-02"), "2026-11-03": marked("2026-11-03"), "2026-11-04": marked("2026-11-04"), "2026-11-05": marked("2026-11-05"), "2026-11-06": marked("2026-11-06") }), NUM, TZ);
    expect(s.requestMarked).toBe(5);
    expect(s.requestHalfDays).toBe(2);
    expect(s.unpaidDays).toBe(1);
    expect(s.days.filter((d) => d.requestHalfDay).map((d) => d.iso)).toEqual(["2026-11-05", "2026-11-06"]);
  });
  it("a late arrival on an over-the-limit day is not punished twice", () => {
    const over = { "2026-11-02": marked("2026-11-02"), "2026-11-03": marked("2026-11-03"), "2026-11-04": marked("2026-11-04") };
    const s = scoreMonth(month({ ...over, "2026-11-05": marked("2026-11-05", "11:10") }), NUM, TZ);
    expect(s.veryLateArrivals).toBe(0);
    expect(s.unpaidDays).toBe(0.5);
  });
  it("the limit follows the firm's setting", () => {
    const s = scoreMonth(month({ "2026-11-02": marked("2026-11-02"), "2026-11-03": marked("2026-11-03") }), { ...NUM, requestMarksPerMonth: 1 }, TZ);
    expect(s.requestHalfDays).toBe(1);
  });
  it("a request-marked day still counts towards the no-leave bonus (it is not leave)", () => {
    const s = scoreMonth(month({ "2026-11-02": marked("2026-11-02") }), NUM, TZ);
    expect(s.leaveTaken).toBe(0);
  });
});

describe("own working hours at a client site (25 Nov 2026: not always 8 hours)", () => {
  it("the day lasts the hours the Team Lead set; grace, half-day and overtime move with it", () => {
    const s = scheduleFor(TIMES, { attendanceProfile: "ONSITE", siteReportingTime: "10:00", siteDayMinutes: 510 });
    expect([s.start, s.end, s.halfDayBefore, s.overtimeAfter].map(hhmm)).toEqual(["10:00", "18:30", "17:30", "18:45"]);
    expect(hhmm(scheduleFor(TIMES, { attendanceProfile: "ONSITE", siteReportingTime: "10:00", siteDayMinutes: 360 }).end)).toBe("16:00");
    expect(hhmm(scheduleFor(TIMES, { attendanceProfile: "ONSITE", siteReportingTime: "10:00" }).end)).toBe("18:00"); // firm's 8 h
  });
});

describe("salary slip in the SSDA format (Vishal Nagarwal, Oct 2026)", () => {
  // Oct 2026: 31 days, nothing deducted, 3 days of approved overtime, 2 bonus days, 2 extra days, ₹200 allowance, ₹2,363 conveyance.
  const score = { ...scoreMonth(month(), NUM, TZ), payableDays: 31, countedDays: 31, unpaidDays: 0, overtimeMinutes: 3 * 540, extraDays: 2, leaveTaken: 0 };
  const pay = computePay({ monthlySalary: 27500, daysInMonth: 31, complete: true, fullMonth: true, score, fines: 0, conveyance: 2363, advanceDeduction: 0, fixedAllowance: 200 }, NUM);
  it("payable days = working days + overtime days + bonus days + extra days; salary = monthly ÷ days × payable days", () => {
    expect(pay.payableDaysTotal).toBe(38);
    expect(pay.overtimeDays).toBe(3);
    expect(pay.bonusDays).toBe(2);
    expect(pay.salaryForDays).toBe(33709.68);
    expect(pay.net).toBe(36272.68);
  });
  it("amount in words, length of service, file name", () => {
    expect(rupeesInWords(36272.68)).toBe("Rupees Thirty Six Thousand Two Hundred Seventy Two and Sixty Eight Paise Only");
    expect(numberInWords(1234567)).toBe("Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven");
    expect(rupeesInWords(100)).toBe("Rupees One Hundred Only");
    expect(lengthOfService(new Date(Date.UTC(2023, 9, 31)), "2026-10")).toBe("3 yrs");
    expect(lengthOfService(new Date(Date.UTC(2025, 5, 1)), "2026-10")).toBe("1 yr 4 mths");
    expect(slipFileName({ code: "08", name: "Vishal Nagarwal" }, "2026-10")).toBe("08_Vishal_Nagarwal_Salary_Slip_Oct-2026.pdf");
    expect(websiteFromEmail("sunildimri@ssdimri.com")).toBe("www.ssdimri.com");
    expect(websiteFromEmail("someone@gmail.com")).toBeNull();
  });
  it("the slip shows every line of the sample", () => {
    const input = {
      firm: { name: "S.S. Dimri & Associates", website: "www.ssdimri.com", address: null }, month: "2026-10", daysInMonth: 31, complete: true, payDay: 10,
      row: { name: "Vishal Nagarwal", code: "08", designation: null, department: null, dateOfJoining: new Date(Date.UTC(2023, 9, 31)), salaryMode: "TRANSFER", monthlySalary: 27500, fixedAllowance: 200, conveyanceClaims: 9, score, pay, fines: { eodMissed: [], leadMissed: [] } },
    };
    const l = slipLines(input);
    expect(l.totalEarnings).toBe(36272.68);
    expect(l.totalDeductions).toBe(0);
    const html = salarySlipHtml(input);
    for (const text of ["SALARY SLIP", "For the month of October 2026", "Vishal Nagarwal", "31 Oct 2023", "3 yrs", "Bank Transfer", "Salary for 38 payable days", "Monthly salary 27,500.00 ÷ 31 days × 38 days", "33,709.68", "Fixed allowance", "200.00", "Conveyance reimbursement", "As per verified Oct-26 claims", "2,363.00", "36,272.68", "Advance / other deductions", "Rupees Thirty Six Thousand", "paid on 10 November 2026", "+3"]) {
      expect(html).toContain(text);
    }
  });
});

describe("conveyance as in the SSDA sheet", () => {
  it("own vehicle: (total run − home ↔ office) × rate", () => {
    expect(conveyanceAmount(62, 32, 4.5)).toEqual({ km: 30, amount: 135 });
    expect(conveyanceAmount(52, 32, 4.5)).toEqual({ km: 20, amount: 90 });
    expect(conveyanceAmount(17, 0, 4.5)).toEqual({ km: 17, amount: 76.5 });
    expect(conveyanceAmount(20, 32, 4.5)).toEqual({ km: 0, amount: 0 });
    expect(isOwnVehicle("Bike (own)")).toBe(true);
    expect(isOwnVehicle("Metro")).toBe(false);
  });
});

describe("GST: ISD registration and state-wise GSTINs (S.No. 100, 107)", () => {
  const g = (name: string, form?: string) => ({ department: "GST", name, form });
  it("an ISD files GSTR-6 only; others never get GSTR-6", () => {
    expect(gstItemApplies("ISD", g("ISD return (Input Service Distributor)", "GSTR-6"))).toBe(true);
    expect(gstItemApplies("ISD", g("GSTR-3B (monthly)", "GSTR-3B"))).toBe(false);
    expect(gstItemApplies("REGULAR", g("ISD return (Input Service Distributor)", "GSTR-6"))).toBe(false);
    expect(gstItemApplies(null, g("ISD return (Input Service Distributor)", "GSTR-6"))).toBe(false);
  });
  it("a client with a Regular GSTIN and an ISD GSTIN gets both sets", () => {
    expect(gstItemApplies(["REGULAR", "ISD"], g("ISD return", "GSTR-6"))).toBe(true);
    expect(gstItemApplies(["REGULAR", "ISD"], g("GSTR-1 (monthly)", "GSTR-1"))).toBe(true);
    expect(gstItemApplies(["COMPOSITION", "ISD"], g("GSTR-1 (monthly)", "GSTR-1"))).toBe(false);
  });
  it("the state comes from the GSTIN's first two digits", () => {
    expect(gstState("07AAACD1234F1Z5")).toBe("Delhi");
    expect(gstState("27AAACD1234F1Z5")).toBe("Maharashtra");
    expect(gstState("XX")).toBeNull();
    expect(gstinLabel({ gstin: "29AAACD1234F1Z5", branchName: "Bengaluru branch" })).toBe("29AAACD1234F1Z5 (Karnataka · Bengaluru branch)");
  });
});

describe("Sunday at clients that work on Sunday (S.No. 109)", () => {
  it("Sunday can be a planned day and is written last", () => {
    const sunday = dateOnly("2026-11-29");
    expect(isPlannedOn({ weekDays: [0, 6] }, sunday)).toBe(true);
    expect(isPlannedOn({ weekDays: [] }, sunday)).toBe(false);
    expect(formatWeekDays([0, 1, 3])).toBe("Mon, Wed, Sun");
    expect(formatWeekDays([0, 1, 2, 3, 4, 5, 6])).toBe("Mon–Sun (all days)");
    expect(parseWeekDays("Sat, Sun").days).toEqual([0, 6]);
  });
});

describe("notifications vs observations & error reports (S.No. 108)", () => {
  it("puts missed / wrong things in the observations tab", () => {
    expect(notificationTab({ type: "observation.assigned", title: "x" })).toBe("observations");
    expect(notificationTab({ type: "daily_plan.eod_missing", title: "x" })).toBe("observations");
    expect(notificationTab({ type: "task.assigned", title: "x" })).toBe("notifications");
    expect(notificationTab({ type: "timesheet.review", title: "Your timesheet entry needs correction" })).toBe("observations");
    expect(notificationTab({ type: "timesheet.review", title: "Your timesheet entry was reviewed" })).toBe("notifications");
  });
});

describe("assistant files: nothing out of the blue", () => {
  const facts = () => {
    const f = new FactIndex();
    f.addJson({ rows: [
      { name: "Vishal Nagarwal", code: "08", late: 4, lateMinutes: 135, present: 20, date: "2026-11-16", state: "LATE" },
      { name: "Kamal Kumar", code: "11", late: 1, lateMinutes: 20, present: 22, date: "2026-11-17", state: "PRESENT" },
    ] });
    return f;
  };
  const cols = [{ header: "Name", type: "text" as const }, { header: "Late days", type: "int" as const }, { header: "Present days", type: "int" as const }];
  it("accepts values copied from the data and works out computed columns and totals itself", () => {
    const problems: string[] = [];
    const t = resolveTable({ columns: cols, rows: [["Vishal Nagarwal", 4, 20], ["Kamal Kumar", 1, 22]], computed: [{ header: "Late %", type: "percent", formula: "{Late days} / {Present days} * 100" }], totals: true }, facts(), new Map(), problems, "t");
    expect(problems).toEqual([]);
    expect(t.rows.map((r) => r[3])).toEqual([20, 4.5455]);
    expect(t.totals?.slice(0, 3)).toEqual(["Total", 5, 42]);
    expect(t.totals?.[3]).toBeUndefined(); // a % is not summed
  });
  it("refuses a number or a name that is not in the data", () => {
    const problems: string[] = [];
    resolveTable({ columns: cols, rows: [["Vishal Nagarwal", 7, 20], ["Ramesh Gupta", 1, 22]] }, facts(), new Map(), problems, "t");
    expect(problems.join(" ")).toMatch(/not in the data/);
    expect(problems.join(" ")).toContain("7");
    expect(problems.join(" ")).toContain("Ramesh Gupta");
  });
  it("copies long lists straight from a data set, with joined name fields and filters", () => {
    const ds = new Map([["d1", { rows: [{ employee: { firstName: "Vishal", lastName: "Nagarwal" }, state: "LATE", minutes: 135 }, { employee: { firstName: "Kamal", lastName: null }, state: "PRESENT", minutes: 0 }] }]]);
    const problems: string[] = [];
    const t = resolveTable({ columns: [{ header: "Name", type: "text", field: "employee.firstName|employee.lastName" }, { header: "Minutes late", type: "int", field: "minutes" }], from: { dataset: "d1", path: "rows", where: { state: "LATE" } }, computed: [{ header: "Hours late", type: "hours", formula: "{Minutes late} / 60" }] }, new FactIndex(), ds, problems, "t");
    expect(problems).toEqual([]);
    expect(t.rows).toEqual([["Vishal Nagarwal", 135, 2.25]]);
    const missing: string[] = [];
    resolveTable({ columns: [{ header: "Name", field: "x", type: "text" }], from: { dataset: "d9" } }, new FactIndex(), ds, missing, "t");
    expect(missing[0]).toMatch(/not one returned in this answer/);
  });
  it("formulas: precedence, brackets, division by zero, unknown column", () => {
    const n = parseFormula("({A} - {B}) * 100 / {B}", ["A", "B"]);
    expect(evalFormula(n, [150, 100])).toBe(50);
    expect(evalFormula(n, [150, 0])).toBeNull();
    expect(() => parseFormula("{C} + 1", ["A"])).toThrow(/no column/);
    expect(() => parseFormula("A + 1", ["A"])).toThrow();
  });
  it("matches rounding, % of a fraction, minutes as hours, Indian-formatted and dated values", () => {
    const f = new FactIndex();
    f.addJson({ pct: 0.9234, minutes: 90, fee: 125000, date: "2026-11-16" });
    expect(f.hasNumber(92.34)).toBe(true);
    expect(f.hasNumber(1.5)).toBe(true);
    expect(f.hasNumber(125000)).toBe(true);
    expect(f.hasNumber(125001)).toBe(false);
    expect(toNumber("₹1,25,000")).toBe(125000);
    expect(toNumber("92.3%")).toBe(92.3);
    expect(toIso("16 Nov 2026")).toBe("2026-11-16");
    expect(f.hasDate("2026-11-16")).toBe(true);
    expect(f.checkText("Monday").ok).toBe(true); // 16 Nov 2026 is a Monday
  });
  it("text in the file may quote the file's own totals", () => {
    const t = resolveTable({ columns: cols, rows: [["Vishal Nagarwal", 4, 20], ["Kamal Kumar", 1, 22]], totals: true }, facts(), new Map(), [], "t");
    expect(documentNumbers([t]).hasNumber(42)).toBe(true);
  });
  it("Excel: styled workbook with formulas for computed columns and totals", () => {
    const t = resolveTable({ columns: cols, rows: [["Vishal Nagarwal", 4, 20], ["Kamal Kumar", 1, 22]], computed: [{ header: "Late %", type: "percent", formula: "{Late days} / {Present days} * 100" }], totals: true }, facts(), new Map(), [], "t");
    const bytes = xlsxBytes({ title: "Late comers", sheets: [{ name: "Late", kpis: [{ label: "People late", value: 2, type: "int" }], table: t }] }, { firm: "S S Dimri", preparedFor: "Admin", preparedOn: "26 Nov 2026", asOf: "26 Nov 2026" });
    const files = unzipSync(bytes);
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("<f>IFERROR(((B");
    expect(sheet).toContain("<f>SUM(B");
    expect(sheet).toContain("Vishal Nagarwal");
    expect(strFromU8(files["xl/styles.xml"])).toContain("₹");
    expect(buildStyledXlsx([{ name: "x", title: "x", columns: [{ header: "A" }], rows: [] }]).byteLength).toBeGreaterThan(500);
  });
  it("PDF: title, figures, table and chart in the HTML", () => {
    const t = resolveTable({ columns: cols, rows: [["Vishal Nagarwal", 4, 20]] }, facts(), new Map(), [], "t");
    const html = pdfHtml({ title: "Late arrivals — November 2026", kpis: [{ label: "Late days", value: 4, type: "int" }], sections: [{ heading: "Who was late", table: t, chart: { chart: "bar", title: "Late days", labels: ["Vishal Nagarwal"], series: [{ name: "Late", values: [4] }] } }] }, { firm: "S S Dimri", preparedFor: "Admin", preparedOn: "26 Nov 2026", asOf: "26 Nov 2026" });
    expect(html).toContain("Late arrivals — November 2026");
    expect(html).toContain("<svg");
    expect(html).toContain("Vishal Nagarwal");
    expect(formatValue(125000, "inr")).toBe("₹1,25,000");
    expect(formatValue("2026-11-16", "date")).toBe("16 Nov 2026");
  });
});
