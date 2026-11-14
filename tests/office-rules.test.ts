// Leave, Timing and Office Decorum Rules (client PDF, 14 Nov 2026): each rule as a test.
import { describe, expect, it } from "vitest";
import { computePay, hhmm, leaveWithIntimation, noticeDays, scheduleFor, scoreMonth, timesOfDay, type DayInput, type PolicyNumbers, type PolicyTimes } from "@/lib/domain/attendance-policy";
import { EOD_RULES_FROM, eodDeadlines, eodProblems, eodRuleApplies, eodState, leadFined, needsEscalation, nextWorkingDay, personFined, planIsLate } from "@/lib/domain/daily-plan";
import { addDays, dateOnly, toIsoDate, zonedDateTime } from "@/lib/dates";

const TZ = "Asia/Kolkata";
const ist = (iso: string) => new Date(`${iso}+05:30`);

const TIMES: PolicyTimes = {
  officeStart: "09:30",
  reportingGraceUntil: "09:45",
  officeEnd: "18:30",
  leavingGraceUntil: "18:45",
  halfDayIfLeavingBefore: "17:30",
  autoAbsentAt: "12:00",
  onsiteRequiredMinutes: 480,
};
const NUM: PolicyNumbers = {
  lateArrivalsPerHalfDay: 3,
  lateGracePerMonth: 1,
  veryLateAfterMinutes: 60,
  paidLeavesPerMonth: 1,
  unrequestedAbsenceDays: 2,
  noLeaveBonusDays: 2,
  overtimeMinutesPerDay: 540,
};
const OFFICE = scheduleFor(TIMES, null);

/** A November 2026 month (1 Nov is a Sunday). `over` changes single days. */
function month(over: Record<string, Partial<DayInput>> = {}, opts: { holidays?: string[]; lastCounted?: string } = {}) {
  const out: (DayInput & { inMonth: boolean })[] = [];
  for (let d = dateOnly("2026-10-25"); d <= dateOnly("2026-12-06"); d = addDays(d, 1)) {
    const iso = toIsoDate(d);
    const off = d.getUTCDay() === 0 || !!opts.holidays?.includes(iso);
    const future = iso > (opts.lastCounted ?? "2026-11-30");
    const base: DayInput = {
      iso, off, employed: true, future, schedule: OFFICE, leave: null, requested: false, lateIntimated: false, earlyLeaveApproved: false, overtimeApproved: false,
      record: off || future ? null : { status: "PRESENT", timeIn: ist(`${iso}T09:30:00`), timeOut: ist(`${iso}T18:30:00`) },
    };
    out.push({ ...base, ...over[iso], inMonth: iso.startsWith("2026-11") });
  }
  return out;
}
const at = (iso: string, inT: string, outT = "18:30") => ({ record: { status: "PRESENT" as const, timeIn: ist(`${iso}T${inT}:00`), timeOut: ist(`${iso}T${outT}:00`) } });
const absent = { record: null };

describe("§5 office timings and the client-site schedule", () => {
  it("office team: 9:30–18:30, grace till 9:45, half day before 17:30, overtime after 18:45, absent at 12:00", () => {
    expect([OFFICE.start, OFFICE.graceUntil, OFFICE.end, OFFICE.halfDayBefore, OFFICE.overtimeAfter, OFFICE.absentAt].map(hhmm))
      .toEqual(["09:30", "09:45", "18:30", "17:30", "18:45", "12:00"]);
  });
  it("client-site team: reporting time fixed by the Team Lead, 8 hours in all", () => {
    const s = scheduleFor(TIMES, { attendanceProfile: "ONSITE", siteReportingTime: "10:30" });
    expect([s.start, s.graceUntil, s.end, s.halfDayBefore, s.overtimeAfter, s.absentAt].map(hhmm))
      .toEqual(["10:30", "10:45", "18:30", "17:30", "18:45", "13:00"]);
    expect(scheduleFor(TIMES, { attendanceProfile: "ONSITE", siteReportingTime: "08:00" }).absentAt).toBe(720); // never before noon
    expect(scheduleFor(TIMES, { attendanceProfile: "ONSITE", siteReportingTime: null }).start).toBe(570); // no time set → office day
  });
  it("a day keeps the schedule recorded at mark-in, even if the Team Lead changes it later", () => {
    const s = scheduleFor(TIMES, { attendanceProfile: "ONSITE", siteReportingTime: "11:00" }, { start: "10:00", end: "18:00" });
    expect(hhmm(s.start)).toBe("10:00");
  });
});

