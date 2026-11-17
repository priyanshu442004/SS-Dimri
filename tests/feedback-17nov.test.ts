import { describe, expect, it } from "vitest";
import { checkGstin, checkPan, checkTan, gstinCheckDigit } from "@/lib/domain/identifier-check";
import { can, liveGrants, parseExpiries } from "@/lib/permissions";

describe("PAN / TAN / GSTIN validate", () => {
  it("accepts real GSTINs and computes the check digit", () => {
    expect(gstinCheckDigit("27AAPFU0939F1Z")).toBe("V");
    expect(checkGstin("27aapfu0939f1zv").ok).toBe(true);
    expect(checkGstin("29AAGCB7383J1Z4").ok).toBe(true);
  });
  it("catches a mistyped GSTIN, a bad state code and a PAN mismatch", () => {
    expect(checkGstin("27AAPFU0939F1ZX").message).toMatch(/check digit/);
    expect(checkGstin("40AAPFU0939F1ZV").ok).toBe(false);
    expect(checkGstin("27AAPFU0939F1ZV", "AAGCB7383J").message).toMatch(/belongs to PAN AAPFU0939F/);
    expect(checkGstin("27AAPFU0939F1ZV", "AAPFU0939F").ok).toBe(true);
  });
  it("checks PAN holder type and TAN format", () => {
    expect(checkPan("AAGCB7383J").details[0]).toMatch(/Company/);
    expect(checkPan("ABCDE1234F").ok).toBe(false); // D is not a holder type
    expect(checkPan("AB12").ok).toBe(false);
    expect(checkTan("DELA12345B").ok).toBe(true);
    expect(checkTan("DEL12345B").ok).toBe(false);
  });
});

describe("temporary rights", () => {
  it("keep a right through its last day and drop it after", () => {
    const until = { "clients.edit": "2026-11-20" };
    expect(liveGrants(["clients.edit", "clients.register"], until, "2026-11-20")).toEqual(["clients.edit", "clients.register"]);
    expect(liveGrants(["clients.edit", "clients.register"], until, "2026-11-21")).toEqual(["clients.register"]);
  });
  it("ignore malformed expiry data", () => {
    expect(parseExpiries(null)).toEqual({});
    expect(parseExpiries({ a: "soon", b: "2026-12-01" })).toEqual({ b: "2026-12-01" });
  });
  it("a granted client-edit right lets a team member edit clients", () => {
    expect(can({ role: "STAFF" }, "clients.edit")).toBe(false);
    expect(can({ role: "STAFF", grantedCapabilities: ["clients.edit"] }, "clients.edit")).toBe(true);
    expect(can({ role: "STAFF", grantedCapabilities: ["access.manage"] }, "access.manage")).toBe(false);
  });
});
