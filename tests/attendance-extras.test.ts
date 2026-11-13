import { describe, expect, it } from "vitest";
import {
  isMissingTimeOut,
  lunchAllowanceMinutes,
  lunchMinutes,
  lunchOverMinutes,
  markOutReminderDue,
  mayReviewPhoto,
  summarizeWorkerDays,
  wageForDay,
} from "../src/lib/domain/attendance-extras";
import { can, GRANTABLE_RIGHTS } from "../src/lib/permissions";

const ist = (hhmm: string, day = "2026-11-12") => new Date(`${day}T${hhmm}:00+05:30`);
const TZ = "Asia/Kolkata";

describe("lunch in / out", () => {
  it("allowance comes from the policy's lunch window", () => {
    expect(lunchAllowanceMinutes("13:00", "13:30")).toBe(30);
    expect(lunchAllowanceMinutes("13:30", "13:00")).toBe(0);
  });
  it("measures the break, running to now while still at lunch", () => {
    expect(lunchMinutes(null, null)).toBeNull();
    expect(lunchMinutes(ist("13:05"), ist("13:47"))).toBe(42);
    expect(lunchMinutes(ist("13:05"), null, ist("13:20"))).toBe(15);
  });
  it("reports only the minutes over the allowance", () => {
    expect(lunchOverMinutes(42, 30)).toBe(12);
    expect(lunchOverMinutes(25, 30)).toBe(0);
    expect(lunchOverMinutes(null, 30)).toBe(0);
  });
});

describe("mark-out reminder", () => {
  it("is due from the reminder time in the firm's timezone", () => {
    expect(markOutReminderDue(ist("18:59"), "19:00", TZ)).toBe(false);
    expect(markOutReminderDue(ist("19:00"), "19:00", TZ)).toBe(true);
    expect(markOutReminderDue(ist("22:10"), "19:00", TZ)).toBe(true);
  });
  it("a missing time out is any earlier day, or today once the reminder time has passed", () => {
    const open = { timeIn: ist("09:40"), timeOut: null };
    expect(isMissingTimeOut({ ...open, isToday: false }, false)).toBe(true);
    expect(isMissingTimeOut({ ...open, isToday: true }, false)).toBe(false);
    expect(isMissingTimeOut({ ...open, isToday: true }, true)).toBe(true);
    expect(isMissingTimeOut({ timeIn: ist("09:40"), timeOut: ist("18:30"), isToday: false }, true)).toBe(false);
    expect(isMissingTimeOut({ timeIn: null, timeOut: null, isToday: false }, true)).toBe(false);
  });
});

describe("photo attendance check", () => {
  const base = { reviewAll: false, isReportingManager: false, markedByMe: false, isMine: false };
  it("firm-wide reviewers check anyone else's, even marks they made", () => {
    expect(mayReviewPhoto({ ...base, reviewAll: true })).toBe(true);
    expect(mayReviewPhoto({ ...base, reviewAll: true, markedByMe: true })).toBe(true);
  });
  it("a senior checks their reportees, but not a mark they made themselves", () => {
    expect(mayReviewPhoto({ ...base, isReportingManager: true })).toBe(true);
    expect(mayReviewPhoto({ ...base, isReportingManager: true, markedByMe: true })).toBe(false);
    expect(mayReviewPhoto(base)).toBe(false);
  });
  it("nobody checks their own attendance", () => {
    expect(mayReviewPhoto({ ...base, reviewAll: true, isMine: true })).toBe(false);
  });
  it("seniors may mark for others by default; staff only when given the right", () => {
    expect(can("SENIOR", "attendance.mark_others")).toBe(true);
    expect(can("STAFF", "attendance.mark_others")).toBe(false);
    expect(can({ role: "STAFF", grantedCapabilities: ["attendance.mark_others"] }, "attendance.mark_others")).toBe(true);
    expect(can("CLIENT", "attendance.mark_others")).toBe(false);
    expect(can("ADMIN", "attendance.review_photos")).toBe(true);
    expect(can("SENIOR", "attendance.review_photos")).toBe(false);
    expect(can("MANAGER", "attendance.workers")).toBe(true);
    expect(can("SENIOR", "attendance.workers")).toBe(false);
    for (const c of ["attendance.mark_others", "attendance.review_photos", "attendance.workers"]) {
      expect(GRANTABLE_RIGHTS.some((r) => r.capability === c)).toBe(true);
    }
  });
  it("a peon limited to other modules cannot mark for others", () => {
    expect(can({ role: "SENIOR", moduleRestricted: true, allowedModules: ["payroll"] }, "attendance.mark_others")).toBe(false);
  });
});

describe("daily workers' pay", () => {
  it("full day earns the wage, half day half, absent nothing", () => {
    expect(wageForDay(650, "PRESENT")).toBe(650);
    expect(wageForDay(651, "HALF_DAY")).toBe(325.5);
    expect(wageForDay(650, "ABSENT")).toBe(0);
  });
  it("adds up earned, paid and still due", () => {
    const s = summarizeWorkerDays([
      { status: "PRESENT", wage: 600, paid: true },
      { status: "PRESENT", wage: 600, paid: false },
      { status: "HALF_DAY", wage: 300, paid: false },
      { status: "ABSENT", wage: 0, paid: false },
    ]);
    expect(s).toEqual({ fullDays: 2, halfDays: 1, absentDays: 1, daysWorked: 2.5, earned: 1500, paid: 600, due: 900 });
  });
});
