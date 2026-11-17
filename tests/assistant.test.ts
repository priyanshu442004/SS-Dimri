import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------- fakes

const calls: { model: string; op: string; q: Record<string, unknown> }[] = [];
let nextResult: unknown = [];

vi.mock("@/lib/db", () => {
  const prisma = new Proxy({}, {
    get: (_t, model: string) => new Proxy({}, {
      get: (_u, op: string) => async (q: Record<string, unknown>) => {
        calls.push({ model, op, q });
        return nextResult;
      },
    }),
  });
  return { prisma };
});

vi.mock("@/lib/auth", () => ({ auth: { api: {} } }));

const streamStep = vi.fn();
vi.mock("@/lib/ai/deepseek", () => ({ streamStep: (...a: unknown[]) => streamStep(...a), quickCompletion: vi.fn() }));

import type { AppContext } from "@/lib/session";
import { runDbQuery, QueryError, schemaText, accessibleModels, plain } from "@/lib/ai/db-query";
import { parseCsv, shapeTab, readSheet, describeSheet } from "@/lib/ai/sheet";
import { blockSchema } from "@/lib/ai/blocks";
import { historyMessages, runAgent, userTurnText } from "@/lib/ai/agent";

const ORG = "01a188d8-c7ff-700f-a46f-1aa179bacdda";
function ctx(role: AppContext["role"], extra: Partial<AppContext> = {}): AppContext {
  return {
    user: { id: "u1", name: "Test Owner", email: "o@example.invalid", username: null },
    role, grantedCapabilities: [], moduleRestricted: false, allowedModules: [], membershipId: `m-${role}-${Math.random()}`,
    mustChangePassword: false, tempPasswordExpiresAt: null,
    organization: { id: ORG, tradeName: "Test Firm", timezone: "Asia/Kolkata", pendingDaysBasis: "CALENDAR" },
    employee: null, client: null, access: { state: "full", graceEndsAt: null }, ...extra,
  } as AppContext;
}

beforeEach(() => {
  calls.length = 0;
  nextResult = [];
});

// ---------------------------------------------------------------- database tool

