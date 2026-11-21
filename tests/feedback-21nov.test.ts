import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/services/files", () => ({ hasFile: () => false, storeUpload: vi.fn() }));
vi.mock("@/lib/services/notifications", () => ({ notifyEmployees: vi.fn(), notifyRoles: vi.fn() }));
vi.mock("@/lib/services/audit", () => ({ audit: vi.fn() }));

const { advanceInMonth } = await import("@/lib/domain/advance");
const { gstItemApplies } = await import("@/lib/domain/gst-type");

describe("salary advance: monthly deduction and balance", () => {
  const a = { amount: 10000, monthlyDeduction: 3000, startMonth: "2026-11", closedMonth: null };
  it("deducts the EMI each month and the rest in the last month", () => {
    expect(advanceInMonth(a, "2026-10")).toEqual({ deduction: 0, before: 10000, after: 10000 });
    expect(advanceInMonth(a, "2026-11")).toEqual({ deduction: 3000, before: 10000, after: 7000 });
    expect(advanceInMonth(a, "2026-12")).toEqual({ deduction: 3000, before: 7000, after: 4000 });
    expect(advanceInMonth(a, "2027-01")).toEqual({ deduction: 3000, before: 4000, after: 1000 });
    expect(advanceInMonth(a, "2027-02")).toEqual({ deduction: 1000, before: 1000, after: 0 });
    expect(advanceInMonth(a, "2027-03").deduction).toBe(0);
  });
  it("stops from the month it is closed", () => {
    expect(advanceInMonth({ ...a, closedMonth: "2026-12" }, "2026-12").deduction).toBe(0);
    expect(advanceInMonth({ ...a, closedMonth: "2026-12" }, "2026-12").before).toBe(7000);
  });
});

describe("GST compliances follow the registration type", () => {
  const g = (name: string) => ({ department: "GST", name });
  it("composition: CMP-08, GSTR-4, e-way bill only; surrendered: none; regular: no composition returns", () => {
    expect(gstItemApplies("COMPOSITION", g("Composition – quarterly payment"))).toBe(true);
    expect(gstItemApplies("COMPOSITION", g("GSTR-3B (monthly)"))).toBe(false);
    expect(gstItemApplies("COMPOSITION", g("E-way bill"))).toBe(true);
    expect(gstItemApplies("SURRENDERED", g("GSTR-1 (monthly)"))).toBe(false);
    expect(gstItemApplies("REGULAR", g("Composition – annual return"))).toBe(false);
    expect(gstItemApplies("REGULAR", g("GSTR-3B (monthly)"))).toBe(true);
    expect(gstItemApplies("SURRENDERED", { department: "TDS", name: "24Q" })).toBe(true);
  });
});
