import { describe, expect, it } from "vitest";
import { clientAccess, graceEndsAt, staffAccess } from "@/lib/domain/approval-access";
import { exceedsSingleHolder, isRepresentativeRoleAllowed } from "@/lib/domain/constitution";
import { canMoveObservation } from "@/lib/domain/observation-workflow";
import { safeAppPath } from "@/lib/safe-path";
import { toCsv } from "@/lib/csv";
import { can } from "@/lib/permissions";

describe("client observation lifecycle (provisional)", () => {
  it("allows the forward path and reopening", () => {
    expect(canMoveObservation("OPEN", "IN_PROGRESS")).toBe(true);
    expect(canMoveObservation("IN_PROGRESS", "RESOLVED")).toBe(true);
    expect(canMoveObservation("RESOLVED", "CLOSED")).toBe(true);
    expect(canMoveObservation("CLOSED", "OPEN")).toBe(true);
  });
  it("does not skip straight to closed", () => {
    expect(canMoveObservation("OPEN", "CLOSED")).toBe(false);
    expect(canMoveObservation("IN_PROGRESS", "CLOSED")).toBe(false);
  });
});

describe("safe in-app redirect paths", () => {
  it("accepts same-site paths for the right area", () => {
    expect(safeAppPath("/app/tasks/1", "app")).toBe("/app/tasks/1");
    expect(safeAppPath("/app", "app")).toBe("/app");
    expect(safeAppPath("/client/work/1?x=1", "client")).toBe("/client/work/1?x=1");
  });
  it("rejects off-site, protocol-relative and cross-area paths", () => {
    expect(safeAppPath("https://evil.example", "app")).toBeNull();
    expect(safeAppPath("//evil.example/app", "app")).toBeNull();
    expect(safeAppPath("/app//evil.example", "app")).toBeNull();
    expect(safeAppPath("/app\\evil", "app")).toBeNull();
    expect(safeAppPath("/application", "app")).toBeNull();
    expect(safeAppPath("/app/tasks/1", "client")).toBeNull();
    expect(safeAppPath(null, "app")).toBeNull();
  });
});

describe("CSV export", () => {
  it("quotes separators and neutralises spreadsheet formulas", () => {
    const csv = toCsv([["a,b", 'say "hi"', "=HYPERLINK(1)", "-5", 12, null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.trim()).toBe(`"a,b","say ""hi""",'=HYPERLINK(1),'-5,12,`);
  });
  it("leaves numbers unprefixed", () => {
    expect(toCsv([[-5]]).trim()).toBe("-5");
  });
});

describe("permissions for the new modules", () => {
  it("lets leads manage observations, staff only their own", () => {
    expect(can("SENIOR", "observations.manage")).toBe(true);
    expect(can("STAFF", "observations.manage")).toBe(false);
    expect(can("CLIENT", "observations.manage")).toBe(false);
  });
  it("keeps client reports and dues away from staff and clients", () => {
    for (const cap of ["reports.client", "dues.manage"] as const) {
      expect(can("STAFF", cap)).toBe(false);
      expect(can("SENIOR", cap)).toBe(false);
      expect(can("CLIENT", cap)).toBe(false);
      expect(can("MANAGER", cap)).toBe(true);
    }
  });
});

describe("constitution representatives", () => {
  it("accepts the constitution's own role and the generic roles", () => {
    expect(isRepresentativeRoleAllowed("PARTNER", "PARTNER")).toBe(true);
    expect(isRepresentativeRoleAllowed("KARTA", "MEMBER")).toBe(true);
    expect(isRepresentativeRoleAllowed("DIRECTOR", "OTHER")).toBe(true);
    expect(isRepresentativeRoleAllowed(null, "DIRECTOR")).toBe(true);
  });
  it("rejects a role from another constitution", () => {
    expect(isRepresentativeRoleAllowed("PARTNER", "DIRECTOR")).toBe(false);
    expect(isRepresentativeRoleAllowed("PROPRIETOR", "KARTA")).toBe(false);
  });
  it("limits single-holder constitutions to one holder", () => {
    expect(exceedsSingleHolder({ representativeRole: "PROPRIETOR", allowsMultiple: false }, ["PROPRIETOR", "PROPRIETOR"])).toBe(true);
    expect(exceedsSingleHolder({ representativeRole: "PROPRIETOR", allowsMultiple: false }, ["PROPRIETOR", "OTHER"])).toBe(false);
    expect(exceedsSingleHolder({ representativeRole: "PARTNER", allowsMultiple: true }, ["PARTNER", "PARTNER"])).toBe(false);
  });
});

describe("access while awaiting approval", () => {
  const created = new Date("2026-10-01T04:30:00Z"); // 10:00 IST on day 1
  const at = (iso: string) => new Date(iso);
  it("ends the grace period exactly 7 x 24 hours after creation", () => {
    expect(graceEndsAt(created, 7).toISOString()).toBe("2026-10-08T04:30:00.000Z");
  });
  it("staff have no grace period: locked until approved, whatever the status", () => {
    for (const st of ["PENDING", "UNDER_REVIEW", "ON_HOLD", "REJECTED"]) {
      expect(staffAccess({ approvalStatus: st }, "STAFF").state, st).toBe("locked");
      expect(staffAccess({ approvalStatus: st }, "SENIOR").state, st).toBe("locked");
      expect(staffAccess({ approvalStatus: st }, "MANAGER").state, st).toBe("locked");
    }
    expect(staffAccess({ approvalStatus: "APPROVED" }, "STAFF")).toEqual({ state: "full", graceEndsAt: null });
  });
  it("never locks owners or administrators", () => {
    expect(staffAccess({ approvalStatus: "PENDING" }, "ADMIN").state).toBe("full");
    expect(staffAccess({ approvalStatus: "REJECTED" }, "OWNER").state).toBe("full");
  });
  it("applies the same clock to a pending client from registration creation", () => {
    const c = { status: "PENDING_APPROVAL", createdAt: created };
    expect(clientAccess(c, 7, at("2026-10-08T04:29:59Z")).state).toBe("grace");
    expect(clientAccess(c, 7, at("2026-10-08T04:30:00Z")).state).toBe("locked");
    expect(clientAccess({ ...c, status: "ACTIVE" }, 7, at("2026-12-01T00:00:00Z")).state).toBe("full");
    expect(clientAccess({ ...c, status: "REJECTED" }, 7, at("2026-10-02T00:00:00Z")).state).toBe("locked");
    expect(clientAccess({ ...c, status: "INACTIVE" }, 7, at("2026-10-02T00:00:00Z")).state).toBe("locked");
  });
  it("0 grace days means no access until approved", () => {
    expect(clientAccess({ status: "PENDING_APPROVAL", createdAt: created }, 0, created).state).toBe("locked");
  });
});
