import { describe, expect, it } from "vitest";
import { availabilityOn, findConflicts } from "@/lib/domain/allocation";
import { evaluateDay, summarizeMonth, type PolicyParams } from "@/lib/domain/attendance-policy";
import { availableActions, canPerform, nextStatus } from "@/lib/domain/task-workflow";
import { daysPending, isTaskOverdue, workHours } from "@/lib/domain/derived";
import { can, landingPath } from "@/lib/permissions";
import { dateOnly, isoDateInTz, minutesOfDayInTz } from "@/lib/dates";
import { gstinSchema, panSchema } from "@/lib/validation/identifiers";

const TZ = "Asia/Kolkata";
const ist = (iso: string) => new Date(`${iso}+05:30`);

const POLICY: PolicyParams = {
  reportingGraceUntil: "09:45",
  halfDayIfLeavingBefore: "17:30",
  leavingGraceUntil: "18:45",
  requiredMinutes: 540,
  onsiteRequiredMinutes: 480,
  reducedRequiredMinutes: 510,
  farClientEarlyMonthMinutes: 510,
  farClientEarlyMonthUntilDay: 15,
  lateArrivalsPerHalfDay: 2,
  lateGracePerMonth: 1,
  overtimeMode: "ACTUAL_MINUTES",
  overtimeMinutesPerDay: 540,
};

describe("permissions", () => {
  it("team members cannot cancel tasks, approve clients or view all attendance", () => {
    expect(can("STAFF", "tasks.cancel")).toBe(false);
    expect(can("STAFF", "clients.approve")).toBe(false);
    expect(can("STAFF", "attendance.view_all")).toBe(false);
    expect(can("STAFF", "attendance.mark_own")).toBe(true);
    expect(can("STAFF", "timesheet.fill_own")).toBe(true);
  });
  it("client report is limited to admin and manager (DFD module 5)", () => {
    expect(can("MANAGER", "reports.client")).toBe(true);
    expect(can("SENIOR", "reports.client")).toBe(false);
    expect(can("STAFF", "reports.client")).toBe(false);
  });
  it("seniors review and create tasks but are not administrators", () => {
    expect(can("SENIOR", "tasks.create")).toBe(true);
    expect(can("SENIOR", "tasks.review")).toBe(true);
    expect(can("SENIOR", "org.manage")).toBe(false);
    expect(can("SENIOR", "employees.manage")).toBe(false);
  });
  it("routes each role to its own landing page", () => {
    expect(landingPath("OWNER")).toBe("/app/admin");
    expect(landingPath("MANAGER")).toBe("/app/manager");
    expect(landingPath("SENIOR")).toBe("/app/senior");
    expect(landingPath("STAFF")).toBe("/app/workspace");
  });
});

describe("task workflow", () => {
  const parties = { makerEmployeeId: "maker", checkerEmployeeId: "checker" };
  it("follows the defined transitions", () => {
    expect(nextStatus("ASSIGNED", "start")).toBe("IN_PROGRESS");
    expect(nextStatus("IN_PROGRESS", "submit")).toBe("PENDING_REVIEW");
    expect(nextStatus("PENDING_REVIEW", "approve")).toBe("COMPLETED");
    expect(nextStatus("PENDING_REVIEW", "request_changes")).toBe("CHANGES_REQUESTED");
    expect(nextStatus("COMPLETED", "submit")).toBeNull();
    expect(nextStatus("CANCELLED", "approve")).toBeNull();
  });
  it("a maker can never approve their own work", () => {
    expect(canPerform({ role: "OWNER", employeeId: "maker", isAssignee: true }, parties, "approve")).toBe(false);
  });
  it("only the named checker (or an admin) approves", () => {
    expect(canPerform({ role: "SENIOR", employeeId: "someone", isAssignee: false }, parties, "approve")).toBe(false);
    expect(canPerform({ role: "SENIOR", employeeId: "checker", isAssignee: false }, parties, "approve")).toBe(true);
    expect(canPerform({ role: "ADMIN", employeeId: "admin", isAssignee: false }, parties, "approve")).toBe(true);
  });
  it("team members can progress their own work but never cancel", () => {
    const me = { role: "STAFF" as const, employeeId: "e1", isAssignee: true };
    expect(availableActions("IN_PROGRESS", me, parties)).toEqual(["hold", "wait_client", "wait_team", "submit"]);
    expect(nextStatus("AWAITING_CLIENT", "start")).toBe("IN_PROGRESS");
    expect(nextStatus("AWAITING_CLIENT", "submit")).toBeNull();
    expect(canPerform(me, parties, "cancel")).toBe(false);
    expect(canPerform({ ...me, isAssignee: false }, parties, "start")).toBe(false);
  });
});

