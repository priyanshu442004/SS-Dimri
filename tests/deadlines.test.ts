import { describe, expect, it } from "vitest";
import { formatDue, upcomingDeadlines } from "@/lib/deadlines";

// 27 Oct 2026, 10:00 IST
const NOW = new Date("2026-10-27T04:30:00Z");

describe("upcoming statutory due dates (public site)", () => {
  it("lists dates on or after today in date order", () => {
    const list = upcomingDeadlines(8, NOW);
    expect(list.map((d) => formatDue(d.date))).toEqual(["30 Oct", "31 Oct", "31 Oct", "31 Oct", "7 Nov", "10 Nov", "11 Nov", "13 Nov"]);
    expect(list[0]).toMatchObject({ form: "LLP Form 8", daysLeft: 3 });
  });

  it("uses the IST calendar day, not UTC", () => {
    // 31 Oct 2026, 00:30 IST is still 30 Oct in UTC; 30 Oct items must already be past.
    const list = upcomingDeadlines(3, new Date("2026-10-30T19:00:00Z"));
    expect(list.every((d) => formatDue(d.date) === "31 Oct" && d.daysLeft === 0)).toBe(true);
  });

  it("moves the March TDS deposit to 30 April", () => {
    const april = upcomingDeadlines(40, new Date("2027-04-01T04:30:00Z")).filter((d) => d.title.startsWith("TDS / TCS deposit"));
    expect(formatDue(april[0].date)).toBe("30 Apr");
  });

  it("alternates IFF and quarterly GSTR-1 on the 13th", () => {
    const at = (iso: string) => upcomingDeadlines(40, new Date(iso)).filter((d) => formatDue(d.date).startsWith("13 "))[0];
    expect(at("2026-11-01T04:30:00Z").form).toBe("IFF");
    expect(at("2027-01-01T04:30:00Z").title).toBe("GSTR-1 (quarterly, QRMP)");
  });
});