describe("query_database safety", () => {
  it("scopes every query to the asker's firm, whatever the model wrote", async () => {
    await runDbQuery(ctx("OWNER"), { model: "Task", operation: "count", args: { where: { organizationId: "someone-else", status: "PENDING" } } });
    const q = calls[0].q as { where: { AND: Record<string, unknown>[] } };
    expect(calls[0]).toMatchObject({ model: "task", op: "count" });
    expect(q.where.AND[0]).toEqual({ organizationId: ORG });
  });

  it("scopes child tables through their parent", async () => {
    await runDbQuery(ctx("OWNER"), { model: "EmployeeSalaryRecord", operation: "findMany" });
    expect((calls[0].q.where as { AND: unknown[] }).AND[0]).toEqual({ employee: { organizationId: ORG } });
    await runDbQuery(ctx("OWNER"), { model: "DailyPlanItem", operation: "count" });
    expect((calls[1].q.where as { AND: unknown[] }).AND[0]).toEqual({ plan: { organizationId: ORG } });
  });

  it("adds the firm filter to nested list relations too", async () => {
    await runDbQuery(ctx("OWNER"), { model: "Employee", operation: "findMany", args: { select: { firstName: true, attendanceRecords: { select: { attendanceDate: true } } } } });
    const sel = calls[0].q.select as { attendanceRecords: { where: { AND: unknown[] } } };
    expect(sel.attendanceRecords.where.AND[0]).toEqual({ organizationId: ORG });
  });

  it("never reads or filters on secret columns, at any depth", async () => {
    const owner = ctx("OWNER");
    await expect(runDbQuery(owner, { model: "Employee", operation: "findMany", args: { select: { aadhaarEncrypted: true } } })).rejects.toThrow(QueryError);
    await expect(runDbQuery(owner, { model: "Employee", operation: "count", args: { where: { aadhaarLast4: "1234" } } })).rejects.toThrow(/not available/);
    await expect(runDbQuery(owner, { model: "Employee", operation: "findMany", args: { select: { bankAccounts: true } } })).rejects.toThrow(QueryError);
    await expect(runDbQuery(owner, { model: "AttendanceRecord", operation: "findMany", args: { select: { timeInLatitude: true } } })).rejects.toThrow(QueryError);
    await expect(runDbQuery(owner, { model: "Task", operation: "findMany", args: { select: { createdBy: { select: { sessions: true } } } } })).rejects.toThrow(QueryError);
    await expect(runDbQuery(owner, { model: "Client", operation: "findMany", args: { select: { organization: true } } })).rejects.toThrow(QueryError);
  });

  it("expands `relation: true` to the allowed columns only", async () => {
    await runDbQuery(ctx("OWNER"), { model: "AttendanceRecord", operation: "findMany", args: { select: { employee: true } } });
    const emp = (calls[0].q.select as { employee: { select: Record<string, true> } }).employee.select;
    expect(emp.firstName).toBe(true);
    expect(emp).not.toHaveProperty("aadhaarEncrypted");
    expect(emp).not.toHaveProperty("aadhaarLast4");
  });

  it("default select hides secret columns", async () => {
    await runDbQuery(ctx("OWNER"), { model: "Employee", operation: "findMany" });
    const sel = calls[0].q.select as Record<string, true>;
    expect(Object.keys(sel).some((k) => /aadhaar|FileId$/i.test(k))).toBe(false);
    expect(sel.firstName).toBe(true);
  });

  it("respects each person's rights", async () => {
    const senior = ctx("SENIOR");
    await expect(runDbQuery(senior, { model: "EmployeeSalaryRecord", operation: "count" })).rejects.toThrow(/do not have access/);
    await expect(runDbQuery(ctx("MANAGER"), { model: "DayReport", operation: "count" })).rejects.toThrow(/do not have access/);
    await expect(runDbQuery(ctx("MANAGER"), { model: "AuditLog", operation: "count" })).rejects.toThrow(/do not have access/);
    expect(accessibleModels(ctx("OWNER")).has("EmployeeSalaryRecord")).toBe(true);
    expect(accessibleModels(senior).has("AttendanceRecord")).toBe(true);
    // A module-restricted member loses that module's data even with the role.
    const restricted = ctx("MANAGER", { moduleRestricted: true, allowedModules: ["attendance"] });
    expect(accessibleModels(restricted).has("Task")).toBe(false);
    expect(accessibleModels(restricted).has("AttendanceRecord")).toBe(true);
  });

  it("refuses relation-only and unknown models, write operations and unknown arguments", async () => {
    const owner = ctx("OWNER");
    await expect(runDbQuery(owner, { model: "User", operation: "findMany" })).rejects.toThrow(/relation/);
    await expect(runDbQuery(owner, { model: "Account", operation: "findMany" })).rejects.toThrow(/Unknown model/);
    await expect(runDbQuery(owner, { model: "Task", operation: "deleteMany" as never })).rejects.toThrow(/operation must be/);
    await expect(runDbQuery(owner, { model: "Task", operation: "findMany", args: { data: { title: "x" } } })).rejects.toThrow(/Unsupported argument/);
    await expect(runDbQuery(owner, { model: "Task", operation: "findMany", args: { include: { client: true } } })).rejects.toThrow(/Unsupported argument/);
    expect(calls).toHaveLength(0);
  });

  it("turns dates into the right instants and validates enums", async () => {
    await runDbQuery(ctx("OWNER"), { model: "AttendanceRecord", operation: "count", args: { where: { attendanceDate: { gte: "2026-11-01", lte: "2026-11-16" }, status: "present", timeIn: { gte: "2026-11-16" } } } });
    const w = (calls[0].q.where as { AND: Record<string, Record<string, unknown>>[] }).AND[1];
    expect((w.attendanceDate.gte as Date).toISOString()).toBe("2026-11-01T00:00:00.000Z"); // calendar date column
    expect((w.timeIn.gte as Date).toISOString()).toBe("2026-11-15T18:30:00.000Z"); // IST midnight
    expect(w.status).toBe("PRESENT");
    await expect(runDbQuery(ctx("OWNER"), { model: "AttendanceRecord", operation: "count", args: { where: { status: "LATE" } } })).rejects.toThrow(/must be one of/);
  });

  it("makes text search case-insensitive and caps sizes", async () => {
    await runDbQuery(ctx("OWNER"), { model: "Client", operation: "findMany", args: { where: { tradeName: { contains: "sharma" } }, take: 5000 } });
    const q = calls[0].q as { where: { AND: Record<string, { mode: string }>[] }; take: number };
    expect(q.where.AND[1].tradeName.mode).toBe("insensitive");
    expect(q.take).toBe(300);
  });

  it("supports groupBy and aggregate with sensible defaults", async () => {
    nextResult = [{ employeeId: "e1", _count: { _all: 3 } }];
    const r = await runDbQuery(ctx("OWNER"), { model: "LeaveRequest", operation: "groupBy", args: { by: ["employeeId"], _count: { _all: true } } });
    expect(calls[0].q.orderBy).toEqual([{ _count: { employeeId: "desc" } }]);
    expect(r).toMatchObject({ rows: [{ employeeId: "e1" }] });
    await expect(runDbQuery(ctx("OWNER"), { model: "Task", operation: "aggregate", args: { _sum: { title: true } } })).rejects.toThrow(/not numeric/);
  });

  it("returns plain JSON: numbers, calendar dates and firm-local times", () => {
    const decimal = { toNumber: () => 1250.5 };
    const out = plain("AttendanceRecord", { attendanceDate: new Date("2026-11-16T00:00:00Z"), timeIn: new Date("2026-11-16T04:22:00Z"), employee: { dateOfJoining: new Date("2025-04-01T00:00:00Z") }, x: decimal, n: BigInt(5) }, "Asia/Kolkata");
    expect(out).toEqual({ attendanceDate: "2026-11-16", timeIn: "2026-11-16 09:52", employee: { dateOfJoining: "2025-04-01" }, x: 1250.5, n: 5 });
  });

  it("describes only the models the person may query", () => {
    const owner = schemaText(ctx("OWNER"));
    const senior = schemaText(ctx("SENIOR"));
    expect(owner).toContain("EmployeeSalaryRecord");
    expect(senior).not.toContain("EmployeeSalaryRecord");
    expect(owner).not.toMatch(/aadhaarEncrypted|password|accountNumber/);
  });
});