describe("derived values", () => {
  it("overdue only for open tasks past due", () => {
    const now = new Date("2026-10-26T10:00:00Z");
    expect(isTaskOverdue({ dueAt: new Date("2026-10-25T10:00:00Z"), status: "IN_PROGRESS" }, now)).toBe(true);
    expect(isTaskOverdue({ dueAt: new Date("2026-10-25T10:00:00Z"), status: "COMPLETED" }, now)).toBe(false);
    expect(isTaskOverdue({ dueAt: null, status: "PENDING" }, now)).toBe(false);
  });
  it("days pending counts to close date or today", () => {
    expect(daysPending({ requestedOn: dateOnly("2026-10-01"), closedAt: null }, new Date("2026-10-11T12:00:00Z"))).toBe(10);
    expect(daysPending({ requestedOn: dateOnly("2026-10-01"), closedAt: new Date("2026-10-04T08:00:00Z") })).toBe(3);
  });
  it("work hours from in/out", () => {
    expect(workHours(ist("2026-10-26T09:30:00"), ist("2026-10-26T18:30:00"))).toBe(9);
  });
});

describe("attendance policy (provisional)", () => {
  it("matches the policy document example: in 9:45, out 20:15 → 90 OT minutes", () => {
    const r = evaluateDay(
      { dayOfMonth: 5, status: "PRESENT", timeIn: ist("2026-10-05T09:45:00"), timeOut: ist("2026-10-05T20:15:00") },
      "STANDARD",
      POLICY,
      TZ,
    );
    expect(r.workedMinutes).toBe(630);
    expect(r.overtimeMinutes).toBe(90);
    expect(r.isLate).toBe(false); // 9:45 is within grace
  });
  it("1,620 OT minutes in a month = 3 OT days; short days reduce OT", () => {
    const days = [0, 1, 2].map((i) => ({
      dayOfMonth: i + 1,
      status: "PRESENT" as const,
      timeIn: ist(`2026-10-0${i + 1}T09:30:00`),
      timeOut: ist(`2026-10-0${i + 1}T00:00:00`.replace("T00:00", "T18:30").replace("18:30:00", "18:30:00")),
    }));
    // three 9h days → 0 OT; then add 1,620 extra minutes on one day
    days.push({ dayOfMonth: 4, status: "PRESENT", timeIn: ist("2026-10-04T00:00:00"), timeOut: new Date(ist("2026-10-04T00:00:00").getTime() + (540 + 1620) * 60000) });
    expect(summarizeMonth(days, "STANDARD", POLICY, TZ).overtimeDays).toBe(3);
    const short = [...days, { dayOfMonth: 5, status: "PRESENT" as const, timeIn: ist("2026-10-05T09:30:00"), timeOut: ist("2026-10-05T17:30:00") }];
    expect(summarizeMonth(short, "STANDARD", POLICY, TZ).overtimeMinutes).toBe(1620 - 60);
  });
  it("two counted late arrivals = half day; first late with a reason is excused", () => {
    const late = (d: number, reason?: string) => ({
      dayOfMonth: d,
      status: "PRESENT" as const,
      timeIn: ist(`2026-10-${String(d).padStart(2, "0")}T10:00:00`),
      timeOut: ist(`2026-10-${String(d).padStart(2, "0")}T19:00:00`),
      lateReason: reason,
    });
    expect(summarizeMonth([late(1), late(2)], "STANDARD", POLICY, TZ).lateHalfDays).toBe(0.5);
    const s = summarizeMonth([late(1, "traffic jam"), late(2)], "STANDARD", POLICY, TZ);
    expect(s.lateArrivalsExcusedByGrace).toBe(1);
    expect(s.lateHalfDays).toBe(0);
  });
  it("far-client staff need 8h30 on days 1–15 and 9h afterwards", () => {
    const d = (day: number) =>
      evaluateDay({ dayOfMonth: day, status: "PRESENT", timeIn: null, timeOut: null }, "FAR_CLIENT", POLICY, TZ).requiredMinutes;
    expect(d(10)).toBe(510);
    expect(d(20)).toBe(540);
  });
  it("leaving before 17:30 is flagged as half day; no OT on leave days", () => {
    const r = evaluateDay({ dayOfMonth: 3, status: "PRESENT", timeIn: ist("2026-10-03T09:30:00"), timeOut: ist("2026-10-03T17:00:00") }, "STANDARD", POLICY, TZ);
    expect(r.leftBeforeHalfDayCutoff).toBe(true);
    const leave = evaluateDay({ dayOfMonth: 3, status: "LEAVE", timeIn: ist("2026-10-03T09:30:00"), timeOut: ist("2026-10-03T21:00:00") }, "STANDARD", POLICY, TZ);
    expect(leave.overtimeMinutes).toBeNull();
  });
  it("old slab policy: >2.5h after 18:45 = half day, >5h = full day", () => {
    const p = { ...POLICY, overtimeMode: "SLABS" as const };
    const r = evaluateDay({ dayOfMonth: 3, status: "PRESENT", timeIn: ist("2026-10-03T09:30:00"), timeOut: ist("2026-10-03T21:30:00") }, "STANDARD", p, TZ);
    expect(r.slabOvertimeDays).toBe(0.5);
  });
});