describe("§6 late arrival", () => {
  const band = (t: string) => timesOfDay({ timeIn: ist(`2026-11-02T${t}:00`), timeOut: null }, "2026-11-02", OFFICE, 60, TZ).lateBand;
  it("up to 15 minutes is grace; more than 15 minutes up to an hour is late; over an hour is very late", () => {
    expect(band("09:30")).toBe("ON_TIME");
    expect(band("09:45")).toBe("GRACE");
    expect(band("09:46")).toBe("LATE");
    expect(band("10:30")).toBe("LATE");
    expect(band("10:31")).toBe("VERY_LATE");
  });
  it("late (15 min – 1 h) on 3 days in a month = half day; 2 days = nothing", () => {
    const two = scoreMonth(month({ "2026-11-02": at("2026-11-02", "10:00"), "2026-11-03": at("2026-11-03", "10:00") }), NUM, TZ);
    expect(two.lateHalfDays).toBe(0);
    const three = scoreMonth(month({ "2026-11-02": at("2026-11-02", "10:00"), "2026-11-03": at("2026-11-03", "10:00"), "2026-11-04": at("2026-11-04", "09:50") }), NUM, TZ);
    expect(three.lateArrivals).toBe(3);
    expect(three.lateHalfDays).toBe(0.5);
  });
  it("grace arrivals (till 9:45) never count", () => {
    const s = scoreMonth(month(Object.fromEntries(["02", "03", "04", "05"].map((d) => [`2026-11-${d}`, at(`2026-11-${d}`, "09:45")]))), NUM, TZ);
    expect(s.lateArrivals).toBe(0);
    expect(s.unpaidDays).toBe(0);
  });
  it("late by more than an hour = half day each time", () => {
    const s = scoreMonth(month({ "2026-11-02": at("2026-11-02", "11:00") }), NUM, TZ);
    expect(s.veryLateArrivals).toBe(1);
    expect(s.lateHalfDays).toBe(0.5);
  });
  it("one late arrival a month is a warning only, when the Team Lead was told in the ERP beforehand", () => {
    const told = { "2026-11-02": { ...at("2026-11-02", "10:00"), lateIntimated: true }, "2026-11-03": at("2026-11-03", "10:00"), "2026-11-04": at("2026-11-04", "10:00") };
    const s = scoreMonth(month(told), NUM, TZ);
    expect(s.lateExcused).toBe(1);
    expect(s.lateArrivals).toBe(2);
    expect(s.lateHalfDays).toBe(0);
    // Not told beforehand → no warning, three lates = half day.
    const untold = scoreMonth(month({ ...told, "2026-11-02": at("2026-11-02", "10:00") }), NUM, TZ);
    expect(untold.lateHalfDays).toBe(0.5);
    // Only one warning a month.
    const twice = scoreMonth(month({ "2026-11-02": { ...at("2026-11-02", "11:00"), lateIntimated: true }, "2026-11-03": { ...at("2026-11-03", "11:00"), lateIntimated: true } }), NUM, TZ);
    expect(twice.lateExcused).toBe(1);
    expect(twice.lateHalfDays).toBe(0.5);
  });
  it("one half day = half of one day's salary", () => {
    const s = scoreMonth(month({ "2026-11-02": at("2026-11-02", "11:00") }), NUM, TZ);
    const pay = computePay({ monthlySalary: 30000, daysInMonth: 30, complete: true, fullMonth: true, score: s, fines: 0 }, NUM);
    expect(pay.perDay).toBe(1000);
    expect(pay.net).toBe(29500);
  });
});

