import { describe, expect, it } from "vitest";
import { availabilityOn, capacityFromPolicy, describeHours, findConflicts } from "@/lib/domain/allocation";
import { availableActions, canPerform, nextStatus } from "@/lib/domain/task-workflow";
import { daysPending, isTaskOverdue, workHours } from "@/lib/domain/derived";
import { can, landingPath } from "@/lib/permissions";
import { dateOnly, isoDateInTz, minutesOfDayInTz } from "@/lib/dates";
import { gstinSchema, panSchema } from "@/lib/validation/identifiers";

const TZ = "Asia/Kolkata";
const ist = (iso: string) => new Date(`${iso}+05:30`);


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
  it("a maker with a different named checker cannot approve; one person can hold both jobs", () => {
    expect(canPerform({ role: "STAFF", employeeId: "maker", isAssignee: true }, parties, "approve")).toBe(false);
    expect(canPerform({ role: "STAFF", employeeId: "solo", isAssignee: true }, { makerEmployeeId: "solo", checkerEmployeeId: "solo" }, "approve")).toBe(true);
    expect(canPerform({ role: "SENIOR", employeeId: "solo", isAssignee: true }, { makerEmployeeId: "solo", checkerEmployeeId: null }, "approve")).toBe(false);
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

describe("team allocation in hours", () => {
  const cap = capacityFromPolicy({ officeStart: "09:30", lunchStart: "13:00", lunchEnd: "13:30", officeEnd: "18:30" });
  const span = (s: string, e: string | null, first: number | null, second: number | null) => ({ startDate: dateOnly(s), endDate: e ? dateOnly(e) : null, firstHalfHours: first, secondHalfHours: second });
  it("takes each half's capacity from the timing policy", () => {
    expect(cap).toEqual({ first: 3.5, second: 5 });
  });
  it("two full days on overlapping dates conflict", () => {
    expect(findConflicts(span("2026-11-01", null, null, null), [span("2026-11-10", "2026-11-20", null, null)], cap).isConflict).toBe(true);
  });
  it("first half at one client and second half at another do not conflict", () => {
    const r = findConflicts(span("2026-11-01", null, 3.5, 0), [span("2026-11-01", null, 0, 5)], cap);
    expect(r.isConflict).toBe(false);
    expect(r.firstHours).toBe(3.5);
    expect(r.secondHours).toBe(5);
  });
  it("too many hours in one half conflict even if the day total would fit", () => {
    expect(findConflicts(span("2026-11-01", null, 2, 0), [span("2026-11-01", null, 2, 0)], cap).isConflict).toBe(true);
  });
  it("allocations that never meet do not add up", () => {
    const r = findConflicts(span("2026-11-01", "2026-11-30", 3, 0), [span("2026-10-01", "2026-10-15", 3, 0), span("2026-12-01", null, 3, 0)], cap);
    expect(r.isConflict).toBe(false);
  });
  it("availability reflects booked hours per half", () => {
    const spans = [span("2026-11-01", null, 2, 1)];
    expect(availabilityOn(dateOnly("2026-10-31"), spans, cap).level).toBe("free");
    expect(availabilityOn(dateOnly("2026-11-02"), spans, cap)).toMatchObject({ level: "partial", first: 2, second: 1 });
    expect(availabilityOn(dateOnly("2026-11-02"), [span("2026-11-01", null, null, null)], cap).level).toBe("busy");
  });
  it("describes hours in words", () => {
    expect(describeHours({ firstHalfHours: null, secondHalfHours: null }, cap)).toBe("Full day");
    expect(describeHours({ firstHalfHours: 3.5, secondHalfHours: 0 }, cap)).toBe("First half 3.5 h");
    expect(describeHours({ firstHalfHours: 2, secondHalfHours: 1.5 }, cap)).toBe("First half 2 h · Second half 1.5 h");
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
