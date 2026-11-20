import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/services/attendance", () => ({ teamAttendanceRows: vi.fn() }));
vi.mock("@/lib/services/office-rules", () => ({ getPolicy: vi.fn(), ruleSubjects: vi.fn() }));
vi.mock("@/lib/services/daily-plans", () => ({ toEscalate: vi.fn() }));
vi.mock("@/lib/services/team-today", () => ({ teamToday: vi.fn() }));
vi.mock("@/lib/services/analytics", () => ({ TASK_STATUS_LABELS: {} }));

const { bizRanges, parseBizFilters, inrShort, weekOf, shiftRange, bizQuery } = await import("@/lib/services/business360");
const f = (q: Record<string, string>) => parseBizFilters(q);

describe("Business 360° periods (client's comparison rule)", () => {
  it("Today → yesterday, Yesterday → the day before, 7 Days → the 7 before", () => {
    expect(bizRanges(f({}), "2026-11-20")).toMatchObject({ cur: { from: "2026-11-20", to: "2026-11-20" }, prev: { from: "2026-11-19", to: "2026-11-19" } });
    expect(bizRanges(f({ period: "yesterday" }), "2026-11-20")).toMatchObject({ cur: { from: "2026-11-19", to: "2026-11-19" }, prev: { from: "2026-11-18", to: "2026-11-18" } });
    expect(bizRanges(f({ period: "7d" }), "2026-11-20")).toMatchObject({ cur: { from: "2026-11-14", to: "2026-11-20" }, prev: { from: "2026-11-07", to: "2026-11-13" } });
  });
  it("Month → previous month (same days), month ends clamp", () => {
    expect(bizRanges(f({ period: "month" }), "2026-11-20")).toMatchObject({ cur: { from: "2026-11-01", to: "2026-11-20" }, prev: { from: "2026-10-01", to: "2026-10-20" } });
    expect(bizRanges(f({ period: "month" }), "2026-03-31").prev).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("Quarter → previous quarter (Indian financial-year quarters), Year → previous year", () => {
    expect(bizRanges(f({ period: "quarter" }), "2026-11-20")).toMatchObject({ cur: { from: "2026-10-01", to: "2026-11-20" }, prev: { from: "2026-07-01", to: "2026-08-20" } });
    expect(bizRanges(f({ period: "quarter" }), "2027-02-10").cur.from).toBe("2027-01-01");
    expect(bizRanges(f({ period: "quarter" }), "2027-02-10").prev.from).toBe("2026-10-01");
    expect(bizRanges(f({ period: "year" }), "2026-11-20")).toMatchObject({ cur: { from: "2026-04-01", to: "2026-11-20" }, prev: { from: "2025-04-01", to: "2025-11-20" } });
    expect(bizRanges(f({ period: "year" }), "2027-02-01").cur.from).toBe("2026-04-01");
  });
  it("Custom → the equal-length range just before; never in the future; from ≤ to", () => {
    expect(bizRanges(f({ period: "custom", from: "2026-11-09", to: "2026-11-15" }), "2026-11-20")).toMatchObject({ cur: { from: "2026-11-09", to: "2026-11-15" }, prev: { from: "2026-11-02", to: "2026-11-08" } });
    expect(bizRanges(f({ period: "custom", from: "2026-11-18", to: "2026-12-30" }), "2026-11-20").cur).toEqual({ from: "2026-11-18", to: "2026-11-20" });
    expect(bizRanges(f({ period: "custom", from: "2026-11-25", to: "2026-11-10" }), "2026-11-20").cur).toEqual({ from: "2026-11-10", to: "2026-11-10" });
  });
  it("ignores unknown or unsafe filter values", () => {
    expect(f({ period: "decade", client: "x'; drop", staff: "not-a-uuid", from: "20-11-2026" })).toMatchObject({ period: "today", client: "", staff: "", from: "" });
    expect(bizQuery(f({ period: "month", activity: "GST Work" }))).toBe("period=month&activity=GST+Work");
  });
});

describe("weeks run Monday to Sunday", () => {
  it("finds the week of a date and the week before", () => {
    expect(weekOf("2026-11-20")).toEqual({ from: "2026-11-16", to: "2026-11-22" }); // Friday
    expect(weekOf("2026-11-16")).toEqual({ from: "2026-11-16", to: "2026-11-22" }); // Monday
    expect(weekOf("2026-11-22")).toEqual({ from: "2026-11-16", to: "2026-11-22" }); // Sunday
    expect(shiftRange(weekOf("2026-11-23"), -7)).toEqual({ from: "2026-11-16", to: "2026-11-22" });
  });
});

describe("money in the Indian format", () => {
  it("lakh, crore, thousand", () => {
    expect(inrShort(884000)).toBe("₹8.84L");
    expect(inrShort(12_300_000)).toBe("₹1.23Cr");
    expect(inrShort(24000)).toBe("₹24k");
    expect(inrShort(1500)).toBe("₹1.5k");
    expect(inrShort(619)).toBe("₹619");
    expect(inrShort(-29301)).toBe("-₹29k");
  });
});