describe("§8 leaving early and §9 overtime", () => {
  it("leaving before 17:30 counts as a half day, even with permission", () => {
    const s = scoreMonth(month({ "2026-11-02": { ...at("2026-11-02", "09:30", "17:00"), earlyLeaveApproved: true } }), NUM, TZ);
    expect(s.earlyHalfDays).toBe(0.5);
  });
  it("leaving between 17:30 and 18:30 without permission is flagged, not deducted", () => {
    const s = scoreMonth(month({ "2026-11-02": at("2026-11-02", "09:30", "18:00"), "2026-11-03": { ...at("2026-11-03", "09:30", "18:00"), earlyLeaveApproved: true } }), NUM, TZ);
    expect(s.days.find((d) => d.iso === "2026-11-02")!.leftEarlyUnapproved).toBe(true);
    expect(s.days.find((d) => d.iso === "2026-11-03")!.leftEarlyUnapproved).toBe(false);
    expect(s.unpaidDays).toBe(0);
  });
  it("overtime is real minutes from 18:46 to the time out, only when approved; no slabs", () => {
    const s = scoreMonth(month({
      "2026-11-02": { ...at("2026-11-02", "09:30", "20:15"), overtimeApproved: true },
      "2026-11-03": at("2026-11-03", "09:30", "21:00"),
      "2026-11-04": { ...at("2026-11-04", "09:30", "18:44"), overtimeApproved: true },
    }), NUM, TZ);
    expect(s.overtimeMinutes).toBe(90);
    expect(s.stayedUnapprovedMinutes).toBe(135);
  });
  it("overtime past midnight keeps counting", () => {
    const s = scoreMonth(month({ "2026-11-02": { record: { status: "PRESENT", timeIn: ist("2026-11-02T09:30:00"), timeOut: ist("2026-11-03T00:15:00") }, overtimeApproved: true } }), NUM, TZ);
    expect(s.overtimeMinutes).toBe(330);
  });
  it("overtime is paid pro rata on the day rate", () => {
    const s = scoreMonth(month({ "2026-11-02": { ...at("2026-11-02", "09:30", "18:45"), overtimeApproved: true, record: { status: "PRESENT", timeIn: ist("2026-11-02T09:30:00"), timeOut: new Date(ist("2026-11-02T18:45:00").getTime() + 540 * 60000) } } }), NUM, TZ);
    const pay = computePay({ monthlySalary: 30000, daysInMonth: 30, complete: true, fullMonth: true, score: s, fines: 0 }, NUM);
    expect(pay.overtimePay).toBe(1000);
  });
  it("no time out: hours and overtime cannot be counted", () => {
    const s = scoreMonth(month({ "2026-11-02": { record: { status: "PRESENT", timeIn: ist("2026-11-02T09:30:00"), timeOut: null }, overtimeApproved: true } }), NUM, TZ);
    expect(s.days.find((d) => d.iso === "2026-11-02")!.noTimeOut).toBe(true);
    expect(s.overtimeMinutes).toBe(0);
  });
});

