import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/services/attendance", () => ({ teamAttendanceRows: vi.fn() }));
vi.mock("@/lib/services/office-rules", () => ({ getPolicy: vi.fn() }));

const { periodRanges, lateFee, isPeriod } = await import("@/lib/services/ops-summary");
const { fmtCompact } = await import("@/lib/chart-format");

describe("dashboard periods", () => {
  it("compares each period with the one before", () => {
    expect(periodRanges("today", "2026-11-17")).toEqual({ cur: { from: "2026-11-17", to: "2026-11-17" }, prev: { from: "2026-11-16", to: "2026-11-16" }, compare: "vs yday" });
    expect(periodRanges("yesterday", "2026-11-17").cur).toEqual({ from: "2026-11-16", to: "2026-11-16" });
    expect(periodRanges("week", "2026-11-17")).toMatchObject({ cur: { from: "2026-11-11", to: "2026-11-17" }, prev: { from: "2026-11-04", to: "2026-11-10" } });
    expect(periodRanges("month", "2026-11-17")).toMatchObject({ cur: { from: "2026-11-01", to: "2026-11-17" }, prev: { from: "2026-10-01", to: "2026-10-17" } });
    expect(periodRanges("last_month", "2026-11-17")).toMatchObject({ cur: { from: "2026-10-01", to: "2026-10-31" }, prev: { from: "2026-09-01", to: "2026-09-30" } });
    expect(periodRanges("year", "2026-11-17").cur).toEqual({ from: "2026-04-01", to: "2026-11-17" });
  });
  it("handles month ends, January and the financial year start", () => {
    expect(periodRanges("month", "2026-03-31").prev).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRanges("last_month", "2026-01-10").cur).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(periodRanges("year", "2027-02-01").cur.from).toBe("2026-04-01");
    expect(periodRanges("year", "2026-04-01").cur).toEqual({ from: "2026-04-01", to: "2026-04-01" });
  });
  it("accepts only known periods", () => {
    expect(isPeriod("week")).toBe(true);
    expect(isPeriod("decade")).toBe(false);
    expect(isPeriod(undefined)).toBe(false);
  });
});

describe("estimated statutory late fees", () => {
  it("prices the usual filings", () => {
    expect(lateFee("GSTR-3B (Oct)", 4)).toBe(200);
    expect(lateFee("GSTR-1 Oct 2026", 300)).toBe(10_000);
    expect(lateFee("GSTR-9 annual return", 3)).toBe(600);
    expect(lateFee("TDS Q2 return (24Q)", 11)).toBe(2_200);
    expect(lateFee("ITR filing", 1)).toBe(5_000);
    expect(lateFee("MGT-7", 2)).toBe(200);
  });
  it("is zero for other work or when not late", () => {
    expect(lateFee("Bank statement entries", 30)).toBe(0);
    expect(lateFee("GSTR-3B", 0)).toBe(0);
  });
});

describe("compact numbers (donut centre)", () => {
  it("shortens rupees without dropping digits", () => {
    expect(fmtCompact(884000, "inr")).toBe("₹8.84 L");
    expect(fmtCompact(100000, "inr")).toBe("₹1 L");
    expect(fmtCompact(1_000_000_000, "inr")).toBe("₹100 Cr");
    expect(fmtCompact(125_000_000, "inr")).toBe("₹12.5 Cr");
    expect(fmtCompact(18_400, "inr")).toBe("₹18.4k");
    expect(fmtCompact(999, "inr")).toBe("₹999");
    expect(fmtCompact(15_000)).toBe("15k");
    expect(fmtCompact(42)).toBe("42");
  });
});