describe("team allocation conflicts", () => {
  const span = (s: string, e: string | null, pct: number | null) => ({ startDate: dateOnly(s), endDate: e ? dateOnly(e) : null, allocationPercent: pct });
  it("full-time overlapping allocations conflict", () => {
    expect(findConflicts(span("2026-11-01", "2026-11-30", null), [span("2026-11-15", null, null)]).isConflict).toBe(true);
  });
  it("partial allocations up to 100% do not conflict; non-overlapping never conflict", () => {
    expect(findConflicts(span("2026-11-01", "2026-11-30", 50), [span("2026-11-01", null, 50)]).isConflict).toBe(false);
    expect(findConflicts(span("2026-11-01", "2026-11-10", null), [span("2026-11-11", null, null)]).isConflict).toBe(false);
  });
  it("availability levels", () => {
    expect(availabilityOn(dateOnly("2026-11-05"), [span("2026-11-01", null, 50)]).level).toBe("partial");
    expect(availabilityOn(dateOnly("2026-12-05"), [span("2026-11-01", "2026-11-30", 50)]).level).toBe("free");
  });
});

describe("dates and validation", () => {
  it("uses the firm's timezone for calendar days", () => {
    expect(isoDateInTz(new Date("2026-10-26T20:00:00Z"), TZ)).toBe("2026-10-27");
    expect(minutesOfDayInTz(ist("2026-10-26T09:45:00"), TZ)).toBe(585);
  });
  it("validates statutory identifiers from the firm's own records", () => {
    expect(gstinSchema.parse("07agbpd7743c1zt")).toBe("07AGBPD7743C1ZT");
    expect(panSchema.safeParse("AGBPD7743C").success).toBe(true);
    expect(gstinSchema.safeParse("07AGBPD7743C1Z").success).toBe(false);
  });
});

describe("client lifecycle", async () => {
  const { clientTransition, clientActions } = await import("@/lib/domain/client-workflow");
  it("quick registration is activated only by an administrator", () => {
    expect(clientTransition("PENDING_APPROVAL", "approve", "ADMIN")).toBe("ACTIVE");
    expect(clientTransition("PENDING_APPROVAL", "approve", "MANAGER")).toBeNull();
    expect(clientTransition("PENDING_APPROVAL", "approve", "STAFF")).toBeNull();
  });
  it("rejected clients can be corrected and resubmitted, not approved directly", () => {
    expect(clientTransition("REJECTED", "approve", "OWNER")).toBeNull();
    expect(clientTransition("REJECTED", "resubmit", "MANAGER")).toBe("PENDING_APPROVAL");
  });
  it("active clients can be put on hold or discontinued and reactivated", () => {
    expect(clientActions("ACTIVE", "OWNER").map((a) => a.action)).toEqual(["hold", "deactivate"]);
    expect(clientTransition("INACTIVE", "reactivate", "ADMIN")).toBe("ACTIVE");
  });
});

describe("client role isolation", async () => {
  const { CAPABILITIES } = await import("@/lib/permissions");
  it("clients hold no internal capability and land in the portal", () => {
    const internal = (Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[]).filter((c) => c !== "portal.use");
    for (const cap of internal) expect(can("CLIENT", cap), cap).toBe(false);
    expect(can("CLIENT", "portal.use")).toBe(true);
    expect(landingPath("CLIENT")).toBe("/client");
  });
  it("staff never get the client-portal capability", () => {
    for (const r of ["OWNER", "ADMIN", "MANAGER", "SENIOR", "STAFF"] as const) expect(can(r, "portal.use")).toBe(false);
  });
});

describe("days pending basis", () => {
  // 2026-10-03 is a Saturday; 2026-10-05 a Monday.
  const item = { requestedOn: dateOnly("2026-10-03"), closedAt: null };
  const monday = new Date("2026-10-05T06:00:00Z");
  it("calendar basis counts every day", () => {
    expect(daysPending(item, monday, "CALENDAR")).toBe(2);
  });
  it("business basis skips Sundays (Mon–Sat working week)", () => {
    expect(daysPending(item, monday, "BUSINESS")).toBe(1);
  });
  it("uses the firm's local date (IST) for 'today'", () => {
    // 2026-10-04T20:00Z is already 5 Oct in IST.
    expect(daysPending({ requestedOn: dateOnly("2026-10-04"), closedAt: null }, new Date("2026-10-04T20:00:00Z"))).toBe(1);
  });
});