describe("§10 leave", () => {
  const leave = (withIntimation = true, paid = true, halfDay = false) => ({ record: null, leave: { paid, halfDay, withIntimation } });
  it("one leave a month with intimation is paid; a second is unpaid", () => {
    const s = scoreMonth(month({ "2026-11-03": leave(), "2026-11-04": leave() }), NUM, TZ);
    expect(s.paidLeave).toBe(1);
    expect(s.excessLeave).toBe(1);
    expect(s.unpaidDays).toBe(1);
  });
  it("leave approved but asked for after the reporting time is not 'with intimation': unpaid, but not double", () => {
    const s = scoreMonth(month({ "2026-11-03": leave(false) }), NUM, TZ);
    expect(s.paidLeave).toBe(0);
    expect(s.unpaidDays).toBe(1);
  });
  it("absence without any request in the ERP counts as double absent", () => {
    const s = scoreMonth(month({ "2026-11-03": absent }), NUM, TZ);
    expect(s.absentUnrequested).toBe(1);
    expect(s.absentDaysCharged).toBe(2);
    expect(s.unpaidDays).toBe(2);
  });
  it("an absence with a request (pending or rejected) counts once; the ERP's 12:00 Absent counts the same as not marked", () => {
    const s = scoreMonth(month({ "2026-11-03": { record: null, requested: true }, "2026-11-04": { record: { status: "ABSENT", timeIn: null, timeOut: null, autoAbsent: true } } }), NUM, TZ);
    expect(s.absentDaysCharged).toBe(3);
  });
  it("approved leave wins over the ERP's automatic Absent; attendance wins over leave", () => {
    const s = scoreMonth(month({
      "2026-11-03": { record: { status: "ABSENT", timeIn: null, timeOut: null, autoAbsent: true }, leave: { paid: true, halfDay: false, withIntimation: true } },
      "2026-11-04": { ...at("2026-11-04", "09:30"), leave: { paid: true, halfDay: false, withIntimation: true } },
    }), NUM, TZ);
    expect(s.paidLeave).toBe(1);
    expect(s.worked).toBeGreaterThan(20);
    expect(s.unpaidDays).toBe(0);
  });
  it("Sunday between Saturday and Monday leave is leave too (the PDF's example)", () => {
    const s = scoreMonth(month({ "2026-11-07": leave(), "2026-11-09": leave() }), NUM, TZ);
    expect(s.days.find((d) => d.iso === "2026-11-08")!.sandwiched).toBe(true);
    expect(s.sandwichDays).toBe(1);
    expect(s.unpaidDays).toBe(2); // second leave + Sunday
  });
  it("an office holiday inside a continuous leave is leave; a holiday next to a working day is not", () => {
    const s = scoreMonth(month({ "2026-11-11": leave(), "2026-11-13": leave() }, { holidays: ["2026-11-12"] }), NUM, TZ);
    expect(s.days.find((d) => d.iso === "2026-11-12")!.sandwiched).toBe(true);
    const t = scoreMonth(month({ "2026-11-11": leave() }, { holidays: ["2026-11-12"] }), NUM, TZ);
    expect(t.sandwichDays).toBe(0);
  });
  it("Sunday + holiday run between two absences: both off days count", () => {
    const s = scoreMonth(month({ "2026-11-07": absent, "2026-11-10": absent }, { holidays: ["2026-11-09"] }), NUM, TZ);
    expect(s.sandwichDays).toBe(2);
  });
  it("a Sunday next to a day not yet reached is not judged yet", () => {
    const s = scoreMonth(month({ "2026-11-14": leave() }, { lastCounted: "2026-11-15" }), NUM, TZ);
    expect(s.days.find((d) => d.iso === "2026-11-15")!.sandwiched).toBe(false);
    // …unless the leave after it is already approved.
    const t = scoreMonth(month({ "2026-11-14": leave(), "2026-11-16": leave() }, { lastCounted: "2026-11-15" }), NUM, TZ);
    expect(t.days.find((d) => d.iso === "2026-11-15")!.sandwiched).toBe(true);
  });
  it("no leave in the month adds 2 days' salary; any leave, absence or half day cancels it", () => {
    const clean = scoreMonth(month(), NUM, TZ);
    expect(clean.tookLeave).toBe(false);
    const pay = computePay({ monthlySalary: 30000, daysInMonth: 30, complete: true, fullMonth: true, score: clean, fines: 0 }, NUM);
    expect(pay.bonusDays).toBe(2);
    expect(pay.net).toBe(32000);
    const late = scoreMonth(month({ "2026-11-02": at("2026-11-02", "11:00") }), NUM, TZ);
    expect(computePay({ monthlySalary: 30000, daysInMonth: 30, complete: true, fullMonth: true, score: late, fines: 0 }, NUM).bonusDays).toBe(0);
    const paidLeave = scoreMonth(month({ "2026-11-03": leave() }), NUM, TZ);
    expect(paidLeave.tookLeave).toBe(true);
    // Not before the month is over, and not for a part month.
    expect(computePay({ monthlySalary: 30000, daysInMonth: 30, complete: false, fullMonth: true, score: clean, fines: 0 }, NUM).bonusDays).toBe(0);
    expect(computePay({ monthlySalary: 30000, daysInMonth: 30, complete: true, fullMonth: false, score: clean, fines: 0 }, NUM).bonusDays).toBe(0);
  });
  it("days before joining are neither paid nor absent", () => {
    const days = month(Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`2026-11-${String(i + 1).padStart(2, "0")}`, { employed: false }])));
    const s = scoreMonth(days, NUM, TZ);
    expect(s.employedDays).toBe(15);
    expect(s.payableDays).toBe(15);
    expect(s.unpaidDays).toBe(0);
  });
  it("leave asked before the reporting time on the day counts as intimation; after it does not", () => {
    expect(leaveWithIntimation(ist("2026-11-02T09:00:00"), "2026-11-02", OFFICE, TZ)).toBe(true);
    expect(leaveWithIntimation(ist("2026-11-02T09:31:00"), "2026-11-02", OFFICE, TZ)).toBe(false);
    expect(leaveWithIntimation(ist("2026-11-01T22:00:00"), "2026-11-02", OFFICE, TZ)).toBe(true);
    expect(leaveWithIntimation(ist("2026-11-03T09:00:00"), "2026-11-02", OFFICE, TZ)).toBe(false);
  });
  it("planned leave notice is counted in whole days", () => {
    expect(noticeDays("2026-11-14", "2026-11-29")).toBe(15);
    expect(noticeDays("2026-11-14", "2026-11-28")).toBe(14);
  });
  it("salary for a full month with no deductions and no bonus yet is the monthly salary", () => {
    const s = scoreMonth(month(), NUM, TZ);
    expect(s.payableDays).toBe(30);
    expect(computePay({ monthlySalary: 30000, daysInMonth: 30, complete: false, fullMonth: true, score: s, fines: 100 }, NUM).net).toBe(29900);
  });
});

