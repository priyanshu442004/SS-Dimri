import { describe, expect, it } from "vitest";
import { taskWorkSegments } from "@/lib/domain/task-time";

const at = (s: string) => new Date(`${s}:00+05:30`);
const office = { start: "09:30", end: "18:30" };
const ME = "u-me";

describe("task time goes to the timesheet when sent for review", () => {
  it("counts from start to submit on the same day", () => {
    const changes = [{ toValue: "IN_PROGRESS", actorUserId: ME, createdAt: at("2026-11-16T10:00") }];
    expect(taskWorkSegments(changes, ME, at("2026-11-16T12:05"), office, "Asia/Kolkata")).toEqual([{ date: "2026-11-16", start: "10:00", end: "12:05", minutes: 125 }]);
  });

  it("leaves out time on hold, and someone else's start", () => {
    const changes = [
      { toValue: "IN_PROGRESS", actorUserId: ME, createdAt: at("2026-11-16T10:00") },
      { toValue: "ON_HOLD", actorUserId: ME, createdAt: at("2026-11-16T11:00") },
      { toValue: "IN_PROGRESS", actorUserId: "someone", createdAt: at("2026-11-16T12:00") },
      { toValue: "AWAITING_CLIENT", actorUserId: "someone", createdAt: at("2026-11-16T13:00") },
      { toValue: "IN_PROGRESS", actorUserId: ME, createdAt: at("2026-11-16T15:00") },
    ];
    const segs = taskWorkSegments(changes, ME, at("2026-11-16T15:30"), office, "Asia/Kolkata");
    expect(segs.map((s) => s.minutes)).toEqual([60, 30]);
  });

  it("does not count the night when the task stays open over days", () => {
    const changes = [{ toValue: "IN_PROGRESS", actorUserId: ME, createdAt: at("2026-11-14T17:30") }];
    // Sat 17:30 → Sunday skipped → Mon 11:00.
    const segs = taskWorkSegments(changes, ME, at("2026-11-16T11:00"), office, "Asia/Kolkata");
    expect(segs).toEqual([
      { date: "2026-11-14", start: "17:30", end: "18:30", minutes: 60 },
      { date: "2026-11-16", start: "09:30", end: "11:00", minutes: 90 },
    ]);
  });

  it("after changes were requested, counts only the new round", () => {
    const changes = [
      { toValue: "IN_PROGRESS", actorUserId: ME, createdAt: at("2026-11-16T10:00") },
      { toValue: "PENDING_REVIEW", actorUserId: ME, createdAt: at("2026-11-16T11:00") },
      { toValue: "CHANGES_REQUESTED", actorUserId: "checker", createdAt: at("2026-11-16T12:00") },
      { toValue: "IN_PROGRESS", actorUserId: ME, createdAt: at("2026-11-16T14:00") },
    ];
    expect(taskWorkSegments(changes, ME, at("2026-11-16T14:20"), office, "Asia/Kolkata").map((s) => s.minutes)).toEqual([20]);
  });

  it("adds nothing when the work was never started", () => {
    expect(taskWorkSegments([], ME, at("2026-11-16T14:20"), office, "Asia/Kolkata")).toEqual([]);
  });
});
