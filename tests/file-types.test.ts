import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({}) }));
vi.mock("@/lib/storage/s3", () => ({ s3: {}, buildObjectKey: () => "", sseParams: () => ({}) }));
import { detectFileType } from "@/lib/services/files";

// 25 Nov 2026: an ITR acknowledgement PDF from the income-tax portal was refused because
// its "%PDF-" header was not at byte 0. PDF readers allow it anywhere in the first 1 KB.
describe("detectFileType", () => {
  const pdf = (lead: string) => Buffer.concat([Buffer.from(lead, "latin1"), Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n", "latin1")]);
  it("accepts a normal PDF", () => {
    expect(detectFileType(pdf(""), "a.pdf")?.ext).toBe("pdf");
  });
  it("accepts a PDF with bytes before the header", () => {
    expect(detectFileType(pdf("\r\n  ﻿"), "FY 2023-24 ACK000000000000000.pdf")?.mime).toBe("application/pdf");
    expect(detectFileType(pdf("x".repeat(1000)), "a.pdf")?.ext).toBe("pdf");
  });
  it("still refuses files with no PDF header in the first 1 KB", () => {
    expect(detectFileType(pdf("x".repeat(1100)), "a.pdf")).toBeNull();
    expect(detectFileType(Buffer.from("<html><body>not a pdf</body></html>"), "a.pdf")).toBeNull();
  });
});