describe("§2 morning plan and EOD report", () => {
  const holidays = new Set(["2026-11-16"]);
  it("the EOD may be filed until the next working day's reporting time (Sundays and holidays skipped)", () => {
    expect(nextWorkingDay("2026-11-13", new Set())).toBe("2026-11-14"); // Fri → Sat
    expect(nextWorkingDay("2026-11-14", new Set())).toBe("2026-11-16"); // Sat → Mon
    expect(nextWorkingDay("2026-11-14", holidays)).toBe("2026-11-17"); // Mon is a holiday
    const d = eodDeadlines("2026-11-14", holidays, 570, 1110, TZ);
    expect(d.fileBy.toISOString()).toBe(ist("2026-11-17T09:30:00").toISOString());
    expect(d.escalateBy.toISOString()).toBe(ist("2026-11-17T18:30:00").toISOString());
  });
  it("filing states and the ₹100 fine", () => {
    const day = "2026-11-20"; // any day after the rule started; only the times below matter
    const fileBy = ist("2026-11-14T09:30:00");
    expect(eodState({ day, worked: true, submittedAt: ist("2026-11-13T19:00:00"), fileBy, now: ist("2026-11-14T12:00:00") })).toBe("FILED");
    expect(eodState({ day, worked: true, submittedAt: ist("2026-11-14T09:00:00"), fileBy, now: ist("2026-11-14T12:00:00") })).toBe("FILED");
    expect(eodState({ day, worked: true, submittedAt: null, fileBy, now: ist("2026-11-14T09:00:00") })).toBe("DUE");
    expect(eodState({ day, worked: true, submittedAt: null, fileBy, now: ist("2026-11-14T09:31:00") })).toBe("MISSED");
    expect(eodState({ day, worked: true, submittedAt: ist("2026-11-14T10:00:00"), fileBy, now: ist("2026-11-14T12:00:00") })).toBe("FILED_LATE");
    expect(eodState({ day, worked: false, submittedAt: null, fileBy, now: ist("2026-11-15T12:00:00") })).toBe("NOT_NEEDED");
    expect(personFined("MISSED")).toBe(true);
    expect(personFined("FILED_LATE")).toBe(true);
    expect(personFined("FILED")).toBe(false);
  });
  it("nothing before the rules went live (14 Nov 2026) is flagged, late or fined", () => {
    const fileBy = ist("2026-11-14T09:30:00");
    const now = ist("2026-11-20T12:00:00");
    // Days before 14 Nov: no EOD needed, so no fine, no escalation, no Team Lead fine.
    for (const day of ["2026-11-07", "2026-11-12", "2026-11-13"]) {
      const state = eodState({ day, worked: true, submittedAt: null, fileBy, now });
      expect(state).toBe("NOT_NEEDED");
      expect(personFined(state)).toBe(false);
      expect(needsEscalation({ state, escalatedAt: null })).toBe(false);
      expect(leadFined({ state, submittedAt: null, escalatedAt: null, escalateBy: fileBy, now })).toBe(false);
      // Filing one anyway, even days later, counts as filed (never "filed late").
      expect(eodState({ day, worked: true, submittedAt: now, fileBy, now })).toBe("FILED");
    }
    // 14 Nov itself counts for the EOD.
    expect(eodState({ day: "2026-11-14", worked: true, submittedAt: null, fileBy: ist("2026-11-16T09:30:00"), now })).toBe("MISSED");
    expect(eodRuleApplies("2026-11-13")).toBe(false);
    expect(eodRuleApplies(EOD_RULES_FROM)).toBe(true);
    // The morning plan arrived after 10:30 on the 14th: being late counts from the 15th.
    expect(planIsLate("2026-11-14", ist("2026-11-14T13:00:00"), ist("2026-11-14T10:30:00"))).toBe(false);
    expect(planIsLate("2026-11-16", ist("2026-11-16T11:00:00"), ist("2026-11-16T10:30:00"))).toBe(true);
    expect(planIsLate("2026-11-16", ist("2026-11-16T10:00:00"), ist("2026-11-16T10:30:00"))).toBe(false);
  });
  it("the Team Lead's ₹200: only if it is still missing at the end of the next day and nobody escalated", () => {
    const escalateBy = ist("2026-11-14T18:30:00");
    const later = ist("2026-11-15T10:00:00");
    expect(leadFined({ state: "MISSED", submittedAt: null, escalatedAt: null, escalateBy, now: later })).toBe(true);
    expect(leadFined({ state: "MISSED", submittedAt: null, escalatedAt: ist("2026-11-14T10:00:00"), escalateBy, now: later })).toBe(false);
    expect(leadFined({ state: "MISSED", submittedAt: null, escalatedAt: ist("2026-11-15T09:00:00"), escalateBy, now: later })).toBe(true);
    expect(leadFined({ state: "FILED_LATE", submittedAt: ist("2026-11-14T11:00:00"), escalatedAt: null, escalateBy, now: later })).toBe(false);
    expect(leadFined({ state: "MISSED", submittedAt: null, escalatedAt: null, escalateBy, now: ist("2026-11-14T15:00:00") })).toBe(false); // still time
    expect(needsEscalation({ state: "MISSED", escalatedAt: null })).toBe(true);
    expect(needsEscalation({ state: "DUE", escalatedAt: null })).toBe(false);
  });
  it("every EOD line needs a status, and a reason for each pending item", () => {
    expect(eodProblems([])).toHaveLength(1);
    expect(eodProblems([{ task: "GST return", status: "DONE", reason: null }])).toEqual([]);
    expect(eodProblems([{ task: "GST return", status: "PENDING", reason: " " }])[0]).toMatch(/reason/);
    expect(eodProblems([{ task: "TDS", status: "CARRIED_FORWARD", reason: "Client data awaited" }])).toEqual([]);
    expect(eodProblems([{ task: "TDS", status: null, reason: null }])[0]).toMatch(/Done, Pending or Carried Forward/);
  });
  it("zoned times are exact in India", () => {
    expect(zonedDateTime("2026-11-14", 630, TZ).toISOString()).toBe("2026-11-14T05:00:00.000Z");
  });
});

describe("who may do what under the rules", () => {
  it("managers and administrators fix salaries; seniors and team members only see their own payslip", async () => {
    const { can, CAPABILITIES } = await import("@/lib/permissions");
    expect(can("MANAGER", "payroll.salaries")).toBe(true);
    expect(can("ADMIN", "payroll.salaries")).toBe(true);
    expect(can("SENIOR", "payroll.salaries")).toBe(false);
    expect(can("STAFF", "payroll.salaries")).toBe(false);
    expect(can("STAFF", "payroll.view_own")).toBe(true);
    // A senior can be given the right for their team.
    expect(can({ role: "SENIOR", grantedCapabilities: ["payroll.salaries"] }, "payroll.salaries")).toBe(true);
    // Rule 1: nobody marks or changes attendance by hand, so the old correction right is gone.
    expect(Object.keys(CAPABILITIES)).not.toContain("attendance.correct");
  });
});
