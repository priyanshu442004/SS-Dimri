import { describe, expect, it } from "vitest";
import { can, isGrantable, type Role } from "@/lib/permissions";

// 24 Nov 2026: owners and administrators may delete any shown document; others only if granted.
describe("documents.delete", () => {
  it("is held by owners and administrators only", () => {
    const holders = (["OWNER", "ADMIN", "MANAGER", "SENIOR", "STAFF", "CLIENT"] as Role[]).filter((r) => can(r, "documents.delete"));
    expect(holders).toEqual(["OWNER", "ADMIN"]);
  });
  it("can be granted person by person", () => {
    expect(isGrantable("documents.delete")).toBe(true);
  });
});