// ---------------------------------------------------------------- Google Sheet

describe("live Google Sheet", () => {
  it("parses quoted CSV with commas and line breaks", () => {
    expect(parseCsv('a,"b, c","d ""q"""\n1,"two\nlines",3\n')).toEqual([["a", "b, c", 'd "q"'], ["1", "two\nlines", "3"]]);
  });

  it("finds the header row under title lines and drops empty columns", () => {
    const t = shapeTab("Team Profit", "1", parseCsv("Team-wise Profit,,,,\nSome note,,,,\n,,,,\nMember,Role,Rate,Hours,\nSanjay,Partner,1200,39,\nKamal,Manager,700,95,\n,,,,\n"));
    expect(t.title).toEqual(["Team-wise Profit", "Some note"]);
    expect(t.header).toEqual(["Member", "Role", "Rate", "Hours"]);
    expect(t.rows.map((r) => r.cells[0])).toEqual(["Sanjay", "Kamal"]);
    expect(t.headerRow).toBe(4);
  });

  it("never drops rows above the widest table on a multi-table tab", () => {
    const t = shapeTab("Data Checks", "2", parseCsv("Measure,Value,,,\nTOTAL REVENUE EARNED,\"792,800\",,,\n,,,,\nRole,Hours,Cost,% of Hours,Headcount\nSenior,75,\"33,750\",33%,2\nExecutive,96,\"24,000\",42%,2\n"));
    const cells = t.rows.map((r) => r.cells[0]);
    expect(cells).toContain("TOTAL REVENUE EARNED");
    expect(cells).toContain("Senior");
  });

  it("follows the sheet when tabs and columns change (same link)", async () => {
    let version = 1;
    const html = (tabs: [string, string][]) => tabs.map(([n, g]) => `{name: "${n}", pageUrl: "x", gid: "${g}"}`).join(",");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("htmlview")) return new Response(version === 1 ? html([["Clients", "11"]]) : html([["Clients", "11"], ["New Tab", "22"]]));
      if (url.includes("gid=11")) return new Response(version === 1 ? "Name,Code\nAcme,AC\n" : "Name,Code,Region\nAcme,AC,North\nBeta,BE,South\n");
      return new Response("Metric,Value\nRevenue,100\n");
    });
    vi.stubGlobal("fetch", fetchMock);
    const id = `sheet-test-${Date.now()}`;
    const a = await readSheet(id, 60, { tab: "clients" });
    expect(a).toMatchObject({ tab: "Clients", columns: ["Name", "Code"], totalMatching: 1 });
    version = 2;
    // Within the fresh window the cached copy is used…
    expect(await readSheet(id, 60, { tab: "Clients" })).toMatchObject({ columns: ["Name", "Code"] });
    // …and a refresh (or an expired window) picks up the new column, rows and tab.
    const b = await readSheet(id, 60, { tab: "Clients", refresh: true });
    expect(b).toMatchObject({ columns: ["Name", "Code", "Region"], totalMatching: 2 });
    const d = await describeSheet(id, 60, true);
    expect(d.tabs.map((t) => t.tab)).toEqual(["Clients", "New Tab"]);
    const missing = await readSheet(id, 60, { tab: "Deleted Tab" });
    expect(missing).toMatchObject({ error: expect.stringContaining("No tab") });
    vi.unstubAllGlobals();
  });

  it("serves the last copy when Google is unreachable", async () => {
    const id = `sheet-down-${Date.now()}`;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("htmlview") ? new Response(`{name: "T", pageUrl: "x", gid: "1"}`) : new Response("A,B\n1,2\n"))));
    await readSheet(id, 5, { tab: "T" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const r = await readSheet(id, 5, { tab: "T", refresh: true });
    expect(r).toMatchObject({ fetched: expect.stringContaining("last saved copy"), totalMatching: 1 });
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------- visual blocks

describe("visual blocks", () => {
  it("accepts numeric strings and rejects mismatched series", () => {
    const ok = blockSchema.parse({ type: "chart", chart: "bar", title: "Late", labels: ["A", "B"], series: [{ name: "Days", values: ["2", "₹1,500"] }] });
    expect(ok).toMatchObject({ series: [{ values: [2, 1500] }] });
    expect(blockSchema.safeParse({ type: "chart", chart: "line", title: "x", labels: ["a", "b", "c"], series: [{ name: "s", values: [1, 2] }] }).success).toBe(false);
    expect(blockSchema.safeParse({ type: "chart", chart: "pie", title: "x", labels: ["a"], series: [{ name: "s", values: [1] }, { name: "t", values: [2] }] }).success).toBe(false);
    expect(blockSchema.safeParse({ type: "kpis", items: [{ label: "Late", value: 2, tone: "bad" }] }).success).toBe(true);
  });
});

// ---------------------------------------------------------------- agent loop

describe("agent", () => {
  it("frames a selected excerpt so only that part is asked about", () => {
    const t = userTurnText("who else was late for this reason this week?", "Traffic jam on the ring road");
    expect(t).toContain("SELECTED EXCERPT");
    expect(t).toContain("Traffic jam on the ring road");
    expect(t.endsWith("Question: who else was late for this reason this week?")).toBe(true);
  });

  it("keeps data notes of recent answers so 'they' can be resolved", () => {
    const msgs = historyMessages([
      { role: "user", content: "Who was late yesterday?" },
      { role: "assistant", content: "Ravi and Neha were late.", context: 'attendance_report → [{"name":"Ravi Kumar","lateReason":"Traffic"}]', blocks: [{ type: "kpis", items: [{ label: "Late", value: 2 }] }] },
    ], false);
    expect(msgs[1].content).toContain("[Data used]");
    expect(msgs[1].content).toContain("Ravi Kumar");
    expect(msgs[1].content).toContain("Late = 2");
  });

  it("runs data tools in parallel, then finishes in the same step as the visuals", async () => {
    streamStep.mockReset();
    nextResult = 7;
    streamStep
      .mockResolvedValueOnce({ content: "", reasoning: "", finishReason: "tool_calls", toolCalls: [
        { id: "a", type: "function", function: { name: "query_database", arguments: JSON.stringify({ model: "Task", operation: "count", args: { where: { status: "PENDING" } } }) } },
        { id: "b", type: "function", function: { name: "query_database", arguments: JSON.stringify({ model: "Client", operation: "count" }) } },
      ] })
      .mockImplementationOnce(async (_m: unknown, o: { onText: (t: string) => void }) => {
        o.onText("You have 7 open tasks.");
        return { content: "You have 7 open tasks.", reasoning: "", finishReason: "tool_calls", toolCalls: [
          { id: "c", type: "function", function: { name: "show_kpis", arguments: JSON.stringify({ items: [{ label: "Open tasks", value: 7 }] }) } },
          { id: "d", type: "function", function: { name: "suggest_follow_up", arguments: JSON.stringify({ question: "Which of them are overdue?" }) } },
        ] };
      });
    const events: { type: string }[] = [];
    const r = await runAgent(ctx("OWNER"), [], { text: "How many open tasks?" }, (e) => events.push(e), new AbortController().signal);
    expect(streamStep).toHaveBeenCalledTimes(2); // no extra round after the visuals
    expect(calls).toHaveLength(2);
    expect(r.content).toBe("You have 7 open tasks.");
    expect(r.blocks).toHaveLength(1);
    expect(r.followUp).toBe("Which of them are overdue?");
    expect(r.context).toContain("query_database");
    expect(events.filter((e) => e.type === "tool")).toHaveLength(4); // 2 running + 2 done
  });

  it("feeds tool errors back so the model can correct itself", async () => {
    streamStep.mockReset();
    streamStep
      .mockResolvedValueOnce({ content: "", reasoning: "", finishReason: "tool_calls", toolCalls: [{ id: "a", type: "function", function: { name: "query_database", arguments: JSON.stringify({ model: "Employee", operation: "findMany", args: { select: { aadhaarEncrypted: true } } }) } }] })
      .mockResolvedValueOnce({ content: "I can't share Aadhaar numbers.", reasoning: "", finishReason: "stop", toolCalls: [] });
    const r = await runAgent(ctx("OWNER"), [], { text: "aadhaar of everyone" }, () => {}, new AbortController().signal);
    const second = streamStep.mock.calls[1][0] as { role: string; content: string }[];
    expect(second.at(-1)).toMatchObject({ role: "tool", content: expect.stringContaining("not available") });
    expect(r.content).toBe("I can't share Aadhaar numbers.");
  });
});

describe("KPI format guess", () => {
  it("reads money, percent and counts from the label", async () => {
    const { guessFormat } = await import("@/lib/ai/tools");
    expect(guessFormat("Total revenue earned", 792800)).toBe("inr");
    expect(guessFormat("Margin % ", 88.8)).toBe("percent");
    expect(guessFormat("Avg hourly rate (sheet)", 489)).toBe("inr");
    expect(guessFormat("Attendance rate", 92.6)).toBe("percent");
    expect(guessFormat("Overdue tasks", 4)).toBe("count");
  });
});

describe("stripNarration", () => {
  it("drops opening process lines only", async () => {
    const { stripNarration } = await import("@/lib/ai/agent");
    expect(stripNarration("I have the key figures. Let me compare the totals across tabs.\n\n**Verdict: no.**")).toBe("**Verdict: no.**");
    expect(stripNarration("I have what I need. Let me verify the arithmetic:\n\n**Revenue:** ok")).toBe("**Revenue:** ok");
    expect(stripNarration("11 people were late yesterday.")).toBe("11 people were late yesterday.");
    expect(stripNarration("Let me know if you need more.")).toBe("Let me know if you need more.");
  });
});
