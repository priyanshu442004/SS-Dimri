// Client feedback 26 Nov 2026: spare parts on an asset, and where a team member may mark in
// (Team timings "Works at", one or more places).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/session", () => ({}));
vi.mock("@/lib/services/notifications", () => ({ notifyEmployees: vi.fn(), notifyRoles: vi.fn() }));
vi.mock("@/lib/services/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/services/office-rules", () => ({ actsAsLeadFor: vi.fn(), getPolicy: vi.fn(), leadScopeIds: vi.fn(), scheduleOf: vi.fn() }));

const { allowedWorkLocations } = await import("@/lib/domain/attendance-policy");
const { parseSpareParts } = await import("@/lib/services/assets");
const { scheduleSchema } = await import("@/lib/services/team-schedules");

const form = (rows: [string, string][]) => {
  const fd = new FormData();
  for (const [n, d] of rows) { fd.append("spareName", n); fd.append("spareDate", d); }
  return fd;
};

describe("where a team member may mark in", () => {
  it("nothing set = all three, as before", () => {
    expect(allowedWorkLocations([])).toEqual(["OFFICE", "CLIENT_OFFICE", "CLIENT_VISIT"]);
    expect(allowedWorkLocations(null)).toEqual(["OFFICE", "CLIENT_OFFICE", "CLIENT_VISIT"]);
  });
  it("keeps only the places set, in the usual order, and ignores unknown values", () => {
    expect(allowedWorkLocations(["CLIENT_VISIT", "OFFICE"])).toEqual(["OFFICE", "CLIENT_VISIT"]);
    expect(allowedWorkLocations(["CLIENT_OFFICE", "SOMEWHERE"])).toEqual(["CLIENT_OFFICE"]);
  });
  it("Team timings takes several places and needs at least one", () => {
    const id = "0191b4a0-0000-7000-8000-000000000001";
    expect(scheduleSchema.safeParse({ employeeId: id, "places[]": ["OFFICE", "CLIENT_VISIT"] }).success).toBe(true);
    expect(scheduleSchema.safeParse({ employeeId: id, "places[]": [] }).success).toBe(false);
    expect(scheduleSchema.safeParse({ employeeId: id }).success).toBe(false);
    expect(scheduleSchema.safeParse({ employeeId: id, "places[]": ["HOME"] }).success).toBe(false);
  });
});

describe("asset spare parts", () => {
  it("reads every row and drops fully blank ones", () => {
    expect(parseSpareParts(form([["Charger 65 W", "2026-11-20"], ["", ""], ["RAM 8 GB", "2026-11-26"]]))).toEqual({
      parts: [{ name: "Charger 65 W", issuedOn: "2026-11-20" }, { name: "RAM 8 GB", issuedOn: "2026-11-26" }],
    });
    expect(parseSpareParts(new FormData())).toEqual({ parts: [] });
  });
  it("a half-filled row is an error, never silently lost", () => {
    expect(parseSpareParts(form([["Toner", ""]]))).toEqual({ error: "Spare part row 1 (Toner): enter the issue date." });
    expect(parseSpareParts(form([["", "2026-11-26"]]))).toEqual({ error: "Spare part row 1: enter the spare part." });
  });
});
